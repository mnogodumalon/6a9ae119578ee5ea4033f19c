import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  createPublicRecord,
  prepareChallenge,
  recordRef,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { useStepForm } from '@/lib/journey/useStepForm';
import { useJourneySubmit } from '@/lib/journey/useJourneySubmit';
import { createPublicPort } from '@/lib/journey/publicPort';
import { todayIso } from '@/lib/journey';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { Input } from '@/components/ui/input';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';
import {
  IconMusic,
  IconCalendar,
  IconUsers,
  IconClock,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Kurs-Daten-Interface
// ---------------------------------------------------------------------------

interface KursRecord {
  id: string;
  titel: string;
  instrument: string;
  niveau: string | null;
  wochentage: string[];
  beginn: string | null;
  ende: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number;
  preis: number | null;
  status: string;
}

function parseKurs(r: PublicRecordResult): KursRecord {
  const f = r.fields;
  return {
    id: r.id,
    titel: (f.titel as string) ?? '',
    instrument: (f.instrument as string) ?? '',
    niveau: (f.niveau as string) ?? null,
    wochentage: Array.isArray(f.wochentage) ? (f.wochentage as string[]) : [],
    beginn: (f.beginn as string) ?? null,
    ende: (f.ende as string) ?? null,
    uhrzeit: (f.uhrzeit as string) ?? null,
    maximale_teilnehmer: Number(f.maximale_teilnehmer) || 0,
    preis: f.preis != null ? Number(f.preis) : null,
    status: (f.status as string) ?? '',
  };
}

function formatUhrzeit(iso: string | null): string {
  if (!iso) return '';
  const time = iso.split('T')[1];
  if (!time) return '';
  return time.slice(0, 5);
}

function formatDatum(iso: string | null): string {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Haupt-Komponente
// ---------------------------------------------------------------------------

export default function Kursanmeldung() {
  const WOCHENTAG_LABELS: Record<string, string> = {
  montag: 'Mo',
  dienstag: 'Di',
  mittwoch: 'Mi',
  donnerstag: 'Do',
  freitag: 'Fr',
  samstag: 'Sa',
};

  const NIVEAU_LABELS: Record<string, string> = {
  anfaenger: 'Anfänger',
  fortgeschritten: 'Fortgeschritten',
  profi: 'Profi',
};

  const INSTRUMENT_LABELS: Record<string, string> = {
  klavier: 'Klavier',
  gitarre: 'Gitarre',
  violine: 'Violine',
  cello: 'Cello',
  querfloete: 'Querflöte',
  klarinette: 'Klarinette',
  schlagzeug: 'Schlagzeug',
  gesang: 'Gesang',
  blockfloete: 'Blockflöte',
};

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [anmeldungenMap, setAnmeldungenMap] = useState<Record<string, string>>({});
  const [dataLoading, setDataLoading] = useState(false);

  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  useEffect(() => {
    loadPublicPagesConfig('kursanmeldung').then(c => {
      if (!c) { setUnavailable(true); setLoadingCfg(false); return; }
      setCfg(c);
      const p = c?.pages['kursanmeldung'] ?? null;
      setPage(p);
      setLoadingCfg(false);
      if (!p) { setUnavailable(true); return; }

      // Daten laden
      setDataLoading(true);
      const kurseEp = p.endpoints?.find(e => e.op === 'list' && e.entity === 'kurse');
      const anmEp = p.endpoints?.find(e => e.op === 'list' && e.entity === 'anmeldungen');
      Promise.all([
        kurseEp
          ? listPublicRecords(c, p, { appId: kurseEp.app_id, limit: 200 })
          : Promise.resolve<Record<string, PublicRecordResult>>({}),
        anmEp
          ? listPublicRecords(c, p, { appId: anmEp.app_id, limit: 500 })
          : Promise.resolve<Record<string, PublicRecordResult>>({}),
      ]).then(([kursMap, anmMap]) => {
        setKurse(Object.values(kursMap).map(parseKurs));
        // Anmeldungen-Map: kursId -> Anzahl aktiver Anmeldungen (status != abgemeldet)
        const counts: Record<string, number> = {};
        for (const a of Object.values(anmMap)) {
          const statusVal = a.fields.status;
          const status = typeof statusVal === 'string' ? statusVal :
            (statusVal && typeof statusVal === 'object' && 'key' in statusVal
              ? (statusVal as { key: string }).key : '');
          if (status === 'abgemeldet') continue;
          const kursRef = a.fields.kurs as string | null;
          if (!kursRef) continue;
          const kursIdMatch = kursRef.match(/([a-f0-9]{24})$/);
          const kursId = kursIdMatch ? kursIdMatch[1] : kursRef;
          counts[kursId] = (counts[kursId] ?? 0) + 1;
        }
        // Stringify counts for state
        const strMap: Record<string, string> = {};
        for (const [k, v] of Object.entries(counts)) strMap[k] = String(v);
        setAnmeldungenMap(strMap);
      }).finally(() => setDataLoading(false));
    }).catch(() => { setUnavailable(true); setLoadingCfg(false); });
  }, []);

  // Kind-Daten-Formular
  const kindForm = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
    required: { vorname: true, nachname: true },
    steps: {
      vorname: 2, nachname: 2, geburtsdatum: 2,
      email: 2, telefon: 2, erziehungsberechtigte_person: 2,
    },
    autoComplete: true,
  });

  // Anmeldungs-Formular (nur für die Referenzfelder kurs + anmeldedatum)
  const anmForm = useStepForm('anmeldungen', {
    fields: ['kurs', 'anmeldedatum'],
    required: { kurs: true, anmeldedatum: true },
    steps: { kurs: 1, anmeldedatum: 1 },
    initial: { anmeldedatum: todayIso() },
    autoComplete: true,
  });

  const port = useMemo(() => {
    if (!cfg || !page) return null;
    return createPublicPort(cfg, page);
  }, [cfg, page]);

  const submit = useJourneySubmit(
    port ?? { door: 'public' as const, list: async () => [], count: async () => null, get: async () => null, create: async () => { throw new Error(tx('no port')); }, ref: () => '' },
    [
      {
        key: 'teilnehmer',
        entity: 'teilnehmer',
        label: tx('Kind anlegen'),
        run: async (_ctx) => {
          if (!cfg || !page) throw new Error(tx('no config'));
          const tnEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'teilnehmer');
          if (!tnEp) throw new Error(tx('no teilnehmer endpoint'));
          // Synthetischer page-config mit teilnehmer app_id für createPublicRecord
          const tnPage = { ...page, app_id: tnEp.app_id };
          const payload = kindForm.payload();
          const result = await createPublicRecord(cfg, tnPage, payload);
          return { id: result.id, fields: (result.fields ?? {}) as Record<string, unknown>, createdAt: result.created_at ?? null };
        },
      },
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        primary: true,
        label: tx('Anmeldung erstellen'),
        needs: ['teilnehmer'],
        run: async (ctx) => {
          if (!cfg || !page) throw new Error(tx('no config'));
          const tnRecord = ctx.done['teilnehmer'];
          if (!tnRecord) throw new Error(tx('teilnehmer fehlt'));
          const tnEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'teilnehmer');
          const anmEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'anmeldungen');
          if (!tnEp || !anmEp) throw new Error(tx('no endpoints'));

          const freieSpots = freePlätze(selectedKursId);
          const anmStatus = freieSpots !== null && freieSpots <= 0 ? 'warteliste' : 'neu';

          const anmPayload: Record<string, unknown> = {
            kurs: recordRef(cfg, page, anmEp.app_id === page.app_id ? '6a9ae0da29ba5927e215786b' : '6a9ae0da29ba5927e215786b', selectedKursId!),
            teilnehmer: recordRef(cfg, page, tnEp.app_id, tnRecord.id),
            anmeldedatum: todayIso(),
            status: anmStatus,
          };
          const result = await createPublicRecord(cfg, page, anmPayload);
          return { id: result.id, fields: (result.fields ?? {}) as Record<string, unknown>, createdAt: result.created_at ?? null };
        },
      },
    ],
    { draftKey: 'kursanmeldung' },
  );

  // Freie Plätze berechnen
  function freePlätze(kursId: string | null): number | null {
    if (!kursId) return null;
    const kurs = kurse.find(k => k.id === kursId);
    if (!kurs) return null;
    const belegt = Number(anmeldungenMap[kursId] ?? 0);
    return kurs.maximale_teilnehmer - belegt;
  }

  function handleKursWählen(kursId: string) {
    setSelectedKursId(kursId);
    anmForm.set('kurs', kursId, kurse.find(k => k.id === kursId)?.titel ?? '');
    if (cfg && page) {
      prepareChallenge(cfg, page, 'POST', `/apps/${page.app_id}/records`);
    }
  }

  function restart() {
    setStep(1);
    setSelectedKursId(null);
    kindForm.reset();
    anmForm.reset({ anmeldedatum: todayIso() });
    submit.reset();
  }

  const isLoading = loadingCfg || dataLoading;

  if (isLoading && !unavailable) {
    return <PublicShell loading />;
  }
  if (unavailable || !cfg || !page) {
    return <PublicShell unavailable />;
  }

  const selectedKurs = kurse.find(k => k.id === selectedKursId);
  const frei = freePlätze(selectedKursId);
  const istVoll = frei !== null && frei <= 0;

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melden Sie Ihr Kind online für einen Kurs an der Musikschule an.')}
    >
      <IntentWizardShell
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[kindForm, anmForm]}
        draftKey="kursanmeldung"
        surface="plain"
      >
        {/* Schritt 1: Kurs wählen */}
        <WizardStep
          label={tx('Kurs wählen')}
          description={tx('Wähle einen Kurs mit freien Plätzen aus.')}
        >
          <div className="space-y-3">
            {kurse.length === 0 && !dataLoading && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {tx('Zurzeit sind keine Kurse verfügbar.')}
              </p>
            )}
            {kurse.map(kurs => {
              const belegte = Number(anmeldungenMap[kurs.id] ?? 0);
              const freie = kurs.maximale_teilnehmer - belegte;
              const voll = freie <= 0;
              const selected = selectedKursId === kurs.id;

              return (
                <button
                  key={kurs.id}
                  type="button"
                  onClick={() => handleKursWählen(kurs.id)}
                  className={[
                    'w-full text-left rounded-lg border p-4 transition-colors',
                    selected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50 hover:bg-muted/40',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <div className={[
                      'flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center mt-0.5',
                      selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    ].join(' ')}>
                      <IconMusic size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{kurs.titel}</span>
                        {kurs.niveau && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                            {NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {INSTRUMENT_LABELS[kurs.instrument] ?? kurs.instrument}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        {kurs.wochentage.length > 0 && (
                          <span className="flex items-center gap-1">
                            <IconCalendar size={13} className="shrink-0" />
                            {kurs.wochentage.map(w => WOCHENTAG_LABELS[w] ?? w).join(', ')}
                          </span>
                        )}
                        {kurs.uhrzeit && (
                          <span className="flex items-center gap-1">
                            <IconClock size={13} className="shrink-0" />
                            {formatUhrzeit(kurs.uhrzeit)} {tx('Uhr')}
                          </span>
                        )}
                        {kurs.beginn && (
                          <span className="flex items-center gap-1">
                            <IconCalendar size={13} className="shrink-0" />
                            {tx('ab')} {formatDatum(kurs.beginn)}
                            {kurs.ende ? ` – ${formatDatum(kurs.ende)}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                        <span className={[
                          'flex items-center gap-1 text-xs font-medium',
                          voll ? 'text-amber-600' : 'text-emerald-600',
                        ].join(' ')}>
                          {voll
                            ? <><IconAlertCircle size={13} className="shrink-0" /> {tx('Kurs voll — Warteliste möglich')}</>
                            : <><IconUsers size={13} className="shrink-0" /> {freie} {tx('freie Plätze')}</>
                          }
                        </span>
                        {kurs.preis != null && (
                          <span className="text-xs text-muted-foreground">
                            {kurs.preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                          </span>
                        )}
                      </div>
                    </div>
                    {selected && (
                      <IconCheck size={18} className="shrink-0 text-primary mt-1" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {istVoll && selectedKursId && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
              <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>
                {tx('Dieser Kurs ist voll. Sie können sich trotzdem anmelden — Ihre Anmeldung kommt dann auf die Warteliste.')}
              </span>
            </div>
          )}

          <StepNav
            onNext={() => {
              if (!selectedKursId) return tx('Bitte wähle zuerst einen Kurs aus.');
              return true;
            }}
            nextStepLabel={tx('Kind-Daten')}
          />
        </WizardStep>

        {/* Schritt 2: Kind-Daten */}
        <WizardStep
          label={tx('Kind-Daten')}
          description={tx('Gib die Angaben zum Kind ein.')}
        >
          <div className="space-y-4">
            {selectedKurs && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <IconMusic size={14} className="shrink-0" />
                <span>
                  <span className="font-medium text-foreground">{selectedKurs.titel}</span>
                  {selectedKurs.niveau && ` · ${NIVEAU_LABELS[selectedKurs.niveau] ?? selectedKurs.niveau}`}
                </span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field form={kindForm} name="vorname">
                <Input {...kindForm.field('vorname')} />
              </Field>
              <Field form={kindForm} name="nachname">
                <Input {...kindForm.field('nachname')} />
              </Field>
            </div>
            <Bound form={kindForm} name="geburtsdatum" />
            <Field form={kindForm} name="email">
              <Input {...kindForm.field('email')} />
            </Field>
            <Field form={kindForm} name="telefon">
              <Input {...kindForm.field('telefon')} />
            </Field>
            <Field form={kindForm} name="erziehungsberechtigte_person" hint={tx('Name der Mutter / des Vaters oder einer anderen erziehungsberechtigten Person')}>
              <Input {...kindForm.field('erziehungsberechtigte_person')} />
            </Field>
          </div>

          <StepNav
            onNext={() => kindForm.validate(['vorname', 'nachname'])}
            nextStepLabel={tx('Zusammenfassung')}
          />
        </WizardStep>

        {/* Schritt 3: Zusammenfassung + Absenden */}
        <WizardStep label={tx('Prüfen & Absenden')}>
          {!submit.result && (
            <SummaryStep
              forms={[kindForm, anmForm]}
              submit={submit}
              items={selectedKurs ? [{
                key: 'kurs',
                label: tx('Gewählter Kurs'),
                value: `${selectedKurs.titel}${selectedKurs.niveau ? ' · ' + (NIVEAU_LABELS[selectedKurs.niveau] ?? selectedKurs.niveau) : ''}${istVoll ? ` (${tx('Warteliste')})` : ''}`,
                step: 1,
                keys: ['kurs'],
                fieldId: 'anmeldungen-kurs',
              }] : []}
              confirmLabel={tx('Jetzt anmelden')}
              whatHappensNext={tx('Wir melden uns so schnell wie möglich per E-Mail oder Telefon, um die Anmeldung zu bestätigen.')}
            />
          )}
        </WizardStep>

        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[kindForm]}
            referencePrefix="A"
            whatHappensNext={tx('Wir melden uns so schnell wie möglich per E-Mail oder Telefon.')}
            next={[
              { label: tx('Weitere Anmeldung'), onClick: restart },
            ]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
