/**
 * Schüler anmelden — 5-Schritt-Wizard.
 * Steps: 1) Schüler wählen oder neu anlegen → 2) Kurs wählen →
 *        3) Anmeldungsdetails → 4) Prüfen & anlegen → 5) Erfolg.
 * Reads: teilnehmer, kurse, anmeldungen (Kapazitätszählung).
 * Writes: anmeldungen (createAnmeldungenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup,
 *           BudgetTracker, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import {
  useRecordSearch,
  useRecordCount,
  useStepForm,
  useJourneySubmit,
  fieldText,
  fieldLookup,
  fieldNumber,
  combineFilters,
  refFilter,
  todayIso,
  optionsOf,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

const KURS_FILTER = "r.v_status in ['geplant', 'laeuft']";

export default function SchuelerAnmeldenPage() {
  const [step, setStep] = useState(1);

  // Schüler suchen (kein Filter — alle wählbar)
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim(),
      subtitle: fieldText(t, 'email') || fieldText(t, 'telefon') || undefined,
    }),
    orderby: ['r.v_nachname asc', 'r.v_vorname asc'],
  });

  // Kurse suchen — nur geplant oder läuft
  const kurse = useRecordSearch(servicePort, 'kurse', {
    searchFields: ['titel'],
    filter: KURS_FILTER,
    where: r => {
      const key = fieldLookup(r, 'status')?.key;
      return key === 'geplant' || key === 'laeuft';
    },
    toItem: (k, _ctx) => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      subtitle: fieldLookup(k, 'instrument')?.label,
      stats: [
        { label: tx('Max. Teilnehmer'), value: fieldNumber(k, 'maximale_teilnehmer') ?? '—' },
      ],
      status: fieldLookup(k, 'status') ?? undefined,
    }),
    orderby: ['r.v_beginn asc'],
  });

  // Formulare
  const anmeldung = useStepForm('anmeldungen', {
    steps: {
      teilnehmer: 1,
      kurs: 2,
      anmeldedatum: 3,
      bezahlt: 3,
      bemerkung: 3,
      status: 3,
    },
    initial: {
      anmeldedatum: todayIso(),
      bezahlt: false,
    },
  });

  // Kapazitätszählung: aktive Anmeldungen für den gewählten Kurs
  const gewaehlterKursId = anmeldung.get('kurs') as string | undefined;
  const anmeldungenCount = useRecordCount(servicePort, 'anmeldungen', {
    filter: gewaehlterKursId
      ? combineFilters(
          refFilter('kurs', gewaehlterKursId),
          tx('r.v_status != \'abgemeldet\'')
        )
      : undefined,
    where: a => {
      const kursRef = (a.fields['kurs'] as string | null) ?? '';
      const statusKey = fieldLookup(a, 'status')?.key;
      return kursRef.includes(gewaehlterKursId ?? '__none__') && statusKey !== 'abgemeldet';
    },
    enabled: Boolean(gewaehlterKursId),
  });

  // Maximale Teilnehmer des gewählten Kurses
  const gewaehlterKurs = gewaehlterKursId ? kurse.recordOf(gewaehlterKursId) : undefined;
  const maxTeilnehmer = gewaehlterKurs ? (fieldNumber(gewaehlterKurs, 'maximale_teilnehmer') ?? 0) : 0;
  const belegteAnmeldungen = anmeldungenCount.count ?? 0;
  const istVoll = maxTeilnehmer > 0 && belegteAnmeldungen >= maxTeilnehmer;
  const berechneterStatus = istVoll ? 'warteliste' : 'neu';

  // Plan
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: anmeldung,
        values: (_ctx) => {
          // Status wird aus der Kapazitätsprüfung gesetzt, kann aber vom Nutzer überschrieben werden
          const formStatus = anmeldung.get('status') as string | undefined;
          return { status: formStatus || berechneterStatus };
        },
        primary: true,
      },
    ],
    { draftKey: 'schueler-anmelden' }
  );

  const statusOptionen = optionsOf('anmeldungen', 'status');

  return (
    <IntentWizardShell
      title={tx('Schüler anmelden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen Kurs anmelden — bei voller Kapazität landet die Anmeldung automatisch auf der Warteliste.'),
        needs: [tx('Name des Schülers'), tx('Kursname')],
      }}
    >
      {/* Schritt 1: Schüler wählen oder neu anlegen */}
      <WizardStep
        label={tx('Schüler')}
        description={tx('Schüler suchen oder neu anlegen.')}
      >
        <EntitySelectStep
          {...teilnehmer.select}
          selectedId={anmeldung.get('teilnehmer') as string | undefined}
          onSelect={id => {
            anmeldung.set('teilnehmer', id, teilnehmer.labelOf(id));
            setStep(2);
          }}
          create={{ fields: ['vorname', 'nachname', 'email', 'telefon'] }}
          searchPlaceholder={tx('Vorname, Nachname oder E-Mail')}
          avatar="initials"
        />
      </WizardStep>

      {/* Schritt 2: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Kurs auswählen — nur aktive Kurse werden angezeigt.')}
        needs={['teilnehmer']}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={anmeldung.get('kurs') as string | undefined}
          onSelect={id => {
            anmeldung.set('kurs', id, kurse.labelOf(id));
            // Status vorbelegen (kann in Schritt 3 überschrieben werden)
            const kursRec = kurse.recordOf(id);
            const max = kursRec ? (fieldNumber(kursRec, 'maximale_teilnehmer') ?? 0) : 0;
            const autoStatus = (max > 0 && belegteAnmeldungen >= max) ? 'warteliste' : 'neu';
            anmeldung.set('status', autoStatus);
            setStep(3);
          }}
          emptyText={tx('Keine aktiven Kurse gefunden.')}
          create={false}
          searchPlaceholder={tx('Kursname')}
          avatar="none"
        />
        {/* Kapazitätsanzeige für den bereits gewählten Kurs (bei Rückkehr) */}
        {gewaehlterKursId && maxTeilnehmer > 0 && (
          <div className="mt-4">
            <BudgetTracker
              format="count"
              unit={tx('Plätze')}
              budget={maxTeilnehmer}
              booked={belegteAnmeldungen}
              label={kurse.labelOf(gewaehlterKursId) ?? tx('Gewählter Kurs')}
              showRemaining
            />
          </div>
        )}
      </WizardStep>

      {/* Schritt 3: Anmeldungsdetails */}
      <WizardStep
        label={tx('Details')}
        description={tx('Anmeldedatum, Zahlung und Status festhalten.')}
        needs={['teilnehmer', 'kurs']}
      >
        <div className="space-y-5">
          {/* Kapazitätsanzeige */}
          {gewaehlterKursId && maxTeilnehmer > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <BudgetTracker
                format="count"
                unit={tx('Plätze')}
                budget={maxTeilnehmer}
                booked={belegteAnmeldungen}
                label={kurse.labelOf(gewaehlterKursId) ?? tx('Kursauslastung')}
                showRemaining
              />
              {istVoll && (
                <p className="mt-2 text-sm text-amber-600">
                  {tx('Der Kurs ist voll — die Anmeldung wird auf die Warteliste gesetzt.')}
                </p>
              )}
            </div>
          )}

          <Bound form={anmeldung} name="anmeldedatum" />

          <Bound form={anmeldung} name="bezahlt" label={tx('Bereits bezahlt')} />

          <Bound form={anmeldung} name="bemerkung" rows={3} />

          <Field form={anmeldung} name="status">
            <ChoiceGroup
              {...anmeldung.choice('status')}
              options={statusOptionen}
              allowClear={false}
            />
          </Field>

          <StepNav
            onNext={() => anmeldung.validate(['anmeldedatum', 'status'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 4: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[anmeldung]}
            submit={submit}
            items={
              istVoll
                ? [{ key: '_warteliste_hinweis', label: tx('Hinweis'), value: tx('Kurs ist voll — Anmeldung auf Warteliste') }]
                : []
            }
            whatHappensNext={tx('Die Anmeldung wird sofort angelegt und erscheint in der Kursliste des Schülers.')}
          />
        )}
      </WizardStep>

      {/* Erfolgsbildschirm */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldung]}
          submit={submit}
          restartLabel={tx('Weitere Anmeldung')}
          next={[
            {
              label: tx('Anwesenheit erfassen'),
              href: '#/intents/anwesenheit-erfassen',
            },
            {
              label: tx('Kurs planen'),
              href: '#/intents/kurs-planen',
            },
            {
              label: tx('Zum Dashboard'),
              href: '#/',
            },
          ]}
          whatHappensNext={
            (anmeldung.get('status') === 'warteliste' || berechneterStatus === 'warteliste')
              ? tx('Die Anmeldung steht auf der Warteliste. Sobald ein Platz frei wird, kann der Status auf "Bestätigt" gesetzt werden.')
              : tx('Der Schüler ist für den Kurs angemeldet. Bei Bedarf kann die Anmeldung im Kursmanagement bearbeitet werden.')
          }
        >
          {/* Wartelisten-Hinweis im Erfolgsbildschirm */}
          {(anmeldung.get('status') === 'warteliste') && (
            <div className="mt-3 flex items-center gap-2">
              <StatusBadge statusKey="warteliste" label={tx('Warteliste')} tone="warning" />
              <span className="text-sm text-muted-foreground">
                {tx('Kurs war zum Zeitpunkt der Anmeldung voll.')}
              </span>
            </div>
          )}
        </SuccessStep>
      )}
    </IntentWizardShell>
  );
}
