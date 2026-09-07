/**
 * Kurs planen — 4-Schritt-Wizard.
 * Steps: 1) Dozent wählen → 2) Kursdetails erfassen → 3) Raum wählen → 4) Prüfen & anlegen.
 * Reads: dozenten, raeume. Writes: kurse (createKurseEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldNumber } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { Bound } from '@/components/blocks/Bound';
import { tx } from '@/i18n';

export default function KursPlanenPage() {
  const [step, setStep] = useState(1);
  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    filter: "r.v_aktiv != False",
    where: r => r.fields.aktiv !== false,
    searchFields: ['vorname', 'nachname', 'instrumente'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname') ?? ''} ${fieldText(d, 'nachname') ?? ''}`.trim(),
      subtitle: fieldText(d, 'instrumente') ?? undefined,
    }),
  });

  const kursForm = useStepForm('kurse', {
    steps: {
      titel: 2,
      instrument: 2,
      niveau: 2,
      wochentage: 2,
      beginn: 2,
      ende: 2,
      uhrzeit: 2,
      maximale_teilnehmer: 2,
      preis: 2,
      dozent: 1,
      raum: 3,
    },
  });

  const selectedMaxTeilnehmer = (kursForm.get('maximale_teilnehmer') as number | undefined) ?? 0;

  const raeume = useRecordSearch(servicePort, 'raeume', {
    filter: selectedMaxTeilnehmer > 0 ? `r.v_plaetze >= ${selectedMaxTeilnehmer}` : undefined,
    where: r => (fieldNumber(r, 'plaetze') ?? 0) >= selectedMaxTeilnehmer,
    searchFields: ['name'],
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'name') ?? '',
      subtitle: [
        `${fieldNumber(r, 'plaetze') ?? 0} ${tx('Plätze')}`,
        r.fields.klavier_vorhanden ? tx('Klavier vorhanden') : '',
      ].filter(Boolean).join(' · '),
    }),
  });

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'kurs',
      entity: 'kurse',
      form: kursForm,
      primary: true,
      values: { status: 'geplant' },
    },
  ], { draftKey: 'kurs-planen' });

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[kursForm]}
      draftKey="kurs-planen"
      intro={{
        description: tx('Einen neuen Kurs für einen Dozenten anlegen und einen passenden Raum wählen.'),
        needs: [tx('Dozent'), tx('Kursdetails'), tx('Raum mit genug Plätzen')],
      }}
    >
      <WizardStep
        label={tx('Dozent')}
        heading={tx('Dozent wählen')}
        description={tx('Den unterrichtenden Dozenten für diesen Kurs auswählen.')}
      >
        <EntitySelectStep
          {...dozenten.select}
          selectedId={kursForm.get('dozent') as string}
          onSelect={id => { kursForm.set('dozent', id, dozenten.labelOf(id)); }}
          emptyText={tx('Kein aktiver Dozent gefunden.')}
          searchPlaceholder={tx('Name oder Instrument suchen …')}
        />
      </WizardStep>

      <WizardStep
        label={tx('Kursdetails')}
        description={tx('Titel, Instrument, Termine und Teilnehmerzahl festlegen.')}
        needs={['dozent']}
      >
        <div className="space-y-4">
          <Bound form={kursForm} name="titel" />
          <Bound form={kursForm} name="instrument" as="choice" />
          <Bound form={kursForm} name="niveau" as="choice" />
          <Bound form={kursForm} name="wochentage" as="choice" />
          <Bound form={kursForm} name="beginn" />
          <Bound form={kursForm} name="ende" />
          <Bound form={kursForm} name="uhrzeit" />
          <Bound form={kursForm} name="maximale_teilnehmer" />
          <Bound form={kursForm} name="preis" />
          <StepNav
            onNext={() => kursForm.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer'])}
            nextStepLabel={tx('Raum wählen')}
          />
        </div>
      </WizardStep>

      <WizardStep
        label={tx('Raum')}
        heading={tx('Raum wählen')}
        description={tx('Einen Raum mit genug Plätzen für die geplante Teilnehmerzahl auswählen.')}
        needs={['titel', 'maximale_teilnehmer']}
      >
        <EntitySelectStep
          {...raeume.select}
          selectedId={kursForm.get('raum') as string}
          onSelect={id => { kursForm.set('raum', id, raeume.labelOf(id)); }}
          emptyText={
            selectedMaxTeilnehmer > 0
              ? (tx('Kein Raum hat genug Plätze für die angegebene Teilnehmerzahl.') ?? '')
              : (tx('Bitte zuerst die maximale Teilnehmerzahl angeben.') ?? '')
          }
          create={false}
          searchPlaceholder={tx('Raumname suchen …')}
        />
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[kursForm]}
            submit={submit}
            whatHappensNext={tx('Der Kurs wird sofort angelegt und ist in der Kursübersicht sichtbar.')}
            items={[
              {
                key: 'dozent-name',
                label: tx('Dozent'),
                value: kursForm.get('dozent') ? (dozenten.labelOf(kursForm.get('dozent') as string) ?? '—') : '—',
                keys: ['dozent'],
                fieldId: 'dozent',
                step: 1,
              },
            ]}
          />
        )}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            submit={submit}
            forms={[kursForm]}
            next={[
              { label: tx('Weiteren Kurs planen'), href: '#/intents/kurs-planen' },
              { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
              { label: tx('Zum Dashboard'), href: '#/' },
            ]}
            whatHappensNext={tx('Schüler können jetzt über „Schüler anmelden" für diesen Kurs angemeldet werden.')}
          />
        )}
      </WizardStep>
    </IntentWizardShell>
  );
}
