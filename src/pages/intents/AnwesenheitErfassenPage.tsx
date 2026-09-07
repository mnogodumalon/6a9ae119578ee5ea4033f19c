/**
 * Anwesenheit erfassen — 4-Schritt-Wizard.
 * Steps: 1) Kurs wählen (status=laeuft) → 2) Datum wählen →
 *        3) Anwesenheit eintragen (eine Zeile pro bestätigter Anmeldung) →
 *        4) Prüfen & anlegen (N Anwesenheiten-Datensätze, einer pro Teilnehmer).
 * Reads: kurse (filter status=laeuft), anmeldungen (filter kurs + status=bestaetigt).
 * Writes: anwesenheiten (createAnwesenheitenEntry — one per enrolled Teilnehmer).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/DatePicker';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  fieldText,
  fieldLookup,
  fieldRef,
  todayIso,
  refFilter,
  combineFilters,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

interface AttendeeRow {
  anmeldungId: string;
  teilnehmerId: string;
  name: string;
  anwesend: boolean;
  entschuldigt: boolean;
}

export default function AnwesenheitErfassenPage() {
  const [step, setStep] = useState(1);

  // Step 1: Kurs wählen — nur laufende Kurse
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status == 'laeuft'",
    where: r => fieldLookup(r, 'status')?.key === 'laeuft',
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  // Step 1 + 2: Formular für Kurs und Datum
  const f = useStepForm('anwesenheiten', {
    steps: { kurs: 1, datum: 2 },
    fields: ['kurs', 'datum'],
    initial: { datum: todayIso() },
  });

  const kursId = f.get('kurs') as string | null | undefined;

  // Step 3: Anmeldungen des gewählten Kurses mit status=bestaetigt laden
  const anmeldungen = useRecordSearch(servicePort, 'anmeldungen', {
    filter: kursId
      ? combineFilters(refFilter('kurs', kursId), tx('r.v_status == \'bestaetigt\''))
      : tx('r.v_status == \'bestaetigt\''),
    where: r =>
      fieldLookup(r, 'status')?.key === 'bestaetigt' &&
      (kursId ? fieldRef(r, 'kurs') === kursId : false),
    searchFields: [],
  });

  // Lokaler State für die Anwesenheitsliste (Schritt 3)
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [rowsInitialized, setRowsInitialized] = useState<string | null>(null);

  // Initialisierung der Zeilen, wenn wir auf Schritt 3 kommen und der Kurs bekannt ist
  useMemo(() => {
    const key = kursId ?? '';
    if (key && !anmeldungen.select.loading && rowsInitialized !== key) {
      const newRows: AttendeeRow[] = anmeldungen.records.map(a => {
        const tid = fieldRef(a, 'teilnehmer') ?? a.id;
        return {
          anmeldungId: a.id,
          teilnehmerId: tid,
          name: anmeldungen.refLabel(a, 'teilnehmer') ?? tid,
          anwesend: true,
          entschuldigt: false,
        };
      });
      setRows(newRows);
      setRowsInitialized(key);
    }
  }, [kursId, anmeldungen.select.loading, anmeldungen.records, rowsInitialized, anmeldungen]);

  const toggleAnwesend = (idx: number) =>
    setRows(prev =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, anwesend: !r.anwesend, entschuldigt: !r.anwesend ? false : r.entschuldigt }
          : r
      )
    );

  const toggleEntschuldigt = (idx: number) =>
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, entschuldigt: !r.entschuldigt } : r)));

  // Zusammenfassungs-Werte
  const datumVal = f.get('datum') as string | null | undefined;
  const kursName = (kursId ? kurse.labelOf(kursId) : undefined) ?? tx('Kein Kurs');
  const countAnwesend = rows.filter(r => r.anwesend).length;
  const countEntschuldigt = rows.filter(r => !r.anwesend && r.entschuldigt).length;
  const countFehlend = rows.filter(r => !r.anwesend && !r.entschuldigt).length;

  // Plan: ein createAnwesenheitenEntry pro Teilnehmer
  const plan = useMemo(
    () =>
      rows.map(row => ({
        key: `anwesenheit-${row.teilnehmerId}`,
        entity: 'anwesenheiten' as const,
        label: row.name,
        values: {
          kurs: kursId ?? '',
          teilnehmer: row.teilnehmerId,
          datum: datumVal ?? todayIso(),
          anwesend: row.anwesend,
          entschuldigt: row.entschuldigt,
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, kursId, datumVal]
  );

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'anwesenheit-erfassen' });

  const handleRestart = () => {
    submit.reset();
    f.reset();
    setRows([]);
    setRowsInitialized(null);
    setStep(1);
  };

  // Extrazeilen für die Zusammenfassung
  const summaryItems = useMemo(
    () => [
      { key: 'kurs-name', label: tx('Kurs'), value: kursName },
      {
        key: 'datum-val',
        label: tx('Datum'),
        value: datumVal ?? '—',
        step: 2,
        keys: ['datum'],
        fieldId: f.fieldId('datum'),
      },
      {
        key: 'teilnehmer-count',
        label: tx('Teilnehmer gesamt'),
        value: String(rows.length),
      },
      { key: 'anwesend-count', label: tx('Anwesend'), value: String(countAnwesend) },
      { key: 'entschuldigt-count', label: tx('Entschuldigt'), value: String(countEntschuldigt) },
      { key: 'fehlend-count', label: tx('Unentschuldigt fehlend'), value: String(countFehlend) },
    ],
    [kursName, datumVal, rows.length, countAnwesend, countEntschuldigt, countFehlend, f]
  );

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      subtitle={tx('Alle angemeldeten Schüler auf einmal eintragen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Für einen laufenden Kurs und ein Datum die Anwesenheit aller bestätigten Schüler erfassen.'),
        needs: [tx('Laufender Kurs'), tx('Unterrichtsdatum')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        heading={tx('Kurs wählen')}
        description={tx('Nur aktuell laufende Kurse werden angezeigt.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={kursId ?? null}
          emptyText={tx('Derzeit läuft kein Kurs. Bitte zuerst einen Kurs starten.')}
          create={false}
          searchPlaceholder={tx('Kurs suchen …')}
          onSelect={id => {
            f.set('kurs', id, kurse.labelOf(id));
            // Reset der Anwesenheitsliste bei Kurswechsel
            setRows([]);
            setRowsInitialized(null);
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Datum wählen */}
      <WizardStep
        label={tx('Unterrichtstag')}
        description={tx('Für welches Datum soll die Anwesenheit eingetragen werden?')}
        needs={['kurs']}
      >
        <div className="space-y-4">
          <Field form={f} name="datum" label={tx('Unterrichtsdatum')}>
            <DatePicker {...f.date('datum')} />
          </Field>
          <StepNav
            onBack={() => setStep(1)}
            onNext={() => f.validate(['datum'])}
            nextStepLabel={tx('Anwesenheit')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Anwesenheit eintragen */}
      <WizardStep
        label={tx('Anwesenheit')}
        heading={tx('Anwesenheit eintragen')}
        description={tx('Für jeden Schüler Anwesenheit und ggf. Entschuldigung eintragen.')}
        needs={['kurs', 'datum']}
      >
        {kursId && datumVal ? (
          <div className="space-y-4">
            {anmeldungen.select.loading && (
              <p className="text-sm text-muted-foreground">{tx('Schüler werden geladen …')}</p>
            )}
            {!anmeldungen.select.loading && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {tx('Keine bestätigten Anmeldungen für diesen Kurs.')}
              </p>
            )}
            {rows.length > 0 && (
              <div className="divide-y rounded-xl border bg-card">
                {/* Kopfzeile */}
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <span>{tx('Schüler')}</span>
                  <span className="w-24 text-center">{tx('Anwesend')}</span>
                  <span className="w-24 text-center">{tx('Entschuldigt')}</span>
                </div>
                {rows.map((row, idx) => (
                  <div
                    key={row.teilnehmerId}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
                    <div className="flex w-24 justify-center">
                      <Checkbox
                        id={`anwesend-${row.teilnehmerId}`}
                        checked={row.anwesend}
                        onCheckedChange={() => toggleAnwesend(idx)}
                      />
                    </div>
                    <div className="flex w-24 justify-center">
                      <Checkbox
                        id={`entschuldigt-${row.teilnehmerId}`}
                        checked={row.entschuldigt}
                        disabled={row.anwesend}
                        onCheckedChange={() => toggleEntschuldigt(idx)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Kurzübersicht */}
            {rows.length > 0 && (
              <div className="flex gap-4 rounded-lg bg-secondary px-4 py-2 text-sm">
                <span>
                  <span className="font-semibold text-foreground">{countAnwesend}</span>
                  {' '}
                  <span className="text-muted-foreground">{tx('anwesend')}</span>
                </span>
                {countEntschuldigt > 0 && (
                  <span>
                    <span className="font-semibold text-foreground">{countEntschuldigt}</span>
                    {' '}
                    <span className="text-muted-foreground">{tx('entschuldigt')}</span>
                  </span>
                )}
                {countFehlend > 0 && (
                  <span>
                    <span className="font-semibold text-foreground">{countFehlend}</span>
                    {' '}
                    <span className="text-muted-foreground">{tx('unentschuldigt fehlend')}</span>
                  </span>
                )}
              </div>
            )}
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => {
                if (rows.length === 0) return tx('Es gibt keine Schüler für diesen Kurs.');
                return undefined;
              }}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            <p className="text-sm text-muted-foreground">
              {tx('Bitte zuerst Kurs und Datum aus den vorherigen Schritten wählen.')}
            </p>
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')} needs={['kurs', 'datum']}>
        {!submit.result && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            items={summaryItems}
            whatHappensNext={tx('Für jeden Schüler wird ein Anwesenheitsdatensatz angelegt.')}
            confirmLabel={tx('Anwesenheit speichern')}
          />
        )}
      </WizardStep>

      {/* Erfolgsseite */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          title={tx(tx`${countAnwesend} von ${rows.length} Schülern anwesend`)}
          facts={[
            { label: tx('Kurs'), value: kursName },
            { label: tx('Datum'), value: datumVal ?? '—' },
            { label: tx('Anwesend'), value: String(countAnwesend) },
            { label: tx('Entschuldigt'), value: String(countEntschuldigt) },
            { label: tx('Unentschuldigt fehlend'), value: String(countFehlend) },
          ]}
          whatHappensNext={tx('Die Anwesenheiten sind gespeichert und können in der Übersicht eingesehen werden.')}
          next={[
            { label: tx('Andere Stunde erfassen'), onClick: handleRestart },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          actions={{ copy: false, print: false }}
        />
      )}
    </IntentWizardShell>
  );
}
