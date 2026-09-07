/**
 * Schüler anmelden — 3-Schritt-Wizard.
 * Steps: 1) Schüler wählen (oder neu anlegen) → 2) Kurs wählen (nur geplant/laufend, Kapazitätsprüfung) → 3) Zusammenfassung & anlegen.
 * Reads: teilnehmer, kurse, anmeldungen (Zählung). Writes: anmeldungen (createAnmeldungenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, BudgetTracker, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
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
  fieldDate,
  todayIso,
  combineFilters,
  refFilter,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function SchuelerAnmeldenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1: Alle Teilnehmer durchsuchbar
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim(),
      subtitle: fieldText(t, 'email') || fieldText(t, 'telefon') || undefined,
    }),
    orderby: ['r.v_nachname asc', 'r.v_vorname asc'],
  });

  // Schritt 2: Nur Kurse mit Status geplant oder laeuft
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const s = fieldLookup(r, 'status')?.key;
      return s === 'geplant' || s === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: (k, ctx) => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      subtitle: [
        fieldLookup(k, 'instrument')?.label,
        fieldLookup(k, 'niveau')?.label,
        ctx.ref('dozent'),
        fieldDate(k, 'beginn') ? tx`ab ${fieldDate(k, 'beginn')!}` : undefined,
      ].filter(Boolean).join(' · ') || undefined,
      status: fieldLookup(k, 'status') ?? undefined,
      stats: [
        { label: tx('Plätze'), value: fieldNumber(k, 'maximale_teilnehmer') ?? '—' },
      ],
    }),
    orderby: ['r.v_beginn asc'],
  });

  // Anmeldeformular
  const anmeldung = useStepForm('anmeldungen', {
    steps: {
      teilnehmer: 1,
      kurs: 2,
      anmeldedatum: 3,
      status: 3,
      bezahlt: 3,
    },
    initial: { anmeldedatum: todayIso(), bezahlt: false },
    required: { bezahlt: false, bemerkung: false },
  });

  const gewaehlterKursId = anmeldung.get('kurs') as string | undefined;
  const gewaehlterKurs = gewaehlterKursId ? kurse.recordOf(gewaehlterKursId) : undefined;
  const maxTeilnehmer = gewaehlterKurs ? (fieldNumber(gewaehlterKurs, 'maximale_teilnehmer') ?? 0) : 0;

  // Aktive Anmeldungen für den gewählten Kurs zählen
  const anmeldungenCount = useRecordCount(servicePort, 'anmeldungen', {
    filter: gewaehlterKursId
      ? combineFilters(
          refFilter('kurs', gewaehlterKursId),
          tx('r.v_status != \'abgemeldet\'')
        )
      : undefined,
    where: a => {
      const kursRef = (a.fields['kurs'] as string | undefined) ?? '';
      const statusKey = fieldLookup(a, 'status')?.key;
      return kursRef.includes(gewaehlterKursId ?? '__none__') && statusKey !== 'abgemeldet';
    },
    enabled: Boolean(gewaehlterKursId),
  });

  // Warteliste-Logik
  const istVoll = useMemo(() => {
    if (anmeldungenCount.count === null) return false;
    return anmeldungenCount.count >= maxTeilnehmer;
  }, [anmeldungenCount.count, maxTeilnehmer]);

  const berechneterStatus = istVoll ? 'warteliste' : 'neu';

  // Plan: Anmeldung anlegen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'anmeldung',
      entity: 'anmeldungen',
      form: anmeldung,
      values: { status: berechneterStatus },
      primary: true,
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
      subtitle={tx('Teilnehmer einem Kurs zuweisen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen Kurs anmelden — bei voller Kapazität automatisch auf die Warteliste.'),
        needs: [tx('Name des Schülers'), tx('Gewünschter Kurs')],
      }}
    >
      {/* Schritt 1: Schüler wählen */}
      <WizardStep
        label={tx('Schüler')}
        heading={tx('Schüler wählen')}
        description={tx('Vorhandenen Teilnehmer suchen oder neu anlegen.')}
      >
        <EntitySelectStep
          {...teilnehmer.select}
          selectedId={anmeldung.get('teilnehmer') as string | undefined}
          onSelect={id => {
            anmeldung.set('teilnehmer', id, teilnehmer.labelOf(id));
            setStep(2);
          }}
          avatar="initials"
          searchPlaceholder={tx('Vor- oder Nachname …')}
          create={{ fields: ['vorname', 'nachname', 'email', 'telefon'] }}
          createLabel={tx('Neuen Schüler anlegen')}
          emptyText={tx('Noch kein Schüler angelegt — jetzt ersten anlegen.')}
        />
      </WizardStep>

      {/* Schritt 2: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        heading={tx('Kurs wählen')}
        description={tx('Nur geplante und laufende Kurse werden angezeigt.')}
        needs={['teilnehmer']}
      >
        {anmeldung.get('teilnehmer') ? (
          <>
            <EntitySelectStep
              {...kurse.select}
              selectedId={anmeldung.get('kurs') as string | undefined}
              onSelect={id => {
                anmeldung.set('kurs', id, kurse.labelOf(id));
                setStep(3);
              }}
              searchPlaceholder={tx('Kurs suchen …')}
              emptyText={tx('Keine geplanten oder laufenden Kurse vorhanden. Zuerst einen Kurs planen.')}
              create={false}
              avatar="none"
              columns={2}
            />
            {gewaehlterKursId && maxTeilnehmer > 0 && (
              <div className="mt-4">
                <BudgetTracker
                  format="count"
                  unit={tx('Plätze')}
                  budget={maxTeilnehmer}
                  booked={anmeldungenCount.count ?? 0}
                  label={tx('Kursauslastung')}
                  showRemaining
                />
                {istVoll && (
                  <p className="mt-2 text-sm text-amber-600">
                    {tx('Dieser Kurs ist voll — die Anmeldung landet auf der Warteliste.')}
                  </p>
                )}
              </div>
            )}
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => anmeldung.validate(['kurs'])}
              nextStepLabel={tx('Zusammenfassung')}
            />
          </>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst einen Schüler auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Zusammenfassung */}
      <WizardStep
        label={tx('Bestätigen')}
        heading={tx('Zusammenfassung')}
      >
        {anmeldung.get('teilnehmer') && anmeldung.get('kurs') ? (
          <>
            {!submit.done && (
              <SummaryStep
                forms={[anmeldung]}
                submit={submit}
                items={[
                  {
                    key: 'status_berechnet',
                    label: tx('Anmeldestatus'),
                    value: istVoll ? tx('Warteliste') : tx('Neu'),
                  },
                  ...(istVoll
                    ? [
                        {
                          key: 'warteliste_hinweis',
                          label: tx('Hinweis'),
                          value: tx('Der Kurs ist voll. Die Anmeldung wird auf die Warteliste gesetzt.'),
                        },
                      ]
                    : []),
                ]}
                whatHappensNext={
                  istVoll
                    ? tx('Die Anmeldung wird auf der Warteliste gespeichert. Der Schüler kann nachrücken, sobald ein Platz frei wird.')
                    : tx('Die Anmeldung wird sofort gespeichert. Der Status kann später auf "Bestätigt" gesetzt werden.')
                }
                confirmLabel={tx('Jetzt anmelden')}
              >
                {istVoll && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <StatusBadge statusKey="warteliste" label={tx('Warteliste')} tone="warning" />
                    <span>{tx('Kurs voll — Anmeldung auf Warteliste')}</span>
                  </div>
                )}
              </SummaryStep>
            )}
          </>
        ) : (
          <StepNav onBack={() => setStep(anmeldung.get('teilnehmer') ? 2 : 1)} nextDisabled>
            {tx('Bitte zuerst Schüler und Kurs auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldung]}
          submit={submit}
          restartLabel={tx('Noch eine Anmeldung')}
          whatHappensNext={
            istVoll
              ? tx('Der Schüler steht auf der Warteliste und wird informiert, sobald ein Platz frei wird.')
              : tx('Der Schüler ist jetzt für den Kurs angemeldet.')
          }
          next={[
            { label: tx('Anwesenheit erfassen'), href: '#/intents/anwesenheit-erfassen' },
            { label: tx('Kurs planen'), href: '#/intents/kurs-planen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
