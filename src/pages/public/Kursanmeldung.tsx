/**
 * Kursanmeldung — public registration form for music school courses.
 * Step 1: pick a course (geplant, with free spots).
 * Step 2: enter child's details (Schüler-Angaben).
 * Step 3: summary + submit (creates Teilnehmer, then Anmeldung).
 */
import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { IntentWizardShell, type WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Input } from '@/components/ui/input';
import { Bound } from '@/components/blocks/Bound';
import { useStepForm, todayIso } from '@/lib/journey';
import { useJourneySubmit } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { tx } from '@/i18n';
import { IconMusic } from '@tabler/icons-react';

const SLUG = 'kursanmeldung';

interface KursRecord {
  id: string;
  titel: string;
  instrument: string;
  niveau: string | null;
  wochentage: string[] | null;
  beginn: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number | null;
  status: string;
}

function parseKurs(r: PublicRecordResult): KursRecord {
  const f = r.fields as Record<string, unknown>;
  const wt = f.wochentage;
  return {
    id: r.id,
    titel: (f.titel as string) ?? '',
    instrument: (f.instrument as string) ?? '',
    niveau: (f.niveau as string) ?? null,
    wochentage: Array.isArray(wt) ? (wt as string[]) : null,
    beginn: (f.beginn as string) ?? null,
    uhrzeit: (f.uhrzeit as string) ?? null,
    maximale_teilnehmer: typeof f.maximale_teilnehmer === 'number' ? f.maximale_teilnehmer : null,
    status: (f.status as string) ?? '',
  };
}

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

function maxPlaces(k: KursRecord): number {
  return k.maximale_teilnehmer ?? 0;
}

function kursToItem(k: KursRecord): SelectItem {
  const WOCHENTAG_LABELS: Record<string, string> = {
  montag: 'Mo',
  dienstag: 'Di',
  mittwoch: 'Mi',
  donnerstag: 'Do',
  freitag: 'Fr',
  samstag: 'Sa',
};

  const instrument = INSTRUMENT_LABELS[k.instrument] ?? k.instrument;
  const niveau = k.niveau ? (NIVEAU_LABELS[k.niveau] ?? k.niveau) : null;
  const tage = k.wochentage?.map(t => WOCHENTAG_LABELS[t] ?? t).join(', ') ?? null;
  const subtitle = [instrument, niveau, tage].filter(Boolean).join(' · ');
  return {
    id: k.id,
    title: k.titel,
    subtitle,
    stats: [
      ...(k.beginn ? [{ label: tx('Beginn'), value: k.beginn }] : []),
      { label: tx('Max. Teilnehmer'), value: maxPlaces(k) },
    ],
    icon: <IconMusic size={20} aria-hidden="true" />,
  };
}

