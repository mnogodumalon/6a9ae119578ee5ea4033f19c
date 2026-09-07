import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, listPublicRecords, createPublicRecord,
  recordRef, prepareChallenge, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig, type PublicRecordResult,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useStepForm, useJourneySubmit, todayIso, type StepForm } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { Bound } from '@/components/blocks/Bound';

interface KursItem extends SelectItem {
  maxTeilnehmer: number;
  belegtCount: number;
}

function instrumentLabel(key: string): string {
  const map: Record<string, string> = {
    klavier: tx('Klavier'),
    gitarre: tx('Gitarre'),
    violine: tx('Violine'),
    cello: tx('Cello'),
    querfloete: tx('Querflöte'),
    klarinette: tx('Klarinette'),
    schlagzeug: tx('Schlagzeug'),
    gesang: tx('Gesang'),
    blockfloete: tx('Blockflöte'),
  };
  return map[key] ?? key;
}

function niveauLabel(key: string): string {
  const map: Record<string, string> = {
    anfaenger: tx('Anfänger'),
    fortgeschritten: tx('Fortgeschritten'),
    profi: tx('Profi'),
  };
  return map[key] ?? key;
}

function wochentageLabel(keys: string[]): string {
  const map: Record<string, string> = {
    montag: tx('Mo'),
    dienstag: tx('Di'),
    mittwoch: tx('Mi'),
    donnerstag: tx('Do'),
    freitag: tx('Fr'),
    samstag: tx('Sa'),
  };
  return keys.map(k => map[k] ?? k).join(', ');
}

function formatUhrzeit(iso: string | null | undefined): string {
  if (!iso) return '';
  // datetimeminute: yyyy-MM-ddTHH:mm
  const t = iso.slice(11, 16);
  return t || iso;
}

