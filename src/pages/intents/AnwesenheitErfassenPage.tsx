/**
 * Anwesenheit erfassen — 4-Schritt-Wizard.
 * Steps: 1) Kurs wählen → 2) Datum der Stunde → 3) Anwesenheit pro Schüler → 4) Prüfen & anlegen.
 * Reads: kurse (aktive), anmeldungen (des gewählten Kurses), teilnehmer (via anmeldungen).
 * Writes: anwesenheiten (createAnwesenheitenEntry — ein Eintrag pro angemeldeten Schüler).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useMemo } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { DatePicker } from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  todayIso,
  combineFilters,
  refFilter,
  fieldText,
  fieldLookup,
  fieldRef,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

interface SchuelerAnwesenheit {
  anmeldungId: string;
  teilnehmerId: string;
  name: string;
  anwesend: boolean;
  entschuldigt: boolean;
}

export default function AnwesenheitErfassenPage() {
  const [step, setStep] = useState(1);

  // Kurs-Picker: nur aktive Kurse (geplant oder läuft)
  const kurse = useRecordSearch(servicePort, 'kurse', {
    searchFields: ['titel'],
    filter: "r.v_status in ['laeuft', 'geplant']",
    where: r => {
      const s = fieldLookup(r, 'status')?.key;
      return s === 'laeuft' || s === 'geplant';
    },
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  // Datumsformular für anwesenheiten (nur datum)
  const datumForm = useStepForm('anwesenheiten', {
    fields: ['datum'],
    steps: { datum: 2 },
    initial: { datum: todayIso() },
  });

  const kursId = datumForm.get('datum') !== undefined
    ? (undefined as string | undefined)
    : undefined;

  // Gewählter Kurs-ID aus separatem State (da kurs ein record-Feld im Formular ist, das der Plan verwaltet)
  const [selectedKursId, setSelectedKursId] = useState<string | null>(null);
  const [selectedKursName, setSelectedKursName] = useState<string>('');

  // Anmeldungen des gewählten Kurses laden
  const anmeldungen = useRecordSearch(servicePort, 'anmeldungen', {
    searchFields: [],
    filter: selectedKursId
      ? combineFilters(
          refFilter('kurs', selectedKursId),
          "r.v_status in ['neu', 'bestaetigt']"
        )
      : tx('r.v_status == \'neu\''),   // Fallback, der keine Treffer liefert wenn kein Kurs gewählt
    where: r => {
      if (!selectedKursId) return false;
      const kursRef = fieldRef(r, 'kurs');
      const status = fieldLookup(r, 'status')?.key;
      return kursRef === selectedKursId && (status === 'neu' || status === 'bestaetigt');
    },
    toItem: a => ({
      id: a.id,
      title: fieldText(a, 'bemerkung') || a.id,
    }),
  });

  // Teilnehmer-Namen über useRecordSearch
  const teilnehmer = useRecordSearch(servicePort, 'teilnehmer', {
    searchFields: ['vorname', 'nachname'],
    toItem: t => ({
      id: t.id,
      title: `${fieldText(t, 'vorname')} ${fieldText(t, 'nachname')}`.trim(),
    }),
  });

  // Schüler-Anwesenheitsliste aus geladenen Anmeldungen aufbauen
  const [schuelerListe, setSchuelerListe] = useState<SchuelerAnwesenheit[]>([]);
  const [listeInitialized, setListeInitialized] = useState<string | null>(null);

  // Liste initialisieren/aktualisieren wenn Anmeldungen geladen sind und Kurs gewählt
  const anmeldungRecords = anmeldungen.records;
  const listeKey = selectedKursId && !anmeldungen.select.loading
    ? `${selectedKursId}-${anmeldungRecords.length}`
    : null;

  if (listeKey && listeKey !== listeInitialized && anmeldungRecords.length > 0) {
    const neueListe: SchuelerAnwesenheit[] = anmeldungRecords.map(a => {
      const tid = fieldRef(a, 'teilnehmer') ?? '';
      const tName = teilnehmer.labelOf(tid) ?? tid;
      return {
        anmeldungId: a.id,
        teilnehmerId: tid,
        name: tName,
        anwesend: false,
        entschuldigt: false,
      };
    });
    setSchuelerListe(neueListe);
    setListeInitialized(listeKey);
  }

  // Schüler mit Teilnehmer-Namen aus dem teilnehmer-Hook anreichern
  const schuelerMitNamen: SchuelerAnwesenheit[] = useMemo(() => {
    return schuelerListe.map(s => ({
      ...s,
      name: teilnehmer.labelOf(s.teilnehmerId) ?? (s.name || s.teilnehmerId),
    }));
  }, [schuelerListe, teilnehmer]);

  const anwesendCount = schuelerMitNamen.filter(s => s.anwesend).length;
  const entschuldigtCount = schuelerMitNamen.filter(s => s.entschuldigt && !s.anwesend).length;
  const fehlendCount = schuelerMitNamen.filter(s => !s.anwesend && !s.entschuldigt).length;

  const toggleAnwesend = (teilnehmerId: string) => {
    setSchuelerListe(prev => prev.map(s =>
      s.teilnehmerId === teilnehmerId
        ? { ...s, anwesend: !s.anwesend, entschuldigt: s.anwesend ? s.entschuldigt : false }
        : s
    ));
  };

  const toggleEntschuldigt = (teilnehmerId: string) => {
    setSchuelerListe(prev => prev.map(s =>
      s.teilnehmerId === teilnehmerId
        ? { ...s, entschuldigt: !s.entschuldigt, anwesend: s.entschuldigt ? s.anwesend : false }
        : s
    ));
  };

  // Plan: ein Anwesenheits-Eintrag pro Schüler
  const datumWert = datumForm.get('datum') as string | undefined;
  const plan = useMemo(() => {
    if (!selectedKursId || !datumWert || schuelerMitNamen.length === 0) return [];
    return schuelerMitNamen.map(s => ({
      key: `anwesenheit-${s.teilnehmerId}`,
      label: s.name || s.teilnehmerId,
      entity: 'anwesenheiten' as const,
      values: {
        kurs: selectedKursId,
        teilnehmer: s.teilnehmerId,
        datum: datumWert,
        anwesend: s.anwesend,
        entschuldigt: s.entschuldigt,
      },
      primary: s === schuelerMitNamen[0],
    }));
  }, [selectedKursId, datumWert, schuelerMitNamen]);

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'anwesenheit-erfassen' });

  const restart = () => {
    submit.reset();
    datumForm.reset({ datum: todayIso() });
    setSelectedKursId(null);
    setSelectedKursName('');
    setSchuelerListe([]);
    setListeInitialized(null);
    setStep(1);
  };

  const summaryItems = [
    { key: 'kurs', label: tx('Kurs'), value: selectedKursName },
    { key: 'datum', label: tx('Datum'), value: datumForm.get('datum') as string ?? '' },
    { key: 'anwesend', label: tx('Anwesend'), value: String(anwesendCount) },
    { key: 'entschuldigt', label: tx('Entschuldigt'), value: String(entschuldigtCount) },
    { key: 'fehlend', label: tx('Fehlend'), value: String(fehlendCount) },
  ];

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[datumForm]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Erfasse nach einer Kursstunde die Anwesenheit aller angemeldeten Schüler.'),
        needs: [tx('Den Kurs auswählen'), tx('Das heutige Datum bestätigen')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Wähle den Kurs, für den du die Anwesenheit erfassen möchtest.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={selectedKursId}
          onSelect={id => {
            setSelectedKursId(id);
            setSelectedKursName(kurse.labelOf(id) ?? '');
            setSchuelerListe([]);
            setListeInitialized(null);
            setStep(2);
          }}
          emptyText={tx('Keine aktiven Kurse gefunden. Nur Kurse mit Status „Läuft" oder „Geplant" sind wählbar.')}
          create={false}
          searchPlaceholder={tx('Kurs suchen…')}
        />
      </WizardStep>

      {/* Schritt 2: Datum der Stunde */}
      <WizardStep
        label={tx('Datum')}
        heading={tx('Wann fand die Stunde statt?')}
        description={tx('Bestätige das Datum der Kursstunde.')}
        needs={['kurs']}
      >
        {selectedKursId ? (
          <div className="space-y-4">
            <Field form={datumForm} name="datum" label={tx('Datum der Kursstunde')}>
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

      {/* Schritt 3: Anwesenheit pro Schüler */}
      <WizardStep
        label={tx('Anwesenheit')}
        description={tx('Markiere für jeden Schüler, ob er anwesend oder entschuldigt war.')}
      >
        {selectedKursId && datumForm.get('datum') ? (
          <div className="space-y-4">
            {anmeldungen.select.loading ? (
              <p className="text-sm text-muted-foreground">{tx('Schüler werden geladen…')}</p>
            ) : schuelerMitNamen.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {tx('Keine angemeldeten Schüler für diesen Kurs gefunden.')}
              </p>
            ) : (
              <div className="divide-y rounded-lg border bg-card">
                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <span>{tx('Schüler')}</span>
                  <span>{tx('Anwesend')}</span>
                  <span>{tx('Entschuldigt')}</span>
                </div>
                {schuelerMitNamen.map(s => (
                  <div
                    key={s.teilnehmerId}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3"
                  >
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    <Checkbox
                      id={`anwesend-${s.teilnehmerId}`}
                      checked={s.anwesend}
                      onCheckedChange={() => toggleAnwesend(s.teilnehmerId)}
                      aria-label={`${s.name} anwesend`}
                    />
                    <Checkbox
                      id={`entschuldigt-${s.teilnehmerId}`}
                      checked={s.entschuldigt}
                      onCheckedChange={() => toggleEntschuldigt(s.teilnehmerId)}
                      aria-label={`${s.name} entschuldigt`}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{tx('Anwesend')}: <strong>{anwesendCount}</strong></span>
              <span>{tx('Entschuldigt')}: <strong>{entschuldigtCount}</strong></span>
              <span>{tx('Fehlend')}: <strong>{fehlendCount}</strong></span>
            </div>
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => {
                if (schuelerMitNamen.length === 0) return tx('Keine Schüler gefunden.') as string;
              }}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(selectedKursId ? 2 : 1)} nextDisabled>
            {!selectedKursId
              ? tx('Bitte zuerst einen Kurs auswählen.')
              : tx('Bitte zuerst das Datum bestätigen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 4: Zusammenfassung */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[datumForm]}
            submit={submit}
            items={summaryItems}
            whatHappensNext={tx('Für jeden angemeldeten Schüler wird ein Anwesenheitseintrag angelegt.')}
            confirmLabel={tx('Anwesenheit speichern')}
          />
        )}
      </WizardStep>

      {/* Erfolgsschritt */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[datumForm]}
          facts={summaryItems}
          next={[
            { label: tx('Weitere Anwesenheit erfassen'), onClick: restart },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Anwesenheiten sind gespeichert und können in der Übersicht eingesehen werden.')}
          restartLabel={tx('Weitere Anwesenheit erfassen')}
        />
      )}
    </IntentWizardShell>
  );
}
