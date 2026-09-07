/**
 * Kurs planen — 4-Schritt-Wizard.
 * Steps: 1) Dozent wählen → 2) Kursdaten erfassen → 3) Raum wählen → 4) Prüfen & anlegen.
 * Reads: dozenten (filter: aktiv), raeume (filter: plaetze >= maximale_teilnehmer, frei im Kurszeitraum).
 * Writes: kurse (createKurseEntry) mit status='geplant'.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, AvailabilityRangePicker,
 *           BudgetTracker, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { DatePicker } from '@/components/DatePicker';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useOccupancy,
  fieldText,
  fieldNumber,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function KursPlanenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1 — nur aktive Dozenten
  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    filter: "r.v_aktiv == True",
    where: r => r.fields.aktiv === true,
    searchFields: ['vorname', 'nachname'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname')} ${fieldText(d, 'nachname')}`.trim(),
      subtitle: fieldText(d, 'instrumente') || undefined,
    }),
    orderby: ['r.v_nachname asc', 'r.v_vorname asc'],
  });

  // Schritt 3 — alle Räume, Belegungsprüfung über Kurse (resource=raum, abgesagt = frei)
  // Wir brauchen den gewählten Raum noch nicht als resource für useOccupancy hier —
  // wir prüfen freie Räume im Zeitraum (beginn/ende aus dem Kurs-Formular)
  const belegung = useOccupancy(servicePort, 'kurse', {});

  // Kurs-Formular — alle Felder in einem Form
  const kurs = useStepForm('kurse', {
    steps: {
      dozent: 1,
      titel: 2,
      instrument: 2,
      niveau: 2,
      wochentage: 2,
      beginn: 2,
      ende: 2,
      uhrzeit: 2,
      maximale_teilnehmer: 2,
      preis: 2,
      raum: 3,
    },
    required: {
      // 'status' wird per values gesetzt, nicht gefragt
      status: false,
    },
    initial: {},
  });

  // Raum-Suche: nur Räume mit ausreichend Plätzen + Belegungsprüfung
  const maxTeilnehmer = (kurs.get('maximale_teilnehmer') as number | null) ?? 0;
  const beginn = kurs.get('beginn') as string | null;
  const ende = kurs.get('ende') as string | null;

  const raeume = useRecordSearch(servicePort, 'raeume', {
    searchFields: ['name'],
    where: r => {
      const plaetze = fieldNumber(r, 'plaetze') ?? 0;
      if (plaetze < maxTeilnehmer) return false;
      return belegung.freeIn(beginn, ende)(r);
    },
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'name'),
      subtitle: tx`${fieldNumber(r, 'plaetze') ?? 0} Plätze`,
      stats: [{ label: tx('Plätze'), value: fieldNumber(r, 'plaetze') ?? 0 }],
    }),
    orderby: ['r.v_name asc'],
  });

  // Plan: einen Kurs anlegen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'kurs',
      entity: 'kurse',
      form: kurs,
      values: { status: 'geplant' },
      primary: true,
    },
  ], { draftKey: 'kurs-planen' });

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      subtitle={tx('Neuen Kurs anlegen und Dozent sowie Raum zuweisen.')}
      currentStep={step}
      onStepChange={setStep}
      forms={[kurs]}
      draftKey="kurs-planen"
      intro={{
        description: tx('Einen neuen Kurs vollständig planen und direkt im System anlegen.'),
        needs: [tx('Name des Dozenten'), tx('Kursdaten und Zeiten'), tx('Raum mit ausreichend Plätzen')],
      }}
    >
      {/* Schritt 1: Dozent wählen */}
      <WizardStep
        label={tx('Dozent wählen')}
        description={tx('Einen aktiven Dozenten für den neuen Kurs auswählen.')}
      >
        <EntitySelectStep
          {...dozenten.select}
          avatar="initials"
          selectedId={kurs.get('dozent') as string | null}
          onSelect={id => {
            kurs.set('dozent', id, dozenten.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Dozent suchen …')}
          emptyText={tx('Keine aktiven Dozenten gefunden.')}
          create={{ fields: ['vorname', 'nachname', 'instrumente', 'aktiv'], title: tx('Neuen Dozenten anlegen') }}
        />
      </WizardStep>

      {/* Schritt 2: Kursdaten erfassen */}
      <WizardStep
        label={tx('Kursdaten')}
        description={tx('Titel, Instrument, Zeiten und Kapazität des Kurses festlegen.')}
        needs={['dozent']}
      >
        <div className="space-y-5">
          <Bound form={kurs} name="titel" placeholder={tx('z. B. Klavierkurs Anfänger')} />

          <Field form={kurs} name="instrument">
            <ChoiceGroup {...kurs.choice('instrument')} />
          </Field>

          <Field form={kurs} name="niveau">
            <ChoiceGroup {...kurs.choice('niveau')} allowClear />
          </Field>

          <Field form={kurs} name="wochentage">
            <ChoiceGroup
              id={kurs.fieldId('wochentage')}
              value={null}
              onChange={() => {}}
              options={[
                { key: 'montag', label: tx('Montag') },
                { key: 'dienstag', label: tx('Dienstag') },
                { key: 'mittwoch', label: tx('Mittwoch') },
                { key: 'donnerstag', label: tx('Donnerstag') },
                { key: 'freitag', label: tx('Freitag') },
                { key: 'samstag', label: tx('Samstag') },
              ]}
              allowClear
            />
          </Field>

          <div>
            <AvailabilityRangePicker
              {...kurs.range('beginn', 'ende', {
                blocked: belegung.blocked,
                unit: 'days',
              })}
              disablePast={false}
              legend={tx('Belegte Zeiträume sind ausgegraut.')}
            />
          </div>

          <Field form={kurs} name="uhrzeit" hint={tx('Wöchentliche Kurszeit')}>
            <DatePicker {...kurs.date('uhrzeit')} />
          </Field>

          <Bound form={kurs} name="maximale_teilnehmer" hint={tx('Maximale Anzahl Schüler')} />

          <Bound form={kurs} name="preis" hint={tx('Preis pro Teilnehmer in Euro')} />

          <StepNav
            onBack={() => setStep(1)}
            onNext={() =>
              kurs.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer'])
            }
            nextStepLabel={tx('Raum wählen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Raum wählen */}
      <WizardStep
        label={tx('Raum wählen')}
        description={tx('Einen Raum mit ausreichend Plätzen und freiem Zeitraum auswählen.')}
        needs={['beginn', 'maximale_teilnehmer']}
      >
        <div className="space-y-4">
          {maxTeilnehmer > 0 && (
            <BudgetTracker
              format="count"
              unit={tx('Plätze')}
              budget={maxTeilnehmer}
              booked={0}
              label={tx('Benötigte Kapazität')}
              showRemaining={false}
            />
          )}
          <EntitySelectStep
            {...raeume.select}
            avatar="none"
            selectedId={kurs.get('raum') as string | null}
            onSelect={id => {
              kurs.set('raum', id, raeume.labelOf(id));
              setStep(4);
            }}
            searchPlaceholder={tx('Raum suchen …')}
            emptyText={
              maxTeilnehmer > 0
                ? tx('Kein Raum hat ausreichend Plätze oder ist im gewählten Zeitraum frei.')
                : tx('Bitte zuerst die maximale Teilnehmerzahl angeben.')
            }
            create={{ fields: ['name', 'plaetze', 'klavier_vorhanden'], title: tx('Neuen Raum anlegen') }}
          />
        </div>
      </WizardStep>

      {/* Schritt 4: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.result && (
          <SummaryStep
            forms={[kurs]}
            submit={submit}
            whatHappensNext={tx('Der Kurs wird mit Status „Geplant" angelegt und erscheint sofort in der Kursübersicht.')}
            confirmLabel={tx('Kurs anlegen')}
          />
        )}
        {submit.result && (
          <SuccessStep
            result={submit.result}
            forms={[kurs]}
            submit={submit}
            restartLabel={tx('Weiteren Kurs planen')}
            next={[
              {
                label: tx('Schüler anmelden'),
                href: '#/intents/schueler-anmelden',
              },
              {
                label: tx('Zum Dashboard'),
                href: '#/',
              },
            ]}
            whatHappensNext={tx('Jetzt können Schüler für diesen Kurs angemeldet werden.')}
          />
        )}
      </WizardStep>
    </IntentWizardShell>
  );
}
