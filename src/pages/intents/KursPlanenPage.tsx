/**
 * Kurs planen — 4-Schritt-Wizard (plus Erfolgsschritt).
 * Steps: 1) Dozent wählen → 2) Kursdaten eingeben → 3) Raum wählen → 4) Überprüfen & anlegen.
 * Reads: dozenten, raeume. Writes: kurse (createKurseEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, StepNav,
 *           SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldNumber, fieldLookup } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { IconInfoCircle, IconDoorEnter } from '@tabler/icons-react';

export default function KursPlanenPage() {
  const [step, setStep] = useState(1);

  // Step 1: Dozent search — filter to active dozenten where possible
  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    filter: "r.v_aktiv == True",
    where: r => fieldText(r, 'aktiv') !== 'false' && r.fields['aktiv'] !== false,
    searchFields: ['vorname', 'nachname'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname') ?? ''} ${fieldText(d, 'nachname') ?? ''}`.trim(),
      subtitle: fieldText(d, 'instrumente') ?? undefined,
    }),
  });

  // Step 3: Raum search — all rooms (client-side filter by plaetze happens in the step)
  const raeume = useRecordSearch(servicePort, 'raeume', {
    searchFields: ['name'],
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'name') ?? tx('Raum'),
      subtitle: fieldNumber(r, 'plaetze') != null
        ? tx`${fieldNumber(r, 'plaetze')} Plätze${r.fields['klavier_vorhanden'] ? tx(' · Klavier vorhanden') : ''}`
        : undefined,
    }),
  });

  // ONE form for the kurse entity — maps every field to the step that asks it
  const f = useStepForm('kurse', {
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
    // status is set via values in the plan; not asked in the form
    required: { status: false },
  });

  const maximale_teilnehmer = (f.get('maximale_teilnehmer') as number | undefined) ?? 0;

  // Plan: create one kurse record with status='geplant'
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'kurs',
      entity: 'kurse',
      form: f,
      primary: true,
      values: { status: 'geplant' },
    },
  ], { draftKey: 'kurs-planen' });

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="kurs-planen"
      intro={{
        description: tx('Einen neuen Kurs anlegen und sofort in der Planung verfügbar machen.'),
        needs: [tx('Dozent'), tx('Kursdaten (Titel, Instrument, Beginn)'), tx('Maximale Teilnehmerzahl')],
      }}
    >
      {/* ── Schritt 1: Dozent wählen ── */}
      <WizardStep
        label={tx('Dozent')}
        description={tx('Aktiven Dozenten für diesen Kurs auswählen.')}
      >
        <EntitySelectStep
          {...dozenten.select}
          selectedId={f.get('dozent') as string}
          onSelect={id => {
            f.set('dozent', id, dozenten.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Kein aktiver Dozent gefunden. Bitte lege zuerst einen Dozenten an.')}
          searchPlaceholder={tx('Vorname oder Nachname …')}
        />
      </WizardStep>

      {/* ── Schritt 2: Kursdaten eingeben ── */}
      <WizardStep
        label={tx('Kursdaten')}
        description={tx('Titel, Instrument, Zeiten und Kapazität des Kurses eingeben.')}
        needs={['dozent']}
      >
        <div className="space-y-4">
          <Bound form={f} name="titel" />
          <Field form={f} name="instrument">
            <ChoiceGroup {...f.choice('instrument')} />
          </Field>
          <Field form={f} name="niveau">
            <ChoiceGroup {...f.choice('niveau')} allowClear />
          </Field>
          <Field form={f} name="wochentage">
            <ChoiceGroup {...f.choice('wochentage')} />
          </Field>
          <Bound form={f} name="beginn" />
          <Bound form={f} name="ende" />
          <Bound form={f} name="uhrzeit" />
          <Bound form={f} name="maximale_teilnehmer" />
          <Bound form={f} name="preis" />
          <StepNav
            onNext={() => f.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer'])}
            nextStepLabel={tx('Raum wählen')}
          />
        </div>
      </WizardStep>

      {/* ── Schritt 3: Raum wählen ── */}
      <WizardStep
        label={tx('Raum')}
        description={
          maximale_teilnehmer > 0
            ? tx`Nur Räume mit mindestens ${maximale_teilnehmer} Plätzen werden angezeigt.`
            : tx('Raum für diesen Kurs auswählen.')
        }
        needs={['titel', 'beginn', 'maximale_teilnehmer']}
      >
        {(() => {
          // Client-side filter: plaetze >= maximale_teilnehmer
          const filteredItems = maximale_teilnehmer > 0
            ? (raeume.select.items ?? []).filter(item => {
                const rec = raeume.recordOf(item.id);
                if (!rec) return true; // show if not yet loaded
                const plaetze = fieldNumber(rec, 'plaetze');
                return plaetze == null || plaetze >= maximale_teilnehmer;
              })
            : (raeume.select.items ?? []);

          const tooSmallCount = maximale_teilnehmer > 0
            ? (raeume.select.items ?? []).length - filteredItems.length
            : 0;

          return (
            <div className="space-y-3">
              {tooSmallCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <IconInfoCircle size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {tx`${tooSmallCount} Räume haben zu wenige Plätze und werden nicht angezeigt.`}
                  </span>
                </div>
              )}
              {maximale_teilnehmer === 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  <IconInfoCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{tx('Alle Räume werden angezeigt — maximale Teilnehmerzahl noch nicht gesetzt.')}</span>
                </div>
              )}
              <EntitySelectStep
                {...raeume.select}
                items={filteredItems}
                selectedId={f.get('raum') as string}
                onSelect={id => {
                  f.set('raum', id, raeume.labelOf(id));
                  setStep(4);
                }}
                emptyText={
                  maximale_teilnehmer > 0
                    ? tx('Kein Raum ist groß genug für die geplante Teilnehmerzahl.')
                    : tx('Noch kein Raum angelegt.')
                }
                searchPlaceholder={tx('Raumname …')}
              />
            </div>
          );
        })()}
      </WizardStep>

      {/* ── Schritt 4: Überprüfen ── */}
      <WizardStep label={tx('Überprüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            whatHappensNext={tx('Der Kurs wird mit Status „Geplant" angelegt und erscheint sofort in der Kursübersicht.')}
            confirmLabel={tx('Kurs anlegen')}
          />
        )}
      </WizardStep>

      {/* ── Erfolg ── */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          next={[
            {
              label: tx('Weiteren Kurs planen'),
              onClick: () => { submit.reset(); f.reset(); setStep(1); },
            },
            {
              label: tx('Schüler anmelden'),
              href: '#/intents/schueler-anmelden',
            },
            {
              label: tx('Zum Dashboard'),
              href: '#/',
            },
          ]}
          whatHappensNext={tx('Jetzt Schüler anmelden oder direkt zur Kursübersicht wechseln.')}
        />
      )}
    </IntentWizardShell>
  );
}
