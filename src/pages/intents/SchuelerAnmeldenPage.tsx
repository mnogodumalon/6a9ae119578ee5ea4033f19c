/**
 * Schüler anmelden — 3-Schritt-Wizard.
 * Steps: 1) Kurs wählen (nur geplant/läuft, Kapazität prüfen) →
 *         2) Teilnehmer wählen oder neu anlegen →
 *         3) Bestätigen & Anmeldung anlegen.
 * Reads: kurse (für Kapazitätscheck), anmeldungen (für Belegung), teilnehmer.
 * Writes: anmeldungen (createAnmeldungenEntry); optional teilnehmer (createTeilnehmerEntry via InlineCreate).
 * Composes: IntentWizardShell, EntitySelectStep, BudgetTracker, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { tx } from '@/i18n';
import { extractRecordId } from '@/services/livingAppsService';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldNumber,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';

export default function SchuelerAnmeldenPage() {
  // Only anmeldungen is fetched via the dashboard hook (for capacity counting).
  // kurse and teilnehmer are loaded by useRecordSearch (server-paged).
  const data = useDashboardData({ omit: ['kurse', 'teilnehmer', 'dozenten', 'raeume', 'anwesenheiten'] });

  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status == 'geplant' or r.v_status == 'laeuft'",
    where: r => {
      const key = fieldLookup(r, 'status')?.key ?? '';
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      status: fieldLookup(k, 'status') ?? undefined,
      subtitle: [
        fieldLookup(k, 'instrument')?.label,
        (fieldLookup(k, 'wochentage') as unknown as Array<{ label: string }> | null)
          ?.map(w => w.label).join(', '),
      ].filter(Boolean).join(' · '),
    }),
  });

  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim(),
      subtitle: fieldText(t, 'email'),
    }),
  });

  const [step, setStep] = useState(1);

  const anmeldung = useStepForm('anmeldungen', {
    steps: { kurs: 1, teilnehmer: 2, anmeldedatum: 3, status: 3, bezahlt: 3 },
    initial: { anmeldedatum: todayIso(), bezahlt: false },
  });

  // Derive capacity information from the dashboard anmeldungen list
  const selectedKursId = anmeldung.get('kurs') as string | undefined;
  const kursRecord = selectedKursId ? kurse.recordOf(selectedKursId) : null;
  const maxTeilnehmer = kursRecord ? (fieldNumber(kursRecord, 'maximale_teilnehmer') ?? 0) : 0;

  const belegtCount = useMemo(() => {
    if (!selectedKursId) return 0;
    return data.anmeldungen.filter(a => {
      const kursId = extractRecordId(a.fields.kurs);
      const statusKey = a.fields.status?.key ?? '';
      return kursId === selectedKursId && statusKey !== 'abgemeldet';
    }).length;
  }, [selectedKursId, data.anmeldungen]);

  const freieP = maxTeilnehmer > 0 ? maxTeilnehmer - belegtCount : Infinity;
  const istVoll = freieP <= 0;
  const anmeldungStatus = istVoll ? 'warteliste' : 'neu';

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'anmeldung',
      entity: 'anmeldungen',
      form: anmeldung,
      primary: true,
      values: {
        kurs: selectedKursId ?? '',
        teilnehmer: (anmeldung.get('teilnehmer') as string | undefined) ?? '',
        anmeldedatum: format(new Date(), 'yyyy-MM-dd'),
        status: anmeldungStatus,
        bezahlt: false,
      },
    },
  ], { draftKey: 'schueler-anmelden' });

  const restart = () => {
    submit.reset();
    anmeldung.reset();
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
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen laufenden oder geplanten Kurs anmelden.'),
        needs: [tx('Kurs'), tx('Name des Schülers')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Nur geplante oder laufende Kurse können gewählt werden.')}
      >
        <div className="space-y-4">
          <EntitySelectStep
            {...kurse.select}
            selectedId={selectedKursId}
            onSelect={id => {
              anmeldung.set('kurs', id, kurse.labelOf(id));
              setStep(2);
            }}
            emptyText={tx('Keine Kurse mit Status „Geplant" oder „Läuft" gefunden.')}
            create={false}
          />
          {selectedKursId && maxTeilnehmer > 0 && (
            <BudgetTracker
              format="count"
              unit={tx('Plätze')}
              budget={maxTeilnehmer}
              booked={belegtCount}
              label={tx('Kursauslastung')}
            />
          )}
          {selectedKursId && istVoll && (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              {tx('Kurs ist voll — Anmeldung kommt auf die Warteliste.')}
            </p>
          )}
        </div>
      </WizardStep>

      {/* Schritt 2: Teilnehmer wählen oder neu anlegen */}
      <WizardStep
        label={tx('Teilnehmer')}
        description={tx('Schüler suchen oder neu in der Kartei anlegen.')}
      >
        {anmeldung.get('kurs') ? (
          <EntitySelectStep
            {...teilnehmer.select}
            selectedId={anmeldung.get('teilnehmer') as string | undefined}
            onSelect={id => {
              anmeldung.set('teilnehmer', id, teilnehmer.labelOf(id));
              setStep(3);
            }}
            create={{
              fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person', 'notizen'],
              title: tx('Neuen Schüler anlegen'),
            }}
            searchPlaceholder={tx('Name oder E-Mail eingeben …')}
          />
        ) : (
          <StepNav
            onBack={() => setStep(1)}
            nextDisabled
          >
            {tx('Bitte zuerst einen Kurs wählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {anmeldung.get('kurs') && anmeldung.get('teilnehmer') ? (
          !submit.done ? (
            <SummaryStep
              forms={[anmeldung]}
              submit={submit}
              whatHappensNext={
                istVoll
                  ? tx('Der Schüler wird auf die Warteliste gesetzt und benachrichtigt, sobald ein Platz frei wird.')
                  : tx('Die Anmeldung erscheint sofort in der Kursliste und kann bestätigt werden.')
              }
            />
          ) : null
        ) : (
          <StepNav
            onBack={() => setStep(anmeldung.get('kurs') ? 2 : 1)}
            nextDisabled
          >
            {tx('Bitte Kurs und Teilnehmer in den vorherigen Schritten wählen.')}
          </StepNav>
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldung]}
          next={[
            { label: tx('Weiteren Schüler anmelden'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={
            istVoll
              ? tx('Der Schüler steht auf der Warteliste. Bei Kursstart rückt er automatisch nach, wenn ein Platz frei wird.')
              : tx('Die Anmeldung ist angelegt. Im nächsten Schritt kann die Zahlung vermerkt werden.')
          }
        />
      )}
    </IntentWizardShell>
  );
}
