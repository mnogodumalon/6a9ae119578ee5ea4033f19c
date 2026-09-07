/**
 * Kurs planen — 5-Schritt-Wizard.
 * Steps: 1) Kursdaten eingeben → 2) Dozenten auswählen → 3) Raum auswählen →
 *         4) Prüfen & anlegen → 5) Erfolg.
 * Reads: dozenten, raeume. Writes: kurse (createKurseEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, Bound,
 *           StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldNumber,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { tx } from '@/i18n';

export default function KursPlanenPage() {
  const data = useDashboardData({ omit: ['dozenten', 'raeume'] });

  const [step, setStep] = useState(1);

  const kursForm = useStepForm('kurse', {
    steps: {
      titel: 1,
      instrument: 1,
      niveau: 1,
      wochentage: 1,
      beginn: 1,
      ende: 1,
      uhrzeit: 1,
      maximale_teilnehmer: 1,
      preis: 1,
      dozent: 2,
      raum: 3,
    },
  });

  const maxTeilnehmer = (kursForm.get('maximale_teilnehmer') as number | null) ?? 0;

  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    searchFields: ['vorname', 'nachname', 'instrumente'],
    toItem: (d) => ({
      id: d.id,
      title: `${fieldText(d, 'vorname')} ${fieldText(d, 'nachname')}`.trim(),
      subtitle: fieldText(d, 'instrumente') || undefined,
      stats: [
        {
          label: tx('Aktiv'),
          value: d.fields['aktiv'] ? tx('ja') : tx('nein'),
        },
      ],
    }),
  });

  const raeume = useRecordSearch(servicePort, 'raeume', {
    searchFields: ['name'],
    where: (r) => (fieldNumber(r, 'plaetze') ?? 0) >= maxTeilnehmer,
    toItem: (r) => ({
      id: r.id,
      title: fieldText(r, 'name'),
      subtitle: tx`${fieldNumber(r, 'plaetze') ?? 0} Plätze`,
      stats: [
        {
          label: tx('Klavier'),
          value: r.fields['klavier_vorhanden'] ? tx('ja') : tx('nein'),
        },
      ],
    }),
  });

  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'kurs',
        entity: 'kurse',
        form: kursForm,
        primary: true,
        values: { status: 'geplant' },
      },
    ],
    { draftKey: 'kurs-planen' },
  );

  const restart = () => {
    submit.reset();
    kursForm.reset();
    setStep(1);
  };

  const dozentId = kursForm.get('dozent') as string | null;
  const raumId = kursForm.get('raum') as string | null;

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[kursForm]}
      draftKey="kurs-planen"
      intro={{
        description: tx('Einen neuen Kurs mit Dozent und Raum anlegen.'),
        needs: [tx('Kurstitel und Instrument'), tx('Startdatum'), tx('Maximale Teilnehmerzahl')],
      }}
    >
      {/* Schritt 1 — Kursdaten */}
      <WizardStep
        label={tx('Kursdaten')}
        description={tx('Grundlegende Informationen zum neuen Kurs eingeben.')}
      >
        <div className="space-y-4">
          <Bound form={kursForm} name="titel" />
          <Bound form={kursForm} name="instrument" />
          <Bound form={kursForm} name="niveau" />
          <Bound form={kursForm} name="wochentage" />
          <Bound form={kursForm} name="beginn" />
          <Bound form={kursForm} name="ende" />
          <Bound form={kursForm} name="uhrzeit" />
          <Bound form={kursForm} name="maximale_teilnehmer" />
          <Bound form={kursForm} name="preis" label={tx('Preis (Euro)')} />
          <StepNav
            onNext={() =>
              kursForm.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer'])
            }
            nextStepLabel={tx('Dozenten auswählen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 2 — Dozenten auswählen */}
      <WizardStep
        label={tx('Dozent')}
        description={tx('Einen Dozenten für diesen Kurs auswählen.')}
      >
        <EntitySelectStep
          {...dozenten.select}
          selectedId={dozentId ?? undefined}
          onSelect={(id) => {
            kursForm.set('dozent', id, dozenten.labelOf(id));
            setStep(3);
          }}
          searchPlaceholder={tx('Dozenten suchen …')}
        />
      </WizardStep>

      {/* Schritt 3 — Raum auswählen */}
      <WizardStep
        label={tx('Raum')}
        description={tx('Einen Raum mit ausreichend Plätzen für diesen Kurs auswählen.')}
      >
        {maxTeilnehmer > 0 ? (
          <EntitySelectStep
            {...raeume.select}
            selectedId={raumId ?? undefined}
            onSelect={(id) => {
              kursForm.set('raum', id, raeume.labelOf(id));
              setStep(4);
            }}
            emptyText={tx('Kein Raum mit genug Plätzen verfügbar — bitte maximale Teilnehmerzahl anpassen')}
            searchPlaceholder={tx('Raum suchen …')}
          />
        ) : (
          <StepNav
            onBack={() => setStep(1)}
            nextDisabled
          >
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht eine Teilnehmeranzahl aus Schritt 1.')}
            </p>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4 — Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[kursForm]}
            submit={submit}
            whatHappensNext={tx('Der Kurs wird mit Status „Geplant" angelegt und ist sofort im System sichtbar.')}
            confirmLabel={tx('Kurs anlegen')}
          />
        )}
      </WizardStep>

      {/* Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[kursForm]}
          facts={[
            { label: tx('Kurs'), value: kursForm.get('titel') as string ?? '' },
            { label: tx('Dozent'), value: dozentId ? (dozenten.labelOf(dozentId) ?? '') : '' },
            { label: tx('Raum'), value: raumId ? (raeume.labelOf(raumId) ?? '') : '' },
            { label: tx('Beginn'), value: (kursForm.get('beginn') as string | null) ?? '' },
            { label: tx('Max. Teilnehmer'), value: String(kursForm.get('maximale_teilnehmer') ?? '') },
          ]}
          next={[
            { label: tx('Weiteren Kurs planen'), onClick: restart },
            { label: tx('Schüler anmelden'), href: '#/schueler-anmelden' },
            { label: tx('Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Der Kurs erscheint sofort in der Kursübersicht.')}
        />
      )}
    </IntentWizardShell>
  );
}
