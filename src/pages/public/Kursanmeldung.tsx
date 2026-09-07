/**
 * Kursanmeldung — Eltern melden ihr Kind für einen Kurs an (3 Schritte).
 *
 * Schritt 1: Kurs auswählen (nur geplante Kurse mit freien Plätzen)
 * Schritt 2: Kind-Daten eingeben
 * Schritt 3: Zusammenfassung bestätigen → Anmeldung anlegen
 *
 * Schreibt: teilnehmer (neu) + anmeldungen (verknüpft mit Kurs und Teilnehmer).
 * Preset: status='neu' (oder 'warteliste' bei vollem Kurs), bezahlt=false,
 *         anmeldedatum=heute.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  IconMusic,
  IconCalendar,
  IconClock,
  IconUsers,
  IconCurrencyEuro,
  IconSchool,
  IconCheck,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { useStepForm } from '@/lib/journey/useStepForm';
import { useJourneySubmit } from '@/lib/journey/useJourneySubmit';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';

// ---------------------------------------------------------------------------
// Typen für Kurs-Datensätze
// ---------------------------------------------------------------------------
interface KursRecord {
  id: string;
  titel: string;
  instrument: string;
  niveau: string | null;
  wochentage: string[];
  beginn: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number;
  preis: number | null;
  status: string;
  freiePlaetze: number; // client-side berechnet
}

interface AnmeldungRecord {
  id: string;
  kurs: string | null; // URL-Referenz
  status: string | null;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

const WOCHENTAG_LABELS: Record<string, string> = /* i18n-exempt */ {
  montag: 'Mo',
  dienstag: 'Di',
  mittwoch: 'Mi',
  donnerstag: 'Do',
  freitag: 'Fr',
  samstag: 'Sa',
};

const INSTRUMENT_LABELS: Record<string, string> = /* i18n-exempt */ {
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

const NIVEAU_LABELS: Record<string, string> = /* i18n-exempt */ {
  anfaenger: 'Anfänger',
  fortgeschritten: 'Fortgeschrittene',
  profi: 'Profis',
};

function extractRecordIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1] || null;
}

function formatUhrzeit(dt: string | null): string {
  if (!dt) return '';
  // datetimeminute: "2025-01-15T10:30"
  const t = dt.split('T')[1];
  return t ? t.slice(0, 5) : '';
}

function formatBeginn(d: string | null): string {
  if (!d) return '';
  // date: "2025-01-15"
  try {
    const [year, month, day] = d.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return format(date, 'dd.MM.yyyy');
  } catch {
    return d;
  }
}

