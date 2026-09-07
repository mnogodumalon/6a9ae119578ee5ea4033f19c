/**
 * The INTERNAL door of the journey port — authenticated, via LivingAppsService.
 * GENERATED: one lister and one creator per entity. Do not edit.
 *
 *   import { servicePort } from '@/services/journeyPort';
 *
 * Intent pages hand this to `useJourneySubmit` and to shared step blocks. It
 * exposes only list · create · ref — the public subset — so a step written
 * against it also runs on a public page. Undo, edit and delete stay on the
 * page itself (LivingAppsService), never inside a shared step.
 */
import { LivingAppsService, createRecordUrl, type RecordQuery } from '@/services/livingAppsService';
import { toWirePayload, type InternalJourneyPort, type JourneyRecord } from '@/lib/journey/port';
import { buildSearchFilter, byIdFilter, combineFilters } from '@/lib/journey/search';
import type { EntityKey } from '@/lib/journey/rules';

type RawRecord = { record_id: string; fields: Record<string, unknown>; createdat?: string | null };
type RawMutation = { record_id: string; fields?: Record<string, unknown>; created_at?: string | null };

const listers: Record<EntityKey, () => Promise<RawRecord[]>> = {
  'dozenten': () => LivingAppsService.getDozenten() as Promise<RawRecord[]>,
  'raeume': () => LivingAppsService.getRaeume() as Promise<RawRecord[]>,
  'kurse': () => LivingAppsService.getKurse() as Promise<RawRecord[]>,
  'teilnehmer': () => LivingAppsService.getTeilnehmer() as Promise<RawRecord[]>,
  'anmeldungen': () => LivingAppsService.getAnmeldungen() as Promise<RawRecord[]>,
  'anwesenheiten': () => LivingAppsService.getAnwesenheiten() as Promise<RawRecord[]>,
};

/** The query/count half — the REST parameters the plain listers never send. */
const queriers: Record<EntityKey, (q: RecordQuery) => Promise<RawRecord[]>> = {
  'dozenten': q => LivingAppsService.queryDozenten(q) as Promise<RawRecord[]>,
  'raeume': q => LivingAppsService.queryRaeume(q) as Promise<RawRecord[]>,
  'kurse': q => LivingAppsService.queryKurse(q) as Promise<RawRecord[]>,
  'teilnehmer': q => LivingAppsService.queryTeilnehmer(q) as Promise<RawRecord[]>,
  'anmeldungen': q => LivingAppsService.queryAnmeldungen(q) as Promise<RawRecord[]>,
  'anwesenheiten': q => LivingAppsService.queryAnwesenheiten(q) as Promise<RawRecord[]>,
};

const counters: Record<EntityKey, (filter?: string, signal?: AbortSignal) => Promise<number>> = {
  'dozenten': (filter, signal) => LivingAppsService.countDozenten(filter, signal),
  'raeume': (filter, signal) => LivingAppsService.countRaeume(filter, signal),
  'kurse': (filter, signal) => LivingAppsService.countKurse(filter, signal),
  'teilnehmer': (filter, signal) => LivingAppsService.countTeilnehmer(filter, signal),
  'anmeldungen': (filter, signal) => LivingAppsService.countAnmeldungen(filter, signal),
  'anwesenheiten': (filter, signal) => LivingAppsService.countAnwesenheiten(filter, signal),
};

const creators: Record<EntityKey, (fields: Record<string, unknown>) => Promise<RawMutation>> = {
  'dozenten': fields => LivingAppsService.createDozentenEntry(fields as never),
  'raeume': fields => LivingAppsService.createRaeumeEntry(fields as never),
  'kurse': fields => LivingAppsService.createKurseEntry(fields as never),
  'teilnehmer': fields => LivingAppsService.createTeilnehmerEntry(fields as never),
  'anmeldungen': fields => LivingAppsService.createAnmeldungenEntry(fields as never),
  'anwesenheiten': fields => LivingAppsService.createAnwesenheitenEntry(fields as never),
};

const updaters: Record<EntityKey, (id: string, fields: Record<string, unknown>) => Promise<RawMutation>> = {
  'dozenten': (id, fields) => LivingAppsService.updateDozentenEntry(id, fields as never),
  'raeume': (id, fields) => LivingAppsService.updateRaeumeEntry(id, fields as never),
  'kurse': (id, fields) => LivingAppsService.updateKurseEntry(id, fields as never),
  'teilnehmer': (id, fields) => LivingAppsService.updateTeilnehmerEntry(id, fields as never),
  'anmeldungen': (id, fields) => LivingAppsService.updateAnmeldungenEntry(id, fields as never),
  'anwesenheiten': (id, fields) => LivingAppsService.updateAnwesenheitenEntry(id, fields as never),
};

function toJourneyRecord(r: RawRecord): JourneyRecord {
  return { id: r.record_id, fields: r.fields ?? {}, createdAt: r.createdat ?? null };
}

export const servicePort: InternalJourneyPort = {
  door: 'internal',
  async list(entity, opts) {
    // Only a bare list(entity) (or an empty options object) takes the historic
    // load-everything path. ANY explicit option — `limit` included — goes to the
    // server: useRecordSearch's first page of a big entity must not pull the
    // whole table (live 2026-09-02: all 263 employees travelled for a limit-50
    // first page because `limit` alone did not count as a query).
    const usesQuery = !!opts && (opts.search !== undefined || opts.offset !== undefined
      || opts.orderby !== undefined || opts.fields !== undefined || opts.signal !== undefined
      || opts.limit !== undefined || opts.filter !== undefined);
    if (!usesQuery) {
      const rows = await listers[entity]();
      const limited = opts?.limit ? rows.slice(0, opts.limit) : rows;
      return limited.map(toJourneyRecord);
    }
    const filter = combineFilters(opts.filter, opts.search ? buildSearchFilter(opts.search.query, opts.search.fields) : undefined);
    const rows = await queriers[entity]({
      filter, orderby: opts.orderby, limit: opts.limit, offset: opts.offset, fields: opts.fields, signal: opts.signal,
    });
    return rows.map(toJourneyRecord);
  },
  async count(entity, opts) {
    const filter = combineFilters(opts?.filter, opts?.search ? buildSearchFilter(opts.search.query, opts.search.fields) : undefined);
    return counters[entity](filter, opts?.signal);
  },
  async get(entity, id) {
    // One query on the server, not the whole table: `r.id` is the vSQL name
    // of the record id (a live page wrote `r.record_id` and got a 400).
    const rows = await queriers[entity]({ filter: byIdFilter(id), limit: 1 });
    return rows[0] ? toJourneyRecord(rows[0]) : null;
  },
  async create(entity, values) {
    const r = await creators[entity](toWirePayload(entity, values, servicePort));
    return { id: r.record_id, fields: r.fields ?? {}, createdAt: r.created_at ?? null };
  },
  // The same payload rules as create — plain ids in, references shaped here.
  async update(entity, id, values) {
    const r = await updaters[entity](id, toWirePayload(entity, values, servicePort));
    return { id: r.record_id || id, fields: r.fields ?? {}, createdAt: r.created_at ?? null };
  },
  ref: (appId, recordId) => createRecordUrl(appId, recordId),
};
