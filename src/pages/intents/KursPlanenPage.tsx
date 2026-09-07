/**
 * Kurs planen — 4-Schritt-Wizard (+ Erfolgsschirm).
 * Steps: 1) Kursdetails eingeben → 2) Dozent wählen → 3) Raum wählen → 4) Bestätigen & anlegen.
 * Reads: dozenten (aktiv=true), kurse (Raumbelegung per beginn+ende+status).
 * Writes: kurse (createKurseEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Bound, Field,
 *           StepNav, SummaryStep, SuccessStep, useRecordSearch, useOccupancy, useStepForm,
 *           useJourneySubmit.
 */
import { useState } from 'react';
import { IconAlertTriangle, IconMusic, IconUser, IconDoor } from '@tabler/icons-react';
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
  useOccupancy,
  fieldText,
  fieldNumber,
  fieldLookup,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function KursPlanenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1 — Kursdetails
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
    required: { preis: false, ende: false, niveau: false, wochentage: false, uhrzeit: false },
  });

  // Schritt 2 — Dozenten (nur aktive)
  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    filter: "r.v_aktiv == True",
    where: r => fieldLookup(r, 'aktiv') !== null ? Boolean(r.fields['aktiv']) : true,
    searchFields: ['vorname', 'nachname'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname')} ${fieldText(d, 'nachname')}`.trim(),
      subtitle: fieldText(d, 'instrumente') || fieldText(d, 'email'),
    }),
    orderby: ['r.v_nachname asc'],
  });

  // Schritt 3 — Räume mit Belegungsprüfung
  const beginn = kurs.get('beginn') as string | null | undefined;
  const ende = kurs.get('ende') as string | null | undefined;
  const maxTeilnehmer = kurs.get('maximale_teilnehmer') as number | null | undefined;

  // Occupancy: Kurs belegt Raum per beginn+ende; frei wenn status=abgesagt
  const belegung = useOccupancy(servicePort, 'kurse', {
    resource: kurs.get('raum') as string | null,
  });

  const raeume = useRecordSearch(servicePort, 'raeume', {
    searchFields: ['name'],
    where: r => {
      const plaetze = fieldNumber(r, 'plaetze') ?? 0;
      return maxTeilnehmer != null ? plaetze >= maxTeilnehmer : true;
    },
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'name'),
      subtitle: `${fieldNumber(r, 'plaetze') ?? '?'} ${tx('Plätze')}${r.fields['klavier_vorhanden'] ? ` · ${tx('Klavier vorhanden')}` : ''}`,
    }),
    orderby: ['r.v_name asc'],
  });

  // Plan: CREATE kurse
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'kurs',
      entity: 'kurse',
      form: kurs,
      primary: true,
      values: { status: 'geplant' },
    },
  ], { draftKey: 'kurs-planen' });

  // Belegungs-Warnung für gewählten Raum
  const gewaehlterRaumId = kurs.get('raum') as string | undefined;
  const raumIstBelegt = Boolean(
    gewaehlterRaumId &&
    beginn && ende &&
    !belegung.isFree(beginn, ende, gewaehlterRaumId)
  );

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[kurs]}
      draftKey="kurs-planen"
      intro={{
        description: tx('Einen neuen Musikkurs mit Dozent und Raum anlegen.'),
        needs: [tx('Kurstitel und Instrument'), tx('Verfügbarer Dozent'), tx('Passender Raum')],
      }}
    >
      {/* Schritt 1 — Kursdetails */}
      <WizardStep
        label={tx('Kursdetails')}
        description={tx('Titel, Instrument und Rahmendaten des Kurses eingeben.')}
      >
        <div className="space-y-4">
          <Bound form={kurs} name="titel" />
          <Bound form={kurs} name="instrument" />
          <Bound form={kurs} name="niveau" />
          <Bound form={kurs} name="wochentage" />
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
            onNext={() => kurs.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer'])}
            nextStepLabel={tx('Dozent wählen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 2 — Dozent wählen */}
      <WizardStep
        label={tx('Dozent')}
        description={tx('Einen aktiven Dozenten für diesen Kurs auswählen.')}
      >
        <EntitySelectStep
          {...dozenten.select}
          selectedId={kurs.get('dozent') as string | undefined}
          onSelect={id => {
            kurs.set('dozent', id, dozenten.labelOf(id));
            setStep(3);
          }}
          emptyText={tx('Keine aktiven Dozenten gefunden. Bitte zunächst einen Dozenten als aktiv markieren.')}
          searchPlaceholder={tx('Name suchen …')}
        />
      </WizardStep>

      {/* Schritt 3 — Raum wählen */}
      <WizardStep
        label={tx('Raum')}
        description={tx('Einen Raum mit ausreichend Plätzen auswählen.')}
        needs={['dozent']}
      >
        <div className="space-y-3">
          {raumIstBelegt && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <span>{tx('Dieser Raum ist im gewählten Zeitraum bereits belegt.')}</span>
            </div>
          )}
          <EntitySelectStep
            {...raeume.select}
            selectedId={gewaehlterRaumId}
            onSelect={id => {
              kurs.set('raum', id, raeume.labelOf(id));
              setStep(4);
            }}
            emptyText={
              maxTeilnehmer
                ? tx('Kein Raum hat genug Plätze für die angegebene Teilnehmerzahl.')
                : tx('Keine Räume gefunden.')
            }
            searchPlaceholder={tx('Raum suchen …')}
          />
        </div>
      </WizardStep>

      {/* Schritt 4 — Bestätigung */}
      <WizardStep label={tx('Bestätigen')}>
        {!submit.done && (
          <SummaryStep
            forms={[kurs]}
            submit={submit}
            whatHappensNext={tx('Der neue Kurs erscheint sofort in der Kursübersicht und kann für Anmeldungen geöffnet werden.')}
          />
        )}
      </WizardStep>

      {/* Erfolgsschirm */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[kurs]}
          submit={submit}
          restartLabel={tx('Weiteren Kurs planen')}
          whatHappensNext={tx('Schülerinnen und Schüler können jetzt für diesen Kurs angemeldet werden.')}
          next={[
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden', icon: <IconUser size={16} /> },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
