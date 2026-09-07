/**
 * Schüler anmelden — 3-Schritt-Wizard.
 * Steps: 1) Schüler wählen (oder neu anlegen) → 2) Kurs wählen (nur geplant/läuft, mit freien Plätzen) → 3) Überprüfen & anmelden.
 * Reads: teilnehmer, kurse, anmeldungen (für Kapazitätsprüfung).
 * Writes: anmeldungen (createAnmeldungenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, BudgetTracker, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, fieldNumber, fieldDate, todayIso, refFilter } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { IconAlertTriangle } from '@tabler/icons-react';
import { APP_IDS } from '@/types/app';

export default function SchuelerAnmeldenPage() {
  const [step, setStep] = useState(1);

  // Schüler-Suche — alle Teilnehmer qualifizieren (Büro prüft Duplikate)
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname') ?? ''} ${fieldText(t, 'nachname') ?? ''}`.trim(),
      subtitle: fieldText(t, 'email') ?? undefined,
    }),
  });

  // Kurs-Suche — nur geplant oder läuft
  const kurse = useRecordSearch(servicePort, 'kurse', {
    searchFields: ['titel'],
    filter: 'r.v_status == "geplant" OR r.v_status == "laeuft"',
    where: r => {
      const key = fieldLookup(r, 'status')?.key;
      return key === 'geplant' || key === 'laeuft';
    },
    toItem: t => ({
      id: t.id,
      title: fieldText(t, 'titel') ?? tx('Unbenannter Kurs'),
      subtitle: [
        fieldLookup(t, 'instrument')?.label,
        fieldLookup(t, 'niveau')?.label,
      ].filter(Boolean).join(' · ') || undefined,
    }),
  });

  // Anmeldungs-Formular — kurs und teilnehmer sind Picks, werden per f.set gesetzt
  // anmeldedatum und status werden per values in den Plan gegeben
  const anmeldung = useStepForm('anmeldungen', {
    steps: { teilnehmer: 1, kurs: 2 },
    required: { anmeldedatum: false, status: false, bezahlt: false },
  });

  // Kapazitätsprüfung: aktive Anmeldungen für den gewählten Kurs zählen
  const selectedKursId = anmeldung.get('kurs') as string | undefined;
  const anmeldungenFuerKurs = useRecordSearch(servicePort, 'anmeldungen', {
    searchFields: [],
    filter: selectedKursId ? refFilter('kurs', selectedKursId) : tx('r.id == "none"'),
    where: r => {
      if (!selectedKursId) return false;
      const ref = r.fields['kurs'];
      if (!ref || typeof ref !== 'string') return false;
      return ref.includes(selectedKursId);
    },
  });

  // Aktive Anmeldungen: status IN [neu, bestaetigt, warteliste]
  const aktivCount = anmeldungenFuerKurs.select.items.filter(a => {
    const record = anmeldungenFuerKurs.recordOf(a.id);
    if (!record) return false;
    const key = fieldLookup(record, 'status')?.key;
    return key === 'neu' || key === 'bestaetigt' || key === 'warteliste';
  }).length;

  // Gewählter Kurs: maximale_teilnehmer aus useRecordSearch
  const selectedKursRecord = selectedKursId ? kurse.recordOf(selectedKursId) : undefined;
  const maxTeilnehmer = selectedKursRecord ? (fieldNumber(selectedKursRecord, 'maximale_teilnehmer') ?? 0) : 0;
  const istVoll = maxTeilnehmer > 0 && aktivCount >= maxTeilnehmer;
  const anmeldungStatus = istVoll ? 'warteliste' : 'neu';

  const submit = useJourneySubmit(servicePort, [
    {
      key: 'anmeldung',
      entity: 'anmeldungen',
      form: anmeldung,
      primary: true,
      values: {
        anmeldedatum: todayIso(),
        status: anmeldungStatus,
        bezahlt: false,
      },
    },
  ], { draftKey: 'schueler-anmelden' });

  const kursTitle = selectedKursId ? kurse.labelOf(selectedKursId) : '';
  const beginnDatum = selectedKursRecord ? fieldDate(selectedKursRecord, 'beginn') : undefined;
  const uhrzeitRaw = selectedKursRecord ? fieldDate(selectedKursRecord, 'uhrzeit') : undefined;

  return (
    <IntentWizardShell
      title={tx('Schüler anmelden')}
      currentStep={step}
      onStepChange={setStep}
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler zu einem laufenden oder geplanten Kurs anmelden.'),
        needs: [tx('Name des Schülers'), tx('Kursname')],
      }}
    >
      {/* Schritt 1: Schüler wählen oder neu anlegen */}
      <WizardStep
        label={tx('Schüler')}
        description={tx('Schüler suchen oder neu anlegen — das Büro prüft Duplikate vorab.')}
      >
        <EntitySelectStep
          {...teilnehmer.select}
          selectedId={anmeldung.get('teilnehmer') as string}
          onSelect={id => {
            anmeldung.set('teilnehmer', id, teilnehmer.labelOf(id));
            setStep(2);
          }}
          searchPlaceholder={tx('Vorname, Nachname oder E-Mail …')}
          create={{ fields: ['vorname', 'nachname', 'email', 'telefon'], title: tx('Neuen Schüler anlegen') }}
          createLabel={tx('Schüler neu anlegen')}
        />
      </WizardStep>

      {/* Schritt 2: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Nur geplante oder laufende Kurse werden angezeigt.')}
        needs={['teilnehmer']}
      >
        <div className="space-y-4">
          <EntitySelectStep
            {...kurse.select}
            selectedId={anmeldung.get('kurs') as string}
            onSelect={id => {
              anmeldung.set('kurs', id, kurse.labelOf(id));
            }}
            searchPlaceholder={tx('Kursname …')}
            create={false}
            emptyText={tx('Keine geplanten oder laufenden Kurse gefunden.')}
          />

          {/* Kapazitätsanzeige für den gewählten Kurs */}
          {selectedKursId && maxTeilnehmer > 0 && (
            <div className="space-y-2">
              <BudgetTracker
                format="count"
                unit={tx('Plätze')}
                budget={maxTeilnehmer}
                booked={aktivCount}
                label={kursTitle ? tx('Kursauslastung') : tx('Auslastung')}
              />
              {istVoll && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <IconAlertTriangle size={16} className="shrink-0" />
                  <span>{tx('Kurs ist voll — Schüler wird auf die Warteliste gesetzt.')}</span>
                </div>
              )}
            </div>
          )}

          {/* Kursinfos (Beginn, Uhrzeit) */}
          {selectedKursRecord && (
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              {beginnDatum && (
                <span>{tx('Beginn')}: <strong>{format(new Date(beginnDatum), 'dd.MM.yyyy')}</strong></span>
              )}
              {uhrzeitRaw && (
                <span>{tx('Uhrzeit')}: <strong>{uhrzeitRaw.slice(11, 16)}</strong></span>
              )}
              {(() => {
                const wochentage = selectedKursRecord.fields['wochentage'];
                if (!Array.isArray(wochentage) || wochentage.length === 0) return null;
                const labels = wochentage
                  .map((v: unknown) => (typeof v === 'object' && v !== null && 'label' in v ? (v as { label: string }).label : null))
                  .filter(Boolean)
                  .join(', ');
                return labels ? <span>{labels}</span> : null;
              })()}
              {anmeldungStatus === 'warteliste' && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  {tx('Warteliste')}
                </Badge>
              )}
            </div>
          )}

          <StepNav
            onNext={() => anmeldung.validate(['kurs'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Überprüfen & Anmelden */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[anmeldung]}
            submit={submit}
            items={[
              {
                key: 'anmeldedatum',
                label: tx('Anmeldedatum'),
                value: format(new Date(), 'dd.MM.yyyy'),
                keys: ['anmeldedatum'],
                fieldId: 'anmeldedatum',
              },
              {
                key: 'status',
                label: tx('Status'),
                value: anmeldungStatus === 'warteliste' ? tx('Warteliste') : tx('Neu'),
                keys: ['status'],
                fieldId: 'status',
              },
            ]}
            whatHappensNext={
              anmeldungStatus === 'warteliste'
                ? tx('Der Schüler wird auf die Warteliste gesetzt und benachrichtigt, sobald ein Platz frei wird.')
                : tx('Die Anmeldung ist sofort aktiv — der Schüler kann am Kurs teilnehmen.')
            }
            confirmLabel={tx('Jetzt anmelden')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldung]}
          submit={submit}
          whatHappensNext={
            anmeldungStatus === 'warteliste'
              ? tx('Der Schüler steht auf der Warteliste. Sobald ein Platz frei wird, kann die Anmeldung bestätigt werden.')
              : tx('Die Anmeldung ist abgeschlossen. Unter "Anwesenheit erfassen" kannst du Teilnahmen eintragen.')
          }
          next={[
            { label: tx('Weiteren Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Anwesenheit erfassen'), href: '#/intents/anwesenheit-erfassen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          restartLabel={tx('Weiteren Schüler anmelden')}
        />
      )}
    </IntentWizardShell>
  );
}
