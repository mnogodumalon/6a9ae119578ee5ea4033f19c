/**
 * Schüler anmelden — 4-Schritt-Wizard.
 * Steps: 1) Schüler wählen oder neu anlegen → 2) Kurs wählen (nur geplant/läuft, Kapazitätsprüfung)
 *        → 3) Bestätigen & anlegen (SummaryStep) → 4) Erfolg (SuccessStep).
 * Reads: teilnehmer, kurse, anmeldungen (Zähler pro Kurs).
 * Writes: teilnehmer (Neu anlegen via port.create sofort), anmeldungen (createAnmeldungenEntry via Plan).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldNumber,
  fieldDate,
  refFilter,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function SchuelerAnmeldenPage() {
  const [step, setStep] = useState(1);
  const [enrolledCount, setEnrolledCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // Schritt 1: Teilnehmer suchen
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim() || tx('Unbekannt'),
      subtitle: fieldText(t, 'email') || fieldText(t, 'telefon') || undefined,
    }),
  });

  // Schritt 2: Kurse suchen — nur geplant oder läuft
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status == 'geplant' or r.v_status == 'laeuft'",
    where: r => {
      const key = fieldLookup(r, 'status')?.key ?? '';
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel') || tx('Kurs ohne Titel'),
      subtitle: [
        fieldLookup(k, 'instrument')?.label,
        fieldLookup(k, 'niveau')?.label,
        fieldDate(k, 'beginn') ? format(new Date(fieldDate(k, 'beginn')!), 'dd.MM.yyyy') : undefined,
      ].filter(Boolean).join(' · ') || undefined,
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  // Anmeldungsformular — nur die Felder, die in der Zusammenfassung erscheinen sollen
  const anmeldung = useStepForm('anmeldungen', {
    steps: { kurs: 2, teilnehmer: 1 },
    required: { anmeldedatum: false, bezahlt: false },
  });

  const kursId = anmeldung.get('kurs') as string | undefined;
  const kursRecord = kursId ? kurse.recordOf(kursId) : null;
  const maxTeilnehmer = kursRecord ? (fieldNumber(kursRecord, 'maximale_teilnehmer') ?? null) : null;
  const isFull = maxTeilnehmer !== null && enrolledCount !== null && enrolledCount >= maxTeilnehmer;

  // Zähler: aktive Anmeldungen für den gewählten Kurs laden
  useEffect(() => {
    if (!kursId) {
      setEnrolledCount(null);
      return;
    }
    let cancelled = false;
    setLoadingCount(true);
    servicePort
      .count('anmeldungen', { filter: tx`${refFilter('kurs', kursId)} and r.v_status != 'abgemeldet'` })
      .then(n => { if (!cancelled) { setEnrolledCount(n); setLoadingCount(false); } })
      .catch(() => { if (!cancelled) { setEnrolledCount(null); setLoadingCount(false); } });
    return () => { cancelled = true; };
  }, [kursId]);

  const anmeldungStatus = isFull ? 'warteliste' : 'neu';

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'anmeldung',
      entity: 'anmeldungen',
      form: anmeldung,
      primary: true,
      values: {
        anmeldedatum: todayIso(),
        status: anmeldungStatus,
        bezahlt: false,
      },
    },
  ], { draftKey: 'schueler-anmelden' });

  const kursLabel = kursId ? kurse.labelOf(kursId) : '';
  const teilnehmerLabel = anmeldung.get('teilnehmer_label') as string | undefined ?? '';

  return (
    <IntentWizardShell
      title={tx('Schüler anmelden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen laufenden oder geplanten Kurs anmelden.'),
        needs: [tx('Name des Schülers'), tx('Gewünschter Kurs')],
      }}
    >
      {/* Schritt 1 — Schüler wählen oder neu anlegen */}
      <WizardStep
        label={tx('Schüler')}
        description={tx('Bestehenden Schüler suchen oder neu anlegen.')}
      >
        <EntitySelectStep
          {...teilnehmer.select}
          selectedId={anmeldung.get('teilnehmer') as string | undefined}
          onSelect={id => {
            anmeldung.set('teilnehmer', id, teilnehmer.labelOf(id));
            setStep(2);
          }}
          create={{
            fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
            title: tx('Neuen Schüler anlegen'),
          }}
          searchPlaceholder={tx('Vorname, Nachname oder E-Mail …')}
        />
      </WizardStep>

      {/* Schritt 2 — Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Nur aktive und geplante Kurse werden angezeigt.')}
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
              emptyText={tx('Kein aktiver oder geplanter Kurs gefunden.')}
              create={false}
              searchPlaceholder={tx('Kurstitel suchen …')}
            />
            {kursId && maxTeilnehmer !== null && (
              <div className="mt-4">
                <BudgetTracker
                  format="count"
                  unit={tx('Plätze')}
                  budget={maxTeilnehmer}
                  booked={loadingCount ? 0 : (enrolledCount ?? 0)}
                  label={tx('Kursauslastung')}
                />
              </div>
            )}
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => anmeldung.validate(['kurs'])}
              nextStepLabel={tx('Prüfen')}
            />
          </>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst einen Schüler auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3 — Zusammenfassung & Bestätigung */}
      <WizardStep label={tx('Prüfen')}>
        {anmeldung.get('kurs') ? (
          !submit.done ? (
            <SummaryStep
              forms={[anmeldung]}
              submit={submit}
              items={[
                {
                  key: 'status_anmeldung',
                  label: tx('Status'),
                  value: isFull ? tx('Warteliste') : tx('Neu'),
                  keys: ['_computed'],
                  fieldId: 'status_anmeldung',
                },
              ]}
              whatHappensNext={
                isFull
                  ? tx('Der Schüler wird auf die Warteliste gesetzt und benachrichtigt, sobald ein Platz frei wird.')
                  : tx('Die Anmeldung erscheint sofort in der Kursliste und kann bestätigt werden.')
              }
            />
          ) : null
        ) : (
          <StepNav onBack={() => setStep(2)} nextDisabled>
            {tx('Bitte zuerst einen Kurs auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4 — Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          submit={submit}
          forms={[anmeldung]}
          facts={[
            { label: tx('Schüler'), value: teilnehmerLabel ?? '' },
            { label: tx('Kurs'), value: kursLabel ?? '' },
            { label: tx('Status'), value: isFull ? tx('Warteliste') : tx('Neu') },
          ]}
          whatHappensNext={
            isFull
              ? tx('Der Schüler steht auf der Warteliste. Sobald ein Platz frei wird, kann der Status auf „Bestätigt" gesetzt werden.')
              : tx('Die Anmeldung ist angelegt. Im nächsten Schritt kann die Anwesenheit für diesen Kurs erfasst werden.')
          }
          next={[
            { label: tx('Weitere Anmeldung'), href: '#/intents/schueler-anmelden' },
            { label: tx('Anwesenheit erfassen'), href: '#/intents/anwesenheit-erfassen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