export default function Kursanmeldung() {
  const STEPS: WizardStep[] = [
  {
    label: tx('Kurs wählen'),
    description: tx('Wähle einen passenden Kurs aus den verfügbaren Angeboten.'),
    needs: ['kurs'],
  },
  {
    label: tx('Angaben zum Kind'),
    description: tx('Gib die Daten des Kindes ein, das angemeldet werden soll.'),
  },
  {
    label: tx('Zusammenfassung'),
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurse, setKurse] = useState<PublicRecordResult[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<PublicRecordResult[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [step, setStep] = useState(1);
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);

  useEffect(() => {
    loadPublicPagesConfig('kursanmeldung').then(c => {
      setCfg(c);
      setPage(c?.pages['kursanmeldung'] ?? null);
      setLoading(false);
    }).catch(err => {
      if (err instanceof PageUnavailableError) setUnavailable(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);
    const kurseEp = page.endpoints?.find(e => e.op === 'list' && (e as { entity?: string }).entity === 'kurse');
    const anmEp = page.endpoints?.find(e => e.op === 'list' && (e as { entity?: string }).entity === 'anmeldungen');
    const kurseAppId = (kurseEp as { app_id?: string } | undefined)?.app_id ?? '';
    const anmAppId = (anmEp as { app_id?: string } | undefined)?.app_id ?? '';

    Promise.all([
      kurseAppId ? listPublicRecords(cfg, page, { appId: kurseAppId, limit: 500 }) : Promise.resolve<Record<string, PublicRecordResult>>({}),
      anmAppId ? listPublicRecords(cfg, page, { appId: anmAppId, limit: 500 }) : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ]).then(([kursMap, anmMap]) => {
      setKurse(Object.values(kursMap));
      setAnmeldungen(Object.values(anmMap));
      setDataLoading(false);
    }).catch(() => setDataLoading(false));
  }, [cfg, page]);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const kind = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
    required: { vorname: true, nachname: true },
    steps: {
      vorname: 2, nachname: 2, geburtsdatum: 2,
      email: 2, telefon: 2, erziehungsberechtigte_person: 2,
    },
    autoComplete: true,
  });

  const anmForm = useStepForm('anmeldungen', {
    fields: ['kurs', 'anmeldedatum'],
    required: { kurs: true, anmeldedatum: false },
    steps: { kurs: 1 },
    initial: { anmeldedatum: todayIso() },
    autoComplete: true,
  });

  // Kapazität je Kurs berechnen
  const belegtPerKurs = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of anmeldungen) {
      const kursRef = a.fields.kurs as string | undefined;
      if (!kursRef) continue;
      // Kurs-ID aus der Ref-URL extrahieren
      const parts = kursRef.split('/');
      const id = parts[parts.length - 1];
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [anmeldungen]);

  const kursItems: KursItem[] = useMemo(() => {
    return kurse
      .map(k => {
        const maxTeilnehmer = (k.fields.maximale_teilnehmer as number) ?? 0;
        const belegtCount = belegtPerKurs[k.id] ?? 0;
        const freiePlaetze = maxTeilnehmer - belegtCount;
        const instrument = (k.fields.instrument as { key: string } | null)?.key ?? (k.fields.instrument as string) ?? '';
        const niveau = (k.fields.niveau as { key: string } | null)?.key ?? '';
        const wochentage = (k.fields.wochentage as Array<{ key: string } | string> | null) ?? [];
        const wochentageKeys = wochentage.map(w => (typeof w === 'string' ? w : w.key));
        const uhrzeit = formatUhrzeit(k.fields.uhrzeit as string | null);
        const preis = (k.fields.preis as number | null) ?? null;

        const subtitleParts: string[] = [];
        if (niveauLabel(niveau)) subtitleParts.push(niveauLabel(niveau));
        if (wochentageKeys.length > 0) subtitleParts.push(wochentageLabel(wochentageKeys));
        if (uhrzeit) subtitleParts.push(uhrzeit + ' Uhr');
        if (preis !== null) subtitleParts.push(`${preis.toFixed(2).replace('.', ',')} €`);

        const statusKey = freiePlaetze > 0 ? 'verfuegbar' : 'warteliste';
        const statusLabel = freiePlaetze > 0
          ? tx`${freiePlaetze} freie Plätze`
          : tx('Warteliste');

        return {
          id: k.id,
          title: (k.fields.titel as string) ?? k.id,
          subtitle: instrumentLabel(instrument) + (subtitleParts.length > 0 ? ' · ' + subtitleParts.join(' · ') : ''),
          status: { key: statusKey, label: statusLabel },
          stats: [
            {
              label: tx('Plätze'),
              value: `${belegtCount}/${maxTeilnehmer}`,
            },
          ],
          maxTeilnehmer,
          belegtCount,
        };
      })
      .sort((a, b) => {
        // Kurse mit freien Plätzen zuerst
        const aFrei = a.maxTeilnehmer - a.belegtCount;
        const bFrei = b.maxTeilnehmer - b.belegtCount;
        if (aFrei > 0 && bFrei <= 0) return -1;
        if (aFrei <= 0 && bFrei > 0) return 1;
        return a.title.localeCompare(b.title);
      });
  }, [kurse, belegtPerKurs]);

  const selectedKurs = useMemo(
    () => kursItems.find(k => k.id === selectedKursId) ?? null,
    [kursItems, selectedKursId],
  );

  const submit = useMemo(() => {
    if (!port) return null;
    return useJourneySubmit; // only resolved below
  }, [port]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  void submit; // suppress lint — journeySubmit is below

  const journeySubmit = useJourneySubmit(
    port ?? createPublicPort(cfg ?? ({} as PublicPagesConfig), page ?? ({} as PublicPageConfig)),
    port
      ? [
          { key: 'kind', entity: 'teilnehmer', form: kind as StepForm },
          {
            key: 'anmeldung',
            entity: 'anmeldungen',
            form: anmForm as StepForm,
            primary: true,
            needs: ['kind'],
            link: { teilnehmer: 'kind' },
            values: (_ctx) => {
              const kursRef = selectedKursId && cfg && page
                ? recordRef(cfg, page, (page.endpoints?.find(e => e.op === 'list' && (e as { entity?: string }).entity === 'kurse') as { app_id?: string } | undefined)?.app_id ?? '', selectedKursId)
                : '';
              const belegtCount = selectedKursId ? (belegtPerKurs[selectedKursId] ?? 0) : 0;
              const maxTn = selectedKurs?.maxTeilnehmer ?? 0;
              const istVoll = belegtCount >= maxTn;
              return {
                kurs: kursRef,
                anmeldedatum: todayIso(),
                status: istVoll ? 'warteliste' : 'neu',
              };
            },
          },
        ]
      : [],
    { draftKey: 'kursanmeldung' },
  );

  const handleFirstInteraction = () => {
    if (!cfg || !page) return;
    const ep = page.endpoints?.find(e => e.op === 'create' && (e as { entity?: string }).entity === 'teilnehmer') as { app_id?: string } | undefined;
    if (ep?.app_id) {
      prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
    }
  };

  if (loading || dataLoading) {
    return <PublicShell loading />;
  }
  if (unavailable || !cfg || !page) {
    return <PublicShell unavailable />;
  }

  const restart = () => {
    journeySubmit.reset();
    kind.reset();
    anmForm.reset({ anmeldedatum: todayIso() });
    setSelectedKursId(null);
    setStep(1);
  };

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind online für einen Kurs der Musikschule Klangraum an.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[kind, anmForm]}
        draftKey="kursanmeldung"
        intro={{
          description: tx('In drei Schritten zum Kursplatz: Kurs wählen, Kindesdaten eingeben, absenden.'),
          estimatedMinutes: 3,
        }}
      >
        {/* Step 1: Kurs wählen */}
        {step === 1 && !journeySubmit.result && (
          <div onClick={handleFirstInteraction}>
            <EntitySelectStep
              items={kursItems}
              selectedId={selectedKursId}
              avatar="none"
              searchPlaceholder={tx('Kurs suchen…')}
              emptyText={tx('Keine Kurse mit freien Plätzen verfügbar.')}
              onSelect={(id) => {
                setSelectedKursId(id);
                const kursEp = page.endpoints?.find(e => e.op === 'list' && (e as { entity?: string }).entity === 'kurse') as { app_id?: string } | undefined;
                if (cfg && kursEp?.app_id) {
                  anmForm.set('kurs', id, kursItems.find(k => k.id === id)?.title ?? '');
                }
              }}
            />
            {selectedKurs && (
              <div className="mt-4 p-4 rounded-lg border bg-muted/40">
                <p className="text-sm font-medium mb-2">{selectedKurs.title}</p>
                <BudgetTracker
                  budget={selectedKurs.maxTeilnehmer}
                  booked={selectedKurs.belegtCount}
                  format="count"
                  unit={tx('Plätze')}
                  showRemaining
                />
                {selectedKurs.belegtCount >= selectedKurs.maxTeilnehmer && (
                  <p className="text-sm text-amber-700 mt-2">
                    {tx('Dieser Kurs ist ausgebucht. Dein Kind wird auf die Warteliste gesetzt.')}
                  </p>
                )}
              </div>
            )}
            <StepNav
              hideBack
              nextStepLabel={tx('Angaben zum Kind')}
              onNext={() => {
                if (!selectedKursId) return tx('Bitte wähle einen Kurs aus.');
                return true;
              }}
            />
          </div>
        )}

        {/* Step 2: Angaben zum Kind */}
        {step === 2 && !journeySubmit.result && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field form={kind} name="vorname">
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  {...kind.field('vorname')}
                  placeholder={tx('Vorname des Kindes')}
                />
              </Field>
              <Field form={kind} name="nachname">
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  {...kind.field('nachname')}
                  placeholder={tx('Nachname des Kindes')}
                />
              </Field>
            </div>
            <Bound form={kind} name="geburtsdatum" hint={tx('Optional')} />
            <Field form={kind} name="erziehungsberechtigte_person" hint={tx('Name des Erziehungsberechtigten')}>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                {...kind.field('erziehungsberechtigte_person')}
                placeholder={tx('z. B. Maria Müller')}
              />
            </Field>
            <Field form={kind} name="email" hint={tx('Für die Bestätigung der Anmeldung')}>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                {...kind.field('email')}
                placeholder={tx('email@beispiel.de')}
              />
            </Field>
            <Field form={kind} name="telefon" hint={tx('Optional')}>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                {...kind.field('telefon')}
                placeholder={tx('+49 …')}
              />
            </Field>
            <StepNav
              onBack={() => setStep(1)}
              nextStepLabel={tx('Zusammenfassung')}
              onNext={() => kind.validate(['vorname', 'nachname'])}
            />
          </div>
        )}

        {/* Step 3: Zusammenfassung */}
        {step === 3 && !journeySubmit.result && (
          <>
            {selectedKurs && (
              <div className="mb-4 p-3 rounded-lg border bg-muted/40 text-sm">
                <span className="font-medium">{tx('Gewählter Kurs:')}</span>{' '}
                {selectedKurs.title}
                {selectedKurs.belegtCount >= selectedKurs.maxTeilnehmer && (
                  <StatusBadge statusKey="warteliste" label={tx('Warteliste')} tone="warning" className="ml-2" />
                )}
              </div>
            )}
            <SummaryStep
              forms={[kind]}
              submit={journeySubmit}
              whatHappensNext={tx('Die Musikschule Klangraum meldet sich mit einer Bestätigung. Bezahlung erfolgt nach Bestätigung durch das Team.')}
            />
          </>
        )}

        {/* Erfolg */}
        {journeySubmit.result && (
          <SuccessStep
            result={journeySubmit.result}
            forms={[kind]}
            submit={journeySubmit}
            restartLabel={tx('Weiteres Kind anmelden')}
            whatHappensNext={tx('Das Team der Musikschule Klangraum bestätigt die Anmeldung in Kürze per E-Mail.')}
            referencePrefix="A"
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
