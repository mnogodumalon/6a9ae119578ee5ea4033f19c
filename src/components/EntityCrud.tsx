/**
 * EntityCrud — pre-generated CRUD + overlay plumbing for the dashboard.
 * Compose it; NEVER re-roll dialog state, submit handlers, an overlay stack
 * or a RecordOverlayHost in the page — this file owns all of it.
 *
 * API at a glance:
 *   const data = useDashboardData();
 *   const crud = useEntityCrud(data, {
 *     // optional — the ONE semantic slot on the overlay: the record's next
 *     // workflow step. Return undefined for types without one.
 *     footer: (top) => top.type === 'dozenten'
 *       ? { label: …, onClick: () => … }
 *       : undefined,
 *   });
 *
 *   `top.type` is the SAME camelCase key as `crud.<entity>` — one spelling
 *   per entity, everywhere in this API.
 *   …
 *   crud.dozenten.openCreate({ …defaults })   // create dialog, prefilled — defaults are
 *                                       // shape-tolerant: bare lookup keys / record ids are fine
 *   crud.dozenten.openEdit(record)            // edit dialog (recordId + defaults wired)
 *   crud.dozenten.openDetail(record)          // record overlay — pass the RAW record,
 *                                       // enrichment is resolved inside
 *   crud.overlay                         // RecordOverlayStack<OverlayItem> for drills:
 *                                       // push / pop / replace / close
 *   crud.enriched.dozenten              // the display-ready array for EVERY entity —
 *                                       // Enriched* where relations exist, the raw array
 *                                       // otherwise. Reuse these; never call enrich*()
 *                                       // in the page, and never guess which entity has
 *                                       // one: they all do.
 *   {crud.surfaces}                      // render ONCE at the end of the page JSX:
 *                                       // all entity dialogs + the overlay host
 *
 * Built in (do NOT re-implement): optimistic update + Rückgängig counter-write
 * on edit, fetchAll-on-error, edit-from-overlay, and per-entity overlay bodies
 * (RecordHeader + <{Entity}Details> with every relation reachable and the
 * contextual "+" prefilled). Drag writes (onEventDrop/onCardMove) stay YOURS:
 * optimistic setter first, PATCH in background, undoToast with counter-write.
 *
 * Overlay content per entity (the host renders these — you never compose
 * Details blocks yourself):
 *   dozenten: vorname, nachname, email, telefon, instrumente, aktiv  ·  ← kurse (list + contextual +)
 *   raeume: name, plaetze, klavier_vorhanden  ·  ← kurse (list + contextual +)
 *   kurse: titel, instrument, niveau, wochentage, dozent, raum, beginn, ende, …  ·  → dozenten · → raeume · ← anmeldungen (list + contextual +) · ← anwesenheiten (list + contextual +)
 *   teilnehmer: vorname, nachname, geburtsdatum, email, telefon, erziehungsberechtigte_person, notizen  ·  ← anmeldungen (list + contextual +) · ← anwesenheiten (list + contextual +)
 *   anmeldungen: kurs, teilnehmer, anmeldedatum, status, bezahlt, bemerkung  ·  → kurse · → teilnehmer
 *   anwesenheiten: kurs, teilnehmer, datum, anwesend, entschuldigt  ·  → kurse · → teilnehmer
 */
import { useState, useMemo, type ReactNode } from 'react';
import type { Dozenten, Raeume, Kurse, Teilnehmer, Anmeldungen, Anwesenheiten } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichKurse, enrichAnmeldungen, enrichAnwesenheiten } from '@/lib/enrich';
import type { EnrichedKurse, EnrichedAnmeldungen, EnrichedAnwesenheiten } from '@/types/enriched';
import { useDashboardData } from '@/hooks/useDashboardData';
import {
  useRecordOverlayStack, RecordOverlayHost, RecordHeader,
  type RecordOverlayStack,
} from '@/components/widgets/RecordView';
import { DozentenDialog, type DozentenDialogDefaults } from '@/components/dialogs/DozentenDialog';
import { DozentenDetails } from '@/components/details/DozentenDetails';
import { RaeumeDialog, type RaeumeDialogDefaults } from '@/components/dialogs/RaeumeDialog';
import { RaeumeDetails } from '@/components/details/RaeumeDetails';
import { KurseDialog, type KurseDialogDefaults } from '@/components/dialogs/KurseDialog';
import { KurseDetails } from '@/components/details/KurseDetails';
import { TeilnehmerDialog, type TeilnehmerDialogDefaults } from '@/components/dialogs/TeilnehmerDialog';
import { TeilnehmerDetails } from '@/components/details/TeilnehmerDetails';
import { AnmeldungenDialog, type AnmeldungenDialogDefaults } from '@/components/dialogs/AnmeldungenDialog';
import { AnmeldungenDetails } from '@/components/details/AnmeldungenDetails';
import { AnwesenheitenDialog, type AnwesenheitenDialogDefaults } from '@/components/dialogs/AnwesenheitenDialog';
import { AnwesenheitenDetails } from '@/components/details/AnwesenheitenDetails';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel } from '@/i18n';
import { undoToast } from '@/lib/polish';
import { formatDate } from '@/lib/formatters';

