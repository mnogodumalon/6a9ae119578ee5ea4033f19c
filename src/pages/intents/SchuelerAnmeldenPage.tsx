/**
 * Schüler anmelden — 3-Schritt-Wizard (+ Erfolgsschritt).
 * Steps: 1) Schüler wählen (oder neu anlegen) → 2) Kurs wählen (nur geplante/laufende mit freien Plätzen)
 *        → 3) Bestätigen & anlegen.
 * Reads: teilnehmer, kurse, anmeldungen (Auslastung via useRecordCount).
 * Writes: anmeldungen (createAnmeldungenEntry) — Status 'neu' oder 'warteliste' je nach Auslastung.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, BudgetTracker, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useRecordCount,
  fieldText,
  fieldLookup,
  fieldDate,
  fieldNumber,
  combineFilters,
  refFilter,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function SchuelerAnmeldenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1 — Schüler suchen (offene Liste, keine Einschränkung)
  const schueler = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim() || tx('Ohne Name'),
      subtitle: fieldText(t, 'email') || fieldText(t, 'telefon') || undefined,
    }),
  });

  // Schritt 2 — Kurs suchen (nur geplante / laufende)
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const key = fieldLookup(r, 'status')?.key;
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel') || tx('Kurs ohne Titel'),
      subtitle: [
        fieldLookup(k, 'instrument')?.label,
        fieldLookup(k, 'niveau')?.label,
      ].filter(Boolean).join(' · ') || undefined,
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  // Formular — ein Record: Anmeldung
  const anmeldung = useStepForm('anmeldungen', {
    steps: {
      teilnehmer: 1,
      kurs: 2,
      anmeldedatum: 3,
      status: 3,
      bezahlt: 3,
    },
    initial: {
      anmeldedatum: todayIso(),
      bezahlt: false,
    },
  });

  const gewaehlterKursId = anmeldung.get('kurs') as string | undefined;
  const gewaehlterKurs = gewaehlterKursId ? kurse.recordOf(gewaehlterKursId) : null;
  const maxTeilnehmer = gewaehlterKurs ? (fieldNumber(gewaehlterKurs, 'maximale_teilnehmer') ?? 0) : 0;

  // Aktive Anmeldungen für den gewählten Kurs zählen
  const aktiveAnmeldungen = useRecordCount(servicePort, 'anmeldungen', {
    filter: gewaehlterKursId
      ? combineFilters(
          refFilter('kurs', gewaehlterKursId),
          "r.v_status in ['neu', 'bestaetigt', 'warteliste']"
        )
      : undefined,
    where: a => {
      const key = fieldLookup(a, 'status')?.key;
      return key === 'neu' || key === 'bestaetigt' || key === 'warteliste';
    },
    enabled: Boolean(gewaehlterKursId),
  });

  const istVoll =
    maxTeilnehmer > 0 &&
    aktiveAnmeldungen.count !== null &&
    aktiveAnmeldungen.count >= maxTeilnehmer;

  const anmeldungsStatus = istVoll ? 'warteliste' : 'neu';

  // Plan: eine Anmeldung anlegen
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: anmeldung,
        primary: true,
        values: {
          status: anmeldungsStatus,
          bezahlt: false,
        },
      },
    ],
    { draftKey: 'schueler-anmelden' }
  );

  const heute = format(new Date(), 'yyyy-MM-dd');

  return (
    <IntentWizardShell
      title={tx('Schüler anmelden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen Kurs anmelden — direkt oder auf die Warteliste.'),
        needs: [tx('Name des Schülers'), tx('Gewünschter Kurs')],
      }}
    >
      {/* Schritt 1: Schüler wählen */}
      <WizardStep
        label={tx('Schüler')}
        description={tx('Schüler suchen oder neu anlegen.')}
      >
        <EntitySelectStep
          {...schueler.select}
          selectedId={anmeldung.get('teilnehmer') as string}
          onSelect={id => {
            anmeldung.set('teilnehmer', id, schueler.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Vorname, Nachname oder E-Mail …')}
          create={{
            fields: ['vorname', 'nachname', 'geburtsdatum', 'email', 'telefon', 'erziehungsberechtigte_person'],
            title: tx('Neuen Schüler anlegen'),
          }}
        />
      </WizardStep>

      {/* Schritt 2: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Nur geplante und laufende Kurse werden angezeigt.')}
      >
        {anmeldung.get('teilnehmer') ? (
          <>
            <EntitySelectStep
              {...kurse.select}
              selectedId={anmeldung.get('kurs') as string}
              onSelect={id => {
                const rec = kurse.recordOf(id);
                const max = rec ? (fieldNumber(rec, 'maximale_teilnehmer') ?? 0) : 0;
                anmeldung.set('kurs', id, kurse.labelOf(id));
                // Auslastung wird via useRecordCount ermittelt — Status im Plan gesetzt
                void max; // max wird via useRecordCount + istVoll genutzt
              }}
              searchPlaceholder={tx('Kurstitel …')}
              emptyText={tx('Keine geplanten oder laufenden Kurse gefunden.')}
              create={false}
            />
            {gewaehlterKursId && maxTeilnehmer > 0 && (
              <div className="mt-4">
                <BudgetTracker
                  format="count"
                  unit={tx('Plätze')}
                  budget={maxTeilnehmer}
                  booked={aktiveAnmeldungen.count ?? 0}
                  label={tx('Kursauslastung')}
                />
                {istVoll && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <IconAlertTriangle size={16} className="shrink-0" />
                    <span>{tx('Dieser Kurs ist voll — die Anmeldung kommt auf die Warteliste.')}</span>
                  </div>
                )}
                {!istVoll && aktiveAnmeldungen.count !== null && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <IconCircleCheck size={16} className="shrink-0" />
                    <span>{tx('Platz verfügbar — Anmeldung wird direkt bestätigt.')}</span>
                  </div>
                )}
              </div>
            )}
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => anmeldung.validate(['kurs'])}
              nextStepLabel={tx('Prüfen')}
            />
          </>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            <span className="text-sm text-muted-foreground">
              {tx('Bitte zuerst einen Schüler wählen.')}
            </span>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Bestätigung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[anmeldung]}
            submit={submit}
            whatHappensNext={
              istVoll
                ? tx('Die Anmeldung wird auf der Warteliste gespeichert. Sobald ein Platz frei wird, kann sie manuell bestätigt werden.')
                : tx('Die Anmeldung wird sofort angelegt und erscheint in der Kursliste des Schülers.')
            }
            items={[
              {
                key: 'anmeldedatum',
                label: tx('Anmeldedatum'),
                value: heute,
              },
              {
                key: 'status_info',
                label: tx('Status'),
                value: istVoll ? tx('Warteliste') : tx('Neu'),
              },
            ]}
            confirmLabel={istVoll ? tx('Auf Warteliste setzen') : tx('Anmeldung bestätigen')}
          />
        )}
      </WizardStep>

      {/* Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldung]}
          title={
            istVoll
              ? tx('Auf Warteliste gesetzt')
              : tx('Anmeldung erfolgreich')
          }
          whatHappensNext={
            istVoll
              ? tx('Die Anmeldung steht auf der Warteliste. Bei Freigabe eines Platzes den Status manuell auf „Bestätigt" setzen.')
              : tx('Der Schüler ist für den Kurs angemeldet. Zur Anwesenheitserfassung den Flow „Anwesenheit erfassen" nutzen.')
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
