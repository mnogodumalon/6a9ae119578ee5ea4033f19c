import type { EnrichedAnmeldungen, EnrichedAnwesenheiten, EnrichedKurse } from '@/types/enriched';
import type { Anmeldungen, Anwesenheiten, Dozenten, Kurse, Raeume, Teilnehmer } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface KurseMaps {
  dozentenMap: Map<string, Dozenten>;
  raeumeMap: Map<string, Raeume>;
}

export function enrichKurse(
  kurse: Kurse[],
  maps: KurseMaps
): EnrichedKurse[] {
  return kurse.map(r => ({
    ...r,
    dozentName: resolveDisplay(r.fields.dozent, maps.dozentenMap, 'vorname', 'nachname'),
    raumName: resolveDisplay(r.fields.raum, maps.raeumeMap, 'name'),
  }));
}

interface AnmeldungenMaps {
  kurseMap: Map<string, Kurse>;
  teilnehmerMap: Map<string, Teilnehmer>;
}

export function enrichAnmeldungen(
  anmeldungen: Anmeldungen[],
  maps: AnmeldungenMaps
): EnrichedAnmeldungen[] {
  return anmeldungen.map(r => ({
    ...r,
    kursName: resolveDisplay(r.fields.kurs, maps.kurseMap, 'titel'),
    teilnehmerName: resolveDisplay(r.fields.teilnehmer, maps.teilnehmerMap, 'vorname', 'nachname'),
  }));
}

interface AnwesenheitenMaps {
  kurseMap: Map<string, Kurse>;
  teilnehmerMap: Map<string, Teilnehmer>;
}

export function enrichAnwesenheiten(
  anwesenheiten: Anwesenheiten[],
  maps: AnwesenheitenMaps
): EnrichedAnwesenheiten[] {
  return anwesenheiten.map(r => ({
    ...r,
    kursName: resolveDisplay(r.fields.kurs, maps.kurseMap, 'titel'),
    teilnehmerName: resolveDisplay(r.fields.teilnehmer, maps.teilnehmerMap, 'vorname', 'nachname'),
  }));
}