// The overlay union — one branch per entity, `record` typed the way the data
// flows: Enriched* where enrichment exists, the raw record type otherwise.
// The host resolves enrichment itself; pages pass raw records everywhere.
export type OverlayItem =
  | { type: 'dozenten'; record: Dozenten }
  | { type: 'raeume'; record: Raeume }
  | { type: 'kurse'; record: EnrichedKurse }
  | { type: 'teilnehmer'; record: Teilnehmer }
  | { type: 'anmeldungen'; record: EnrichedAnmeldungen }
  | { type: 'anwesenheiten'; record: EnrichedAnwesenheiten };

/** The useDashboardData() return — pass it in, never re-fetch inside. */
export type EntityCrudData = ReturnType<typeof useDashboardData>;

export interface EntityCrudOptions {
  /** Per-type overlay footer — the record's next workflow step. */
  footer?: (top: OverlayItem) => ReactNode | { label: ReactNode; onClick: () => void } | undefined;
  placement?: 'side' | 'center';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export interface EntityCrudApi<TRecord, TDefaults> {
  /** Open the create dialog, optionally prefilled (shape-tolerant defaults). */
  openCreate: (defaults?: TDefaults) => void;
  /** Open the edit dialog for a record (recordId + defaults are wired). */
  openEdit: (record: TRecord) => void;
  /** Open the record overlay (raw record is fine — enrichment resolved inside). */
  openDetail: (record: TRecord) => void;
}

export interface EntityCrud {
  /** The overlay stack for drills: push / pop / replace / close. */
  overlay: RecordOverlayStack<OverlayItem>;
  /** Render ONCE at the end of the page JSX — all dialogs + the overlay host. */
  surfaces: ReactNode;
  dozenten: EntityCrudApi<Dozenten, DozentenDialogDefaults>;
  raeume: EntityCrudApi<Raeume, RaeumeDialogDefaults>;
  kurse: EntityCrudApi<Kurse, KurseDialogDefaults>;
  teilnehmer: EntityCrudApi<Teilnehmer, TeilnehmerDialogDefaults>;
  anmeldungen: EntityCrudApi<Anmeldungen, AnmeldungenDialogDefaults>;
  anwesenheiten: EntityCrudApi<Anwesenheiten, AnwesenheitenDialogDefaults>;
  /** The display-ready array per entity: Enriched* where an enrich function
   *  exists, the raw array otherwise. One key per entity so no page has to
   *  know which is which. Reuse these; never re-enrich in the page. */
  enriched: { dozenten: Dozenten[]; raeume: Raeume[]; kurse: EnrichedKurse[]; teilnehmer: Teilnehmer[]; anmeldungen: EnrichedAnmeldungen[]; anwesenheiten: EnrichedAnwesenheiten[] };
}

export function useEntityCrud(data: EntityCrudData, options?: EntityCrudOptions): EntityCrud {
  const overlay = useRecordOverlayStack<OverlayItem>();
  const [dozentenDialog, setDozentenDialog] = useState<{ defaults?: DozentenDialogDefaults; editing?: Dozenten } | null>(null);
  const [raeumeDialog, setRaeumeDialog] = useState<{ defaults?: RaeumeDialogDefaults; editing?: Raeume } | null>(null);
  const [kurseDialog, setKurseDialog] = useState<{ defaults?: KurseDialogDefaults; editing?: Kurse } | null>(null);
  const [teilnehmerDialog, setTeilnehmerDialog] = useState<{ defaults?: TeilnehmerDialogDefaults; editing?: Teilnehmer } | null>(null);
  const [anmeldungenDialog, setAnmeldungenDialog] = useState<{ defaults?: AnmeldungenDialogDefaults; editing?: Anmeldungen } | null>(null);
  const [anwesenheitenDialog, setAnwesenheitenDialog] = useState<{ defaults?: AnwesenheitenDialogDefaults; editing?: Anwesenheiten } | null>(null);
  const enrichedKurse = useMemo(() => enrichKurse(data.kurse, { dozentenMap: data.dozentenMap, raeumeMap: data.raeumeMap }), [data.kurse, data.dozentenMap, data.raeumeMap]);
  const enrichedAnmeldungen = useMemo(() => enrichAnmeldungen(data.anmeldungen, { kurseMap: data.kurseMap, teilnehmerMap: data.teilnehmerMap }), [data.anmeldungen, data.kurseMap, data.teilnehmerMap]);
  const enrichedAnwesenheiten = useMemo(() => enrichAnwesenheiten(data.anwesenheiten, { kurseMap: data.kurseMap, teilnehmerMap: data.teilnehmerMap }), [data.anwesenheiten, data.kurseMap, data.teilnehmerMap]);

  function detailDozenten(record: Dozenten, push = false) {
    const item: OverlayItem = { type: 'dozenten', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitDozenten(fields: Dozenten['fields']) {
    const editing = dozentenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setDozenten(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateDozentenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('dozenten')} — ${t('crud_updated')}`, async () => {
        data.setDozenten(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateDozentenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createDozentenEntry(fields);
      undoToast(`${appLabel('dozenten')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailRaeume(record: Raeume, push = false) {
    const item: OverlayItem = { type: 'raeume', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitRaeume(fields: Raeume['fields']) {
    const editing = raeumeDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setRaeume(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateRaeumeEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('raeume')} — ${t('crud_updated')}`, async () => {
        data.setRaeume(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateRaeumeEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createRaeumeEntry(fields);
      undoToast(`${appLabel('raeume')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailKurse(record: Kurse, push = false) {
    const rec = enrichedKurse.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'kurse', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitKurse(fields: Kurse['fields']) {
    const editing = kurseDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setKurse(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateKurseEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('kurse')} — ${t('crud_updated')}`, async () => {
        data.setKurse(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateKurseEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createKurseEntry(fields);
      undoToast(`${appLabel('kurse')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailTeilnehmer(record: Teilnehmer, push = false) {
    const item: OverlayItem = { type: 'teilnehmer', record };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitTeilnehmer(fields: Teilnehmer['fields']) {
    const editing = teilnehmerDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setTeilnehmer(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateTeilnehmerEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('teilnehmer')} — ${t('crud_updated')}`, async () => {
        data.setTeilnehmer(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateTeilnehmerEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createTeilnehmerEntry(fields);
      undoToast(`${appLabel('teilnehmer')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailAnmeldungen(record: Anmeldungen, push = false) {
    const rec = enrichedAnmeldungen.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'anmeldungen', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitAnmeldungen(fields: Anmeldungen['fields']) {
    const editing = anmeldungenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setAnmeldungen(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateAnmeldungenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('anmeldungen')} — ${t('crud_updated')}`, async () => {
        data.setAnmeldungen(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateAnmeldungenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createAnmeldungenEntry(fields);
      undoToast(`${appLabel('anmeldungen')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  function detailAnwesenheiten(record: Anwesenheiten, push = false) {
    const rec = enrichedAnwesenheiten.find(r => r.record_id === record.record_id);
    if (!rec) return;
    const item: OverlayItem = { type: 'anwesenheiten', record: rec };
    if (push) overlay.push(item); else overlay.replace(item);
  }

  async function submitAnwesenheiten(fields: Anwesenheiten['fields']) {
    const editing = anwesenheitenDialog?.editing;
    if (editing) {
      const prev = editing;
      data.setAnwesenheiten(list => list.map(r => (r.record_id === editing.record_id ? { ...r, fields } : r)));
      try {
        await LivingAppsService.updateAnwesenheitenEntry(editing.record_id, fields);
      } catch (err) {
        data.fetchAll();
        throw err;
      }
      undoToast(`${appLabel('anwesenheiten')} — ${t('crud_updated')}`, async () => {
        data.setAnwesenheiten(list => list.map(r => (r.record_id === prev.record_id ? prev : r)));
        try { await LivingAppsService.updateAnwesenheitenEntry(prev.record_id, prev.fields); } catch { data.fetchAll(); }
      });
    } else {
      await LivingAppsService.createAnwesenheitenEntry(fields);
      undoToast(`${appLabel('anwesenheiten')} — ${t('crud_created')}`);
      data.fetchAll();
    }
  }

  const surfaces = (
    <>
      <DozentenDialog
        open={dozentenDialog !== null}
        onClose={() => setDozentenDialog(null)}
        onSubmit={submitDozenten}
        defaultValues={dozentenDialog?.defaults}
        recordId={dozentenDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Dozenten']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Dozenten']}
      />
      <RaeumeDialog
        open={raeumeDialog !== null}
        onClose={() => setRaeumeDialog(null)}
        onSubmit={submitRaeume}
        defaultValues={raeumeDialog?.defaults}
        recordId={raeumeDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Raeume']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Raeume']}
      />
      <KurseDialog
        open={kurseDialog !== null}
        onClose={() => setKurseDialog(null)}
        onSubmit={submitKurse}
        defaultValues={kurseDialog?.defaults}
        recordId={kurseDialog?.editing?.record_id}
        dozentenList={data.dozenten}
        raeumeList={data.raeume}
        enablePhotoScan={AI_PHOTO_SCAN['Kurse']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kurse']}
      />
      <TeilnehmerDialog
        open={teilnehmerDialog !== null}
        onClose={() => setTeilnehmerDialog(null)}
        onSubmit={submitTeilnehmer}
        defaultValues={teilnehmerDialog?.defaults}
        recordId={teilnehmerDialog?.editing?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Teilnehmer']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Teilnehmer']}
      />
      <AnmeldungenDialog
        open={anmeldungenDialog !== null}
        onClose={() => setAnmeldungenDialog(null)}
        onSubmit={submitAnmeldungen}
        defaultValues={anmeldungenDialog?.defaults}
        recordId={anmeldungenDialog?.editing?.record_id}
        kurseList={data.kurse}
        teilnehmerList={data.teilnehmer}
        enablePhotoScan={AI_PHOTO_SCAN['Anmeldungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Anmeldungen']}
      />
      <AnwesenheitenDialog
        open={anwesenheitenDialog !== null}
        onClose={() => setAnwesenheitenDialog(null)}
        onSubmit={submitAnwesenheiten}
        defaultValues={anwesenheitenDialog?.defaults}
        recordId={anwesenheitenDialog?.editing?.record_id}
        kurseList={data.kurse}
        teilnehmerList={data.teilnehmer}
        enablePhotoScan={AI_PHOTO_SCAN['Anwesenheiten']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Anwesenheiten']}
      />
      <RecordOverlayHost
        overlay={overlay}
        placement={options?.placement}
        size={options?.size}
        footer={options?.footer}
        render={(top) => {
          if (top.type === 'dozenten') {
            return (
              <>
                <RecordHeader title={top.record.fields.vorname ?? appLabel('dozenten')} subtitle={undefined} />
                <DozentenDetails
                  record={top.record}
                  kurseList={data.kurse}
                  onOpenKurse={(r) => detailKurse(r, true)}
                  onAddKurse={() => setKurseDialog({ defaults: { dozent: createRecordUrl(APP_IDS.DOZENTEN, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'raeume') {
            return (
              <>
                <RecordHeader title={top.record.fields.name ?? appLabel('raeume')} subtitle={undefined} />
                <RaeumeDetails
                  record={top.record}
                  kurseList={data.kurse}
                  onOpenKurse={(r) => detailKurse(r, true)}
                  onAddKurse={() => setKurseDialog({ defaults: { raum: createRecordUrl(APP_IDS.RAEUME, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'kurse') {
            return (
              <>
                <RecordHeader title={top.record.fields.titel ?? appLabel('kurse')} subtitle={top.record.fields.beginn ? formatDate(top.record.fields.beginn) : undefined} />
                <KurseDetails
                  record={top.record}
                  dozentenList={data.dozenten}
                  onOpenDozenten={(r) => detailDozenten(r, true)}
                  raeumeList={data.raeume}
                  onOpenRaeume={(r) => detailRaeume(r, true)}
                  anmeldungenList={data.anmeldungen}
                  onOpenAnmeldungen={(r) => detailAnmeldungen(r, true)}
                  onAddAnmeldungen={() => setAnmeldungenDialog({ defaults: { kurs: createRecordUrl(APP_IDS.KURSE, top.record.record_id) } })}
                  anwesenheitenList={data.anwesenheiten}
                  onOpenAnwesenheiten={(r) => detailAnwesenheiten(r, true)}
                  onAddAnwesenheiten={() => setAnwesenheitenDialog({ defaults: { kurs: createRecordUrl(APP_IDS.KURSE, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'teilnehmer') {
            return (
              <>
                <RecordHeader title={top.record.fields.vorname ?? appLabel('teilnehmer')} subtitle={top.record.fields.geburtsdatum ? formatDate(top.record.fields.geburtsdatum) : undefined} />
                <TeilnehmerDetails
                  record={top.record}
                  anmeldungenList={data.anmeldungen}
                  onOpenAnmeldungen={(r) => detailAnmeldungen(r, true)}
                  onAddAnmeldungen={() => setAnmeldungenDialog({ defaults: { teilnehmer: createRecordUrl(APP_IDS.TEILNEHMER, top.record.record_id) } })}
                  anwesenheitenList={data.anwesenheiten}
                  onOpenAnwesenheiten={(r) => detailAnwesenheiten(r, true)}
                  onAddAnwesenheiten={() => setAnwesenheitenDialog({ defaults: { teilnehmer: createRecordUrl(APP_IDS.TEILNEHMER, top.record.record_id) } })}
                />
              </>
            );
          }
          if (top.type === 'anmeldungen') {
            return (
              <>
                <RecordHeader title={appLabel('anmeldungen')} subtitle={top.record.fields.anmeldedatum ? formatDate(top.record.fields.anmeldedatum) : undefined} />
                <AnmeldungenDetails
                  record={top.record}
                  kurseList={data.kurse}
                  onOpenKurse={(r) => detailKurse(r, true)}
                  teilnehmerList={data.teilnehmer}
                  onOpenTeilnehmer={(r) => detailTeilnehmer(r, true)}
                />
              </>
            );
          }
          if (top.type === 'anwesenheiten') {
            return (
              <>
                <RecordHeader title={appLabel('anwesenheiten')} subtitle={top.record.fields.datum ? formatDate(top.record.fields.datum) : undefined} />
                <AnwesenheitenDetails
                  record={top.record}
                  kurseList={data.kurse}
                  onOpenKurse={(r) => detailKurse(r, true)}
                  teilnehmerList={data.teilnehmer}
                  onOpenTeilnehmer={(r) => detailTeilnehmer(r, true)}
                />
              </>
            );
          }
          return null;
        }}
        onEdit={(top) => {
          overlay.close();
          if (top.type === 'dozenten') setDozentenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'raeume') setRaeumeDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'kurse') setKurseDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'teilnehmer') setTeilnehmerDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'anmeldungen') setAnmeldungenDialog({ editing: top.record, defaults: top.record.fields });
          if (top.type === 'anwesenheiten') setAnwesenheitenDialog({ editing: top.record, defaults: top.record.fields });
        }}
      />
    </>
  );

  return {
    overlay,
    surfaces,
    dozenten: {
      openCreate: (defaults?: DozentenDialogDefaults) => setDozentenDialog({ defaults }),
      openEdit: (record: Dozenten) => setDozentenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Dozenten) => detailDozenten(record, false),
    },
    raeume: {
      openCreate: (defaults?: RaeumeDialogDefaults) => setRaeumeDialog({ defaults }),
      openEdit: (record: Raeume) => setRaeumeDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Raeume) => detailRaeume(record, false),
    },
    kurse: {
      openCreate: (defaults?: KurseDialogDefaults) => setKurseDialog({ defaults }),
      openEdit: (record: Kurse) => setKurseDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Kurse) => detailKurse(record, false),
    },
    teilnehmer: {
      openCreate: (defaults?: TeilnehmerDialogDefaults) => setTeilnehmerDialog({ defaults }),
      openEdit: (record: Teilnehmer) => setTeilnehmerDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Teilnehmer) => detailTeilnehmer(record, false),
    },
    anmeldungen: {
      openCreate: (defaults?: AnmeldungenDialogDefaults) => setAnmeldungenDialog({ defaults }),
      openEdit: (record: Anmeldungen) => setAnmeldungenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Anmeldungen) => detailAnmeldungen(record, false),
    },
    anwesenheiten: {
      openCreate: (defaults?: AnwesenheitenDialogDefaults) => setAnwesenheitenDialog({ defaults }),
      openEdit: (record: Anwesenheiten) => setAnwesenheitenDialog({ editing: record, defaults: record.fields }),
      openDetail: (record: Anwesenheiten) => detailAnwesenheiten(record, false),
    },
    enriched: { dozenten: data.dozenten, raeume: data.raeume, kurse: enrichedKurse, teilnehmer: data.teilnehmer, anmeldungen: enrichedAnmeldungen, anwesenheiten: enrichedAnwesenheiten },
  };
}
