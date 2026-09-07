/**
 * Anwesenheit erfassen — 4-Schritt-Wizard.
 * Steps: 1) Kurs wählen → 2) Datum der Stunde → 3) Anwesenheitsliste → 4) Prüfen & anlegen.
 * Reads: kurse (useRecordSearch), anmeldungen (servicePort.list), teilnehmer (servicePort.get).
 * Writes: anwesenheiten (createAnwesenheitenEntry — one per Schüler).
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useEffect } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { Field } from '@/components/blocks/Field';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup, todayIso } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS } from '@/types/app';
import { tx } from '@/i18n';
import { DatePicker } from '@/components/DatePicker';
import { IconUsers, IconAlertCircle, IconCheck, IconX } from '@tabler/icons-react';

interface SchuelerStatus {
  anwesend: boolean;
  entschuldigt: boolean;
  name: string;
}

export default function AnwesenheitErfassenPage() {
  const data = useDashboardData({ omit: ['kurse', 'anmeldungen', 'teilnehmer', 'anwesenheiten'] });

  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status == 'geplant' or r.v_status == 'laeuft'",
    where: r => { const k = fieldLookup(r, 'status')?.key ?? ''; return k === 'geplant' || k === 'laeuft'; },
    searchFields: ['titel'],
    toItem: r => ({
      id: r.id,
      title: fieldText(r, 'titel'),
      subtitle: fieldText(r, 'instrument') || fieldLookup(r, 'instrument')?.label,
      status: fieldLookup(r, 'status') ?? undefined,
    }),
  });

  const [step, setStep] = useState(1);

  // Step 2 form: datum
  const datumForm = useStepForm('anwesenheiten', {
    steps: { datum: 2 },
    initial: { datum: todayIso() },
  });

  // Step 3 state: Anwesenheitsliste pro Schüler
  const [schuelerListe, setSchuelerListe] = useState<Record<string, SchuelerStatus>>({});
  const [listeLoading, setListeLoading] = useState(false);
  const [listeError, setListeError] = useState<string | null>(null);
  const [listeLoaded, setListeLoaded] = useState(false);

  const kursId = kurse.select.items.length > 0
    ? (datumForm.get('_kursId') as string | undefined)
    : undefined;

  // Load Anmeldungen when step 3 is reached
  useEffect(() => {
    const selectedKursId = datumForm.get('_kursId') as string | undefined;
    if (step !== 3 || !selectedKursId) return;

    setListeLoading(true);
    setListeError(null);
    setListeLoaded(false);

    servicePort.list('anmeldungen', {
      filter: tx`'${selectedKursId}' in str(r.v_kurs) and (r.v_status == 'neu' or r.v_status == 'bestaetigt')`,
    }).then(async anmeldungen => {
      const neueMap: Record<string, SchuelerStatus> = {};
      await Promise.all(anmeldungen.map(async (anmeldung) => {
        const teilnehmerId = (() => {
          const v = anmeldung.fields['teilnehmer'];
          if (typeof v !== 'string' || !v) return null;
          const m = /([0-9a-f]{24})\/?$/.exec(v.trim());
          return m ? m[1] : null;
        })();
        if (!teilnehmerId) return;
        const existing = schuelerListe[teilnehmerId];
        if (existing) {
          neueMap[teilnehmerId] = existing;
          return;
        }
        const teilnehmer = await servicePort.get('teilnehmer', teilnehmerId);
        const name = teilnehmer
          ? `${fieldText(teilnehmer, 'vorname')} ${fieldText(teilnehmer, 'nachname')}`.trim()
          : teilnehmerId;
        neueMap[teilnehmerId] = { anwesend: true, entschuldigt: false, name };
      }));
      setSchuelerListe(neueMap);
      setListeLoaded(true);
      setListeLoading(false);
    }).catch(() => {
      setListeError(tx('Schülerliste konnte nicht geladen werden.'));
      setListeLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, datumForm.get('_kursId')]);

  const schuelerIds = Object.keys(schuelerListe);
  const kursLabel = datumForm.get('_kursLabel') as string | undefined;
  const datumValue = datumForm.get('datum') as string | undefined;

  // Plan: one anwesenheit per Schüler
  const plan = schuelerIds.map(schuelerId => ({
    key: `anwesenheit-${schuelerId}`,
    entity: 'anwesenheiten' as const,
    primary: schuelerId === schuelerIds[0],
    values: {
      kurs: APP_IDS.KURSE + '/' + (datumForm.get('_kursId') as string ?? ''),
      teilnehmer: APP_IDS.TEILNEHMER + '/' + schuelerId,
      datum: datumValue ?? '',
      anwesend: schuelerListe[schuelerId]?.anwesend ?? false,
      entschuldigt: schuelerListe[schuelerId]?.entschuldigt ?? false,
    },
  }));

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'anwesenheit-erfassen' });

  const restart = () => {
    submit.reset();
    datumForm.reset();
    setSchuelerListe({});
    setListeLoaded(false);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      currentStep={step}
      onStepChange={setStep}
      loading={data.loading}
      error={data.error}
      onRetry={data.fetchAll}
      forms={[datumForm]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Kurs wählen und Anwesenheit der Schüler für eine Unterrichtsstunde eintragen.'),
        needs: [tx('Kurs'), tx('Datum der Stunde')],
      }}
    >
      {/* Step 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Aktiven oder geplanten Kurs auswählen.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={datumForm.get('_kursId') as string | undefined}
          onSelect={id => {
            datumForm.set('_kursId', id, kurse.labelOf(id));
            datumForm.set('_kursLabel', kurse.labelOf(id));
            setSchuelerListe({});
            setListeLoaded(false);
            setStep(2);
          }}
          emptyText={tx('Keine laufenden oder geplanten Kurse gefunden.')}
          create={false}
        />
      </WizardStep>

      {/* Step 2: Datum */}
      <WizardStep
        label={tx('Datum')}
        description={tx('Datum der Unterrichtsstunde wählen.')}
      >
        {datumForm.get('_kursId') ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              {tx('Kurs')}: <span className="font-medium text-foreground">{kursLabel}</span>
            </div>
            <Field form={datumForm} name="datum">
              <DatePicker {...datumForm.date('datum')} />
            </Field>
            <StepNav
              onNext={() => datumForm.validate(['datum'])}
              nextStepLabel={tx('Anwesenheit')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)}>
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kurs auswählen.')}</p>
          </StepNav>
        )}
      </WizardStep>

      {/* Step 3: Anwesenheitsliste */}
      <WizardStep
        label={tx('Anwesenheit')}
        description={tx('Anwesenheit für jeden Schüler eintragen.')}
      >
        {!datumForm.get('_kursId') ? (
          <StepNav onBack={() => setStep(1)}>
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kurs auswählen.')}</p>
          </StepNav>
        ) : listeLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <span className="animate-spin"><IconUsers size={16} className="shrink-0" /></span>
            {tx('Schüler werden geladen...')}
          </div>
        ) : listeError ? (
          <div className="flex items-center gap-2 text-sm text-destructive py-4">
            <IconAlertCircle size={16} className="shrink-0" />
            {listeError}
          </div>
        ) : listeLoaded && schuelerIds.length === 0 ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-secondary p-6 text-center">
              <IconUsers size={32} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{tx('Keine angemeldeten Schüler in diesem Kurs')}</p>
              <p className="text-xs text-muted-foreground mt-1">{tx('Nur Schüler mit Status „Neu" oder „Bestätigt" werden angezeigt.')}</p>
            </div>
            <StepNav onBack={() => setStep(1)} nextDisabled>
              {null}
            </StepNav>
          </div>
        ) : listeLoaded ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-3 flex flex-wrap gap-2 text-sm">
              <span className="text-muted-foreground">{tx('Kurs')}:</span>
              <span className="font-medium">{kursLabel}</span>
              <span className="text-muted-foreground ml-2">{tx('Datum')}:</span>
              <span className="font-medium">{datumValue ?? ''}</span>
            </div>
            <div className="space-y-2">
              {schuelerIds.map(id => {
                const s = schuelerListe[id];
                return (
                  <div key={id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                    <span className="flex-1 text-sm font-medium truncate min-w-0">{s.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSchuelerListe(prev => ({
                          ...prev,
                          [id]: { ...prev[id], anwesend: true, entschuldigt: false },
                        }))}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${s.anwesend ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground'}`}
                        aria-pressed={s.anwesend}
                      >
                        <IconCheck size={14} className="shrink-0" />
                        {tx('Anwesend')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchuelerListe(prev => ({
                          ...prev,
                          [id]: { ...prev[id], anwesend: false, entschuldigt: true },
                        }))}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${!s.anwesend && s.entschuldigt ? 'bg-amber-500 text-white' : 'bg-secondary text-muted-foreground'}`}
                        aria-pressed={!s.anwesend && s.entschuldigt}
                      >
                        <IconX size={14} className="shrink-0" />
                        {tx('Entschuldigt')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSchuelerListe(prev => ({
                          ...prev,
                          [id]: { ...prev[id], anwesend: false, entschuldigt: false },
                        }))}
                        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${!s.anwesend && !s.entschuldigt ? 'bg-destructive/80 text-white' : 'bg-secondary text-muted-foreground'}`}
                        aria-pressed={!s.anwesend && !s.entschuldigt}
                      >
                        {tx('Fehlt')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <StepNav
              onNext={() => {
                if (schuelerIds.length === 0) return tx('Es gibt keine Schüler in diesem Kurs.');
                return undefined;
              }}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        ) : null}
      </WizardStep>

      {/* Step 4: Summary & Submit */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep
            forms={[datumForm]}
            submit={submit}
            items={[
              { key: '_kursLabel', label: tx('Kurs'), value: kursLabel ?? '—', step: 1, keys: ['_kursId', '_kursLabel'], fieldId: 'anwesenheiten-_kursId' },
              { key: '_schueler', label: tx('Schüler'), value: `${schuelerIds.length}`, step: 3, keys: ['_schueler'], fieldId: 'anwesenheiten-_kursId' },
              { key: '_anwesend', label: tx('Anwesend'), value: `${schuelerIds.filter(id => schuelerListe[id]?.anwesend).length}`, step: 3, keys: ['_anwesend'], fieldId: 'anwesenheiten-_kursId' },
            ]}
            whatHappensNext={tx('Die Anwesenheiten werden sofort gespeichert und sind in der Übersicht sichtbar.')}
          />
        )}
      </WizardStep>

      {/* Success */}
      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[datumForm]}
          next={[
            { label: tx('Weiteren Kurs erfassen'), onClick: restart },
            { label: tx('Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Alle Anwesenheiten wurden erfolgreich gespeichert.')}
        />
      )}
    </IntentWizardShell>
  );
}
