/**
 * Anwesenheit erfassen — 5-Schritt-Wizard.
 * Steps: 1) Kurs wählen → 2) Datum der Stunde → 3) Anwesenheitsliste → 4) Zusammenfassung → 5) Erfolg.
 * Reads: kurse (gefiltert: geplant/laeuft), anmeldungen (gefiltert: neu/bestaetigt).
 * Writes: anwesenheiten (createAnwesenheitenEntry) — N Einträge, einer pro Schüler.
 * Composes: IntentWizardShell, WizardStep, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { Field } from '@/components/blocks/Field';
import {
  useStepForm,
  useJourneySubmit,
  useRecordSearch,
  todayIso,
  fieldText,
  fieldLookup,
  fieldRef,
  refFilter,
} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { APP_IDS } from '@/types/app';
import { tx } from '@/i18n';
import { DatePicker } from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';

interface AnwesenheitsZeile {
  teilnehmerId: string;
  name: string;
  anwesend: boolean;
  entschuldigt: boolean;
}

export default function AnwesenheitErfassenPage() {
  const [step, setStep] = useState(1);
  const [anwesenheitsListe, setAnwesenheitsListe] = useState<AnwesenheitsZeile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const kurse = useRecordSearch(servicePort, 'kurse', {
    filter: "r.v_status == 'geplant' or r.v_status == 'laeuft'",
    where: r => ['geplant', 'laeuft'].includes(fieldLookup(r, 'status')?.key ?? ''),
    searchFields: ['titel'],
    toItem: k => ({
      id: k.id,
      title: fieldText(k, 'titel'),
      subtitle: [
        (k.fields['wochentage'] as Array<{ key: string; label: string }> | undefined)
          ?.map(w => w.label).join(', ') ?? '',
        fieldText(k, 'uhrzeit')
          ? format(new Date(fieldText(k, 'uhrzeit')), 'HH:mm') + ' Uhr'
          : '',
      ].filter(Boolean).join(' · '),
      status: fieldLookup(k, 'status') ?? undefined,
    }),
  });

  const datumForm = useStepForm('anwesenheiten', {
    steps: { datum: 2 },
    initial: { datum: todayIso() },
  });

  const kursId = datumForm.get('kurs') as string | undefined;
  const kursName = datumForm.get('kursName') as string | undefined;
  const datum = datumForm.get('datum') as string | undefined;

  const ladeAnmeldungen = async (selectedKursId: string) => {
    setListLoading(true);
    setListError(null);
    try {
      const anmeldungen = await servicePort.list('anmeldungen', {
        filter: refFilter('kurs', selectedKursId),
      });
      const aktive = anmeldungen.filter(a => {
        const statusKey = fieldLookup(a, 'status')?.key ?? '';
        return ['neu', 'bestaetigt'].includes(statusKey);
      });
      const zeilen: AnwesenheitsZeile[] = [];
      for (const a of aktive) {
        const teilnehmerId = fieldRef(a, 'teilnehmer') ?? '';
        if (!teilnehmerId) continue;
        const tnRecord = await servicePort.get('teilnehmer', teilnehmerId);
        const name = tnRecord
          ? `${fieldText(tnRecord, 'vorname')} ${fieldText(tnRecord, 'nachname')}`.trim()
          : teilnehmerId;
        zeilen.push({ teilnehmerId, name, anwesend: true, entschuldigt: false });
      }
      setAnwesenheitsListe(zeilen);
    } catch {
      setListError(tx('Anmeldungen konnten nicht geladen werden.'));
    } finally {
      setListLoading(false);
    }
  };

  const plan = (anwesenheitsListe.length > 0 && kursId && datum)
    ? anwesenheitsListe.map(z => ({
        key: `anwesenheit-${z.teilnehmerId}`,
        entity: 'anwesenheiten' as const,
        values: {
          kurs: kursId,
          teilnehmer: z.teilnehmerId,
          datum,
          anwesend: z.anwesend,
          entschuldigt: z.entschuldigt,
        },
      }))
    : [];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'anwesenheit-erfassen' });

  const anwesendCount = anwesenheitsListe.filter(z => z.anwesend).length;
  const entschuldigtCount = anwesenheitsListe.filter(z => z.entschuldigt).length;

  const toggleAnwesend = (teilnehmerId: string) => {
    setAnwesenheitsListe(prev =>
      prev.map(z =>
        z.teilnehmerId === teilnehmerId
          ? { ...z, anwesend: !z.anwesend, entschuldigt: !z.anwesend ? false : z.entschuldigt }
          : z
      )
    );
  };

  const toggleEntschuldigt = (teilnehmerId: string) => {
    setAnwesenheitsListe(prev =>
      prev.map(z =>
        z.teilnehmerId === teilnehmerId
          ? { ...z, entschuldigt: !z.entschuldigt, anwesend: !z.entschuldigt ? false : z.anwesend }
          : z
      )
    );
  };

  const summaryItems = [
    {
      key: 'kursName',
      label: tx('Kurs'),
      value: kursName ?? '',
      step: 1,
      keys: ['kurs'],
      fieldId: datumForm.fieldId('kurs'),
    },
    {
      key: 'datum',
      label: tx('Datum'),
      value: datum ?? '',
      step: 2,
      keys: ['datum'],
      fieldId: datumForm.fieldId('datum'),
    },
    {
      key: 'anzahl',
      label: tx('Schüler'),
      value: String(anwesenheitsListe.length),
      keys: ['_anzahl'],
      fieldId: 'anzahl-schueler',
    },
  ];

  return (
    <IntentWizardShell
      title={tx('Anwesenheit erfassen')}
      currentStep={step}
      onStepChange={setStep}
      forms={[datumForm]}
      draftKey="anwesenheit-erfassen"
      intro={{
        description: tx('Für eine Kursstunde die Anwesenheit aller angemeldeten Schüler erfassen.'),
        needs: [tx('Kurs auswählen'), tx('Datum der Stunde'), tx('Anwesenheit pro Schüler')],
      }}
    >
      <WizardStep
        label={tx('Kurs')}
        description={tx('Kurs wählen, für den die Anwesenheit erfasst werden soll.')}
      >
        <EntitySelectStep
          {...kurse.select}
          selectedId={kursId}
          emptyText={tx('Kein aktiver Kurs gefunden. Nur Kurse mit Status „Geplant" oder „Läuft" sind wählbar.')}
          create={false}
          onSelect={id => {
            datumForm.set('kurs', id, kurse.labelOf(id));
            datumForm.set('kursName', kurse.labelOf(id));
            void ladeAnmeldungen(id);
            setStep(2);
          }}
        />
      </WizardStep>

      <WizardStep
        label={tx('Datum')}
        description={tx('Datum der Unterrichtsstunde angeben.')}
      >
        {kursId ? (
          <div className="space-y-4">
            <Field form={datumForm} name="datum">
              <DatePicker {...datumForm.date('datum')} />
            </Field>
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => {
                const result = datumForm.validate(['datum']);
                if (result !== true) return result;
                setStep(3);
              }}
              nextStepLabel={tx('Anwesenheit')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Bitte zuerst einen Kurs auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep
        label={tx('Anwesenheitsliste')}
        description={tx('Anwesenheit und Entschuldigung für jeden Schüler festhalten.')}
      >
        {datum ? (
          <div className="space-y-4">
            {listLoading && (
              <p className="text-sm text-muted-foreground">{tx('Schüler werden geladen…')}</p>
            )}
            {listError && (
              <p className="text-sm text-destructive">{listError}</p>
            )}
            {!listLoading && !listError && anwesenheitsListe.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {tx('Keine angemeldeten Schüler für diesen Kurs gefunden.')}
              </p>
            )}
            {!listLoading && anwesenheitsListe.length > 0 && (
              <div className="rounded-2xl border bg-card shadow-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                  <span>{tx('Schüler')}</span>
                  <span className="text-center w-20">{tx('Anwesend')}</span>
                  <span className="text-center w-20">{tx('Entschuldigt')}</span>
                </div>
                {anwesenheitsListe.map(z => (
                  <div
                    key={z.teilnehmerId}
                    className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-4 py-3 border-b last:border-b-0"
                  >
                    <span className="text-sm font-medium text-foreground">{z.name}</span>
                    <div className="flex justify-center w-20">
                      <Checkbox
                        checked={z.anwesend}
                        onCheckedChange={() => toggleAnwesend(z.teilnehmerId)}
                        aria-label={tx`${z.name} anwesend`}
                      />
                    </div>
                    <div className="flex justify-center w-20">
                      <Checkbox
                        checked={z.entschuldigt}
                        onCheckedChange={() => toggleEntschuldigt(z.teilnehmerId)}
                        aria-label={tx`${z.name} entschuldigt`}
                      />
                    </div>
                  </div>
                ))}
                <div className="px-4 py-2 bg-secondary text-xs text-muted-foreground flex gap-4">
                  <span>{tx`${anwesendCount} anwesend`}</span>
                  <span>{tx`${entschuldigtCount} entschuldigt`}</span>
                </div>
              </div>
            )}
            <StepNav
              onBack={() => setStep(2)}
              onNext={() => {
                if (anwesenheitsListe.length === 0) {
                  return tx('Es sind keine Schüler in der Liste.');
                }
                setStep(4);
              }}
              nextStepLabel={tx('Zusammenfassung')}
            />
          </div>
        ) : (
          <StepNav onBack={() => setStep(2)} nextDisabled>
            {tx('Bitte zuerst ein Datum auswählen.')}
          </StepNav>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')}>
        {!submit.done ? (
          <SummaryStep
            forms={[datumForm]}
            submit={submit}
            items={summaryItems}
            whatHappensNext={tx('Für jeden Schüler wird ein Anwesenheitseintrag angelegt.')}
          />
        ) : null}
      </WizardStep>

      {submit.result && (
        <SuccessStep
          result={submit.result}
          forms={[datumForm]}
          next={[
            {
              label: tx('Weitere Stunde erfassen'),
              onClick: () => {
                submit.reset();
                datumForm.reset();
                setAnwesenheitsListe([]);
                setStep(1);
              },
            },
            { label: tx('Schüler anmelden'), href: '#/intents/schueler-anmelden' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
          whatHappensNext={tx('Die Anwesenheiten sind sofort in der Übersicht sichtbar.')}
        />
      )}
    </IntentWizardShell>
  );
}
