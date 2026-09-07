/**
 * Schüler anmelden — 3-Schritt-Wizard.
 * Steps: 1) Kurs wählen (nur geplant/läuft, Kapazitätsprüfung) →
 *        2) Schüler wählen oder neu anlegen →
 *        3) Prüfen & anlegen.
 * Reads: kurse, anmeldungen (Kapazitätszählung), teilnehmer.
 * Writes: anmeldungen (createAnmeldungenEntry); optional teilnehmer (inline-create via layer).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, BudgetTracker, StepNav,
 *            SummaryStep, SuccessStep, StatusBadge.
 */
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldNumber,
  fieldDate,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { tx } from '@/i18n';
import { formatDate } from '@/lib/formatters';

export default function SchuelerAnmeldenPage() {
  const data = useDashboardData({ omit: ['kurse', 'teilnehmer', 'anmeldungen'] });

  // --- Step 1: Kurs-Suche (nur geplant / läuft) ---
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const key = fieldLookup(r, 'status')?.key ?? '';
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: r => {
      const beginn = fieldDate(r, 'beginn');
      const max = fieldNumber(r, 'maximale_teilnehmer');
      const parts = [
        fieldLookup(r, 'instrument')?.label,
        fieldLookup(r, 'niveau')?.label,
        beginn ? formatDate(beginn) : undefined,
        max != null ? tx`${max} Plätze` : undefined,
      ].filter(Boolean);
      return {
        id: r.id,
        title: fieldText(r, 'titel') ?? '',
        subtitle: parts.join(' · '),
        status: fieldLookup(r, 'status') ?? undefined,
      };
    },
  });

  // --- Step 2: Teilnehmer-Suche ---
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: r => ({
      id: r.id,
      title: `${fieldText(r, 'vorname') ?? ''} ${fieldText(r, 'nachname') ?? ''}`.trim(),
      subtitle: fieldText(r, 'email') ?? undefined,
    }),
  });

  // --- Forms ---
  const anmeldungForm = useStepForm('anmeldungen', {
    steps: {
      kurs: 1,
      teilnehmer: 2,
      anmeldedatum: 3,
      status: 3,
    },
    initial: {
      anmeldedatum: todayIso(),
    },
  });

  // Kapazitäts-State: wird nach Kursauswahl befüllt
  const [maxTeilnehmer, setMaxTeilnehmer] = useState<number>(0);
  const [belegtCount, setBelegtCount] = useState<number>(0);
  const [kapazitaetGeladen, setKapazitaetGeladen] = useState(false);

  const selectedKursId = anmeldungForm.get('kurs') as string | undefined;
  const freiePlaetze = maxTeilnehmer > 0 ? maxTeilnehmer - belegtCount : 0;
  const istVoll = maxTeilnehmer > 0 && freiePlaetze <= 0;

  // Wenn ein Kurs gewählt wurde, aktive Anmeldungen laden
  useEffect(() => {
    if (!selectedKursId) {
      setMaxTeilnehmer(0);
      setBelegtCount(0);
      setKapazitaetGeladen(false);
      return;
    }
    setKapazitaetGeladen(false);
    const kursRecord = kurse.recordOf(selectedKursId);
    const max = kursRecord ? (fieldNumber(kursRecord, 'maximale_teilnehmer') ?? 0) : 0;
    setMaxTeilnehmer(max);

    // Aktive Anmeldungen zählen (status != abgemeldet)
    servicePort
      .list('anmeldungen', {
        filter: tx`'${selectedKursId}' in str(r.v_kurs) and r.v_status != 'abgemeldet'`,
      })
      .then(result => {
        setBelegtCount(result.length);
        setKapazitaetGeladen(true);
      })
      .catch(() => {
        setBelegtCount(0);
        setKapazitaetGeladen(true);
      });
  }, [selectedKursId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schritt-Status berechnen (für values im Plan)
  const anmeldungStatus = istVoll ? 'warteliste' : 'neu';

  // Plan: nur anmeldungen anlegen (teilnehmer wird via inline-create des layer geschrieben)
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: anmeldungForm,
        primary: true,
        values: {
          anmeldedatum: format(new Date(), 'yyyy-MM-dd'),
          status: anmeldungStatus,
          bezahlt: false,
        },
      },
    ],
    { draftKey: 'schueler-anmelden' }
  );

  const [step, setStep] = useState(1);

  const restart = () => {
    submit.reset();
    anmeldungForm.reset();
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Schüler anmelden')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[anmeldungForm]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen laufenden oder geplanten Kurs anmelden.'),
        needs: [tx('Kursauswahl'), tx('Name des Schülers')],
      }}
    >
      {/* ── Step 1: Kurs wählen ─────────────────────────────────── */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Einen aktiven oder geplanten Kurs auswählen.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={anmeldungForm.get('kurs') as string}
          emptyText={tx('Keine Kurse mit Status „Geplant" oder „Läuft" gefunden.')}
          create={false}
          onSelect={id => {
            anmeldungForm.set('kurs', id, kurse.labelOf(id));
            // Kapazitätsdaten aus dem gewählten Record anzeigen
            const rec = kurse.recordOf(id);
            const max = rec ? (fieldNumber(rec, 'maximale_teilnehmer') ?? 0) : 0;
            setMaxTeilnehmer(max);
            setBelegtCount(0);
            setKapazitaetGeladen(false);
            setStep(2);
          }}
        />
      </WizardStep>

      {/* ── Step 2: Schüler wählen oder anlegen ─────────────────── */}
      <WizardStep
        label={tx('Schüler')}
        description={tx('Einen vorhandenen Schüler suchen oder neu anlegen.')}
      >
        {anmeldungForm.get('kurs') ? (
          <div className="space-y-4">
            {/* Kapazitätsanzeige für gewählten Kurs */}
            {kapazitaetGeladen && maxTeilnehmer > 0 && (
              <div className="space-y-2">
                <BudgetTracker
                  format="count"
                  unit={tx('Plätze')}
                  budget={maxTeilnehmer}
                  booked={belegtCount}
                  label={tx('Kursauslastung')}
                />
                {istVoll && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    {tx('Kurs ist voll — die Anmeldung kommt auf die Warteliste.')}
                    <span className="ml-2">
                      <StatusBadge statusKey="warteliste" label={tx('Warteliste')} />
                    </span>
                  </div>
                )}
              </div>
            )}

            <EntitySelectStep
              {...teilnehmer.select}
              selectedId={anmeldungForm.get('teilnehmer') as string}
              searchPlaceholder={tx('Name oder E-Mail suchen …')}
              create={{
                fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
                title: tx('Neuen Schüler anlegen'),
              }}
              createLabel={tx('Neuen Schüler anlegen')}
              onSelect={id => {
                anmeldungForm.set('teilnehmer', id, teilnehmer.labelOf(id));
                setStep(3);
              }}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst einen Kurs in Schritt 1 auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* ── Step 3: Prüfen & anlegen ─────────────────────────────── */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && anmeldungForm.get('kurs') && anmeldungForm.get('teilnehmer') ? (
          <SummaryStep
            forms={[anmeldungForm]}
            submit={submit}
            items={[
              {
                key: 'status-preview',
                label: tx('Anmeldestatus'),
                value: istVoll ? tx('Warteliste') : tx('Neu'),
                keys: ['_computed'],
                fieldId: 'status',
              },
              {
                key: 'anmeldedatum-preview',
                label: tx('Anmeldedatum'),
                value: formatDate(format(new Date(), 'yyyy-MM-dd')),
                keys: ['_computed'],
                fieldId: 'anmeldedatum',
              },
            ]}
            whatHappensNext={
              istVoll
                ? tx('Die Anmeldung erscheint auf der Warteliste. Das Büro kann sie manuell bestätigen, wenn ein Platz frei wird.')
                : tx('Die Anmeldung wird sofort angelegt und erscheint in der Kursliste.')
            }
            confirmLabel={tx('Anmeldung anlegen')}
          />
        ) : (
          <StepNav onBack={() => setStep(anmeldungForm.get('kurs') ? 2 : 1)} nextDisabled>
            {tx('Bitte Kurs und Schüler in den vorherigen Schritten auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* ── Erfolg ───────────────────────────────────────────────── */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldungForm]}
          title={tx('Anmeldung angelegt')}
          whatHappensNext={
            istVoll
              ? tx('Der Schüler steht auf der Warteliste und wird benachrichtigt, sobald ein Platz frei wird.')
              : tx('Die Anmeldung ist aktiv. Der Schüler kann am Kurs teilnehmen.')
          }
          next={[
            { label: tx('Weiteren Schüler anmelden'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
