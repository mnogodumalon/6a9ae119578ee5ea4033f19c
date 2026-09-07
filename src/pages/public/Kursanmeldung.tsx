import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { useStepForm, useJourneySubmit } from '@/lib/journey';
import { todayIso } from '@/lib/journey/format';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Input } from '@/components/ui/input';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';
import { format } from 'date-fns';
import {
  IconMusic,
  IconCalendar,
  IconUsers,
  IconCurrencyEuro,
  IconCheck,
  IconSchool,
  IconAlertCircle,
} from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KursRecord {
  id: string;
  titel: string;
  instrument: string | null;
  niveau: string | null;
  wochentage: string[] | null;
  dozentRef: string | null;
  beginn: string | null;
  maximale_teilnehmer: number | null;
  preis: number | null;
}

interface DozentRecord {
  id: string;
  vorname: string;
  nachname: string;
}

// ---------------------------------------------------------------------------
// Helper: extract record-id from a reference URL
// ---------------------------------------------------------------------------
function extractId(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref) return null;
  const idx = ref.lastIndexOf('/records/');
  if (idx === -1) return null;
  return ref.slice(idx + 9) || null;
}

// ---------------------------------------------------------------------------
// Lookup labels (static, hardcoded from schema — no live fetch)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// KursCard
// ---------------------------------------------------------------------------
interface KursCardProps {
  kurs: KursRecord;
  dozentName: string | null;
  freie_plaetze: number;
  selected: boolean;
  onSelect: () => void;
}