export default function Kursanmeldung() {
  const STEPS: WizardStep[] = [
  { label: tx('Kurs wählen') },
  { label: tx('Angaben zum Kind') },
  { label: tx('Prüfen & Anmelden') },
];

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [kurseLoading, setKurseLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);

  // All hooks before any early return
  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const teilnehmer = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
    required: { vorname: true, nachname: true },
    steps: {
      vorname: 2,
      nachname: 2,
      geburtsdatum: 2,
      email: 2,
      telefon: 2,
      erziehungsberechtigte_person: 2,
    },
    initial: { anmeldedatum: todayIso() },
    autoComplete: true,
  });

  const anmeldung = useStepForm('anmeldungen', {
    fields: ['kurs', 'anmeldedatum'],
    required: { kurs: true, anmeldedatum: true },
    steps: { kurs: 1, anmeldedatum: 1 },
    initial: { kurs: selectedKursId ?? '', anmeldedatum: todayIso() },
    autoComplete: true,
  });

  const submit = useJourneySubmit(
    port ?? ({} as ReturnType<typeof createPublicPort>),
    [
      { key: 'teilnehmer', entity: 'teilnehmer', form: teilnehmer },
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: anmeldung,
        primary: true,
        needs: ['teilnehmer'],
        link: { teilnehmer: 'teilnehmer' },
        values: () => ({ anmeldedatum: todayIso() }),
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
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setKurseLoading(true);
    port!
      .list('kurse')
      .then(rows => {
        const parsed = rows
          .map(r => parseKurs({ id: r.id, fields: r.fields, created_at: null, updated_at: null }))
          .filter(k => k.status === 'geplant');
        setKurse(parsed);
      })
      .finally(() => setKurseLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, page]);

  useEffect(() => {
    if (selectedKursId) {
      anmeldung.set('kurs', selectedKursId, selectedKursId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKursId]);

  if (loading || unavailable || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={unavailable || (!loading && !page)} />;
  }

  const kursItems: SelectItem[] = kurse.map(kursToItem);
  const selectedKurs = kurse.find(k => k.id === selectedKursId) ?? null;

  const restart = () => {
    setSelectedKursId(null);
    anmeldung.reset?.();
    teilnehmer.reset?.();
    setStep(1);
  };

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind hier für einen Kurs an. Die Anmeldung geht sofort bei uns ein.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        back={false}
        forms={[anmeldung, teilnehmer]}
        draftKey="kursanmeldung"
      >
        {step === 1 && !submit.result && (
          <>
            <EntitySelectStep
              items={kursItems}
              onSelect={id => setSelectedKursId(id)}
              selectedId={selectedKursId}
              avatar="none"
              searchPlaceholder={tx('Kurs suchen …')}
              emptyText={tx('Aktuell sind keine Kurse mit freien Plätzen verfügbar.')}
              emptyIcon={<IconMusic size={32} aria-hidden="true" />}
              create={false}
              loading={kurseLoading}
            />
            <StepNav
              onNext={() => {
                if (!selectedKursId) return tx('Bitte wähle zuerst einen Kurs aus.');
                return undefined;
              }}
              nextStepLabel={tx('Angaben zum Kind')}
            />
          </>
        )}

        {step === 2 && !submit.result && (
          <div className="space-y-4">
            {selectedKurs && (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                <p className="font-medium">{selectedKurs.titel}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {[
                    INSTRUMENT_LABELS[selectedKurs.instrument] ?? selectedKurs.instrument,
                    selectedKurs.niveau ? (NIVEAU_LABELS[selectedKurs.niveau] ?? selectedKurs.niveau) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {' · '}
                  {tx('Max.')} {maxPlaces(selectedKurs)} {tx('Teilnehmer')}
                </p>
              </div>
            )}
            <Field form={teilnehmer} name="vorname">
              <Input {...teilnehmer.field('vorname')} />
            </Field>
            <Field form={teilnehmer} name="nachname">
              <Input {...teilnehmer.field('nachname')} />
            </Field>
            <Bound form={teilnehmer} name="geburtsdatum" />
            <Field form={teilnehmer} name="email">
              <Input {...teilnehmer.field('email')} />
            </Field>
            <Field form={teilnehmer} name="telefon">
              <Input {...teilnehmer.field('telefon')} />
            </Field>
            <Field
              form={teilnehmer}
              name="erziehungsberechtigte_person"
              hint={tx('Vollständiger Name des Erziehungsberechtigten')}
            >
              <Input {...teilnehmer.field('erziehungsberechtigte_person')} />
            </Field>
            <StepNav
              onNext={() => teilnehmer.validate(['vorname', 'nachname'])}
              nextStepLabel={tx('Prüfen & Anmelden')}
            />
          </div>
        )}

        {step === 3 && !submit.result && (
          <SummaryStep
            forms={[anmeldung, teilnehmer]}
            submit={submit}
            whatHappensNext={tx(
              'Wir prüfen deine Anmeldung und melden uns per E-Mail zur Bestätigung.',
            )}
          />
        )}

        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[anmeldung, teilnehmer]}
            next={[{ label: tx('Weitere Anmeldung'), onClick: restart }]}
            whatHappensNext={tx(
              'Deine Anmeldung ist eingegangen. Wir schicken dir eine Bestätigungs-E-Mail.',
            )}
          />
        )}
      </IntentWizardShell>
    </PublicShell>
  );
}