function formatPreis(p: number | null): string {
  if (p === null || p === undefined) return '';
  return p.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

// ---------------------------------------------------------------------------
// Wizard-Schritte
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Kurs-Karte
// ---------------------------------------------------------------------------
interface KursKarteProps {
  kurs: KursRecord;
  selected: boolean;
  onSelect: () => void;
}

function KursKarte({ kurs, selected, onSelect }: KursKarteProps) {
  const wochentage = (kurs.wochentage ?? [])
    .map(k => WOCHENTAG_LABELS[k] ?? k)
    .join(', ');
  const tage = wochentage || '–';
  const instrument = INSTRUMENT_LABELS[kurs.instrument] ?? kurs.instrument;
  const niveau = kurs.niveau ? (NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full text-left rounded-xl border-2 p-4 transition-all',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-primary/50 hover:bg-muted/40',
      ].join(' ')}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base truncate">{kurs.titel}</span>
            {selected && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full shrink-0">
                <IconCheck size={12} />
                {tx('Ausgewählt')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <IconMusic size={14} className="shrink-0" />
              {instrument}
              {niveau && <span className="text-xs">· {niveau}</span>}
            </span>
            {kurs.beginn && (
              <span className="flex items-center gap-1">
                <IconCalendar size={14} className="shrink-0" />
                {tx('ab')} {formatBeginn(kurs.beginn)}
              </span>
            )}
            {kurs.uhrzeit && (
              <span className="flex items-center gap-1">
                <IconClock size={14} className="shrink-0" />
                {tage} · {formatUhrzeit(kurs.uhrzeit)} {tx('Uhr')}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          {kurs.preis !== null && (
            <span className="flex items-center gap-0.5 font-medium text-sm">
              <IconCurrencyEuro size={14} className="shrink-0" />
              {formatPreis(kurs.preis)}
            </span>
          )}
          <span
            className={[
              'text-xs flex items-center gap-1',
              kurs.freiePlaetze <= 3 ? 'text-amber-600' : 'text-emerald-600',
            ].join(' ')}
          >
            <IconUsers size={12} className="shrink-0" />
            {tx`${kurs.freiePlaetze} freie Plätze`}
          </span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------
export default function Kursanmeldung() {
  const STEPS: WizardStep[] = [
  { label: tx('Kurs wählen'), key: 'kurs' },
  { label: tx('Kind-Daten'), key: 'kind' },
  { label: tx('Bestätigen'), key: 'bestaetigen' },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  // Kurs-Daten
  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [kurseLoading, setKurseLoading] = useState(false);
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [kursError, setKursError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  // Config laden
  useEffect(() => {
    loadPublicPagesConfig('kursanmeldung').then(c => {
      if (!c) {
        setUnavailable(true);
        setLoading(false);
        return;
      }
      setCfg(c);
      setPage(c.pages['kursanmeldung'] ?? null);
      if (!c.pages['kursanmeldung']) setUnavailable(true);
      setLoading(false);
    }).catch(err => {
      if (err instanceof PageUnavailableError) setUnavailable(true);
      setLoading(false);
    });
  }, []);

  // Kurse + Anmeldungen laden, sobald cfg/page vorhanden
  useEffect(() => {
    if (!cfg || !page) return;
    setKurseLoading(true);

    const kursEp = page.endpoints?.find(e => e.op === 'list' && e.entity === 'kurse');
    const anmEp = page.endpoints?.find(e => e.op === 'list' && e.entity === 'anmeldungen');

    if (!kursEp || !anmEp) {
      setKurseLoading(false);
      return;
    }

    Promise.all([
      listPublicRecords(cfg, page, { appId: kursEp.app_id, limit: 200 }),
      listPublicRecords(cfg, page, { appId: anmEp.app_id, limit: 500 }),
    ]).then(([kursMap, anmMap]) => {
      const kursRows = Object.values(kursMap) as PublicRecordResult[];
      const anmRows = Object.values(anmMap) as PublicRecordResult[];

      // Anmeldungen pro Kurs zählen (nur nicht-abgemeldet)
      const anmProKurs: Record<string, number> = {};
      for (const anm of anmRows) {
        const anmStatus = (anm.fields.status as string) ?? '';
        if (anmStatus === 'abgemeldet') continue;
        const kursRef = (anm.fields.kurs as string) ?? '';
        const kursId = extractRecordIdFromUrl(kursRef);
        if (kursId) {
          anmProKurs[kursId] = (anmProKurs[kursId] ?? 0) + 1;
        }
      }

      const result: KursRecord[] = kursRows
        .filter(r => (r.fields.status as string) === 'geplant')
        .map(r => {
          const maxTn = (r.fields.maximale_teilnehmer as number) ?? 0;
          const belegt = anmProKurs[r.id] ?? 0;
          const frei = Math.max(0, maxTn - belegt);
          return {
            id: r.id,
            titel: (r.fields.titel as string) ?? '',
            instrument: (r.fields.instrument as string) ?? '',
            niveau: (r.fields.niveau as string) ?? null,
            wochentage: (r.fields.wochentage as string[]) ?? [],
            beginn: (r.fields.beginn as string) ?? null,
            uhrzeit: (r.fields.uhrzeit as string) ?? null,
            maximale_teilnehmer: maxTn,
            preis: (r.fields.preis as number) ?? null,
            status: (r.fields.status as string) ?? '',
            freiePlaetze: frei,
          };
        })
        .filter(k => k.freiePlaetze > 0)
        .sort((a, b) => (a.beginn ?? '').localeCompare(b.beginn ?? ''));

      setKurse(result);
      setKurseLoading(false);
    }).catch(() => {
      setKurseLoading(false);
    });
  }, [cfg, page]);

  // Journey-Port
  const port = useMemo(() => {
    if (!cfg || !page) return null;
    return createPublicPort(cfg, page);
  }, [cfg, page]);

  // Formulare
  const kindForm = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
    required: { vorname: true, nachname: true },
    steps: {
      vorname: 2, nachname: 2, geburtsdatum: 2,
      email: 2, telefon: 2, erziehungsberechtigte_person: 2,
    },
    autoComplete: true,
  });

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  // Plan: 1. Teilnehmer anlegen, 2. Anmeldung anlegen
  const submitPlan = useMemo(() => {
    if (!port) return null;
    return [
      {
        key: 'teilnehmer',
        entity: 'teilnehmer' as const,
        form: kindForm,
      },
      {
        key: 'anmeldung',
        entity: 'anmeldungen' as const,
        primary: true,
        needs: ['teilnehmer'],
        link: { teilnehmer: 'teilnehmer' },
        values: ({ done: _done }: { done: Record<string, { id: string; fields: Record<string, unknown> }> }) => {
          const selectedKurs = kurse.find(k => k.id === selectedKursId);
          const isFull = selectedKurs ? selectedKurs.freiePlaetze <= 1 : false;
          const kursEp = page?.endpoints?.find(e => e.op === 'list' && e.entity === 'kurse');
          const kursRef = kursEp && selectedKursId
            ? port.ref(kursEp.app_id, selectedKursId)
            : '';
          return {
            kurs: kursRef,
            anmeldedatum: todayIso,
            status: isFull ? 'warteliste' : 'neu',
          };
        },
      },
    ];
  }, [port, kindForm, kurse, selectedKursId, page, todayIso]);

  const submit = useJourneySubmit(
    port ?? ({} as ReturnType<typeof createPublicPort>),
    submitPlan ?? [],
    { draftKey: 'kursanmeldung' },
  );

  const restart = useCallback(() => {
    submit.reset();
    kindForm.reset();
    setSelectedKursId(null);
    setStep(1);
  }, [submit, kindForm]);

  // Challenge vorbereiten beim ersten Schritt-Wechsel
  const handleKursWeiter = useCallback(() => {
    if (!selectedKursId) {
      setKursError(tx('Bitte wähle einen Kurs aus.'));
      return false;
    }
    setKursError(null);
    if (cfg && page) {
      const anmEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'anmeldungen');
      if (anmEp) prepareChallenge(cfg, page, 'POST', `/apps/${anmEp.app_id}/records`);
    }
    return true;
  }, [selectedKursId, cfg, page]);

  // Loading / Unavailable
  if (loading || (!cfg && !unavailable)) {
    return <PublicShell loading={true} unavailable={false} />;
  }
  if (unavailable || !cfg || !page) {
    return <PublicShell loading={false} unavailable={true} />;
  }

  const selectedKurs = kurse.find(k => k.id === selectedKursId);

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind online für einen Kurs an.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[kindForm]}
        draftKey="kursanmeldung"
      >
        {/* ── Schritt 1: Kurs wählen ── */}
        {step === 1 && (
          <div className="space-y-4">
            {kurseLoading && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {tx('Kurse werden geladen …')}
              </div>
            )}
            {!kurseLoading && kurse.length === 0 && (
              <div className="text-center py-8 space-y-2">
                <IconSchool size={40} className="mx-auto text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  {tx('Aktuell sind keine Kurse mit freien Plätzen verfügbar.')}
                </p>
              </div>
            )}
            {!kurseLoading && kurse.length > 0 && (
              <div className="space-y-3">
                {kurse.map(kurs => (
                  <KursKarte
                    key={kurs.id}
                    kurs={kurs}
                    selected={selectedKursId === kurs.id}
                    onSelect={() => {
                      setSelectedKursId(kurs.id);
                      setKursError(null);
                    }}
                  />
                ))}
              </div>
            )}
            {kursError && (
              <p className="text-sm text-destructive" role="alert">{kursError}</p>
            )}
            <StepNav
              hideBack
              onNext={handleKursWeiter}
              nextStepLabel={tx('Kind-Daten')}
            />
          </div>
        )}

        {/* ── Schritt 2: Kind-Daten ── */}
        {step === 2 && (
          <div className="space-y-4">
            {selectedKurs && (
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm flex items-center gap-2">
                <IconMusic size={16} className="shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{selectedKurs.titel}</span>
                  {selectedKurs.beginn && (
                    <span className="text-muted-foreground"> · {tx('ab')} {formatBeginn(selectedKurs.beginn)}</span>
                  )}
                </span>
              </div>
            )}
            <Field form={kindForm} name="vorname">
              <Input {...kindForm.field('vorname')} />
            </Field>
            <Field form={kindForm} name="nachname">
              <Input {...kindForm.field('nachname')} />
            </Field>
            <Bound form={kindForm} name="geburtsdatum" />
            <Field form={kindForm} name="erziehungsberechtigte_person" hint={tx('Vor- und Nachname des Erziehungsberechtigten')}>
              <Input {...kindForm.field('erziehungsberechtigte_person')} />
            </Field>
            <Field form={kindForm} name="email">
              <Input {...kindForm.field('email')} />
            </Field>
            <Field form={kindForm} name="telefon">
              <Input {...kindForm.field('telefon')} />
            </Field>
            <StepNav
              onNext={() => kindForm.validate(['vorname', 'nachname'])}
              nextStepLabel={tx('Bestätigen')}
            />
          </div>
        )}

        {/* ── Schritt 3: Bestätigen ── */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[kindForm]}
            submit={submit}
            whatHappensNext={tx('Wir prüfen deine Anmeldung und melden uns per E-Mail bei dir.')}
            items={selectedKurs ? [
              {
                key: 'kurs',
                label: tx('Kurs'),
                value: selectedKurs.titel,
                keys: ['kurs'],
                fieldId: 'kurs',
              },
            ] : []}
          />
        )}

        {/* ── Erfolg ── */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[kindForm]}
            whatHappensNext={tx('Wir prüfen deine Anmeldung und melden uns per E-Mail bei dir.')}
            next={[{ label: tx('Weitere Anmeldung'), onClick: restart }]}
            referencePrefix="A"
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