function KursCard({ kurs, dozentName, freie_plaetze, selected, onSelect }: KursCardProps) {
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

  const instrument = kurs.instrument ? (INSTRUMENT_LABELS[kurs.instrument] ?? kurs.instrument) : null;
  const niveau = kurs.niveau ? (NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau) : null;
  const wochentage = kurs.wochentage
    ? kurs.wochentage.map(w => WOCHENTAG_LABELS[w] ?? w).join(', ')
    : null;
  const beginn = kurs.beginn
    ? format(new Date(kurs.beginn + 'T00:00:00'), 'dd.MM.yyyy')
    : null;
  const voll = freie_plaetze <= 0;

  return (
    <button
      type="button"
      onClick={voll ? undefined : onSelect}
      disabled={voll}
      aria-pressed={selected}
      className={`w-full text-left rounded-2xl border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        voll
          ? 'border-border bg-muted/30 opacity-60 cursor-not-allowed'
          : selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/20 cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground truncate">{kurs.titel}</span>
            {selected && !voll && (
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <IconCheck size={12} stroke={2.5} className="text-primary-foreground" aria-hidden="true" />
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {instrument && (
              <span className="flex items-center gap-1">
                <IconMusic size={13} className="shrink-0" aria-hidden="true" />
                {instrument}
              </span>
            )}
            {niveau && <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{niveau}</span>}
            {wochentage && (
              <span className="flex items-center gap-1">
                <IconCalendar size={13} className="shrink-0" aria-hidden="true" />
                {wochentage}
              </span>
            )}
            {beginn && <span>{tx('ab')} {beginn}</span>}
            {dozentName && (
              <span className="flex items-center gap-1">
                <IconSchool size={13} className="shrink-0" aria-hidden="true" />
                {dozentName}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right space-y-1">
          {kurs.preis != null && (
            <div className="flex items-center gap-0.5 font-semibold text-foreground">
              <IconCurrencyEuro size={14} className="shrink-0" aria-hidden="true" />
              <span>{kurs.preis.toFixed(0)}</span>
            </div>
          )}
          <div className={`flex items-center gap-1 text-xs font-medium ${voll ? 'text-destructive' : freie_plaetze <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
            <IconUsers size={12} className="shrink-0" aria-hidden="true" />
            {voll ? tx('Ausgebucht') : tx`${freie_plaetze} frei`}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Kursanmeldung() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [dozenten, setDozenten] = useState<DozentRecord[]>([]);
  const [anmeldungCounts, setAnmeldungCounts] = useState<Record<string, number>>({});
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  // ALL hooks before any early return
  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const kindForm = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
    required: { vorname: true, nachname: true },
    steps: {
      vorname: 2, nachname: 2, geburtsdatum: 2, email: 2, telefon: 2, erziehungsberechtigte_person: 2,
    },
    autoComplete: true,
  });

  // kursForm captures course selection + registration date for the summary
  const kursForm = useStepForm('anmeldungen', {
    fields: ['kurs', 'anmeldedatum'],
    required: { kurs: true, anmeldedatum: true },
    initial: { anmeldedatum: todayIso() },
    steps: { kurs: 1, anmeldedatum: 1 },
    autoComplete: true,
  });

  // Plan is stable — arrays are re-created each render but useJourneySubmit
  // reads the latest plan via a ref internally.
  const submit = useJourneySubmit(
    // When port is not yet ready, we pass a dummy-like port; but because cfg/page
    // are loaded before the component renders past its loading guard, port is always
    // defined here. We still need a fallback to satisfy TypeScript before guards.
    port ?? { door: 'public', list: async () => [], count: async () => null, get: async () => null, create: async () => ({ id: '', fields: {}, createdAt: null }), ref: () => '' },
    [
      {
        key: 'teilnehmer',
        entity: 'teilnehmer',
        form: kindForm,
        label: tx('Kind anlegen'),
      },
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: kursForm,
        primary: true,
        needs: ['teilnehmer'],
        link: { teilnehmer: 'teilnehmer' },
        label: tx('Anmeldung anlegen'),
      },
    ],
    { draftKey: 'kursanmeldung' },
  );

  // Load config + data
  useEffect(() => {
    loadPublicPagesConfig('kursanmeldung').then(c => {
      if (!c) {
        setLoadingData(false);
        return;
      }
      setCfg(c);
      const p = c.pages['kursanmeldung'] ?? null;
      setPage(p);
      if (!p) {
        setLoadingData(false);
        return;
      }

      const kurseEp = p.endpoints?.find(e => e.op === 'list' && e.entity === 'kurse');
      const anmEp = p.endpoints?.find(e => e.op === 'list' && e.entity === 'anmeldungen');
      const dozEp = p.endpoints?.find(e => e.op === 'list' && e.entity === 'dozenten');

      Promise.all([
        kurseEp ? listPublicRecords(c, p, { appId: kurseEp.app_id, limit: 500 }) : Promise.resolve<Record<string, import('@/lib/publicClient').PublicRecordResult>>({}),
        anmEp ? listPublicRecords(c, p, { appId: anmEp.app_id, limit: 500 }) : Promise.resolve<Record<string, import('@/lib/publicClient').PublicRecordResult>>({}),
        dozEp ? listPublicRecords(c, p, { appId: dozEp.app_id, limit: 200 }) : Promise.resolve<Record<string, import('@/lib/publicClient').PublicRecordResult>>({}),
      ]).then(([kurseMap, anmMap, dozMap]) => {
        // Parse dozenten
        const dozList: DozentRecord[] = Object.entries(dozMap).map(([id, r]) => ({
          id: r.id ?? id,
          vorname: (r.fields.vorname as string) ?? '',
          nachname: (r.fields.nachname as string) ?? '',
        }));
        setDozenten(dozList);

        // Parse anmeldungen — count per kurs
        const counts: Record<string, number> = {};
        Object.values(anmMap).forEach(r => {
          const kursRef = r.fields.kurs as string | undefined;
          if (!kursRef) return;
          const kursId = extractId(kursRef);
          if (!kursId) return;
          counts[kursId] = (counts[kursId] ?? 0) + 1;
        });
        setAnmeldungCounts(counts);

        // Parse kurse
        const kursList: KursRecord[] = Object.entries(kurseMap).map(([id, r]) => {
          const wt = r.fields.wochentage;
          return {
            id: r.id ?? id,
            titel: (r.fields.titel as string) ?? '',
            instrument: (r.fields.instrument as string | null) ?? null,
            niveau: (r.fields.niveau as string | null) ?? null,
            wochentage: Array.isArray(wt) ? (wt as string[]) : null,
            dozentRef: (r.fields.dozent as string | null) ?? null,
            beginn: (r.fields.beginn as string | null) ?? null,
            maximale_teilnehmer: (r.fields.maximale_teilnehmer as number | null) ?? null,
            preis: (r.fields.preis as number | null) ?? null,
          };
        });

        // Filter: only kurse with free seats
        const withFree = kursList.filter(k => {
          const max = k.maximale_teilnehmer ?? 0;
          const belegt = counts[k.id] ?? 0;
          return max > belegt;
        });

        // Sort by beginn
        withFree.sort((a, b) => (a.beginn ?? '').localeCompare(b.beginn ?? ''));
        setKurse(withFree);
        setLoadingData(false);
      }).catch(err => {
        if (err instanceof PageUnavailableError) {
          setLoadError(err);
        } else {
          setLoadError(err instanceof Error ? err : new Error(String(err)));
        }
        setLoadingData(false);
      });
    }).catch(() => setLoadingData(false));
  }, []);

  // prepareChallenge on first interaction
  const handleFirstInteraction = () => {
    if (!cfg || !page) return;
    const tnEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'teilnehmer');
    if (tnEp) prepareChallenge(cfg, page, 'POST', `/apps/${tnEp.app_id}/records`);
  };

  if (loadingData) {
    return <PublicShell loading />;
  }

  if (loadError instanceof PageUnavailableError || (!loadingData && !page)) {
    return <PublicShell unavailable />;
  }

  if (!cfg || !page || !port || !submit) {
    return <PublicShell unavailable />;
  }

  const selectedKurs = kurse.find(k => k.id === selectedKursId) ?? null;

  const dozentName = (kurs: KursRecord) => {
    const id = extractId(kurs.dozentRef);
    if (!id) return null;
    const d = dozenten.find(dz => dz.id === id);
    return d ? `${d.vorname} ${d.nachname}` : null;
  };

  const handleKursSelect = (kursId: string, kurs: KursRecord) => {
    setSelectedKursId(kursId);
    kursForm.set('kurs', kursId, kurs.titel);
  };

  const validateKursStep = (): boolean => {
    if (!selectedKursId) {
      return false;
    }
    return true;
  };

  const restart = () => {
    submit.reset();
    kindForm.reset();
    kursForm.reset({ anmeldedatum: todayIso() });
    setSelectedKursId(null);
    setStep(1);
  };

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind für einen Kurs an der Musikschule Klangraum an.')}
    >
      <div onPointerEnter={handleFirstInteraction} onFocus={handleFirstInteraction}>
        <IntentWizardShell
          currentStep={step}
          onStepChange={setStep}
          back={false}
          forms={[kursForm, kindForm]}
          draftKey="kursanmeldung"
        >
          <WizardStep
            label={tx('Kurs wählen')}
            description={tx('Wähle einen Kurs mit freien Plätzen.')}
          >
            {kurse.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <IconAlertCircle size={40} className="text-muted-foreground" aria-hidden="true" />
                <p className="text-muted-foreground text-sm max-w-xs">
                  {tx('Aktuell gibt es keine Kurse mit freien Plätzen. Bitte schau später noch einmal vorbei.')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {kurse.map(k => {
                  const max = k.maximale_teilnehmer ?? 0;
                  const belegt = anmeldungCounts[k.id] ?? 0;
                  const freie = Math.max(0, max - belegt);
                  return (
                    <KursCard
                      key={k.id}
                      kurs={k}
                      dozentName={dozentName(k)}
                      freie_plaetze={freie}
                      selected={selectedKursId === k.id}
                      onSelect={() => handleKursSelect(k.id, k)}
                    />
                  );
                })}
              </div>
            )}

            {!selectedKursId && kurse.length > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                {tx('Bitte wähle einen Kurs aus.')}
              </p>
            )}

            <StepNav
              hideBack
              onNext={() => {
                if (!validateKursStep()) return tx('Bitte wähle zuerst einen Kurs aus.');
                return true;
              }}
              nextStepLabel={tx('Angaben zum Kind')}
            />
          </WizardStep>

          <WizardStep
            label={tx('Angaben zum Kind')}
            description={tx('Gib die Daten des Kindes ein, das angemeldet werden soll.')}
          >
            <div className="space-y-4">
              {selectedKurs && (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedKurs.titel}</span>
                  {selectedKurs.instrument && (
                    <span> · {INSTRUMENT_LABELS[selectedKurs.instrument] ?? selectedKurs.instrument}</span>
                  )}
                  {selectedKurs.beginn && (
                    <span> · {tx('ab')} {format(new Date(selectedKurs.beginn + 'T00:00:00'), 'dd.MM.yyyy')}</span>
                  )}
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

              <Field form={kindForm} name="erziehungsberechtigte_person" hint={tx('Name des Erziehungsberechtigten')}>
                <Input {...kindForm.field('erziehungsberechtigte_person')} />
              </Field>
            </div>

            <StepNav
              onNext={() => kindForm.validate(['vorname', 'nachname', 'email', 'telefon', 'geburtsdatum', 'erziehungsberechtigte_person'])}
              nextStepLabel={tx('Prüfen & Absenden')}
            />
          </WizardStep>

          <WizardStep label={tx('Prüfen & Absenden')}>
            {!submit.result && (
              <SummaryStep
                forms={[kursForm, kindForm]}
                submit={submit}
                whatHappensNext={tx('Das Büro der Musikschule prüft die Anmeldung und meldet sich per E-Mail bei dir.')}
                confirmLabel={tx('Jetzt anmelden')}
              />
            )}
          </WizardStep>

          {submit.result && (
            <SuccessStep
              result={submit.result}
              forms={[kursForm, kindForm]}
              whatHappensNext={tx('Das Büro der Musikschule bestätigt die Anmeldung und nimmt Kontakt mit dir auf.')}
              submit={submit}
              restartLabel={tx('Weiteres Kind anmelden')}
              next={[]}
            />
          )}
        </IntentWizardShell>
      </div>
    </PublicShell>
  );
}
