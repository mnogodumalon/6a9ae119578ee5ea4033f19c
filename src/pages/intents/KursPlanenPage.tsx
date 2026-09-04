/**
 * Kurs planen — 4-Schritt-Wizard.
 * Steps: 1) Kursdetails → 2) Dozent wählen → 3) Raum wählen → 4) Prüfen & anlegen.
 * Reads: kurse (Raumbelegungscheck), dozenten, raeume.
 * Writes: kurse (createKurseEntry, status: 'geplant').
 * Composes: IntentWizardShell, EntitySelectStep, ChoiceGroup, AvailabilityRangePicker (hint),
 *           StepNav, SummaryStep, SuccessStep.
 */
import { useMemo } from 'react';
import { tx } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { createRecordUrl } from '@/services/livingAppsService';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  occupancyFor,
  fieldText,
  fieldLookup,
  fieldNumber,
  fieldRef,
} from '@/lib/journey';
import { rangeIsFree } from '@/components/blocks/AvailabilityRangePicker';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { Field } from '@/components/blocks/Field';
import { Bound } from '@/components/blocks/Bound';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { IconAlertTriangle } from '@tabler/icons-react';

export default function KursPlanenPage() {
  // kurse wird für den Raum-Belegungscheck gebraucht; dozenten + raeume kommen per useRecordSearch.
  const data = useDashboardData({ omit: ['dozenten', 'raeume', 'teilnehmer', 'anmeldungen', 'anwesenheiten'] });

  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    filter: "r.v_aktiv == True",
    where: r => r.fields.aktiv === true,
    searchFields: ['vorname', 'nachname', 'instrumente'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname')} ${fieldText(d, 'nachname')}`.trim(),
      subtitle: fieldText(d, 'instrumente'),
    }),
  });

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
  });

  const maxTeilnehmer = (kurs.get('maximale_teilnehmer') as number | undefined) ?? 0;
  const beginnIso = kurs.get('beginn') as string | null | undefined;
  const endeIso = kurs.get('ende') as string | null | undefined;
  const selectedRaumId = kurs.get('raum') as string | undefined;
  const selectedDozentId = kurs.get('dozent') as string | undefined;

  const raeume = useRecordSearch(servicePort, 'raeume', {
    filter: maxTeilnehmer > 0 ? `r.v_plaetze >= ${maxTeilnehmer}` : undefined,
    where: r => (fieldNumber(r, 'plaetze') ?? 0) >= maxTeilnehmer,
    searchFields: ['name'],
    toItem: rm => ({
      id: rm.id,
      title: fieldText(rm, 'name'),
      subtitle: tx`${fieldNumber(rm, 'plaetze') ?? 0} Plätze${fieldRef(rm, 'klavier_vorhanden') ? tx(' · Klavier vorhanden') : ''}`,
    }),
  });

  // Belegungscheck: Räume aus Kursen, die den Raum belegen (außer abgeschlossen/abgesagt)
  const raumBelegt = useMemo(() => {
    if (!selectedRaumId || !beginnIso || !endeIso) return false;
    const blocked = occupancyFor('kurse', data.kurse, { resource: selectedRaumId });
    return !rangeIsFree(beginnIso, endeIso, blocked);
  }, [selectedRaumId, beginnIso, endeIso, data.kurse]);

  const wochentageOptionen = LOOKUP_OPTIONS['kurse']?.['wochentage'] ?? [];
  const wochentageAktuell = Array.isArray(kurs.get('wochentage')) ? (kurs.get('wochentage') as string[]) : [];

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'kurs',
      entity: 'kurse',
      form: kurs,
      primary: true,
      values: {
        status: 'geplant',
        dozent: selectedDozentId ? createRecordUrl(APP_IDS.DOZENTEN, selectedDozentId) : undefined,
        raum: selectedRaumId ? createRecordUrl(APP_IDS.RAEUME, selectedRaumId) : undefined,
      },
    },
  ], { draftKey: 'kurs-planen' });

  const restart = () => {
    submit.reset();
    kurs.reset();
  };

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      currentStep={1}
      onStepChange={() => {}}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[kurs]}
      draftKey="kurs-planen"
      intro={{
        description: tx('Einen neuen Musikkurs anlegen und Dozent sowie Raum zuweisen.'),
        needs: [tx('Kurstitel'), tx('Instrument'), tx('Dozent')],
      }}
    >
      {/* Schritt 1: Kursdetails */}
      <WizardStep
        label={tx('Kursdetails')}
        description={tx('Kurstitel, Lernziel, Wochentage, Zeiten und Kapazität festlegen.')}
      >
        <div className="space-y-5">
          <Bound form={kurs} name="titel" />

          <Field form={kurs} name="instrument">
            <ChoiceGroup {...kurs.choice('instrument')} />
          </Field>

          <Field form={kurs} name="niveau">
            <ChoiceGroup {...kurs.choice('niveau')} allowClear />
          </Field>

          {/* Wochentage: multiplelookup/checkbox */}
          <Field form={kurs} name="wochentage">
            <div
              id={kurs.fieldId('wochentage')}
              role="group"
              aria-describedby={kurs.error('wochentage') ? `${kurs.fieldId('wochentage')}-error` : undefined}
              className="flex flex-wrap gap-x-4 gap-y-2"
            >
              {wochentageOptionen.map(opt => (
                <div key={opt.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`${kurs.fieldId('wochentage')}_${opt.key}`}
                    checked={wochentageAktuell.includes(opt.key)}
                    onCheckedChange={checked => {
                      const next = checked
                        ? [...wochentageAktuell, opt.key]
                        : wochentageAktuell.filter(k => k !== opt.key);
                      kurs.set('wochentage', next.length ? next : undefined);
                    }}
                  />
                  <Label
                    htmlFor={`${kurs.fieldId('wochentage')}_${opt.key}`}
                    className="font-normal cursor-pointer"
                  >
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </Field>

          <Bound form={kurs} name="beginn" />
          <Bound form={kurs} name="ende" />
          <Bound form={kurs} name="uhrzeit" />
          <Bound form={kurs} name="maximale_teilnehmer" />
          <Bound form={kurs} name="preis" />

          <StepNav
            onNext={() => kurs.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer'])}
            nextStepLabel={tx('Dozent wählen')}
            hideBack
          />
        </div>
      </WizardStep>

      {/* Schritt 2: Dozent wählen */}
      <WizardStep
        label={tx('Dozent')}
        description={tx('Einen aktiven Dozenten für diesen Kurs auswählen.')}
      >
        {kurs.get('titel') ? (
          <>
            <EntitySelectStep
              {...dozenten.select}
              selectedId={selectedDozentId}
              onSelect={id => {
                kurs.set('dozent', id, dozenten.labelOf(id));
              }}
              emptyText={tx('Keine aktiven Dozenten gefunden.')}
              create={false}
            />
            <StepNav
              onNext={() => kurs.validate(['dozent'])}
              nextStepLabel={tx('Raum wählen')}
            />
          </>
        ) : (
          <StepNav onBack={() => {}} nextDisabled>
            {tx('Bitte zuerst die Kursdetails in Schritt 1 ausfüllen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Raum wählen */}
      <WizardStep
        label={tx('Raum')}
        description={tx('Einen Raum mit ausreichend Plätzen zuweisen (empfohlen).')}
      >
        {kurs.get('titel') ? (
          <div className="space-y-3">
            <EntitySelectStep
              {...raeume.select}
              selectedId={selectedRaumId}
              onSelect={id => {
                kurs.set('raum', id, raeume.labelOf(id));
              }}
              emptyText={tx('Kein Raum hat genug Plätze für die gewählte Kapazität.')}
              create={false}
            />

            {raumBelegt && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <IconAlertTriangle className="mt-0.5 shrink-0" size={16} stroke={1.5} />
                <span>
                  {tx('Dieser Raum ist im gewählten Zeitraum bereits für einen anderen Kurs belegt. Bitte prüfen.')}
                </span>
              </div>
            )}

            <StepNav
              onNext={() => true}
              nextStepLabel={tx('Prüfen & anlegen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => {}} nextDisabled>
            {tx('Bitte zuerst die Kursdetails in Schritt 1 ausfüllen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[kurs]}
            submit={submit}
            whatHappensNext={tx('Der Kurs wird mit Status „Geplant" angelegt und ist sofort in der Kursübersicht sichtbar.')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[kurs]}
          next={[
            { label: tx('Weiteren Kurs planen'), onClick: restart },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Schüler können sich jetzt für diesen Kurs anmelden.')}
        />
      )}
    </IntentWizardShell>
  );
}
