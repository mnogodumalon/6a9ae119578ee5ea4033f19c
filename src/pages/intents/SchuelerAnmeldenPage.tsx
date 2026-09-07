/**
 * Schüler anmelden — 3-Schritt-Wizard.
 * Steps: 1) Kurs wählen (nur geplant/läuft, Auslastung prüfen) →
 *        2) Schüler wählen oder neu anlegen →
 *        3) Zusammenfassung & anlegen.
 * Reads: kurse, teilnehmer, anmeldungen (count). Writes: anmeldungen (createAnmeldungenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep, BudgetTracker.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconUsers } from '@tabler/icons-react';
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
  useRecordCount,
  fieldText,
  fieldLookup,
  fieldNumber,
  combineFilters,
  refFilter,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function SchuelerAnmeldenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1: Kurs suchen — nur geplant oder läuft
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const key = fieldLookup(r, 'status')?.key;
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'titel') ?? tx('Kurs'),
      subtitle: [
        fieldLookup(r, 'instrument')?.label,
        fieldLookup(r, 'niveau')?.label,
      ].filter(Boolean).join(' · '),
      status: fieldLookup(r, 'status') ?? undefined,
    }),
  });

  // Schritt 2: Teilnehmer suchen — alle Records
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: t => ({
      id: t.id,
      title: [fieldText(t, 'vorname'), fieldText(t, 'nachname')].filter(Boolean).join(' ').trim() || tx('Unbekannt'),
      subtitle: fieldText(t, 'email') ?? undefined,
    }),
  });

  // Formular für die Anmeldung
  const anmeldung = useStepForm('anmeldungen', {
    steps: {
      kurs: 1,
      teilnehmer: 2,
      anmeldedatum: 3,
      status: 3,
    },
    initial: {
      anmeldedatum: todayIso(),
    },
    required: {
      // anmeldedatum und status werden aus dem Plan gesetzt, nicht befragt
      anmeldedatum: false,
      status: false,
    },
  });

  const selectedKursId = anmeldung.get('kurs') as string | undefined;
  const selectedKursRecord = selectedKursId ? kurse.recordOf(selectedKursId) : null;
  const maxTeilnehmer = selectedKursRecord ? (fieldNumber(selectedKursRecord, 'maximale_teilnehmer') ?? 0) : 0;

  // Belegungszahl für den gewählten Kurs (ohne abgemeldete)
  const belegung = useRecordCount(servicePort, 'anmeldungen', {
    filter: selectedKursId
      ? combineFilters(refFilter('kurs', selectedKursId), tx('r.v_status != \'abgemeldet\''))
      : undefined,
    where: a => {
      if (!selectedKursId) return false;
      const statusKey = fieldLookup(a, 'status')?.key;
      return statusKey !== 'abgemeldet';
    },
    enabled: Boolean(selectedKursId),
  });

  const istVoll = maxTeilnehmer > 0 && (belegung.count ?? 0) >= maxTeilnehmer;

  // Plan: eine Anmeldung anlegen
  const submit = useJourneySubmit(servicePort, [
    {
      key: 'anmeldung',
      entity: 'anmeldungen',
      form: anmeldung,
      primary: true,
      values: {
        anmeldedatum: format(new Date(), 'yyyy-MM-dd'),
        status: istVoll ? 'warteliste' : 'neu',
        bezahlt: false,
      },
    },
  ], { draftKey: 'schueler-anmelden' });

  const kursName = selectedKursId ? kurse.labelOf(selectedKursId) : '';
  const teilnehmerName = anmeldung.get('teilnehmer')
    ? teilnehmer.labelOf(anmeldung.get('teilnehmer') as string)
    : '';

  return (
    <IntentWizardShell
      title={tx('Schüler anmelden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen Kurs anmelden — auch für die Warteliste.'),
        needs: [tx('Kursauswahl'), tx('Name des Schülers')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Nur laufende und geplante Kurse stehen zur Auswahl.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={selectedKursId}
          onSelect={id => {
            anmeldung.set('kurs', id, kurse.labelOf(id));
            setStep(2);
          }}
          emptyText={tx('Keine aktiven Kurse gefunden. Erst einen Kurs planen.')}
          searchPlaceholder={tx('Kurstitel suchen …')}
          create={false}
        />
        {selectedKursId && maxTeilnehmer > 0 && (
          <div className="mt-4">
            <BudgetTracker
              format="count"
              unit={tx('Plätze')}
              budget={maxTeilnehmer}
              booked={belegung.count ?? 0}
              label={tx('Kursauslastung')}
            />
          </div>
        )}
        <StepNav
          onNext={() => anmeldung.validate(['kurs'])}
          nextStepLabel={tx('Schüler')}
          hideBack
        />
      </WizardStep>

      {/* Schritt 2: Schüler wählen oder anlegen */}
      <WizardStep
        label={tx('Schüler')}
        description={tx('Einen vorhandenen Schüler suchen oder neu anlegen.')}
      >
        {anmeldung.get('kurs') ? (
          <>
            {istVoll && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <span className="font-semibold">{tx('Kurs ist voll')} —</span>{' '}
                {tx('Die Anmeldung landet auf der Warteliste.')}
              </div>
            )}
            <EntitySelectStep
              {...teilnehmer.select}
              selectedId={anmeldung.get('teilnehmer') as string | undefined}
              onSelect={id => {
                anmeldung.set('teilnehmer', id, teilnehmer.labelOf(id));
                setStep(3);
              }}
              searchPlaceholder={tx('Vorname, Nachname oder E-Mail …')}
              create={{
                fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
                title: tx('Neuen Schüler anlegen'),
              }}
            />
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => anmeldung.validate(['teilnehmer'])}
              nextStepLabel={tx('Prüfen')}
            />
          </>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht zuerst einen Kurs aus Schritt 1.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {anmeldung.get('kurs') && anmeldung.get('teilnehmer') ? (
          <>
            {istVoll && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <IconUsers size={16} className="inline shrink-0 mr-1" />
                {tx('Der Kurs ist voll — die Anmeldung wird auf der Warteliste gespeichert.')}
              </div>
            )}
            {!submit.done && (
              <SummaryStep
                forms={[anmeldung]}
                submit={submit}
                items={[
                  {
                    key: 'status-hinweis',
                    keys: ['status-hinweis'],
                    label: tx('Anmeldestatus'),
                    value: istVoll ? tx('Warteliste') : tx('Neu'),
                  },
                  {
                    key: 'anmeldedatum',
                    keys: ['anmeldedatum'],
                    label: tx('Anmeldedatum'),
                    value: format(new Date(), 'yyyy-MM-dd'),
                  },
                ]}
                whatHappensNext={
                  istVoll
                    ? tx('Die Anmeldung wird auf der Warteliste gespeichert und kann später bestätigt werden.')
                    : tx('Die Anmeldung erscheint sofort in der Kursliste des Schülers.')
                }
                confirmLabel={tx('Anmeldung speichern')}
              />
            )}
          </>
        ) : (
          <StepNav onBack={() => setStep(anmeldung.get('kurs') ? 2 : 1)} nextDisabled>
            {tx('Dieser Schritt braucht Kurs und Schüler aus den vorherigen Schritten.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldung]}
          title={
            istVoll
              ? tx('Auf der Warteliste')
              : tx('Anmeldung gespeichert')
          }
          whatHappensNext={
            istVoll
              ? tx(tx`${teilnehmerName} steht auf der Warteliste für ${kursName}. Bei einem freien Platz kann die Anmeldung bestätigt werden.`)
              : tx(tx`${teilnehmerName} ist jetzt für ${kursName} angemeldet.`)
          }
          next={[
            {
              label: tx('Weitere Anmeldung'),
              onClick: () => {
                submit.reset();
                anmeldung.reset();
                setStep(1);
              },
            },
            {
              label: tx('Anwesenheit erfassen'),
              href: '#/intents/anwesenheit-erfassen',
            },
            {
              label: tx('Zum Dashboard'),
              href: '#/',
            },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
