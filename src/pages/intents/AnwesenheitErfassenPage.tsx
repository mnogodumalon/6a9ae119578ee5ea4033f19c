/**
 * Anwesenheit erfassen — 4-Schritt-Wizard.
 * Steps: 1) Kurs wählen → 2) Datum wählen → 3) Anwesenheitsliste → 4) Prüfen & anlegen.
 * Reads: kurse (gefiltert auf geplant/laeuft), anmeldungen (bestaetigt, per kurs).
 * Writes: anwesenheiten (createAnwesenheitenEntry, ein Eintrag pro Teilnehmer).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState, useEffect } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import { DatePicker } from '@/components/DatePicker';
import { useStepForm, useJourneySubmit, useRecordSearch, todayIso, refFilter, fieldText, fieldLookup, fieldRef } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { useDashboardData } from '@/hooks/useDashboardData';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';

type AttendanceState = { anwesend: boolean; entschuldigt: boolean };

export default function AnwesenheitErfassenPage() {
  const data = useDashboardData({ omit: ['kurse'] });

  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status == 'geplant' or r.v_status == 'laeuft'",
    where: r => {
      const key = fieldLookup(r, 'status')?.key ?? '';
      return key === 'geplant' || key === 'laeuft';
    },
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      subtitle: fieldLookup(k, 'status')?.label ?? '',
    }),
  });

  const [step, setStep] = useState(1);

  const f = useStepForm('anwesenheiten', {
    initial: { datum: todayIso() },
    steps: { kurs: 1, datum: 2 },
  });

  // Step 3: Anmeldungen des gewählten Kurses laden
  const [anmeldungen, setAnmeldungen] = useState<Array<{ id: string; teilnehmerId: string; name: string }>>([]);
  const [anmeldungenLoading, setAnmeldungenLoading] = useState(false);
  const [anmeldungenError, setAnmeldungenError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Map<string, AttendanceState>>(new Map());

  const kursId = f.get('kurs') as string | undefined;
  const kursLabel = kursId ? (kurse.labelOf(kursId) ?? '') : '';

  useEffect(() => {
    if (!kursId || step !== 3) return;
    let cancelled = false;
    setAnmeldungenLoading(true);
    setAnmeldungenError(null);
    servicePort
      .list('anmeldungen', {
        filter: tx`${refFilter('kurs', kursId)} and r.v_status == 'bestaetigt'`,
      })
      .then(async rows => {
        if (cancelled) return;
        // Resolve Teilnehmer-Namen
        const resolved: Array<{ id: string; teilnehmerId: string; name: string }> = [];
        for (const row of rows) {
          const tid = fieldRef(row, 'teilnehmer');
          if (!tid) continue;
          const tn = await servicePort.get('teilnehmer', tid);
          if (cancelled) return;
          const name = tn
            ? `${tn.fields['vorname'] ?? ''} ${tn.fields['nachname'] ?? ''}`.trim()
            : tid;
          resolved.push({ id: row.id, teilnehmerId: tid, name });
        }
        setAnmeldungen(resolved);
        // Initialzustand: alle anwesend=true, entschuldigt=false
        setAttendance(
          new Map(resolved.map(a => [a.teilnehmerId, { anwesend: true, entschuldigt: false }])),
        );
        setAnmeldungenLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setAnmeldungenError(String(err));
        setAnmeldungenLoading(false);
      });
    return () => { cancelled = true; };
  }, [kursId, step]);

  const toggleAnwesend = (tid: string) => {
    setAttendance(prev => {
      const next = new Map(prev);
      const cur = next.get(tid) ?? { anwesend: true, entschuldigt: false };
      next.set(tid, { anwesend: !cur.anwesend, entschuldigt: cur.entschuldigt });
      return next;
    });
  };

  const toggleEntschuldigt = (tid: string) => {
    setAttendance(prev => {
      const next = new Map(prev);
      const cur = next.get(tid) ?? { anwesend: true, entschuldigt: false };
      next.set(tid, { anwesend: cur.anwesend, entschuldigt: !cur.entschuldigt });
      return next;
    });
  };

  const anwesendCount = [...attendance.values()].filter(a => a.anwesend).length;
  const abwesendCount = anmeldungen.length - anwesendCount;
  const datum = f.get('datum') as string | undefined;

  // Plan: ein Step pro Teilnehmer (Bulk-Create)
  const planSteps = anmeldungen.map(a => {
    const state = attendance.get(a.teilnehmerId) ?? { anwesend: true, entschuldigt: false };
    return {
      key: `anwesenheit-${a.teilnehmerId}`,
      entity: 'anwesenheiten' as const,
      values: {
        kurs: kursId ?? '',
        teilnehmer: a.teilnehmerId,
        datum: datum ?? todayIso(),
        anwesend: state.anwesend,
        entschuldigt: state.entschuldigt,
      },
    };
  });

  const submit = useJourneySubmit(servicePort, planSteps.length > 0 ? planSteps : [
    // Fallback damit der Hook stabil ist — wird nie abgeschickt wenn keine Anmeldungen
    { key: 'anwesenheit-placeholder', entity: 'anwesenheiten' as const, values: { kurs: '', teilnehmer: '', datum: todayIso(), anwesend: true, entschuldigt: false } },
  ], { draftKey: 'anwesenheit-erfassen' });

  const restart = () => {
    submit.reset();
    f.reset();
    setAnmeldungen([]);
    setAttendance(new Map());
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
      forms={[f]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Anwesenheit aller bestätigten Teilnehmer für eine Kursstunde festhalten.'),
        needs: [tx('Kurs'), tx('Datum der Stunde')],
      }}
    >
      {/* Schritt 1: Kurs wählen */}
      <WizardStep
        label={tx('Kurs')}
        description={tx('Nur laufende und geplante Kurse können noch Stunden haben.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={f.get('kurs') as string}
          emptyText={tx('Kein aktiver Kurs gefunden — nur Kurse mit Status Geplant oder Läuft erscheinen hier.')}
          create={false}
          onSelect={id => {
            f.set('kurs', id, kurse.labelOf(id));
            setAnmeldungen([]);
            setAttendance(new Map());
            setStep(2);
          }}
        />
      </WizardStep>

      {/* Schritt 2: Datum wählen */}
      <WizardStep
        label={tx('Stunden-Datum')}
        description={tx('An welchem Tag hat die Stunde stattgefunden?')}
      >
        {f.get('kurs') ? (
          <div className="space-y-4">
            <Field form={f} name="datum">
              <DatePicker {...f.date('datum')} />
            </Field>
            <StepNav
              onNext={() => f.validate(['datum'])}
              nextStepLabel={tx('Anwesenheitsliste')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst einen Kurs wählen.')}
          </StepNav>
        )}
      </WizardStep>

      {/* Schritt 3: Anwesenheitsliste */}
      <WizardStep
        label={tx('Anwesenheit')}
        description={tx('Für jeden Teilnehmer Anwesenheit oder Entschuldigung markieren.')}
      >
        {!f.get('kurs') || !f.get('datum') ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst Kurs und Datum wählen.')}
          </StepNav>
        ) : anmeldungenLoading ? (
          <div className="py-8 text-center text-muted-foreground">{tx('Teilnehmer werden geladen…')}</div>
        ) : anmeldungenError ? (
          <div className="py-8 text-center text-destructive">{anmeldungenError}</div>
        ) : anmeldungen.length === 0 ? (
          <div className="space-y-4">
            <p className="rounded-2xl bg-secondary px-4 py-6 text-center text-muted-foreground">
              {tx('Keine bestätigten Anmeldungen für diesen Kurs')}
            </p>
            <StepNav onBack={() => setStep(1)} nextDisabled />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-card shadow-lg overflow-hidden">
              {anmeldungen.map((a, idx) => {
                const state = attendance.get(a.teilnehmerId) ?? { anwesend: true, entschuldigt: false };
                return (
                  <div
                    key={a.teilnehmerId}
                    className={`flex items-center gap-3 px-4 py-3 ${idx < anmeldungen.length - 1 ? 'border-b' : ''}`}
                  >
                    <span className="flex-1 font-medium text-foreground">{a.name}</span>
                    <Button
                      size="sm"
                      variant={state.anwesend ? 'default' : 'outline'}
                      className="min-w-[100px]"
                      onClick={() => toggleAnwesend(a.teilnehmerId)}
                      type="button"
                    >
                      {state.anwesend ? tx('Anwesend') : tx('Abwesend')}
                    </Button>
                    <Button
                      size="sm"
                      variant={state.entschuldigt ? 'default' : 'outline'}
                      className="min-w-[110px]"
                      onClick={() => toggleEntschuldigt(a.teilnehmerId)}
                      type="button"
                    >
                      {state.entschuldigt ? tx('Entschuldigt') : tx('Unentschuldigt')}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 rounded-2xl bg-secondary px-4 py-2 text-sm text-muted-foreground">
              <span>{tx('Anwesend')}: <strong className="text-foreground">{anwesendCount}</strong></span>
              <span>{tx('Abwesend')}: <strong className="text-foreground">{abwesendCount}</strong></span>
            </div>
            <StepNav
              onNext={() => undefined}
              nextStepLabel={tx('Prüfen')}
            />
          </div>
        )}
      </WizardStep>

      {/* Schritt 4: Prüfen & anlegen */}
      <WizardStep label={tx('Prüfen')}>
        {!submit.result && (
          <SummaryStep
            forms={[f]}
            submit={submit}
            items={[
              { key: 'kurs-titel', label: tx('Kurs'), value: kursLabel, keys: ['kurs'], fieldId: 'field-kurs' },
              { key: 'anzahl-tn', label: tx('Anzahl Teilnehmer'), value: String(anmeldungen.length), keys: [], fieldId: '' },
              { key: 'anzahl-anwesend', label: tx('Anwesende'), value: String(anwesendCount), keys: [], fieldId: '' },
              { key: 'anzahl-abwesend', label: tx('Abwesende'), value: String(abwesendCount), keys: [], fieldId: '' },
            ]}
            whatHappensNext={tx('Für jeden Teilnehmer wird ein Anwesenheitseintrag angelegt.')}
          />
        )}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[f]}
          next={[
            { label: tx('Nächste Stunde erfassen'), onClick: restart },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Anwesenheitseinträge sind sofort in der Übersicht sichtbar.')}
        />
      )}
    </IntentWizardShell>
  );
}
