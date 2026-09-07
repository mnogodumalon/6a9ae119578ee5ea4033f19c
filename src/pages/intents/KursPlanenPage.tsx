/**
 * Kurs planen — 4-Schritt-Wizard.
 * Steps: 1) Kursdetails eingeben → 2) Dozent wählen → 3) Raum wählen → 4) Prüfen & anlegen.
 * Reads: dozenten (aktiv=true), raeume (plaetze >= maximale_teilnehmer).
 * Writes: kurse (createKurseEntry) mit status=geplant.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Bound,
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
import { tx } from '@/i18n';

const DRAFT_KEY = 'kurs-planen';

export default function KursPlanenPage() {
  const [step, setStep] = useState(1);

  const kurs = useStepForm('kurse', {
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
    required: { raum: false, ende: false, uhrzeit: false, niveau: false, wochentage: false, preis: false },
  });

  const maxTeilnehmer = (kurs.get('maximale_teilnehmer') as number | null) ?? 0;

  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    filter: "r.v_aktiv == True",
    where: r => r.fields.aktiv === true,
    searchFields: ['vorname', 'nachname'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname')} ${fieldText(d, 'nachname')}`.trim(),
      subtitle: fieldText(d, 'instrumente') || undefined,
      avatar: 'initials' as const,
    }),
    orderby: ['r.v_nachname asc'],
  });

  const raumFilter = maxTeilnehmer > 0
    ? `r.v_plaetze >= ${maxTeilnehmer}`
    : undefined;

  const raeume = useRecordSearch(servicePort, 'raeume', {
    filter: raumFilter,
    where: r => maxTeilnehmer <= 0 || (fieldNumber(r, 'plaetze') ?? 0) >= maxTeilnehmer,
    searchFields: ['name'],
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'name'),
      stats: [
        { label: tx('Plätze'), value: fieldNumber(r, 'plaetze') ?? 0 },
      ],
      avatar: 'none' as const,
    }),
    orderby: ['r.v_plaetze asc'],
  });

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'kurs',
      entity: 'kurse',
      form: kurs,
      primary: true,
      values: { status: 'geplant' },
    },
  ], { draftKey: DRAFT_KEY });

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      subtitle={tx('Neuen Kurs anlegen und Dozenten sowie Raum zuweisen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[kurs]}
      draftKey={DRAFT_KEY}
      intro={{
        description: tx('Einen neuen Kurs anlegen, Dozenten und Raum zuweisen.'),
        needs: [tx('Kurstitel und Instrument'), tx('Startdatum und Teilnehmerzahl')],
      }}
    >
      {/* Schritt 1: Kursdetails */}
      <WizardStep
        label={tx('Kursdetails')}
        description={tx('Titel, Instrument und Kursdetails eingeben.')}
      >
        <div className="space-y-4">
          <Bound form={kurs} name="titel" />
          <Bound form={kurs} name="instrument" />
          <Bound form={kurs} name="niveau" allowClear />
          <Bound form={kurs} name="wochentage" allowClear />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Bound form={kurs} name="beginn" />
            <Bound form={kurs} name="ende" />
          </div>
          <Bound form={kurs} name="uhrzeit" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Bound form={kurs} name="maximale_teilnehmer" />
            <Bound form={kurs} name="preis" />
          </div>
          <StepNav
            hideBack
            nextStepLabel={tx('Dozent')}
            onNext={() => kurs.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer'])}
          />
        </div>
      </WizardStep>

      {/* Schritt 2: Dozent wählen */}
      <WizardStep
        label={tx('Dozent')}
        description={tx('Einen aktiven Dozenten für den Kurs wählen.')}
      >
        <EntitySelectStep
          {...dozenten.select}
          selectedId={kurs.get('dozent') as string | null}
          onSelect={id => {
            kurs.set('dozent', id, dozenten.labelOf(id));
            setStep(3);
          }}
          emptyText={tx('Keine aktiven Dozenten vorhanden. Bitte zuerst einen Dozenten anlegen.')}
          searchPlaceholder={tx('Dozent suchen …')}
          avatar="initials"
        />
        <StepNav
          onBack={() => setStep(1)}
          nextStepLabel={tx('Raum')}
          onNext={() => kurs.validate(['dozent'])}
        />
      </WizardStep>

      {/* Schritt 3: Raum wählen */}
      <WizardStep
        label={tx('Raum')}
        description={tx('Einen Raum mit ausreichend Plätzen wählen.')}
        needs={['maximale_teilnehmer']}
      >
        <EntitySelectStep
          {...raeume.select}
          selectedId={kurs.get('raum') as string | null}
          onSelect={id => {
            kurs.set('raum', id, raeume.labelOf(id));
            setStep(4);
          }}
          emptyText={
            maxTeilnehmer > 0
              ? tx('Kein Raum hat genügend Plätze für die angegebene Teilnehmerzahl.')
              : tx('Bitte zuerst die maximale Teilnehmeranzahl in Schritt 1 eingeben.')
          }
          searchPlaceholder={tx('Raum suchen …')}
          avatar="none"
          create={false}
        />
        <StepNav
          onBack={() => setStep(2)}
          nextStepLabel={tx('Prüfen')}
          onNext={() => kurs.validate(['raum'])}
        />
      </WizardStep>

      {/* Schritt 4: Prüfen & Anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[kurs]}
            submit={submit}
            items={[
              { key: 'status', label: tx('Status'), value: tx('Geplant') },
            ]}
            whatHappensNext={tx('Der Kurs wird mit Status „Geplant" angelegt und kann sofort mit Schülern belegt werden.')}
            confirmLabel={tx('Kurs anlegen')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[kurs]}
          submit={submit}
          restartLabel={tx('Weiteren Kurs planen')}
          whatHappensNext={tx('Der Kurs ist angelegt. Jetzt können Schüler angemeldet werden.')}
          next={[
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Anwesenheit erfassen'), href: '#/intents/anwesenheit-erfassen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
