/**
 * Anwesenheit erfassen — 4-Schritt-Wizard.
 * Steps: 1) Kurs wählen → 2) Datum wählen → 3) Anwesenheit eintragen → 4) Prüfen & anlegen.
 * Reads: kurse, anmeldungen. Writes: anwesenheiten (createAnwesenheitenEntry).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { DatePicker } from '@/components/DatePicker';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, todayIso, refFilter } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { IconCheck, IconX, IconMinus } from '@tabler/icons-react';

type Attendance = { anwesend: boolean; entschuldigt: boolean };

export default function AnwesenheitErfassenPage() {
  const [step, setStep] = useState(1);

  // Step 1: Kurs suchen — nur laufende oder geplante Kurse
  const kurse = useRecordSearch(servicePort, 'kurse', {
    searchFields: ['titel'],
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const s = fieldLookup(r, 'status')?.key;
      return s === 'geplant' || s === 'laeuft';
    },
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  // Form für Kurs + Datum
  const kursForm = useStepForm('anwesenheiten', {
    steps: { kurs: 1, datum: 2 },
    initial: { datum: todayIso() },
    required: { teilnehmer: false, anwesend: false, entschuldigt: false },
  });

  const selectedKursId = kursForm.get('kurs') as string | undefined;

  // Step 3: Anmeldungen für den gewählten Kurs laden
  const anmeldungenFilter = selectedKursId
    ? tx`${refFilter('kurs', selectedKursId)} AND (r.v_status == 'neu' OR r.v_status == 'bestaetigt')`
    : tx('r.v_status == \'neu\' OR r.v_status == \'bestaetigt\'');
  const anmeldungen = useRecordSearch(servicePort, 'anmeldungen', {
    searchFields: [],
    filter: anmeldungenFilter,
    where: r => {
      const s = fieldLookup(r, 'status')?.key;
      return s === 'neu' || s === 'bestaetigt';
    },
  });

  // Lokaler Zustand für Anwesenheit pro Anmeldung
  const [attendanceMap, setAttendanceMap] = useState<Map<string, Attendance>>(new Map());

  const setAttendance = (anmeldungId: string, anwesend: boolean, entschuldigt: boolean) => {
    setAttendanceMap(prev => {
      const next = new Map(prev);
      next.set(anmeldungId, { anwesend, entschuldigt });
      return next;
    });
  };

  const selectedDatum = kursForm.get('datum') as string | undefined;

  // Anmeldungen als Liste (sobald geladen)
  const anmeldungItems = anmeldungen.select.items ?? [];

  // Teilnehmer-IDs aus den Anmeldungen lesen
  const teilnehmerEntries = useMemo(() => {
    return anmeldungItems.map(item => {
      const rec = anmeldungen.recordOf(item.id);
      const teilnehmerId = rec ? (rec.fields['teilnehmer'] as string | undefined) : undefined;
      return { anmeldungId: item.id, teilnehmerId };
    }).filter((e): e is { anmeldungId: string; teilnehmerId: string } => !!e.teilnehmerId);
  }, [anmeldungItems, anmeldungen]);

  // Teilnehmer-Datensätze nachladen für Namen
  const teilnehmerSearch = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim(),
    }),
  });

  // Zähler für Summary
  const countAnwesend = teilnehmerEntries.filter(e => attendanceMap.get(e.anmeldungId)?.anwesend === true).length;
  const countEntschuldigt = teilnehmerEntries.filter(e => {
    const a = attendanceMap.get(e.anmeldungId);
    return a && !a.anwesend && a.entschuldigt;
  }).length;
  const countFehlend = teilnehmerEntries.length - countAnwesend - countEntschuldigt;

  // Plan: ein Eintrag pro Teilnehmer
  const plan = useMemo(() => {
    if (!selectedKursId || !selectedDatum) return [];
    return teilnehmerEntries.map(({ anmeldungId, teilnehmerId }) => {
      const att = attendanceMap.get(anmeldungId) ?? { anwesend: false, entschuldigt: false };
      return {
        key: `anwesenheit-${anmeldungId}`,
        entity: 'anwesenheiten' as const,
        primary: false,
        values: {
          kurs: selectedKursId,
          teilnehmer: teilnehmerId,
          datum: selectedDatum,
          anwesend: att.anwesend,
          entschuldigt: att.entschuldigt,
        },
      };
    });
  }, [teilnehmerEntries, attendanceMap, selectedKursId, selectedDatum]);

  // Primary-Plan-Step (mind. einer muss primary=true sein für SuccessStep)
  const fullPlan = useMemo(() => {
    if (plan.length === 0) {
      return [{
        key: 'anwesenheit-placeholder',
        entity: 'anwesenheiten' as const,
        primary: true,
        values: {
          kurs: selectedKursId ?? '',
          teilnehmer: '',
          datum: selectedDatum ?? '',
          anwesend: false,
          entschuldigt: false,
        },
      }];
    }
    return plan.map((s, i) => ({ ...s, primary: i === 0 }));
  }, [plan, selectedKursId, selectedDatum]);

  const submit = useJourneySubmit(servicePort, fullPlan, { draftKey: 'anwesenheit-erfassen' });

  const kursName = selectedKursId ? (kurse.labelOf(selectedKursId) ?? '') : '';

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[kursForm]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Für einen Kurs das heutige Datum wählen und alle Schüler als anwesend, entschuldigt oder fehlend markieren.'),
        needs: [tx('Kurs'), tx('Datum der Stunde')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Einen laufenden oder geplanten Kurs auswählen.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={kursForm.get('kurs') as string}
          onSelect={id => {
            kursForm.set('kurs', id, kurse.labelOf(id));
            setAttendanceMap(new Map());
            setStep(2);
          }}
          emptyText={tx('Kein Kurs mit Status „Geplant" oder „Läuft" gefunden.')}
          create={false}
        />
      </WizardStep>

      {/* Schritt 2: Datum wählen */}
      <WizardStep
        label={tx('Unterrichtsstunde')}
        description={tx('Datum der Unterrichtsstunde wählen.')}
        needs={['kurs']}
      >
        <div className="space-y-4">
          <Field form={kursForm} name="datum">
            <DatePicker {...kursForm.date('datum')} />
          </Field>
          <StepNav
            onNext={() => kursForm.validate(['datum'])}
            nextStepLabel={tx('Anwesenheit eintragen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 3: Anwesenheit eintragen */}
      <WizardStep
        label={tx('Anwesenheit')}
        description={tx('Jeden Schüler als anwesend, entschuldigt oder fehlend markieren.')}
        needs={['kurs', 'datum']}
      >
        <div className="space-y-4">
          {anmeldungen.select.loading && (
            <p className="text-sm text-muted-foreground">{tx('Schüler werden geladen…')}</p>
          )}
          {!anmeldungen.select.loading && teilnehmerEntries.length === 0 && (
            <p className="text-sm text-muted-foreground">{tx('Keine angemeldeten Schüler mit Status „Neu" oder „Bestätigt" für diesen Kurs gefunden.')}</p>
          )}
          {teilnehmerEntries.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              {teilnehmerEntries.map(({ anmeldungId, teilnehmerId }) => {
                const att = attendanceMap.get(anmeldungId) ?? { anwesend: false, entschuldigt: false };
                const teilnehmerRec = teilnehmerSearch.recordOf(teilnehmerId);
                const vorname = teilnehmerRec ? fieldText(teilnehmerRec, 'vorname') : '';
                const nachname = teilnehmerRec ? fieldText(teilnehmerRec, 'nachname') : '';
                const name = [vorname, nachname].filter(Boolean).join(' ') || teilnehmerId.slice(0, 8);
                const isAnwesend = att.anwesend;
                const isEntschuldigt = !att.anwesend && att.entschuldigt;
                const isFehlend = !att.anwesend && !att.entschuldigt;

                return (
                  <div
                    key={anmeldungId}
                    className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-b-0 bg-card"
                  >
                    <span className="text-sm font-medium text-foreground min-w-0 truncate">{name}</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setAttendance(anmeldungId, true, false)}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isAnwesend
                            ? 'bg-emerald-500 text-white'
                            : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                        }`}
                      >
                        <IconCheck size={14} className="shrink-0" />
                        {tx('Anwesend')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttendance(anmeldungId, false, true)}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isEntschuldigt
                            ? 'bg-amber-500 text-white'
                            : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                        }`}
                      >
                        <IconX size={14} className="shrink-0" />
                        {tx('Entschuldigt')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAttendance(anmeldungId, false, false)}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isFehlend
                            ? 'bg-destructive/80 text-white'
                            : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                        }`}
                      >
                        <IconMinus size={14} className="shrink-0" />
                        {tx('Fehlend')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <StepNav
            onNext={() => {
              if (teilnehmerEntries.length === 0) return tx('Es gibt keine Schüler, deren Anwesenheit erfasst werden kann.');
              return undefined;
            }}
            nextStepLabel={tx('Prüfen')}
          />
        </div>
      </WizardStep>

      {/* Schritt 4: Prüfen & Anlegen */}
      <WizardStep label={tx('Prüfen')} needs={['kurs', 'datum']}>
        {!submit.done && (
          <SummaryStep
            forms={[kursForm]}
            submit={submit}
            items={[
              {
                key: 'kurs-name',
                label: tx('Kurs'),
                value: kursName,
                keys: ['kurs'],
                fieldId: kursForm.fieldId('kurs'),
                step: 1,
              },
              {
                key: 'datum-val',
                label: tx('Datum'),
                value: selectedDatum ?? '—',
                keys: ['datum'],
                fieldId: kursForm.fieldId('datum'),
                step: 2,
              },
              {
                key: 'anzahl-schueler',
                label: tx('Schüler gesamt'),
                value: String(teilnehmerEntries.length),
                keys: [],
                fieldId: '',
              },
              {
                key: 'anwesend-count',
                label: tx('Anwesend'),
                value: String(countAnwesend),
                keys: [],
                fieldId: '',
              },
              {
                key: 'entschuldigt-count',
                label: tx('Entschuldigt'),
                value: String(countEntschuldigt),
                keys: [],
                fieldId: '',
              },
              {
                key: 'fehlend-count',
                label: tx('Fehlend'),
                value: String(countFehlend),
                keys: [],
                fieldId: '',
              },
            ]}
            whatHappensNext={tx('Für jeden Schüler wird ein Anwesenheitseintrag für diesen Tag angelegt.')}
          />
        )}
      </WizardStep>

      {/* Erfolg */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          submit={submit}
          forms={[kursForm]}
          title={tx('Anwesenheit erfasst')}
          whatHappensNext={tx('Die Anwesenheitseinträge sind gespeichert und sofort in der Übersicht sichtbar.')}
          next={[
            { label: tx('Weitere Stunde erfassen'), href: '#/intents/anwesenheit-erfassen' },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
