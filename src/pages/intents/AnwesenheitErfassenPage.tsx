/**
 * Anwesenheit erfassen — 4-Schritt-Wizard.
 * Steps: 1) Kurs wählen → 2) Datum der Stunde → 3) Anwesenheit je Schüler → 4) Zusammenfassung & anlegen.
 * Reads: kurse (status=geplant|laeuft), anmeldungen (status=neu|bestaetigt, kurs=gewählt).
 * Writes: anwesenheiten (createAnwesenheitenEntry) — eine pro aktivem Teilnehmer (Batch).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { DatePicker } from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
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
import { IconUserCheck, IconAlertCircle } from '@tabler/icons-react';

interface AttendanceRow {
  anmeldungId: string;
  teilnehmerId: string;
  teilnehmerName: string;
  anwesend: boolean;
  entschuldigt: boolean;
}

export default function AnwesenheitErfassenPage() {
  const [step, setStep] = useState(1);

  // Kurs-Auswahl (Schritt 1): nur geplante oder laufende Kurse
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const k = fieldLookup(r, 'status')?.key;
      return k === 'geplant' || k === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      subtitle: fieldLookup(k, 'instrument')?.label,
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  // Formular für Kurs + Datum
  const f = useStepForm('anwesenheiten', {
    steps: { kurs: 1, datum: 2 },
    fields: ['kurs', 'datum'],
    initial: { datum: todayIso() },
  });

  const kursId = f.get('kurs') as string | undefined;
  const datumValue = f.get('datum') as string | null;

  // Anmeldungen für gewählten Kurs (Schritt 3): nur aktive (neu oder bestätigt)
  // Wenn kursId bekannt: serverseitig filtern; sonst where=alles ablehnen (kein kursId → Schritt 3 noch nicht erreichbar)
  const anmeldungen = useRecordSearch(servicePort, 'anmeldungen', {
    filter: kursId
      ? combineFilters(
          refFilter('kurs', kursId),
          "r.v_status in ['neu', 'bestaetigt']"
        )
      : undefined,
    where: r => {
      if (!kursId) return false;
      const sk = fieldLookup(r, 'status')?.key;
      return (sk === 'neu' || sk === 'bestaetigt') && fieldRef(r, 'kurs') === kursId;
    },
    searchFields: [],
    toItem: a => ({
      id: a.id,
      title: fieldRef(a, 'teilnehmer') ?? a.id,
    }),
  });

  // Batch-State: eine Zeile pro Anmeldung
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [rowsInitialized, setRowsInitialized] = useState<string>(''); // kursId für das letzte Init

  // Teilnehmer-Namen über useRecordSearch laden
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim(),
    }),
  });

  // Wenn ein neuer Kurs gewählt wird und wir auf Schritt 3 gehen → Rows initialisieren
  const initRows = () => {
    if (!anmeldungen.select.items || rowsInitialized === (kursId ?? '')) return;
    const newRows: AttendanceRow[] = anmeldungen.select.items.map(item => {
      const tid = item.title; // toItem gibt das record_id des Teilnehmers als title (Fallback)
      // Suche den echten Teilnehmernamen
      const tName = teilnehmer.labelOf(tid) ?? tid;
      return {
        anmeldungId: item.id,
        teilnehmerId: tid,
        teilnehmerName: tName,
        anwesend: false,
        entschuldigt: false,
      };
    });
    setRows(newRows);
    setRowsInitialized(kursId ?? '');
  };

  // Teilnehmer-IDs aus Anmeldungen extrahieren für bessere Namensauflösung
  const teilnehmerIds = useMemo(
    () => anmeldungen.select.items?.map(a => a.title) ?? [],
    [anmeldungen.select.items]
  );

  // Teilnehmer-Namen-Map aus dem teilnehmer-Hook
  const getTeilnehmerName = (tid: string) =>
    teilnehmer.labelOf(tid) ?? tid;

  // Anzahl-Stats für Zusammenfassung
  const anwesendCount = rows.filter(r => r.anwesend).length;
  const entschuldigtCount = rows.filter(r => !r.anwesend && r.entschuldigt).length;
  const abwesendCount = rows.filter(r => !r.anwesend && !r.entschuldigt).length;

  // Plan: für jeden Teilnehmer ein Create-Step
  const plan = useMemo(() => {
    if (!kursId || !datumValue || rows.length === 0) return [];
    return rows.map(row => ({
      key: `anwesenheit-${row.anmeldungId}`,
      entity: 'anwesenheiten' as const,
      values: {
        kurs: kursId,
        teilnehmer: row.teilnehmerId,
        datum: datumValue,
        anwesend: row.anwesend,
        entschuldigt: row.anwesend ? false : row.entschuldigt,
      },
      label: tx('Anwesenheit'),
    }));
  }, [kursId, datumValue, rows]);

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'anwesenheit-erfassen' });

  const toggleAnwesend = (id: string, val: boolean) => {
    setRows(prev =>
      prev.map(r =>
        r.anmeldungId === id
          ? { ...r, anwesend: val, entschuldigt: val ? false : r.entschuldigt }
          : r
      )
    );
  };

  const toggleEntschuldigt = (id: string, val: boolean) => {
    setRows(prev =>
      prev.map(r =>
        r.anmeldungId === id && !r.anwesend ? { ...r, entschuldigt: val } : r
      )
    );
  };

  const kursName = kursId ? kurse.labelOf(kursId) : undefined;
  const datumFormatted = datumValue
    ? format(new Date(datumValue + 'T12:00:00'), 'dd.MM.yyyy')
    : undefined;

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      subtitle={kursName ? `${kursName}${datumFormatted ? ` · ${datumFormatted}` : ''}` : undefined}
      currentStep={step}
      onStepChange={setStep}
      forms={[f]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Anwesenheit aller angemeldeten Schüler eines Kurses für eine Stunde erfassen.'),
        needs: [tx('Kurs'), tx('Datum der Stunde')],
      }}
    >
      {/* Schritt 1 — Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Einen laufenden oder geplanten Kurs auswählen.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={f.get('kurs') as string}
          onSelect={id => {
            f.set('kurs', id, kurse.labelOf(id));
            setRowsInitialized(''); // Rows zurücksetzen wenn Kurs wechselt
            setRows([]);
            setStep(2);
          }}
          emptyText={tx('Keine geplanten oder laufenden Kurse gefunden.')}
          create={false}
          searchPlaceholder={tx('Kurs suchen…')}
        />
      </WizardStep>

      {/* Schritt 2 — Datum der Stunde */}
      <WizardStep
        label={tx('Datum')}
        heading={tx('Datum der Unterrichtsstunde')}
        description={tx('Für welche Stunde wird die Anwesenheit erfasst?')}
        needs={['kurs']}
      >
        <div className="space-y-6">
          <Field form={f} name="datum">
            <DatePicker {...f.date('datum')} />
          </Field>
          <StepNav
            onNext={() => f.validate(['datum'])}
            nextStepLabel={tx('Anwesenheit eintragen')}
            onBack={() => setStep(1)}
          />
        </div>
      </WizardStep>

      {/* Schritt 3 — Anwesenheit je Schüler */}
      <WizardStep
        label={tx('Schüler')}
        description={tx('Für jeden Schüler Anwesenheit oder Entschuldigung markieren.')}
        needs={['kurs', 'datum']}
      >
        {(() => {
          // Rows initialisieren wenn nötig
          if (
            kursId &&
            anmeldungen.select.items &&
            !anmeldungen.select.loading &&
            rowsInitialized !== kursId
          ) {
            // Verwende setTimeout um State-Update außerhalb des Renders zu triggern
            // (initRows wird beim nächsten Render synchron aufgerufen)
            Promise.resolve().then(initRows);
          }

          if (anmeldungen.select.loading) {
            return (
              <div className="py-8 text-center text-muted-foreground">
                <p>{tx('Schüler werden geladen…')}</p>
              </div>
            );
          }

          if (!anmeldungen.select.items || anmeldungen.select.items.length === 0) {
            return (
              <div className="py-8 text-center space-y-3">
                <IconAlertCircle size={40} className="mx-auto text-muted-foreground" stroke={1.5} />
                <p className="text-muted-foreground">
                  {tx('Keine aktiven Anmeldungen für diesen Kurs gefunden.')}
                </p>
                <StepNav onBack={() => setStep(1)} hideBack={false} nextDisabled />
              </div>
            );
          }

          const displayRows =
            rows.length > 0 && rowsInitialized === kursId
              ? rows
              : anmeldungen.select.items.map(item => ({
                  anmeldungId: item.id,
                  teilnehmerId: item.title,
                  teilnehmerName: getTeilnehmerName(item.title),
                  anwesend: false,
                  entschuldigt: false,
                }));

          return (
            <div className="space-y-4">
              {/* Kopfzeile */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b">
                <span>{tx('Schüler')}</span>
                <span className="w-24 text-center">{tx('Anwesend')}</span>
                <span className="w-24 text-center">{tx('Entschuldigt')}</span>
              </div>

              {/* Teilnehmer-Zeilen */}
              <div className="divide-y divide-border rounded-lg border overflow-hidden">
                {displayRows.map(row => (
                  <div
                    key={row.anmeldungId}
                    className={`grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-3 py-3 ${
                      row.anwesend
                        ? 'bg-emerald-50 dark:bg-emerald-950/20'
                        : row.entschuldigt
                        ? 'bg-amber-50 dark:bg-amber-950/20'
                        : 'bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <IconUserCheck
                        size={16}
                        className={`shrink-0 ${
                          row.anwesend
                            ? 'text-emerald-600'
                            : row.entschuldigt
                            ? 'text-amber-600'
                            : 'text-muted-foreground'
                        }`}
                      />
                      <span className="truncate text-sm font-medium">
                        {getTeilnehmerName(row.teilnehmerId) || row.teilnehmerName || row.teilnehmerId}
                      </span>
                    </div>

                    {/* Anwesend-Toggle */}
                    <div className="w-24 flex justify-center">
                      <Checkbox
                        id={`anwesend-${row.anmeldungId}`}
                        checked={row.anwesend}
                        onCheckedChange={val => {
                          const checked = val === true;
                          if (rows.length > 0 && rowsInitialized === kursId) {
                            toggleAnwesend(row.anmeldungId, checked);
                          } else {
                            const initialized = displayRows.map(r => ({ ...r }));
                            setRows(initialized);
                            setRowsInitialized(kursId ?? '');
                            setRows(prev =>
                              prev.map(r =>
                                r.anmeldungId === row.anmeldungId
                                  ? { ...r, anwesend: checked, entschuldigt: checked ? false : r.entschuldigt }
                                  : r
                              )
                            );
                          }
                        }}
                        aria-label={tx('Anwesend')}
                      />
                    </div>

                    {/* Entschuldigt-Toggle (nur aktiv wenn nicht anwesend) */}
                    <div className="w-24 flex justify-center">
                      <Checkbox
                        id={`entschuldigt-${row.anmeldungId}`}
                        checked={!row.anwesend && row.entschuldigt}
                        disabled={row.anwesend}
                        onCheckedChange={val => {
                          if (row.anwesend) return;
                          const checked = val === true;
                          if (rows.length > 0 && rowsInitialized === kursId) {
                            toggleEntschuldigt(row.anmeldungId, checked);
                          } else {
                            const initialized = displayRows.map(r => ({ ...r }));
                            setRows(initialized);
                            setRowsInitialized(kursId ?? '');
                            setRows(prev =>
                              prev.map(r =>
                                r.anmeldungId === row.anmeldungId
                                  ? { ...r, entschuldigt: checked }
                                  : r
                              )
                            );
                          }
                        }}
                        aria-label={tx('Entschuldigt')}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Schnellübersicht */}
              <div className="flex gap-4 text-sm text-muted-foreground px-1">
                <span>
                  <span className="font-medium text-emerald-600">{displayRows.filter(r => r.anwesend).length}</span>
                  {' '}{tx('anwesend')}
                </span>
                <span>
                  <span className="font-medium text-amber-600">{displayRows.filter(r => !r.anwesend && r.entschuldigt).length}</span>
                  {' '}{tx('entschuldigt')}
                </span>
                <span>
                  <span className="font-medium text-muted-foreground">{displayRows.filter(r => !r.anwesend && !r.entschuldigt).length}</span>
                  {' '}{tx('abwesend')}
                </span>
              </div>

              <StepNav
                onBack={() => setStep(2)}
                onNext={() => {
                  // Rows in State übernehmen falls noch nicht geschehen
                  if (rows.length === 0 || rowsInitialized !== kursId) {
                    setRows(displayRows);
                    setRowsInitialized(kursId ?? '');
                  }
                  if (displayRows.length === 0) {
                    return tx('Für diesen Kurs gibt es keine aktiven Anmeldungen.');
                  }
                }}
                nextStepLabel={tx('Zusammenfassung')}
              />
            </div>
          );
        })()}
      </WizardStep>

      {/* Schritt 4 — Zusammenfassung */}
      <WizardStep label={tx('Prüfen')} needs={['kurs', 'datum']}>
        {!submit.done && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            whatHappensNext={tx('Die Anwesenheit wird für alle Schüler gleichzeitig eingetragen.')}
            items={[
              {
                key: 'kursname',
                label: tx('Kurs'),
                value: kursName ?? '—',
                keys: ['kurs'],
              },
              {
                key: 'datum-stunde',
                label: tx('Datum'),
                value: datumFormatted ?? '—',
                keys: ['datum'],
              },
              {
                key: 'anwesend-anzahl',
                label: tx('Anwesend'),
                value: String(anwesendCount),
                keys: ['_anwesend'],
              },
              {
                key: 'entschuldigt-anzahl',
                label: tx('Entschuldigt'),
                value: String(entschuldigtCount),
                keys: ['_entschuldigt'],
              },
              {
                key: 'abwesend-anzahl',
                label: tx('Abwesend'),
                value: String(abwesendCount),
                keys: ['_abwesend'],
              },
            ]}
          />
        )}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          submit={submit}
          restartLabel={tx('Weitere Stunde erfassen')}
          next={[
            {
              label: tx('Schüler anmelden'),
              href: '#/intents/schueler-anmelden',
            },
            {
              label: tx('Kurs planen'),
              href: '#/intents/kurs-planen',
            },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Anwesenheitsliste ist jetzt vollständig für diese Stunde.')}
        />
      )}
    </IntentWizardShell>
  );
}
