/**
 * Kursanmeldung — öffentliche Anmeldeseite für Kurse der Musikschule Klangraum.
 *
 * Schritt 1: Kurs wählen (nur geplante Kurse mit freien Plätzen)
 * Schritt 2: Angaben zum Kind (vorname, nachname, geburtsdatum, email, telefon, erziehungsberechtigte_person)
 * Schritt 3: Zusammenfassung & Bestätigung
 *
 * Erstellt zwei Records: Teilnehmer → Anmeldung (verknüpft Kurs + Teilnehmer).
 * Status und bezahlt sind preset_fields (intern, nicht vom Besucher).
 */
import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  PageUnavailableError,
  prepareChallenge,
  listPublicRecords,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { useStepForm, useJourneySubmit } from '@/lib/journey';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { EntitySelectStep, type SelectItem } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { Input } from '@/components/ui/input';
import { IconMusic, IconUsers, IconAlertCircle } from '@tabler/icons-react';
import { format } from 'date-fns';
import { tx } from '@/i18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface KursRecord {
  id: string;
  titel: string;
  instrument: string | null;
  niveau: string | null;
  wochentage: string[] | null;
  beginn: string | null;
  maximale_teilnehmer: number | null;
  preis: number | null;
}

interface AnmeldungRecord {
  id: string;
  kursRef: string | null;
}

function parseKurs(id: string, r: PublicRecordResult): KursRecord {
  return {
    id: r.id ?? id,
    titel: (r.fields.titel as string) ?? '',
    instrument: (r.fields.instrument as string) ?? null,
    niveau: (r.fields.niveau as string) ?? null,
    wochentage: (r.fields.wochentage as string[]) ?? null,
    beginn: (r.fields.beginn as string) ?? null,
    maximale_teilnehmer: (r.fields.maximale_teilnehmer as number) ?? null,
    preis: (r.fields.preis as number) ?? null,
  };
}

function parseAnmeldung(id: string, r: PublicRecordResult): AnmeldungRecord {
  return {
    id: r.id ?? id,
    kursRef: (r.fields.kurs as string) ?? null,
  };
}

/** Extrahiert die Record-ID aus einer Kurs-Referenz-URL */
function kursIdFromRef(ref: string | null): string | null {
  if (!ref) return null;
  const m = ref.match(/\/records\/([^/]+)$/);
  return m ? m[1] : null;
}

function formatBeginn(beginn: string | null): string {
  if (!beginn) return '';
  try {
    const d = new Date(beginn + 'T12:00:00');
    return format(d, 'dd.MM.yyyy');
  } catch {
    return beginn;
  }
}

