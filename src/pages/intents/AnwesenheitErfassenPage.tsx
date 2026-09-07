/**
 * Anwesenheit erfassen — 4-Schritt-Wizard.
 * Steps: 1) Kurs wählen → 2) Datum wählen → 3) Anwesenheit eintragen → 4) Prüfen & anlegen.
 * Reads: kurse (filter: status in ['geplant','laeuft']), anmeldungen (filter: kurs=gewählt AND status in ['bestaetigt','neu']).
 * Writes: anwesenheiten (createAnwesenheitenEntry) — ein Eintrag pro Teilnehmer.
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
  useRecordSearch,
  useRecordCount,
  useStepForm,
  useJourneySubmit,
  fieldText,
  fieldLookup,
  fieldRef,
  todayIso,
  combineFilters,
  refFilter,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';
import { IconCalendar, IconUsers, IconCheck } from '@tabler/icons-react';

// Local state for attendance toggles — one entry per Anmeldung
interface AttendanceState {
  anmeldungId: string;
  teilnehmerId: string;
  name: string;
  anwesend: boolean;
  entschuldigt: boolean;
}

export default function AnwesenheitErfassenPage() {
  const [step, setStep] = useState(1);
  const [attendance, setAttendance] = useState<AttendanceState[]>([]);
  const [attendanceLoaded, setAttendanceLoaded] = useState(false);

  // Step 1: Kurs wählen — nur geplante oder laufende Kurse
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const key = fieldLookup(r, 'status')?.key;
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      subtitle: fieldLookup(k, 'instrument')?.label,
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  // Step 2: Datums-Formular
  const datumForm = useStepForm('anwesenheiten', {
    fields: ['datum'],
    steps: { datum: 2 },
    initial: { datum: todayIso() },
  });

  // Kurs-ID aus kursForm (wird in setKurs gesetzt)
  const [kursId, setKursId] = useState<string | null>(null);
  const [kursLabel, setKursLabel] = useState<string>('');

  // Anmeldungen für den gewählten Kurs laden (Step 3)
  const anmeldungen = useRecordSearch(servicePort, 'anmeldungen', {
    filter: kursId
      ? combineFilters(refFilter('kurs', kursId), "r.v_status in ['bestaetigt', 'neu']")
      : tx('r.id == \'none\''),
    where: r => {
      const kRef = fieldRef(r, 'kurs');
      const statusKey = fieldLookup(r, 'status')?.key;
      return kRef === kursId && (statusKey === 'bestaetigt' || statusKey === 'neu');
    },
    searchFields: [],
  });

  // Anzahl der Anmeldungen für die Zusammenfassung
  const anmeldungenCount = useRecordCount(servicePort, 'anmeldungen', {
    filter: kursId
      ? combineFilters(refFilter('kurs', kursId), "r.v_status in ['bestaetigt', 'neu']")
      : undefined,
    where: r => {
      const kRef = fieldRef(r, 'kurs');
      const statusKey = fieldLookup(r, 'status')?.key;
      return kRef === kursId && (statusKey === 'bestaetigt' || statusKey === 'neu');
    },
    enabled: Boolean(kursId),
  });

  // Plan: ein create-Schritt pro Teilnehmer
  const datum = datumForm.get('datum') as string | null;

  const plan = useMemo(() => {
    if (!kursId || !datum || attendance.length === 0) return [];
    return attendance.map(a => ({
      key: `anwesenheit-${a.anmeldungId}`,
      label: a.name,
      entity: 'anwesenheiten' as const,
      values: {
        kurs: kursId,
        teilnehmer: a.teilnehmerId,
        datum,
        anwesend: a.anwesend,
        entschuldigt: !a.anwesend && a.entschuldigt,
      },
    }));
  }, [kursId, datum, attendance]);

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'anwesenheit-erfassen' });

  // Attendance-Liste initialisieren wenn Anmeldungen geladen
  const loadAttendance = () => {
    if (anmeldungen.records.length === 0 && !anmeldungen.select.loading) {
      setAttendance([]);
      setAttendanceLoaded(true);
      return;
    }
    const list: AttendanceState[] = anmeldungen.records.map(r => {
      const teilnehmerId = fieldRef(r, 'teilnehmer') ?? '';
      const tnLabel = anmeldungen.refLabel(r, 'teilnehmer') ?? teilnehmerId;
      return {
        anmeldungId: r.id,
        teilnehmerId,
        name: tnLabel,
        anwesend: true,
        entschuldigt: false,
      };
    });
    setAttendance(list);
    setAttendanceLoaded(true);
  };

  const toggleAnwesend = (id: string, val: boolean) => {
    setAttendance(prev => prev.map(a =>
      a.anmeldungId === id
        ? { ...a, anwesend: val, entschuldigt: val ? false : a.entschuldigt }
        : a
    ));
  };

  const toggleEntschuldigt = (id: string, val: boolean) => {
    setAttendance(prev => prev.map(a =>
      a.anmeldungId === id && !a.anwesend ? { ...a, entschuldigt: val } : a
    ));
  };

  const anwesendCount = attendance.filter(a => a.anwesend).length;
  const entschuldigtCount = attendance.filter(a => !a.anwesend && a.entschuldigt).length;
  const fehlendCount = attendance.filter(a => !a.anwesend && !a.entschuldigt).length;

  const restart = () => {
    submit.reset();
    datumForm.reset({ datum: todayIso() });
    setKursId(null);
    setKursLabel('');
    setAttendance([]);
    setAttendanceLoaded(false);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      subtitle={tx('Für eine Kursstunde')}
      currentStep={step}
      onStepChange={setStep}
      forms={[datumForm]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Erfasse die Anwesenheit aller angemeldeten Schüler für eine Kursstunde.'),
        needs: [tx('Den Kurs und das Datum der Stunde')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs wählen')}
        description={tx('Wähle den Kurs, für den du die Anwesenheit erfassen möchtest.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={kursId}
          onSelect={id => {
            setKursId(id);
            setKursLabel(kurse.labelOf(id) ?? id);
            setAttendanceLoaded(false);
            setStep(2);
          }}
          avatar="none"
          emptyText={tx('Keine laufenden oder geplanten Kurse gefunden.')}
          create={false}
          searchPlaceholder={tx('Kurs suchen…')}
        />
      </WizardStep>

      {/* Schritt 2: Datum wählen */}
      <WizardStep
        label={tx('Datum wählen')}
        description={tx('Wähle das Datum der Unterrichtsstunde.')}
        needs={['datum']}
      >
        {kursId ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconCalendar size={16} className="shrink-0" />
              <span>{kursLabel}</span>
            </div>
            <Field form={datumForm} name="datum">
              <DatePicker {...datumForm.date('datum')} />
            </Field>
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => datumForm.validate(['datum'])}
              nextStepLabel={tx('Anwesenheit')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst einen Kurs auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Anwesenheit eintragen */}
      <WizardStep
        label={tx('Anwesenheit')}
        description={tx('Markiere für jeden Teilnehmer, ob er anwesend oder entschuldigt ist.')}
      >
        {kursId && datum ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <IconCalendar size={14} className="shrink-0" />
                {format(new Date(datum), 'dd.MM.yyyy')}
              </span>
              <span className="flex items-center gap-1">
                <IconUsers size={14} className="shrink-0" />
                {kursLabel}
              </span>
            </div>

            {anmeldungen.select.loading && !attendanceLoaded && (
              <p className="text-sm text-muted-foreground">{tx('Lade Teilnehmer…')}</p>
            )}

            {!anmeldungen.select.loading && !attendanceLoaded && (
              <div>
                {/* Auto-load attendance when records are available */}
                {anmeldungen.records.length > 0 && (() => { if (!attendanceLoaded) { loadAttendance(); } return null; })()}
              </div>
            )}

            {attendanceLoaded && attendance.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {tx('Keine bestätigten oder neuen Anmeldungen für diesen Kurs.')}
              </p>
            )}

            {attendanceLoaded && attendance.length > 0 && (
              <>
                <div className="rounded-lg border bg-card overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 bg-secondary text-xs font-medium text-muted-foreground">
                    <span>{tx('Teilnehmer')}</span>
                    <span className="w-20 text-center">{tx('Anwesend')}</span>
                    <span className="w-24 text-center">{tx('Entschuldigt')}</span>
                  </div>
                  {attendance.map((a, idx) => (
                    <div
                      key={a.anmeldungId}
                      className={`grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 items-center ${idx < attendance.length - 1 ? 'border-b' : ''}`}
                    >
                      <span className="text-sm font-medium truncate min-w-0">{a.name}</span>
                      <div className="w-20 flex justify-center">
                        <Checkbox
                          id={`anwesend-${a.anmeldungId}`}
                          checked={a.anwesend}
                          onCheckedChange={checked => toggleAnwesend(a.anmeldungId, checked === true)}
                        />
                      </div>
                      <div className="w-24 flex justify-center">
                        <Checkbox
                          id={`entschuldigt-${a.anmeldungId}`}
                          checked={!a.anwesend && a.entschuldigt}
                          onCheckedChange={checked => toggleEntschuldigt(a.anmeldungId, checked === true)}
                          disabled={a.anwesend}
                          aria-label={tx('Entschuldigt')}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Zusammenfassung */}
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <IconCheck size={14} className="shrink-0" />
                    {tx('Anwesend')}: <strong>{anwesendCount}</strong>
                  </span>
                  {entschuldigtCount > 0 && (
                    <span className="text-amber-600">
                      {tx('Entschuldigt')}: <strong>{entschuldigtCount}</strong>
                    </span>
                  )}
                  {fehlendCount > 0 && (
                    <span className="text-destructive">
                      {tx('Fehlend')}: <strong>{fehlendCount}</strong>
                    </span>
                  )}
                </div>
              </>
            )}

            <StepNav
              onBack={() => setStep(2)}
              onNext={() => {
                if (!attendanceLoaded) {
                  return tx('Bitte warte, bis die Teilnehmer geladen sind.');
                }
                if (attendance.length === 0) {
                  return tx('Keine Teilnehmer für diesen Kurs gefunden.');
                }
                return true;
              }}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(kursId ? 2 : 1)} nextDisabled>
            {!kursId ? tx('Bitte zuerst einen Kurs auswählen.') : tx('Bitte zuerst ein Datum wählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Prüfen & Bestätigen */}
      <WizardStep label={tx('Prüfen')}>
        {kursId && datum && attendance.length > 0 && !submit.result ? (
          <SummaryStep
            forms={[datumForm]}
            submit={submit}
            items={[
              {
                key: 'kurs',
                label: tx('Kurs'),
                value: kursLabel,
                step: 1,
              },
              {
                key: 'zusammenfassung',
                label: tx('Zusammenfassung'),
                value: (() => {
                  const parts: string[] = [];
                  if (anwesendCount > 0) parts.push(`${anwesendCount} ${tx('anwesend')}`);
                  if (entschuldigtCount > 0) parts.push(`${entschuldigtCount} ${tx('entschuldigt')}`);
                  if (fehlendCount > 0) parts.push(`${fehlendCount} ${tx('fehlend')}`);
                  return parts.join(', ');
                })(),
              },
            ]}
            whatHappensNext={tx('Für jeden Teilnehmer wird ein Anwesenheitseintrag angelegt.')}
          />
        ) : !kursId || !datum ? (
          <StepNav onBack={() => setStep(!kursId ? 1 : 2)} nextDisabled>
            {!kursId ? tx('Bitte zuerst einen Kurs auswählen.') : tx('Bitte zuerst ein Datum wählen.')}
          </StepNav>
        ) : attendance.length === 0 ? (
          <StepNav onBack={() => setStep(3)} nextDisabled>
            {tx('Keine Teilnehmer zum Erfassen gefunden.')}
          </StepNav>
        ) : null}
      </WizardStep>

      {/* Erfolgsmeldung */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          title={tx('Anwesenheit gespeichert')}
          forms={[datumForm]}
          facts={[
            { label: tx('Kurs'), value: kursLabel },
            { label: tx('Datum'), value: datum ? format(new Date(datum), 'dd.MM.yyyy') : '' },
            { label: tx('Anwesend'), value: String(anwesendCount) },
            ...(entschuldigtCount > 0 ? [{ label: tx('Entschuldigt'), value: String(entschuldigtCount) }] : []),
            ...(fehlendCount > 0 ? [{ label: tx('Fehlend'), value: String(fehlendCount) }] : []),
          ]}
          whatHappensNext={tx('Die Anwesenheit ist jetzt für alle Teilnehmer gespeichert.')}
          next={[
            { label: tx('Neue Anwesenheit erfassen'), onClick: restart },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
