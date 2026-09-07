/**
 * Kurs planen — 5-Schritt-Wizard.
 * Steps: 1) Kursdetails → 2) Dozent wählen → 3) Raum wählen → 4) Prüfen & anlegen → 5) Erfolg.
 * Reads: kurse (occupancy), dozenten, raeume. Writes: kurse (createKurseEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, ChoiceGroup, Bound, StepNav,
 *           SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Bound } from '@/components/blocks/Bound';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useOccupancy,
  fieldText,
  fieldNumber,
  todayIso,
  optionsOf,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { IconMusic, IconUser, IconAlertTriangle } from '@tabler/icons-react';

const DRAFT_KEY = 'kurs-planen';

export default function KursPlanenPage() {
  const [step, setStep] = useState(1);

  // Step 1: Kursdetails
  const kurs = useStepForm('kurse', {
    steps: {
      titel: 1,
      instrument: 1,
      niveau: 1,
      wochentage: 1,
      uhrzeit: 1,
      beginn: 1,
      ende: 1,
      maximale_teilnehmer: 1,
      preis: 1,
      status: 1,
      dozent: 2,
      raum: 3,
    },
    initial: {
      status: optionsOf('kurse', 'status')[0]?.key ?? 'geplant',
    },
    required: { raum: false },
  });

  // Aus Step 1 abgeleitete Werte für Folgeschritte
  const maxTeilnehmer = (kurs.get('maximale_teilnehmer') as number | null) ?? 0;
  const beginnIso = kurs.get('beginn') as string | null;
  const endeIso = kurs.get('ende') as string | null;

  // Step 2: Dozenten-Suche
  const dozenten = useRecordSearch(servicePort, 'dozenten', {
    filter: "r.v_aktiv == True",
    where: r => {
      const aktiv = r.fields['aktiv'];
      return aktiv === true || aktiv === null || aktiv === undefined;
    },
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: d => ({
      id: d.id,
      title: `${fieldText(d, 'vorname')} ${fieldText(d, 'nachname')}`.trim(),
      subtitle: fieldText(d, 'email') || fieldText(d, 'instrumente') || undefined,
    }),
    orderby: ['r.v_nachname asc'],
  });

  // Step 3: Raum-Suche (nur Räume mit plaetze >= maximale_teilnehmer)
  const raeume = useRecordSearch(servicePort, 'raeume', {
    searchFields: ['name'],
    where: r => (fieldNumber(r, 'plaetze') ?? 0) >= (maxTeilnehmer > 0 ? maxTeilnehmer : 0),
    toItem: r => {
      const plaetze = fieldNumber(r, 'plaetze') ?? 0;
      const klavierVorhanden = r.fields['klavier_vorhanden'] === true;
      return {
        id: r.id,
        title: fieldText(r, 'name'),
        subtitle: klavierVorhanden ? tx('Klavier vorhanden') : undefined,
        stats: [{ label: tx('Plätze'), value: plaetze }],
      };
    },
    orderby: ['r.v_plaetze asc'],
  });

  // Belegungshinweis für Räume (kein harter Block — nur Hinweis)
  const belegung = useOccupancy(servicePort, 'kurse', {
    resource: kurs.get('raum') as string | null,
  });

  // Plan: nur kurse anlegen (alle Felder inkl. dozent und raum sind im Form)
  const submit = useJourneySubmit(servicePort, [
    { key: 'kurs', entity: 'kurse', form: kurs, primary: true },
  ], { draftKey: DRAFT_KEY });

  // Belegungshinweis für den gewählten Raum
  const gewahlterRaumId = kurs.get('raum') as string | null;
  const raumBelegt =
    gewahlterRaumId && beginnIso && endeIso
      ? !belegung.isFree(beginnIso, endeIso, gewahlterRaumId)
      : false;

  return (
    <IntentWizardShell
      title={tx('Kurs planen')}
      subtitle={tx('Neuen Kurs anlegen — Titel, Dozent und Raum in einem Schritt')}
      currentStep={step}
      onStepChange={setStep}
      forms={[kurs]}
      draftKey={DRAFT_KEY}
      intro={{
        description: tx('Legt einen neuen Kurs mit allen nötigen Infos, dem Dozenten und dem Raum an.'),
        needs: [tx('Kurstitel und Instrument'), tx('Beginn und max. Teilnehmerzahl'), tx('Dozent und Raum')],
      }}
    >
      {/* ── Step 1: Kursdetails ─────────────────────────────────────── */}
      <WizardStep
        label={tx('Kursdetails')}
        description={tx('Titel, Instrument, Niveau und Zeiten des Kurses festlegen.')}
      >
        <div className="space-y-5">
          <Bound form={kurs} name="titel" placeholder={tx('z. B. Gitarre für Anfänger')} />

          <Bound form={kurs} name="instrument" />

          <Bound form={kurs} name="niveau" allowClear />

          <Bound form={kurs} name="wochentage" />

          <Bound form={kurs} name="uhrzeit" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Bound form={kurs} name="beginn" />
            <Bound form={kurs} name="ende" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Bound form={kurs} name="maximale_teilnehmer" hint={tx('Maximale Anzahl Teilnehmer')} />
            <Bound form={kurs} name="preis" hint={tx('Kursgebühr in Euro (optional)')} />
          </div>

          <Bound form={kurs} name="status" />

          <StepNav
            hideBack
            onNext={() => kurs.validate(['titel', 'instrument', 'beginn', 'maximale_teilnehmer', 'status'])}
            nextStepLabel={tx('Dozent')}
          />
        </div>
      </WizardStep>

      {/* ── Step 2: Dozent wählen ───────────────────────────────────── */}
      <WizardStep
        label={tx('Dozent')}
        description={tx('Einen aktiven Dozenten für diesen Kurs auswählen.')}
      >
        <EntitySelectStep
          {...dozenten.select}
          selectedId={kurs.get('dozent') as string | null}
          onSelect={id => {
            kurs.set('dozent', id, dozenten.labelOf(id));
            setStep(3);
          }}
          avatar="initials"
          emptyText={tx('Keine aktiven Dozenten gefunden. Bitte zuerst Dozenten anlegen.')}
          create={{ fields: ['vorname', 'nachname', 'email', 'instrumente'] }}
          searchPlaceholder={tx('Dozent suchen …')}
        />
        <div className="mt-4">
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => kurs.validate(['dozent'])}
            nextStepLabel={tx('Raum')}
          />
        </div>
      </WizardStep>

      {/* ── Step 3: Raum wählen ─────────────────────────────────────── */}
      <WizardStep
        label={tx('Raum')}
        description={tx('Einen Raum mit ausreichend Plätzen wählen — Belegungshinweis wird angezeigt.')}
      >
        {/* Belegungshinweis für gewählten Raum */}
        {raumBelegt && (
          <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <IconAlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{tx('Hinweis: Der gewählte Raum ist im Kurszeitraum bereits belegt. Du kannst trotzdem fortfahren.')}</span>
          </div>
        )}

        <EntitySelectStep
          {...raeume.select}
          selectedId={kurs.get('raum') as string | null}
          onSelect={id => {
            const rec = raeume.recordOf(id);
            const istBelegt = (beginnIso && endeIso)
              ? !belegung.isFree(beginnIso, endeIso, id)
              : false;
            kurs.set('raum', id, raeume.labelOf(id));
            // Hinweis wird automatisch über raumBelegt angezeigt — kein harter Block
            void istBelegt;
            setStep(4);
          }}
          avatar="none"
          emptyText={
            maxTeilnehmer > 0
              ? tx('Kein Raum hat genug Plätze für die angegebene Teilnehmerzahl.')
              : tx('Bitte zuerst die maximale Teilnehmerzahl in Schritt 1 angeben.')
          }
          create={{ fields: ['name', 'plaetze', 'klavier_vorhanden'], title: tx('Neuen Raum anlegen') }}
          searchPlaceholder={tx('Raum suchen …')}
          columns={2}
        />

        <div className="mt-4">
          <StepNav
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* ── Step 4: Zusammenfassung ─────────────────────────────────── */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[kurs]}
            submit={submit}
            whatHappensNext={tx('Der Kurs wird sofort angelegt und ist danach buchbar. Schüler können anschließend angemeldet werden.')}
            confirmLabel={tx('Kurs anlegen')}
          />
        )}
      </WizardStep>

      {/* ── Erfolgsschritt ──────────────────────────────────────────── */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[kurs]}
          submit={submit}
          restartLabel={tx('Weiteren Kurs anlegen')}
          next={[
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden', icon: <IconUser size={16} /> },
            { label: tx('Anwesenheit erfassen'), href: '#/intents/anwesenheit-erfassen', icon: <IconMusic size={16} /> },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Im nächsten Schritt können Schüler zum Kurs angemeldet werden.')}
        />
      )}
    </IntentWizardShell>
  );
}
