/**
 * Anwesenheit erfassen — 4-Schritt-Wizard (+ Erfolgsschirm).
 * Steps: 1) Kurs wählen → 2) Datum der Stunde → 3) Anwesenheitsliste → 4) Prüfen & anlegen.
 * Reads: kurse (gefiltert: geplant/laeuft), anmeldungen (gefiltert: kurs + aktive Status).
 * Writes: anwesenheiten (createAnwesenheitenEntry) — ein Datensatz pro Teilnehmer.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useStepForm, useJourneySubmit, useRecordSearch, todayIso, refFilter, combineFilters, fieldText, fieldRef } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/DatePicker';
import { Field } from '@/components/blocks/Field';
import { tx } from '@/i18n';

interface AttendanceRow {
  anmeldungId: string;
  teilnehmerId: string;
  name: string;
  anwesend: boolean;
  entschuldigt: boolean;
}

export default function AnwesenheitErfassenPage() {
  const [step, setStep] = useState(1);

  // Schritt 1: Kurs wählen — nur geplant oder laeuft
  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status in ['geplant', 'laeuft']",
    where: r => {
      const key = fieldText(r, 'status');
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: k => ({ id: k.id, title: fieldText(k, 'titel'), subtitle: fieldText(k, 'status') }),
  });

  // Schritt 2: Datum-Formular
  const datumForm = useStepForm('anwesenheiten', {
    steps: { datum: 2 },
    initial: { datum: todayIso() },
  });

  // Gewählter Kurs-ID aus separatem State
  const [kursId, setKursId] = useState<string>('');
  const [kursName, setKursName] = useState<string>('');

  // Schritt 3: Anmeldungen des gewählten Kurses laden (aktive Status)
  const anmeldungen = useRecordSearch(servicePort, 'anmeldungen', {
    filter: kursId
      ? combineFilters(refFilter('kurs', kursId), "r.v_status in ['neu', 'bestaetigt', 'warteliste']")
      : tx('r.id == \'none\''),
    where: r => {
      const statusKey = (r.fields['status'] as { key: string } | null)?.key;
      const kursRef = fieldRef(r, 'kurs');
      return (
        kursRef === kursId &&
        (statusKey === 'neu' || statusKey === 'bestaetigt' || statusKey === 'warteliste')
      );
    },
    searchFields: [],
    toItem: (_a, ctx) => ({
      id: _a.id,
      title: ctx.ref('teilnehmer') ?? tx('Unbekannter Teilnehmer'),
    }),
  });

  // Lokale Anwesenheitsliste — wird aus den geladenen Anmeldungen aufgebaut
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [rowsInitialized, setRowsInitialized] = useState<string>(''); // tracks kursId for init

  // Wenn sich der Kurs ändert oder Anmeldungen geladen werden, Liste neu aufbauen
  const anmeldungItems = anmeldungen.select.items;
  useEffect(() => {
    if (!kursId || anmeldungen.select.loading) return;
    if (rowsInitialized === kursId) return;
    const newRows: AttendanceRow[] = anmeldungItems.map(item => {
      const rec = anmeldungen.recordOf(item.id);
      const teilnehmerId = rec ? (fieldRef(rec, 'teilnehmer') ?? '') : '';
      return {
        anmeldungId: item.id,
        teilnehmerId,
        name: item.title,
        anwesend: false,
        entschuldigt: false,
      };
    });
    setRows(newRows);
    setRowsInitialized(kursId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kursId, anmeldungItems, anmeldungen.select.loading, rowsInitialized]);

  const toggleAnwesend = (id: string) => {
    setRows(prev => prev.map(r =>
      r.anmeldungId === id
        ? { ...r, anwesend: !r.anwesend, entschuldigt: r.anwesend ? r.entschuldigt : false }
        : r
    ));
  };

  const toggleEntschuldigt = (id: string) => {
    setRows(prev => prev.map(r =>
      r.anmeldungId === id && !r.anwesend ? { ...r, entschuldigt: !r.entschuldigt } : r
    ));
  };

  // Zusammenfassung
  const anzahlAnwesend = rows.filter(r => r.anwesend).length;
  const anzahlEntschuldigt = rows.filter(r => !r.anwesend && r.entschuldigt).length;
  const anzahlFehlend = rows.filter(r => !r.anwesend && !r.entschuldigt).length;

  const datumWert = datumForm.get('datum') as string | undefined;

  // Plan: ein Create-Eintrag pro Teilnehmer
  const plan = rows.map(row => ({
    key: `anwesenheit-${row.anmeldungId}`,
    entity: 'anwesenheiten' as const,
    values: {
      kurs: kursId,
      teilnehmer: row.teilnehmerId,
      datum: datumWert ?? todayIso(),
      anwesend: row.anwesend,
      entschuldigt: row.entschuldigt,
    },
  }));

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'anwesenheit-erfassen' });

  const restart = () => {
    submit.reset();
    datumForm.reset();
    setKursId('');
    setKursName('');
    setRows([]);
    setRowsInitialized('');
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[datumForm]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Anwesenheit aller angemeldeten Teilnehmer für eine Kursstunde eintragen.'),
        needs: [tx('Kurs'), tx('Datum der Stunde')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Nur laufende oder geplante Kurse werden angezeigt.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={kursId}
          onSelect={id => {
            const label = kurse.labelOf(id) ?? '';
            setKursId(id);
            setKursName(label);
            setRows([]);
            setRowsInitialized('');
            setStep(2);
          }}
          create={false}
          emptyText={tx('Kein aktiver Kurs gefunden. Bitte zuerst einen Kurs anlegen.')}
          searchPlaceholder={tx('Kurs suchen …')}
        />
      </WizardStep>

      {/* Schritt 2: Datum der Stunde */}
      <WizardStep
        label={tx('Stundendatum')}
        description={tx('Datum der Unterrichtsstunde wählen.')}
      >
        {step === 2 && (
          kursId ? (
            <div className="space-y-4">
              <Field form={datumForm} name="datum" label={tx('Datum der Stunde')}>
                <DatePicker {...datumForm.date('datum')} />
              </Field>
              <StepNav
                onNext={() => datumForm.validate(['datum'])}
                nextStepLabel={tx('Anwesenheit')}
              />
            </div>
          ) : (
            <StepNav
              onBack={() => setStep(1)}
              nextDisabled
            >
              <p className="text-sm text-muted-foreground">
                {tx('Bitte zuerst einen Kurs wählen.')}
              </p>
            </StepNav>
          )
        )}
      </WizardStep>

      {/* Schritt 3: Anwesenheitsliste */}
      <WizardStep
        label={tx('Anwesenheit')}
        description={tx('Anwesenheit und Entschuldigungen für alle angemeldeten Teilnehmer eintragen.')}
      >
        {step === 3 && (
          kursId && datumWert ? (
            <div className="space-y-4">
              {anmeldungen.select.loading && (
                <p className="text-sm text-muted-foreground">{tx('Teilnehmer werden geladen …')}</p>
              )}
              {!anmeldungen.select.loading && rows.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {tx('Keine aktiven Anmeldungen für diesen Kurs gefunden.')}
                </p>
              )}
              {!anmeldungen.select.loading && rows.length > 0 && (
                <div className="rounded-xl border bg-card overflow-hidden">
                  {/* Kopfzeile */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 bg-secondary text-xs text-muted-foreground font-medium">
                    <span>{tx('Teilnehmer')}</span>
                    <span className="text-center w-20">{tx('Anwesend')}</span>
                    <span className="text-center w-24">{tx('Entschuldigt')}</span>
                  </div>
                  {rows.map((row, i) => (
                    <div
                      key={row.anmeldungId}
                      className={`grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 items-center${i < rows.length - 1 ? ' border-b' : ''}`}
                    >
                      <span className="text-sm font-medium truncate min-w-0">{row.name}</span>
                      <div className="flex justify-center w-20">
                        <Checkbox
                          id={`anwesend-${row.anmeldungId}`}
                          checked={row.anwesend}
                          onCheckedChange={() => toggleAnwesend(row.anmeldungId)}
                          aria-label={`${row.name} ${tx('anwesend')}`}
                        />
                      </div>
                      <div className="flex justify-center w-24">
                        <Checkbox
                          id={`entschuldigt-${row.anmeldungId}`}
                          checked={row.entschuldigt}
                          disabled={row.anwesend}
                          onCheckedChange={() => toggleEntschuldigt(row.anmeldungId)}
                          aria-label={`${row.name} ${tx('entschuldigt')}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Kurzübersicht */}
              {rows.length > 0 && (
                <div className="flex gap-4 text-sm text-muted-foreground px-1">
                  <span>
                    <span className="font-medium text-foreground">{anzahlAnwesend}</span>{' '}
                    {tx('anwesend')}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{anzahlEntschuldigt}</span>{' '}
                    {tx('entschuldigt')}
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{anzahlFehlend}</span>{' '}
                    {tx('fehlend')}
                  </span>
                </div>
              )}
              <StepNav
                onNext={() => {
                  if (rows.length === 0) return tx('Keine Teilnehmer geladen — bitte Kurs prüfen.');
                  return undefined;
                }}
                nextStepLabel={tx('Prüfen')}
              />
            </div>
          ) : (
            <StepNav
              onBack={() => setStep(kursId ? 2 : 1)}
              nextDisabled
            >
              <p className="text-sm text-muted-foreground">
                {!kursId ? tx('Bitte zuerst einen Kurs wählen.') : tx('Bitte zuerst ein Datum wählen.')}
              </p>
            </StepNav>
          )
        )}
      </WizardStep>

      {/* Schritt 4: Prüfen & Anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {step === 4 && !submit.done && (
          <div className="space-y-4">
            {/* Manuelle Zusammenfassung, da mehrere Plan-Steps keine einzelne Form widerspiegeln */}
            <div className="rounded-xl border bg-card divide-y">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">{tx('Kurs')}</span>
                <span className="text-sm font-medium">{kursName}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">{tx('Datum')}</span>
                <span className="text-sm font-medium">
                  {datumWert ? format(new Date(datumWert + 'T00:00'), 'dd.MM.yyyy') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">{tx('Anwesend')}</span>
                <span className="text-sm font-medium">{anzahlAnwesend}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">{tx('Entschuldigt')}</span>
                <span className="text-sm font-medium">{anzahlEntschuldigt}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">{tx('Fehlend')}</span>
                <span className="text-sm font-medium">{anzahlFehlend}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-muted-foreground">{tx('Einträge gesamt')}</span>
                <span className="text-sm font-medium">{rows.length}</span>
              </div>
            </div>
            <SummaryStep
              forms={[datumForm]}
              submit={submit}
              whatHappensNext={tx('Für jeden Teilnehmer wird ein Anwesenheitseintrag angelegt.')}
              items={[]}
            />
          </div>
        )}
      </WizardStep>

      {/* Erfolgsschirm */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[datumForm]}
          next={[
            { label: tx('Andere Stunde erfassen'), onClick: restart },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Anwesenheitseinträge sind jetzt im System gespeichert.')}
        />
      )}
    </IntentWizardShell>
  );
}
