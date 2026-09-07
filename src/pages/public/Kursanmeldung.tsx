import { useEffect, useMemo, useState } from 'react';
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
import { tx } from '@/i18n';
import { useStepForm } from '@/lib/journey/useStepForm';
import { useJourneySubmit } from '@/lib/journey/useJourneySubmit';
import { createPublicPort } from '@/lib/journey/publicPort';
import { todayIso } from '@/lib/journey/format';
import { ENTITIES } from '@/lib/journey/rules';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { format, parseISO } from 'date-fns';
import { IconMusic, IconCalendar, IconUsers, IconAlertTriangle } from '@tabler/icons-react';

// Lookup labels for instruments and levels – derived inside the component body
interface KursRecord {
  id: string;
  titel: string;
  instrument: string;
  niveau: string | null;
  beginn: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number;
  freiePlaetze: number;
}

function formatBeginn(beginn: string | null): string {
  if (!beginn) return '—';
  try {
    return format(parseISO(beginn), 'dd.MM.yyyy');
  } catch {
    return beginn;
  }
}

function formatUhrzeit(uhrzeit: string | null): string {
  if (!uhrzeit) return '';
  try {
    return format(parseISO(uhrzeit), 'HH:mm') + ' Uhr';
  } catch {
    return '';
  }
}

interface KursCardProps {
  kurs: KursRecord;
  selected: boolean;
  onSelect: () => void;
}

