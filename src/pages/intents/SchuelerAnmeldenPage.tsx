/**
 * Schüler anmelden — 3-Schritt-Wizard.
 * Steps: 1) Kurs wählen (nur geplant/läuft, zeigt freie Plätze) →
 *        2) Teilnehmer wählen oder neu anlegen (Duplikat-Warnung) →
 *        3) Anmeldedaten + Bestätigung (Warteliste wenn Kurs voll).
 * Reads: kurse, teilnehmer, anmeldungen (count). Writes: anmeldungen.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, BudgetTracker,
 *           StatusBadge, StepNav, SummaryStep, SuccessStep, Bound.
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { Bound } from '@/components/blocks/Bound';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  useRecordCount,
  fieldText,
  fieldLookup,
  fieldNumber,
  fieldRef,
  combineFilters,
  refFilter,
  todayIso,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { IconAlertCircle } from '@tabler/icons-react';

export default function SchuelerAnmeldenPage() {
  const [step, setStep] = useState(1);

  // ── Step 1: Kurs wählen (nur geplant oder läuft) ──────────────────────────
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const k = fieldLookup(r, 'status')?.key;
      return k === 'geplant' || k === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'titel'),
      subtitle: fieldLookup(r, 'instrument')?.label ?? undefined,
      status: fieldLookup(r, 'status') ?? undefined,
    }),
    orderby: ['r.v_titel asc'],
  });

  // ── Step 2: Teilnehmer wählen ──────────────────────────────────────────────
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname', 'email'],
    toItem: r => ({
      id: r.id,
      title: `${fieldText(r, 'vorname')} ${fieldText(r, 'nachname')}`.trim(),
      subtitle: fieldText(r, 'email') || undefined,
    }),
    orderby: ['r.v_nachname asc', 'r.v_vorname asc'],
  });

  // ── Forms ──────────────────────────────────────────────────────────────────
  const anmeldung = useStepForm('anmeldungen', {
    steps: {
      kurs: 1,
      teilnehmer: 2,
      anmeldedatum: 3,
      status: 3,
      bezahlt: 3,
      bemerkung: 3,
    },
    initial: {
      anmeldedatum: todayIso(),
      status: 'neu',
      bezahlt: false,
    },
    required: { bezahlt: false, bemerkung: false },
  });

  const selectedKursId = anmeldung.get('kurs') as string | null;
  const selectedTeilnehmerId = anmeldung.get('teilnehmer') as string | null;

  // ── Anmeldungen-Zähler für den gewählten Kurs (ohne abgemeldete) ───────────
  const anmeldungenCount = useRecordCount(servicePort, 'anmeldungen', {
    filter: selectedKursId
      ? combineFilters(
          refFilter('kurs', selectedKursId),
          "r.v_status in ['neu', 'bestaetigt', 'warteliste']",
        )
      : undefined,
    where: r => {
      if (!selectedKursId) return false;
      const kursRef = fieldRef(r, 'kurs');
      const st = fieldLookup(r, 'status')?.key;
      return kursRef === selectedKursId && st !== 'abgemeldet';
    },
    enabled: Boolean(selectedKursId),
  });

  // Maximale Teilnehmer des gewählten Kurses
  const selectedKursRecord = selectedKursId ? kurse.recordOf(selectedKursId) : undefined;
  const maxTeilnehmer = selectedKursRecord ? (fieldNumber(selectedKursRecord, 'maximale_teilnehmer') ?? 0) : 0;
  const belegtCount = anmeldungenCount.count ?? 0;
  const isFull = maxTeilnehmer > 0 && belegtCount >= maxTeilnehmer;

  // ── Duplikat-Prüfung: Teilnehmer bereits für diesen Kurs angemeldet? ───────
  const duplikatCount = useRecordCount(servicePort, 'anmeldungen', {
    filter:
      selectedKursId && selectedTeilnehmerId
        ? combineFilters(
            refFilter('kurs', selectedKursId),
            refFilter('teilnehmer', selectedTeilnehmerId),
            "r.v_status in ['neu', 'bestaetigt']",
          )
        : undefined,
    where: r => {
      if (!selectedKursId || !selectedTeilnehmerId) return false;
      const kursRef = fieldRef(r, 'kurs');
      const tnRef = fieldRef(r, 'teilnehmer');
      const st = fieldLookup(r, 'status')?.key;
      return kursRef === selectedKursId && tnRef === selectedTeilnehmerId && (st === 'neu' || st === 'bestaetigt');
    },
    enabled: Boolean(selectedKursId && selectedTeilnehmerId),
  });
  const isDuplicate = (duplikatCount.count ?? 0) > 0;

  // ── Plan ───────────────────────────────────────────────────────────────────
  const submit = useJourneySubmit(
    servicePort,
    [
      {
        key: 'anmeldung',
        entity: 'anmeldungen',
        form: anmeldung,
        primary: true,
        values: () => ({
          status: isFull ? 'warteliste' : 'neu',
          bezahlt: false,
        }),
      },
    ],
    { draftKey: 'schueler-anmelden' },
  );

  const restart = () => {
    submit.reset();
    anmeldung.reset({ anmeldedatum: todayIso(), status: 'neu', bezahlt: false });
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Schüler anmelden')}
      subtitle={tx('Kurs wählen, Schüler zuordnen, Anmeldung anlegen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[anmeldung]}
      draftKey="schueler-anmelden"
      intro={{
        description: tx('Einen Schüler für einen laufenden oder geplanten Kurs anmelden.'),
        needs: [tx('Name des Schülers'), tx('Gewünschter Kurs')],
      }}
    >
      {/* ── Schritt 1: Kurs wählen ─────────────────────────────────────────── */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Einen Kurs mit freien Plätzen wählen — nur laufende und geplante Kurse werden angezeigt.')}
      >
        {selectedKursId && maxTeilnehmer > 0 && (
          <div className="mb-4">
            <BudgetTracker
              format="count"
              unit={tx('Plätze')}
              budget={maxTeilnehmer}
              booked={belegtCount}
              label={tx('Kursauslastung')}
              showRemaining
            />
            {isFull && (
              <p className="mt-2 flex items-center gap-1 text-sm text-amber-600">
                <IconAlertCircle size={15} className="shrink-0" />
                {tx('Kurs ist voll — Anmeldung landet auf der Warteliste.')}
              </p>
            )}
          </div>
        )}
        <EntitySelectStep
          {...kurse.select}
          selectedId={selectedKursId}
          avatar="none"
          emptyText={tx('Keine Kurse mit Status „Geplant" oder „Läuft" vorhanden.')}
          create={false}
          onSelect={id => {
            anmeldung.set('kurs', id, kurse.labelOf(id));
            setStep(2);
          }}
        />
      </WizardStep>

      {/* ── Schritt 2: Teilnehmer wählen ───────────────────────────────────── */}
      <WizardStep
        label={tx('Teilnehmer')}
        description={tx('Einen vorhandenen Schüler suchen oder neu anlegen.')}
        needs={['kurs']}
      >
        {isDuplicate && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{tx('Dieser Schüler ist für den gewählten Kurs bereits angemeldet.')}</span>
          </div>
        )}
        <EntitySelectStep
          {...teilnehmer.select}
          selectedId={selectedTeilnehmerId}
          create={{ fields: ['vorname', 'nachname', 'email', 'telefon'], title: tx('Neuen Schüler anlegen') }}
          createLabel={tx('Neuen Schüler anlegen')}
          searchPlaceholder={tx('Schüler suchen …')}
          onSelect={id => {
            anmeldung.set('teilnehmer', id, teilnehmer.labelOf(id));
            setStep(3);
          }}
        />
      </WizardStep>

      {/* ── Schritt 3: Anmeldedaten ────────────────────────────────────────── */}
      <WizardStep
        label={tx('Anmeldedaten')}
        description={tx('Datum und optionale Bemerkung erfassen.')}
        needs={['kurs', 'teilnehmer']}
      >
        {isFull && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <IconAlertCircle size={15} className="shrink-0" />
            <span>
              {tx('Kurs voll → Warteliste')}{' '}
              <StatusBadge statusKey="warteliste" label={tx('Warteliste')} />
            </span>
          </div>
        )}
        <div className="space-y-4">
          <Bound form={anmeldung} name="anmeldedatum" />
          <Bound form={anmeldung} name="bemerkung" rows={3} />
          <StepNav
            onNext={() => anmeldung.validate(['anmeldedatum'])}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* ── Schritt 4: Zusammenfassung & Bestätigung ───────────────────────── */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[anmeldung]}
            submit={submit}
            items={[
              {
                key: '_status',
                label: tx('Status'),
                value: isFull ? tx('Warteliste') : tx('Neu'),
              },
            ]}
            whatHappensNext={
              isFull
                ? tx('Die Anmeldung wird auf der Warteliste gespeichert und kann bei Verfügbarkeit bestätigt werden.')
                : tx('Die Anmeldung wird sofort als „Neu" gespeichert und kann im Anschluss bestätigt werden.')
            }
          />
        )}
      </WizardStep>

      {/* ── Erfolgsmeldung ─────────────────────────────────────────────────── */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[anmeldung]}
          submit={submit}
          restartLabel={tx('Noch eine Anmeldung')}
          whatHappensNext={
            isFull
              ? tx('Der Schüler steht auf der Warteliste. Sobald ein Platz frei wird, kann die Anmeldung bestätigt werden.')
              : tx('Die Anmeldung ist angelegt. Im nächsten Schritt kann die Anwesenheit erfasst werden.')
          }
          next={[
            { label: tx('Noch eine Anmeldung'), onClick: restart },
            {
              label: tx('Anwesenheit erfassen'),
              href: '#/intents/anwesenheit-erfassen',
            },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