function formatPreis(preis: number | null): string {
  if (preis === null) return '';
  return preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Wizard steps definition
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SLUG = 'kursanmeldung';

export default function Kursanmeldung() {
  const STEPS = [
  { label: tx('Kurs wählen') },
  { label: tx('Angaben zum Kind') },
  { label: tx('Bestätigen') },
];

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
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<AnmeldungRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [step, setStep] = useState(1);

  // Forms — ALL hooks before any early return
  const teilnehmerForm = useStepForm('teilnehmer', {
    fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
    required: { vorname: true, nachname: true, geburtsdatum: false, email: false, telefon: false, erziehungsberechtigte_person: false },
    steps: { vorname: 2, nachname: 2, geburtsdatum: 2, email: 2, telefon: 2, erziehungsberechtigte_person: 2 },
    autoComplete: true,
  });

  const anmeldungForm = useStepForm('anmeldungen', {
    fields: ['kurs', 'teilnehmer', 'anmeldedatum'],
    required: { kurs: true, teilnehmer: false, anmeldedatum: false },
    steps: { kurs: 1 },
    autoComplete: true,
  });

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  const submit = useJourneySubmit(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    port!,
    [
      { key: 'teilnehmer', entity: 'teilnehmer', form: teilnehmerForm },
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: anmeldungForm,
        primary: true,
        needs: ['teilnehmer'],
        link: { teilnehmer: 'teilnehmer' },
        values: () => ({ anmeldedatum: format(new Date(), 'yyyy-MM-dd') }),
      },
    ],
    { draftKey: 'kursanmeldung' },
  );

  // Lade-Effekt
  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        if (!c?.pages[SLUG]) setUnavailable(true);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        else setUnavailable(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // Kurse + Anmeldungen laden sobald cfg/page bereit
  useEffect(() => {
    if (!cfg || !page) return;
    const kurseAppId = page.endpoints?.find(e => e.entity === 'kurse' && e.op === 'list')?.app_id ?? '';
    const anmeldungenAppId = page.endpoints?.find(e => e.entity === 'anmeldungen' && e.op === 'list')?.app_id ?? '';
    if (!kurseAppId) return;
    setDataLoading(true);
    Promise.all([
      listPublicRecords(cfg, page, { appId: kurseAppId, limit: 500 }),
      anmeldungenAppId
        ? listPublicRecords(cfg, page, { appId: anmeldungenAppId, limit: 500 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ])
      .then(([kurseMap, anmeldungenMap]) => {
        setKurse(Object.entries(kurseMap).map(([id, r]) => parseKurs(id, r)));
        setAnmeldungen(Object.entries(anmeldungenMap).map(([id, r]) => parseAnmeldung(id, r)));
      })
      .catch(() => {
        // Kurse konnten nicht geladen werden
      })
      .finally(() => setDataLoading(false));
  }, [cfg, page]);

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  // Challenge vorbereiten beim ersten Render nach Laden
  const tnCreateEp = page.endpoints?.find(e => e.op === 'create' && e.entity === 'teilnehmer');
  if (tnCreateEp?.app_id) {
    prepareChallenge(cfg, page, 'POST', `/apps/${tnCreateEp.app_id}/records`);
  }

  // Belegung: Anzahl aktiver Anmeldungen pro Kurs
  const belegungByKursId: Record<string, number> = {};
  for (const a of anmeldungen) {
    const kursId = kursIdFromRef(a.kursRef);
    if (kursId) {
      belegungByKursId[kursId] = (belegungByKursId[kursId] ?? 0) + 1;
    }
  }

  // Nur geplante Kurse mit freien Plätzen
  const verfuegbareKurse = kurse.filter(k => {
    const max = k.maximale_teilnehmer ?? 0;
    const belegt = belegungByKursId[k.id] ?? 0;
    return max > belegt;
  });

  const selectedKursId = anmeldungForm.get('kurs') as string | undefined;
  const selectedKurs = verfuegbareKurse.find(k => k.id === selectedKursId);

  const kursItems: SelectItem[] = verfuegbareKurse.map(k => {
    const max = k.maximale_teilnehmer ?? 0;
    const belegt = belegungByKursId[k.id] ?? 0;
    const frei = max - belegt;
    const stats: SelectItem['stats'] = [];
    if (k.instrument) stats.push({ label: tx('Instrument'), value: INSTRUMENT_LABELS[k.instrument] ?? k.instrument });
    if (k.niveau) stats.push({ label: tx('Niveau'), value: NIVEAU_LABELS[k.niveau] ?? k.niveau });
    stats.push({ label: tx('Freie Plätze'), value: frei });
    if (k.beginn) stats.push({ label: tx('Beginn'), value: formatBeginn(k.beginn) });

    const subtitleParts: string[] = [];
    if (k.wochentage?.length) subtitleParts.push(k.wochentage.map(t => WOCHENTAG_LABELS[t] ?? t).join(', '));
    if (k.preis !== null) subtitleParts.push(formatPreis(k.preis));

    return {
      id: k.id,
      title: k.titel,
      subtitle: subtitleParts.join(' · ') || undefined,
      stats,
      icon: <IconMusic size={20} aria-hidden="true" />,
    };
  });

  return (
    <PublicShell
      title={tx('Kursanmeldung')}
      description={tx('Melde dein Kind für einen Kurs der Musikschule Klangraum an.')}
    >
      <IntentWizardShell
        steps={STEPS}
        currentStep={step}
        onStepChange={setStep}
        forms={[teilnehmerForm, anmeldungForm]}
        draftKey="kursanmeldung"
        back={false}
      >
        {/* Schritt 1: Kurs wählen */}
        <WizardStep
          label={tx('Kurs wählen')}
          heading={tx('Welchen Kurs soll dein Kind belegen?')}
          description={tx('Nur Kurse mit freien Plätzen werden angezeigt.')}
        >
          <Field form={anmeldungForm} name="kurs">
            {dataLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <span className="animate-pulse">{tx('Kurse werden geladen …')}</span>
              </div>
            ) : verfuegbareKurse.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-muted-foreground">
                <IconAlertCircle size={40} stroke={1.5} />
                <p className="text-sm">{tx('Aktuell sind keine Kurse mit freien Plätzen verfügbar.')}</p>
              </div>
            ) : (
              <EntitySelectStep
                items={kursItems}
                selectedId={selectedKursId ?? null}
                onSelect={id => {
                  const kurs = verfuegbareKurse.find(k => k.id === id);
                  anmeldungForm.set('kurs', id, kurs?.titel ?? id);
                }}
                avatar="none"
                searchPlaceholder={tx('Kurs suchen …')}
                emptyText={tx('Kein Kurs gefunden.')}
                create={false}
              />
            )}
          </Field>

          {selectedKurs && (() => {
            const max = selectedKurs.maximale_teilnehmer ?? 0;
            const belegt = belegungByKursId[selectedKurs.id] ?? 0;
            const frei = max - belegt;
            return (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-4 py-3 text-sm text-foreground">
                <IconUsers size={16} className="shrink-0 text-primary" />
                <span>
                  <strong>{selectedKurs.titel}</strong>
                  {' — '}
                  {frei === 1
                    ? tx('Noch 1 freier Platz')
                    : <>{frei} {tx('freie Plätze')}</>}
                </span>
              </div>
            );
          })()}

          <StepNav
            onNext={() => anmeldungForm.validate(['kurs'])}
            nextStepLabel={tx('Angaben zum Kind')}
            hideBack
          />
        </WizardStep>

        {/* Schritt 2: Angaben zum Kind */}
        <WizardStep
          label={tx('Angaben zum Kind')}
          heading={tx('Angaben zum Kind')}
          description={tx('Fülle die Felder für das Kind aus, das den Kurs besuchen soll.')}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field form={teilnehmerForm} name="vorname">
                <Input {...teilnehmerForm.field('vorname')} />
              </Field>
              <Field form={teilnehmerForm} name="nachname">
                <Input {...teilnehmerForm.field('nachname')} />
              </Field>
            </div>

            <Field form={teilnehmerForm} name="geburtsdatum" hint={tx('Format: JJJJ-MM-TT')}>
              <Input {...teilnehmerForm.field('geburtsdatum')} />
            </Field>

            <Field form={teilnehmerForm} name="email" hint={tx('Für die Anmeldebestätigung')}>
              <Input {...teilnehmerForm.field('email')} />
            </Field>

            <Field form={teilnehmerForm} name="telefon">
              <Input {...teilnehmerForm.field('telefon')} />
            </Field>

            <Field
              form={teilnehmerForm}
              name="erziehungsberechtigte_person"
              hint={tx('Vor- und Nachname der erziehungsberechtigten Person')}
            >
              <Input {...teilnehmerForm.field('erziehungsberechtigte_person')} />
            </Field>
          </div>

          <StepNav
            onNext={() => teilnehmerForm.validate(['vorname', 'nachname'])}
            nextStepLabel={tx('Überprüfen')}
          />
        </WizardStep>

        {/* Schritt 3: Zusammenfassung */}
        <WizardStep
          label={tx('Bestätigen')}
          heading={tx('Anmeldung prüfen')}
        >
          {!submit.result ? (
            <SummaryStep
              forms={[anmeldungForm, teilnehmerForm]}
              submit={submit}
              items={
                selectedKurs
                  ? [
                      {
                        key: 'kurs_titel',
                        label: tx('Kurs'),
                        value: selectedKurs.titel,
                        step: 1,
                        keys: ['kurs'],
                      },
                      ...(selectedKurs.beginn
                        ? [
                            {
                              key: 'kurs_beginn',
                              label: tx('Kursbeginn'),
                              value: formatBeginn(selectedKurs.beginn),
                              keys: [],
                            },
                          ]
                        : []),
                    ]
                  : []
              }
              whatHappensNext={tx(
                'Deine Anmeldung wird von der Musikschule Klangraum geprüft. Du erhältst eine Bestätigung per E-Mail.',
              )}
              confirmLabel={tx('Jetzt anmelden')}
            />
          ) : (
            <SuccessStep
              result={submit.result}
              forms={[anmeldungForm, teilnehmerForm]}
              next={[{ label: tx('Weitere Anmeldung'), onClick: () => setStep(1) }]}
            />
          )}
        </WizardStep>
      </IntentWizardShell>
    </PublicShell>
  );
}
