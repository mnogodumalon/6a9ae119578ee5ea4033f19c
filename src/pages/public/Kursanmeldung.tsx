import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { useStepForm, useJourneySubmit, todayIso, fieldLookup, fieldNumber, fieldText, fieldDate } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IconMusic, IconUsers, IconCalendar, IconAlertCircle } from '@tabler/icons-react';
import type { SelectItem } from '@/components/blocks/EntitySelectStep';
import type { JourneyRecord } from '@/lib/journey';

const SLUG = 'kursanmeldung';

function kursToItem(
  record: JourneyRecord,
  freePlaces: number,
): SelectItem {
  const WOCHENTAG_LABELS: Record<string, string> = {
  montag: 'Mo',
  dienstag: 'Di',
  mittwoch: 'Mi',
  donnerstag: 'Do',
  freitag: 'Fr',
  samstag: 'Sa',
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

  const titel = fieldText(record, 'titel');
  const instrument = fieldLookup(record, 'instrument');
  const niveau = fieldLookup(record, 'niveau');
  const beginn = fieldDate(record, 'beginn');
  const wochentage = (record.fields.wochentage as Array<{ key: string; label: string }> | null) ?? [];

  const wochentageStr = wochentage.map(w => WOCHENTAG_LABELS[w.key] ?? w.label).join(', ');
  const instrLabel = instrument ? (INSTRUMENT_LABELS[instrument.key] ?? instrument.label) : '';

  const subtitleParts: string[] = [];
  if (instrLabel) subtitleParts.push(instrLabel);
  if (niveau) subtitleParts.push(niveau.label);
  if (beginn) subtitleParts.push(`ab ${beginn}`);
  if (wochentageStr) subtitleParts.push(wochentageStr);

  return {
    id: record.id,
    title: titel,
    subtitle: subtitleParts.join(' · '),
    stats: [
      { label: tx('Freie Plätze'), value: freePlaces },
    ],
  };
}

export default function Kursanmeldung() {
  const STEPS = [
  {
    label: tx('Kurs wählen'),
    heading: tx('Welchen Kurs möchtest du buchen?'),
    description: tx('Wähle einen Kurs mit freien Plätzen.'),
  },
  {
    label: tx('Kind-Daten'),
    heading: tx('Angaben zum Kind'),
    description: tx('Gib die Daten des Kindes ein, das den Kurs besuchen soll.'),
  },
  {
    label: tx('Prüfen'),
    heading: tx('Anmeldung prüfen'),
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurse, setKurse] = useState<JourneyRecord[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<JourneyRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [step, setStep] = useState(1);
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);

  // ALL hooks before early returns
  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const kursForm = useStepForm('anmeldungen', {
    fields: ['kurs'],
    steps: { kurs: 1 },
    required: { kurs: true },
    autoComplete: true,
  });

  const teilnehmerForm = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'erziehungsberechtigte_person', 'email', 'telefon'],
    steps: {
      vorname: 2,
      nachname: 2,
      geburtsdatum: 2,
      erziehungsberechtigte_person: 2,
      email: 2,
      telefon: 2,
    },
    required: {
      vorname: true,
      nachname: true,
    },
    initial: { anmeldedatum: todayIso() },
    autoComplete: true,
  });

  const anmeldungForm = useStepForm('anmeldungen', {
    fields: ['kurs', 'anmeldedatum'],
    required: { kurs: true },
    initial: { anmeldedatum: todayIso() },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port ?? ({} as ReturnType<typeof createPublicPort>),
    [
      {
        key: 'teilnehmer',
        entity: 'teilnehmer',
        form: teilnehmerForm,
      },
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: anmeldungForm,
        primary: true,
        needs: ['teilnehmer'],
        link: { teilnehmer: 'teilnehmer' },
      },
    ],
    { draftKey: 'kursanmeldung' },
  );

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) {
          setUnavailable(true);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);
    const p = createPublicPort(cfg, page);
    Promise.all([
      p.list('kurse', { limit: 200 }),
      p.list('anmeldungen', { limit: 500 }),
    ])
      .then(([k, a]) => {
        setKurse(k);
        setAnmeldungen(a);
      })
      .finally(() => setDataLoading(false));
  }, [cfg, page]);

  // Compute free places per kurs
  const freePlacesMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const kurs of kurse) {
      const max = fieldNumber(kurs, 'maximale_teilnehmer') ?? 0;
      const count = anmeldungen.filter(a => {
        const ref = a.fields.kurs as string | null;
        if (!ref) return false;
        // Extract record id from the URL or reference
        const parts = ref.split('/');
        return parts[parts.length - 1] === kurs.id;
      }).length;
      map[kurs.id] = Math.max(0, max - count);
    }
    return map;
  }, [kurse, anmeldungen]);

  // Only kurse with free places
  const availableKurse = useMemo(
    () => kurse.filter(k => (freePlacesMap[k.id] ?? 0) > 0),
    [kurse, freePlacesMap],
  );

  const kursItems = useMemo(
    () => availableKurse.map(k => kursToItem(k, freePlacesMap[k.id] ?? 0)),
    [availableKurse, freePlacesMap],
  );

  const selectedKurs = useMemo(
    () => (selectedKursId ? kurse.find(k => k.id === selectedKursId) : null),
    [kurse, selectedKursId],
  );

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading && unavailable} />;
  }

  const handleSelectKurs = (id: string) => {
    const label = kurse.find(k => k.id === id) ? fieldText(kurse.find(k => k.id === id)!, 'titel') : id;
    setSelectedKursId(id);
    kursForm.set('kurs', id, label);
    anmeldungForm.set('kurs', id, label);
  };

  const handleNextStep1 = () => {
    if (!selectedKursId) return tx('Bitte wähle einen Kurs aus.');
    return true;
  };

  const handleNextStep2 = () => {
    return teilnehmerForm.validate(['vorname', 'nachname', 'geburtsdatum', 'erziehungsberechtigte_person', 'email', 'telefon']);
  };

  const restart = () => {
    submit.reset();
    kursForm.reset();
    teilnehmerForm.reset();
    anmeldungForm.reset();
    setSelectedKursId(null);
    setStep(1);
  };

  const freePlaces = selectedKursId ? (freePlacesMap[selectedKursId] ?? 0) : null;
  const maxPlaces = selectedKurs ? (fieldNumber(selectedKurs, 'maximale_teilnehmer') ?? 0) : 0;
  const bookedPlaces = freePlaces !== null ? maxPlaces - freePlaces : 0;

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind für einen Kurs der Musikschule Klangraum an.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[kursForm, teilnehmerForm, anmeldungForm]}
        draftKey="kursanmeldung"
        loading={dataLoading}
      >
        {/* Schritt 1: Kurs wählen */}
        {step === 1 && !submit.done && (
          <>
            {kursItems.length === 0 && !dataLoading && (
              <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
                <IconAlertCircle size={48} stroke={1.5} />
                <p className="text-sm">{tx('Aktuell sind keine Kurse mit freien Plätzen verfügbar.')}</p>
              </div>
            )}
            {kursItems.length > 0 && (
              <EntitySelectStep
                items={kursItems}
                selectedId={selectedKursId}
                onSelect={handleSelectKurs}
                avatar="none"
                searchPlaceholder={tx('Kurs suchen …')}
                emptyIcon={<IconMusic size={32} stroke={1.5} />}
                emptyText={tx('Kein Kurs gefunden.')}
                columns={1}
              />
            )}

            {selectedKurs && (
              <div className="mt-4 rounded-lg border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <IconUsers size={16} className="shrink-0 text-muted-foreground" />
                  <span>{tx('Verfügbare Plätze')}</span>
                </div>
                <BudgetTracker
                  budget={maxPlaces}
                  booked={bookedPlaces}
                  format="count"
                  unit={tx('Plätze')}
                  showRemaining
                  texts={{
                    booked: tx('Belegt'),
                    of: tx('von'),
                    remaining: tx('frei'),
                    over: tx('Keine freien Plätze'),
                    none: tx('Keine Kapazität festgelegt'),
                  }}
                />
                {fieldDate(selectedKurs, 'beginn') && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IconCalendar size={14} className="shrink-0" />
                    <span>
                      {tx('Beginn')}: {fieldDate(selectedKurs, 'beginn')}
                    </span>
                  </div>
                )}
                <div className="mt-1">
                  <StatusBadge
                    statusKey={fieldLookup(selectedKurs, 'status')?.key}
                    label={fieldLookup(selectedKurs, 'status')?.label}
                  />
                </div>
              </div>
            )}

            <StepNav
              hideBack
              onNext={handleNextStep1}
              nextStepLabel={tx('Kind-Daten')}
            />
          </>
        )}

        {/* Schritt 2: Kind-Daten */}
        {step === 2 && !submit.done && (
          <>
            <div className="space-y-4">
              <Field form={teilnehmerForm} name="vorname">
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  {...teilnehmerForm.field('vorname')}
                  placeholder={tx('Vorname des Kindes')}
                />
              </Field>
              <Field form={teilnehmerForm} name="nachname">
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  {...teilnehmerForm.field('nachname')}
                  placeholder={tx('Nachname des Kindes')}
                />
              </Field>
              <Bound form={teilnehmerForm} name="geburtsdatum" />
              <Field form={teilnehmerForm} name="erziehungsberechtigte_person" hint={tx('Vollständiger Name der erziehungsberechtigten Person')}>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  {...teilnehmerForm.field('erziehungsberechtigte_person')}
                  placeholder={tx('z. B. Maria Müller')}
                />
              </Field>
              <Field form={teilnehmerForm} name="email" hint={tx('Für die Anmeldebestätigung')}>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  {...teilnehmerForm.field('email')}
                  placeholder={tx('ihre@email.de')}
                />
              </Field>
              <Field form={teilnehmerForm} name="telefon">
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  {...teilnehmerForm.field('telefon')}
                  placeholder={tx('+49 …')}
                />
              </Field>
            </div>
            <StepNav
              onBack={() => setStep(1)}
              onNext={handleNextStep2}
              nextStepLabel={tx('Prüfen')}
            />
          </>
        )}

        {/* Schritt 3: Zusammenfassung */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[teilnehmerForm, anmeldungForm]}
            submit={submit}
            whatHappensNext={tx('Wir prüfen deine Anmeldung und melden uns in Kürze per E-Mail oder Telefon.')}
            items={
              selectedKurs
                ? [
                    {
                      key: 'kurs',
                      label: tx('Kurs'),
                      value: fieldText(selectedKurs, 'titel'),
                      step: 1,
                    },
                  ]
                : []
            }
          />
        )}

        {/* Erfolgsmeldung */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[teilnehmerForm]}
            whatHappensNext={tx('Wir prüfen deine Anmeldung und melden uns in Kürze. Neue Anmeldungen werden vom Team bestätigt.')}
            next={[{ label: tx('Weitere Anmeldung'), onClick: restart }]}
            submit={submit}
            restartLabel={tx('Weitere Anmeldung')}
            referencePrefix="A"
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
