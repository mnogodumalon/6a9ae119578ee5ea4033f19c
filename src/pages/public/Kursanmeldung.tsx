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
import { createPublicPort } from '@/lib/journey/publicPort';
import { useStepForm, useJourneySubmit, todayIso } from '@/lib/journey';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { tx } from '@/i18n';
import { formatDate } from '@/lib/formatters';
import {
  IconMusic,
  IconCalendar,
  IconClock,
  IconUsers,
  IconCurrencyEuro,
  IconSchool,
  IconAlertCircle,
} from '@tabler/icons-react';

const SLUG = 'kursanmeldung';

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

function getField<T>(r: PublicRecordResult, key: string): T {
  return r.fields[key] as T;
}

function extractKursId(kursRef: unknown): string | null {
  if (!kursRef || typeof kursRef !== 'string') return null;
  const parts = kursRef.split('/');
  return parts[parts.length - 1] ?? null;
}

interface KursItem extends SelectItem {
  maxTeilnehmer: number;
  angemeldete: number;
  freiePlaetze: number;
  preis: number | null;
  beginn: string | null;
  uhrzeit: string | null;
  wochentage: string[];
  niveau: string | null;
}

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

  const STEPS: WizardStep[] = [
  {
    label: tx('Kurs wählen'),
    description: tx('Wähle einen verfügbaren Kurs aus der Liste.'),
  },
  {
    label: tx('Angaben zum Kind'),
    description: tx('Gib die Daten des Kindes ein, das am Kurs teilnehmen soll.'),
  },
  {
    label: tx('Zusammenfassung'),
    description: tx('Prüfe deine Angaben und schicke die Anmeldung ab.'),
  },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurseRaw, setKurseRaw] = useState<PublicRecordResult[]>([]);
  const [anmeldungenRaw, setAnmeldungenRaw] = useState<PublicRecordResult[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [step, setStep] = useState(1);
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then((c) => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (err instanceof PageUnavailableError) {
          setUnavailable(true);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    const ep = page.endpoints?.find((e) => e.op === 'list' && e.entity === 'kurse');
    const epA = page.endpoints?.find((e) => e.op === 'list' && e.entity === 'anmeldungen');
    if (!ep?.app_id) return;
    setDataLoading(true);
    const kursePromise = listPublicRecords(cfg, page, { appId: ep.app_id, limit: 500 });
    const anmPromise = epA?.app_id
      ? listPublicRecords(cfg, page, { appId: epA.app_id, limit: 500 })
      : Promise.resolve<Record<string, PublicRecordResult>>({});
    Promise.all([kursePromise, anmPromise])
      .then(([k, a]) => {
        setKurseRaw(Object.values(k));
        setAnmeldungenRaw(Object.values(a));
      })
      .finally(() => setDataLoading(false));
  }, [cfg, page]);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  // Anmeldungen pro Kurs zählen (status != abgemeldet — bereits server-seitig gefiltert)
  const anmeldungenPerKurs = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of anmeldungenRaw) {
      const ref = getField<unknown>(a, 'kurs');
      const kursId = extractKursId(ref);
      if (kursId) {
        map[kursId] = (map[kursId] ?? 0) + 1;
      }
    }
    return map;
  }, [anmeldungenRaw]);

  // Kurse mit freien Plätzen aufbereiten
  const kursItems = useMemo((): KursItem[] => {
    return kurseRaw.flatMap((k) => {
      const max = (getField<number | null>(k, 'maximale_teilnehmer') ?? 0);
      const angemeldet = anmeldungenPerKurs[k.id] ?? 0;
      const frei = Math.max(0, max - angemeldet);
      if (frei <= 0) return [];
      const instrKey = (getField<{ key: string } | null>(k, 'instrument') as { key: string } | null)?.key ?? '';
      const niveauKey = (getField<{ key: string } | null>(k, 'niveau') as { key: string } | null)?.key ?? '';
      const wochentage: string[] = ((getField<Array<{ key: string }> | null>(k, 'wochentage') ?? []) as Array<{ key: string }>).map(
        (w) => WOCHENTAG_LABELS[w.key] ?? w.key,
      );
      const beginn = getField<string | null>(k, 'beginn');
      const uhrzeit = getField<string | null>(k, 'uhrzeit');
      const preis = getField<number | null>(k, 'preis');

      const subtitleParts: string[] = [];
      if (niveauKey) subtitleParts.push(NIVEAU_LABELS[niveauKey] ?? niveauKey);
      if (wochentage.length > 0) subtitleParts.push(wochentage.join(', '));
      if (uhrzeit) subtitleParts.push(formatDate(uhrzeit));

      return [
        {
          id: k.id,
          title: getField<string>(k, 'titel') ?? tx('Kurs'),
          subtitle: subtitleParts.join(' · '),
          icon: <IconMusic size={18} className="shrink-0 text-muted-foreground" />,
          stats: [
            {
              label: tx('Freie Plätze'),
              value: frei,
            },
            ...(beginn
              ? [{ label: tx('Beginn'), value: formatDate(beginn) }]
              : []),
            ...(preis != null
              ? [{ label: tx('Preis / Monat'), value: `${preis} €` }]
              : []),
          ],
          maxTeilnehmer: max,
          angemeldete: angemeldet,
          freiePlaetze: frei,
          preis: preis ?? null,
          beginn: beginn ?? null,
          uhrzeit: uhrzeit ?? null,
          wochentage,
          niveau: niveauKey ? (NIVEAU_LABELS[niveauKey] ?? niveauKey) : null,
        } satisfies KursItem,
      ];
    });
  }, [kurseRaw, anmeldungenPerKurs]);

  const selectedKurs = useMemo(
    () => kursItems.find((k) => k.id === selectedKursId) ?? null,
    [kursItems, selectedKursId],
  );

  const teilnehmerForm = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
    required: {
      vorname: true,
      nachname: true,
      geburtsdatum: false,
      email: false,
      telefon: false,
      erziehungsberechtigte_person: false,
    },
    steps: {
      vorname: 2,
      nachname: 2,
      geburtsdatum: 2,
      email: 2,
      telefon: 2,
      erziehungsberechtigte_person: 2,
    },
    autoComplete: true,
  });

  const anmeldungForm = useStepForm('anmeldungen', {
    fields: ['kurs', 'anmeldedatum'],
    steps: { kurs: 1, anmeldedatum: 1 },
    initial: { anmeldedatum: todayIso() },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port!,
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
        values: (_ctx) => ({
          kurs: selectedKursId ? port!.ref(
            page!.endpoints?.find((e) => e.op === 'list' && e.entity === 'kurse')?.app_id ?? '',
            selectedKursId,
          ) : undefined,
          anmeldedatum: todayIso(),
        }),
      },
    ],
    { draftKey: 'kursanmeldung' },
  );

  const restart = () => {
    submit.reset();
    teilnehmerForm.reset();
    anmeldungForm.reset();
    setSelectedKursId(null);
    setStep(1);
  };

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  const handleKursSelect = (id: string) => {
    setSelectedKursId(id);
    prepareChallenge(cfg, page, 'POST',
      `/apps/${page.endpoints?.find((e) => e.op === 'create' && e.entity === 'teilnehmer')?.app_id ?? ''}/records`,
    );
    setStep(2);
  };

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind online für einen Kurs an der Musikschule Klangraum an.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[teilnehmerForm]}
        draftKey="kursanmeldung"
        loading={dataLoading}
      >
        {/* Schritt 1 — Kurs wählen */}
        {step === 1 && !submit.done && (
          <div className="space-y-4">
            {kursItems.length === 0 && !dataLoading && (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                <IconSchool size={48} stroke={1.5} />
                <p className="text-sm">{tx('Aktuell sind keine Kurse mit freien Plätzen verfügbar.')}</p>
              </div>
            )}
            {kursItems.length > 0 && (
              <EntitySelectStep
                items={kursItems}
                selectedId={selectedKursId}
                onSelect={handleKursSelect}
                avatar="none"
                columns={1}
                searchPlaceholder={tx('Kurs suchen …')}
                emptyIcon={<IconMusic size={32} />}
                emptyText={tx('Kein Kurs gefunden.')}
              />
            )}
          </div>
        )}

        {/* Schritt 2 — Angaben zum Kind */}
        {step === 2 && !submit.done && (
          <div className="space-y-5">
            {selectedKurs && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <p className="font-medium text-sm">
                  <IconMusic size={14} className="inline shrink-0 mr-1" />
                  {selectedKurs.title}
                  {selectedKurs.niveau && (
                    <span className="ml-2 text-xs text-muted-foreground">{selectedKurs.niveau}</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {selectedKurs.beginn && (
                    <span className="flex items-center gap-1">
                      <IconCalendar size={13} className="shrink-0" />
                      {tx('Beginn')}: {formatDate(selectedKurs.beginn)}
                    </span>
                  )}
                  {selectedKurs.uhrzeit && (
                    <span className="flex items-center gap-1">
                      <IconClock size={13} className="shrink-0" />
                      {formatDate(selectedKurs.uhrzeit)}
                    </span>
                  )}
                  {selectedKurs.wochentage.length > 0 && (
                    <span>{selectedKurs.wochentage.join(', ')}</span>
                  )}
                  {selectedKurs.preis != null && (
                    <span className="flex items-center gap-1">
                      <IconCurrencyEuro size={13} className="shrink-0" />
                      {selectedKurs.preis} €
                      {tx(' / Monat')}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <IconUsers size={13} className="shrink-0" />
                    {tx('Noch')}{' '}
                    {selectedKurs.freiePlaetze === 1
                      ? tx('1 freier Platz')
                      : `${selectedKurs.freiePlaetze} ${tx('freie Plätze')}`}
                  </span>
                </div>
                <BudgetTracker
                  budget={selectedKurs.maxTeilnehmer}
                  booked={selectedKurs.angemeldete}
                  format="count"
                  unit={tx('Plätze')}
                  showRemaining
                />
              </div>
            )}

            {selectedKurs && selectedKurs.freiePlaetze <= 3 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-800 text-sm">
                <IconAlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>
                  {selectedKurs.freiePlaetze === 1
                    ? tx('Nur noch 1 Platz frei – melde dich jetzt an!')
                    : tx('Nur noch wenige Plätze frei – melde dich jetzt an!')}
                </span>
              </div>
            )}

            <Field form={teilnehmerForm} name="vorname">
              <input {...teilnehmerForm.field('vorname')} className="w-full rounded-md border px-3 py-2 text-sm" placeholder={tx('z. B. Lena')} />
            </Field>
            <Field form={teilnehmerForm} name="nachname">
              <input {...teilnehmerForm.field('nachname')} className="w-full rounded-md border px-3 py-2 text-sm" placeholder={tx('z. B. Müller')} />
            </Field>
            <Field form={teilnehmerForm} name="geburtsdatum">
              <Bound form={teilnehmerForm} name="geburtsdatum" />
            </Field>
            <Field form={teilnehmerForm} name="email">
              <input {...teilnehmerForm.field('email')} className="w-full rounded-md border px-3 py-2 text-sm" placeholder={tx('z. B. familie@beispiel.de')} />
            </Field>
            <Field form={teilnehmerForm} name="telefon">
              <input {...teilnehmerForm.field('telefon')} className="w-full rounded-md border px-3 py-2 text-sm" placeholder={tx('z. B. 0171 1234567')} />
            </Field>
            <Field form={teilnehmerForm} name="erziehungsberechtigte_person">
              <input {...teilnehmerForm.field('erziehungsberechtigte_person')} className="w-full rounded-md border px-3 py-2 text-sm" placeholder={tx('z. B. Maria Müller')} />
            </Field>

            <StepNav
              onBack={() => setStep(1)}
              onNext={() => teilnehmerForm.validate(['vorname', 'nachname'])}
              nextStepLabel={tx('Zusammenfassung')}
            />
          </div>
        )}

        {/* Schritt 3 — Zusammenfassung + Absenden */}
        {step === 3 && !submit.done && (
          <SummaryStep
            forms={[teilnehmerForm]}
            submit={submit}
            items={
              selectedKurs
                ? [
                    {
                      key: 'kurs',
                      label: tx('Kurs'),
                      value: selectedKurs.title,
                      step: 1,
                    },
                    ...(selectedKurs.niveau
                      ? [{ key: 'niveau', label: tx('Niveau'), value: selectedKurs.niveau, step: 1 }]
                      : []),
                    ...(selectedKurs.beginn
                      ? [{ key: 'beginn', label: tx('Beginn'), value: formatDate(selectedKurs.beginn), step: 1 }]
                      : []),
                    ...(selectedKurs.preis != null
                      ? [{ key: 'preis', label: tx('Preis / Monat'), value: `${selectedKurs.preis} €`, step: 1 }]
                      : []),
                  ]
                : []
            }
            whatHappensNext={tx('Wir prüfen deine Anmeldung und melden uns in Kürze per E-Mail. Die Teilnahme ist erst nach Bestätigung durch die Musikschule verbindlich.')}
            confirmLabel={tx('Jetzt anmelden')}
            onEdit={(s) => setStep(s)}
          />
        )}

        {/* Erfolg */}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[teilnehmerForm]}
            title={tx('Anmeldung eingegangen!')}
            whatHappensNext={tx('Wir prüfen deine Anmeldung und melden uns in Kürze per E-Mail. Die Teilnahme ist erst nach Bestätigung durch die Musikschule verbindlich.')}
            referencePrefix="A"
            submit={submit}
            restartLabel={tx('Weitere Anmeldung')}
            next={[{ label: tx('Weitere Anmeldung'), onClick: restart }]}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