function KursCard({ kurs, selected, onSelect }: KursCardProps) {
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

  const noBusy = kurs.freiePlaetze <= 0;
  return (
    <button
      type="button"
      onClick={noBusy ? undefined : onSelect}
      disabled={noBusy}
      aria-pressed={selected}
      className={`w-full text-left rounded-2xl border p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        noBusy
          ? 'opacity-50 cursor-not-allowed border-border bg-muted/30'
          : selected
          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
          : 'border-border bg-card hover:border-primary/50 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{kurs.titel}</p>
          <p className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
            <span className="inline-flex items-center gap-1">
              <IconMusic size={13} className="shrink-0" aria-hidden="true" />
              {INSTRUMENT_LABELS[kurs.instrument] ?? kurs.instrument}
            </span>
            {kurs.niveau && (
              <span>{NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau}</span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          {noBusy ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
              <IconAlertTriangle size={13} aria-hidden="true" />
              {tx('Ausgebucht')}
            </span>
          ) : (
            <span className={`text-sm font-semibold ${kurs.freiePlaetze <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {/* i18n-exempt: interpolated tx below */}
              {tx`${kurs.freiePlaetze} freie Plätze`}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
        {kurs.beginn && (
          <span className="inline-flex items-center gap-1">
            <IconCalendar size={12} className="shrink-0" aria-hidden="true" />
            {tx('Beginn')}: {formatBeginn(kurs.beginn)}
          </span>
        )}
        {kurs.uhrzeit && (
          <span>{formatUhrzeit(kurs.uhrzeit)}</span>
        )}
        <span className="inline-flex items-center gap-1">
          <IconUsers size={12} className="shrink-0" aria-hidden="true" />
          {tx`${kurs.maximale_teilnehmer} Plätze gesamt`}
        </span>
      </div>
    </button>
  );
}

export default function Kursanmeldung() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [kursError, setKursError] = useState<string | undefined>(undefined);

  const [step, setStep] = useState(1);

  // ALL hooks before any early return
  const kind = useMemo(() => createPublicPort(cfg!, page!), [cfg, page]);

  const teilnehmerForm = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'erziehungsberechtigte_person', 'email', 'telefon'],
    required: { vorname: true, nachname: true },
    steps: { vorname: 2, nachname: 2, geburtsdatum: 2, erziehungsberechtigte_person: 2, email: 2, telefon: 2 },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    kind,
    [
      { key: 'teilnehmer', entity: 'teilnehmer', form: teilnehmerForm },
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        primary: true,
        needs: ['teilnehmer'],
        link: { teilnehmer: 'teilnehmer' },
        values: () => ({
          kurs: selectedKursId ?? '',
          anmeldedatum: todayIso(),
        }),
      },
    ],
    { draftKey: 'kursanmeldung' },
  );

  useEffect(() => {
    loadPublicPagesConfig('kursanmeldung')
      .then(async c => {
        if (!c) { setUnavailable(true); setLoading(false); return; }
        const p = c.pages['kursanmeldung'] ?? null;
        if (!p) { setUnavailable(true); setLoading(false); return; }
        setCfg(c);
        setPage(p);

        // Load kurse and anmeldungen in parallel
        const kurseAppId = ENTITIES.kurse.appId;
        const anmeldungenAppId = ENTITIES.anmeldungen.appId;
        const [kurseRaw, anmeldungenRaw] = await Promise.all([
          listPublicRecords(c, p, { appId: kurseAppId, limit: 500 }),
          listPublicRecords(c, p, { appId: anmeldungenAppId, limit: 500 }),
        ]);

        // Count active registrations per kurs (status != abgemeldet)
        const belegtMap: Record<string, number> = {};
        Object.values(anmeldungenRaw as Record<string, PublicRecordResult>).forEach(r => {
          const status = r.fields.status as string | null;
          if (status === 'abgemeldet') return;
          // kurs field is a record URL — extract the id at the end
          const kursRef = r.fields.kurs as string | null;
          if (!kursRef) return;
          const parts = kursRef.split('/');
          const kursId = parts[parts.length - 1];
          belegtMap[kursId] = (belegtMap[kursId] ?? 0) + 1;
        });

        const kursListe: KursRecord[] = Object.values(kurseRaw as Record<string, PublicRecordResult>).map(r => {
          const kursId = r.id;
          const maxTn = (r.fields.maximale_teilnehmer as number) ?? 0;
          const belegt = belegtMap[kursId] ?? 0;
          return {
            id: kursId,
            titel: (r.fields.titel as string) ?? '',
            instrument: (r.fields.instrument as string) ?? '',
            niveau: (r.fields.niveau as string | null) ?? null,
            beginn: (r.fields.beginn as string | null) ?? null,
            uhrzeit: (r.fields.uhrzeit as string | null) ?? null,
            maximale_teilnehmer: maxTn,
            freiePlaetze: Math.max(0, maxTn - belegt),
          };
        });

        // Sort: available first, then by beginn
        kursListe.sort((a, b) => {
          if (a.freiePlaetze > 0 && b.freiePlaetze === 0) return -1;
          if (a.freiePlaetze === 0 && b.freiePlaetze > 0) return 1;
          return (a.beginn ?? '').localeCompare(b.beginn ?? '');
        });

        setKurse(kursListe);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading && unavailable} />;
  }

  const selectedKurs = kurse.find(k => k.id === selectedKursId) ?? null;

  const handleKursWeiter = () => {
    if (!selectedKursId) {
      setKursError(tx('Bitte wähle einen Kurs aus.'));
      return false;
    }
    // Warm up the challenge for subsequent creates
    const tnEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'teilnehmer');
    if (tnEp?.app_id) prepareChallenge(cfg, page, 'POST', `/apps/${tnEp.app_id}/records`);
    setKursError(undefined);
    return true;
  };

  const restart = () => {
    submit.reset();
    teilnehmerForm.reset();
    setSelectedKursId(null);
    setKursError(undefined);
    setStep(1);
  };

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind online für einen unserer Kurse an.')}
    >
      <IntentWizardShell
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[teilnehmerForm]}
        draftKey="kursanmeldung"
      >
        <WizardStep
          label={tx('Kurs wählen')}
          description={tx('Wähle einen Kurs mit freien Plätzen aus.')}
        >
          {kurse.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              {tx('Aktuell sind keine Kurse verfügbar.')}
            </div>
          ) : (
            <div className="space-y-3">
              {kurse.map(k => (
                <KursCard
                  key={k.id}
                  kurs={k}
                  selected={selectedKursId === k.id}
                  onSelect={() => { setSelectedKursId(k.id); setKursError(undefined); }}
                />
              ))}
            </div>
          )}
          {kursError && (
            <p role="alert" className="text-sm text-destructive mt-2">{kursError}</p>
          )}
          <StepNav
            onNext={handleKursWeiter}
            nextStepLabel={tx('Angaben zum Kind')}
            hideBack
          />
        </WizardStep>

        <WizardStep
          label={tx('Angaben zum Kind')}
          description={tx('Fülle die Felder aus. Pflichtfelder sind mit * markiert.')}
        >
          <div className="space-y-4">
            {selectedKurs && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
                <span className="font-medium">{tx('Gewählter Kurs')}: </span>
                {selectedKurs.titel}
                {selectedKurs.beginn && (
                  <span className="text-muted-foreground"> · {tx('Beginn')}: {formatBeginn(selectedKurs.beginn)}</span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field form={teilnehmerForm} name="vorname">
                <Input {...teilnehmerForm.field('vorname')} />
              </Field>
              <Field form={teilnehmerForm} name="nachname">
                <Input {...teilnehmerForm.field('nachname')} />
              </Field>
            </div>

            <Field form={teilnehmerForm} name="geburtsdatum" hint={tx('Format: TT.MM.JJJJ')}>
              <Input {...teilnehmerForm.field('geburtsdatum')} placeholder="TT.MM.JJJJ" /* i18n-exempt */ />
            </Field>

            <Field
              form={teilnehmerForm}
              name="erziehungsberechtigte_person"
              hint={tx('Für Minderjährige: Name eines Erziehungsberechtigten')}
            >
              <Input {...teilnehmerForm.field('erziehungsberechtigte_person')} />
            </Field>

            <Field form={teilnehmerForm} name="email" hint={tx('Für die Anmeldebestätigung')}>
              <Input {...teilnehmerForm.field('email')} />
            </Field>

            <Field form={teilnehmerForm} name="telefon">
              <Input {...teilnehmerForm.field('telefon')} />
            </Field>
          </div>

          <StepNav
            onNext={() => teilnehmerForm.validate(['vorname', 'nachname', 'email', 'telefon'])}
            nextStepLabel={tx('Prüfen')}
          />
        </WizardStep>

        <WizardStep label={tx('Prüfen')}>
          {!submit.result && (
            <SummaryStep
              forms={[teilnehmerForm]}
              submit={submit}
              items={
                selectedKurs
                  ? [
                      {
                        key: 'kurs',
                        keys: ['kurs'],
                        label: tx('Kurs'),
                        value: selectedKurs.titel,
                        step: 1,
                        fieldId: 'kurs-select',
                      },
                    ]
                  : []
              }
              whatHappensNext={tx('Das Team der Musikschule prüft deine Anmeldung und gibt dir Bescheid. Status und Bezahlung werden nach der Prüfung festgelegt.')}
              confirmLabel={tx('Jetzt anmelden')}
            />
          )}
          {submit.result && (
            <SuccessStep
              result={submit.result}
              forms={[teilnehmerForm]}
              whatHappensNext={tx('Wir melden uns in Kürze mit einer Bestätigung. Bitte überprüfe auch deinen Spam-Ordner.')}
              submit={submit}
              restartLabel={tx('Weiteres Kind anmelden')}
            />
          )}
        </WizardStep>
      </IntentWizardShell>
    </PublicShell>
  );
}
