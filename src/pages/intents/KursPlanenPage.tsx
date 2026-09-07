/**
 * Kurs planen — 4-Schritt-Wizard.
 * Steps: 1) Dozent wählen → 2) Kursdetails → 3) Raum wählen → 4) Prüfen & anlegen.
 * Reads: dozenten, raeume, kurse (Raumbelegung). Writes: kurse (createKurseEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Bound,
 *           StepNav, SummaryStep, SuccessStep, useOccupancy.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useOccupancy,
  fieldText,
  fieldNumber,
  fieldLookup,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { LOOKUP_OPTIONS } from '@/types/app';
import { tx } from '@/i18n';
import { IconPiano, IconUsers } from '@tabler/icons-react';

export default function KursPlanenPage() {
  const [step, setStep] = useState(1);

  // Step form — one form for the whole kurse entity, steps map each field to its step
  const kurs = useStepForm('kurse', {
    steps: {
      dozent: 1,
      titel: 2,
      instrument: 2,
      niveau: 2,
      beginn: 2,
      ende: 2,
      uhrzeit: 2,
      wochentage: 2,
      maximale_teilnehmer: 2,
      preis: 2,
      status: 2,
      raum: 3,
    },
    initial: {
      status: LOOKUP_OPTIONS['kurse']?.['status']?.find(o => o.key === 'geplant')?.key ?? 'geplant',
    },
    required: {
      // preis and raum are optional per brief (no !)
      preis: false,
      raum: false,
      ende: false,
      uhrzeit: false,
      wochentage: false,
    },
  });

  // Dozenten: prefer aktiv=true but show all (no filter — brief says "alle wählbar")
  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    searchFields: ['vorname', 'nachname'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname')} ${fieldText(d, 'nachname')}`.trim(),
      subtitle: fieldText(d, 'instrumente') || undefined,
      status: d.fields['aktiv'] === true ? { key: 'aktiv', label: tx('Aktiv') } : { key: 'inaktiv', label: tx('Inaktiv') },
    }),
  });

  // Belegung: Räume belegt über kurse beginn/ende, frei wenn status ∈ abgesagt | abgeschlossen
  const belegung = useOccupancy(servicePort, 'kurse', {
    resource: kurs.get('raum') as string,
  });

  // Beginn/Ende aus dem Formular für den Raumfilter
  const beginnVal = kurs.get('beginn') as string | null;
  const endeVal = kurs.get('ende') as string | null;
  const maxTeilnehmer = kurs.get('maximale_teilnehmer') as number | null;

  // Raeume: nur Räume mit genug Plätzen (plaetze >= maximale_teilnehmer), frei im Zeitraum
  const raeume = useRecordSearch(servicePort, 'raeume', {
    searchFields: ['name'],
    where: r => {
      const plaetze = fieldNumber(r, 'plaetze') ?? 0;
      const hatPlatz = maxTeilnehmer == null || plaetze >= maxTeilnehmer;
      const istFrei = belegung.freeIn(beginnVal, endeVal)(r);
      return hatPlatz && istFrei;
    },
    toItem: r => {
      const plaetze = fieldNumber(r, 'plaetze');
      const klavierVorhanden = r.fields['klavier_vorhanden'] === true;
      return {
        id: r.id,
        title: fieldText(r, 'name'),
        subtitle: [
          plaetze != null ? tx`${plaetze} Plätze` : null,
          klavierVorhanden ? tx('Klavier vorhanden') : null,
        ].filter(Boolean).join(' · ') || undefined,
        stats: plaetze != null ? [{ label: tx('Plätze'), value: String(plaetze) }] : [],
      };
    },
  });

  // Plan: CREATE kurse mit allen Feldern
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'kurs',
      entity: 'kurse',
      form: kurs,
      primary: true,
      values: {
        status: LOOKUP_OPTIONS['kurse']?.['status']?.find(o => o.key === 'geplant')?.key ?? 'geplant',
      },
    },
  ], { draftKey: 'kurs-planen' });

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[kurs]}
      draftKey="kurs-planen"
      intro={{
        description: tx('Einen neuen Kurs mit Dozent, Details und Raum anlegen.'),
        needs: [tx('Dozent'), tx('Kursdetails'), tx('Raum')],
      }}
    >
      {/* Schritt 1 — Dozent wählen */}
      <WizardStep
        label={tx('Dozent')}
        heading={tx('Dozent wählen')}
        description={tx('Wer unterrichtet diesen Kurs?')}
      >
        <EntitySelectStep
          {...dozenten.select}
          selectedId={kurs.get('dozent') as string}
          onSelect={id => {
            kurs.set('dozent', id, dozenten.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Vorname oder Nachname …')}
        />
      </WizardStep>

      {/* Schritt 2 — Kursdetails */}
      <WizardStep
        label={tx('Kursdetails')}
        description={tx('Instrument, Niveau, Termine und Kapazität festlegen.')}
        needs={['dozent']}
      >
        <div className="space-y-5">
          <Bound form={kurs} name="titel" />

          {/* instrument — ChoiceGroup, viele Optionen → scrollbar via overflow */}
          <Field form={kurs} name="instrument">
            <div className="max-h-48 overflow-y-auto pr-1">
              <ChoiceGroup {...kurs.choice('instrument')} />
            </div>
          </Field>

          {/* niveau — ChoiceGroup (3 Optionen) */}
          <Field form={kurs} name="niveau">
            <ChoiceGroup {...kurs.choice('niveau')} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Bound form={kurs} name="beginn" />
            <Bound form={kurs} name="ende" />
          </div>

          <Bound form={kurs} name="uhrzeit" />

          {/* wochentage — multiplelookup/checkbox → ChoiceGroup */}
          <Field form={kurs} name="wochentage">
            <ChoiceGroup {...kurs.choice('wochentage')} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Bound form={kurs} name="maximale_teilnehmer" />
            <Bound form={kurs} name="preis" />
          </div>

          <StepNav
            onNext={() => kurs.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer', 'status'])}
            nextStepLabel={tx('Raum wählen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3 — Raum wählen */}
      <WizardStep
        label={tx('Raum')}
        heading={tx('Raum wählen')}
        description={tx('Nur Räume mit ausreichend Plätzen werden angezeigt.')}
        needs={['titel', 'maximale_teilnehmer']}
      >
        <EntitySelectStep
          {...raeume.select}
          selectedId={kurs.get('raum') as string}
          onSelect={id => {
            kurs.set('raum', id, raeume.labelOf(id));
            setStep(4);
          }}
          emptyText={tx('Kein Raum hat genug Plätze oder ist im gewählten Zeitraum frei.')}
          searchPlaceholder={tx('Raumname …')}
          create={false}
        />
      </WizardStep>

      {/* Schritt 4 — Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[kurs]}
            submit={submit}
            whatHappensNext={tx('Der Kurs wird sofort angelegt und kann danach mit Schülern belegt werden.')}
            confirmLabel={tx('Kurs anlegen')}
          />
        )}
      </WizardStep>

      {/* Schritt 5 — Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[kurs]}
          next={[
            { label: tx('Weiteren Kurs planen'), onClick: () => { submit.reset(); kurs.reset(); setStep(1); } },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Über „Schüler anmelden" können Schüler direkt für diesen Kurs gebucht werden.')}
        />
      )}
    </IntentWizardShell>
  );
}
