import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
/** A raw record URL (applookup reference). NEVER render this directly
 *  in JSX — it is a URL, not a display value. Show the enriched `*Name`
 *  field or resolve it via the entity map instead. Assignable to/from
 *  string everywhere; the `& {}` keeps the alias NAME visible in tsc
 *  error messages (a plain primitive alias gets normalized away). */
export type RecordUrl = string & {};
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Dozenten {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    email?: string;
    telefon?: string;
    instrumente?: string;
    aktiv?: boolean;
  };
}

export interface Raeume {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    name?: string;
    plaetze?: number;
    klavier_vorhanden?: boolean;
  };
}

export interface Kurse {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    instrument?: LookupValue;
    niveau?: LookupValue;
    wochentage?: LookupValue[];
    dozent?: RecordUrl; // applookup -> URL zu 'Dozenten' Record
    raum?: RecordUrl; // applookup -> URL zu 'Raeume' Record
    beginn?: string; // Format: YYYY-MM-DD oder ISO String
    ende?: string; // Format: YYYY-MM-DD oder ISO String
    uhrzeit?: string; // Format: YYYY-MM-DD oder ISO String
    maximale_teilnehmer?: number;
    preis?: number;
    status?: LookupValue;
  };
}

export interface Teilnehmer {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    geburtsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    email?: string;
    telefon?: string;
    erziehungsberechtigte_person?: string;
    notizen?: string;
  };
}

export interface Anmeldungen {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    kurs?: RecordUrl; // applookup -> URL zu 'Kurse' Record
    teilnehmer?: RecordUrl; // applookup -> URL zu 'Teilnehmer' Record
    anmeldedatum?: string; // Format: YYYY-MM-DD oder ISO String
    status?: LookupValue;
    bezahlt?: boolean;
    bemerkung?: string;
  };
}

export interface Anwesenheiten {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    kurs?: RecordUrl; // applookup -> URL zu 'Kurse' Record
    teilnehmer?: RecordUrl; // applookup -> URL zu 'Teilnehmer' Record
    datum?: string; // Format: YYYY-MM-DD oder ISO String
    anwesend?: boolean;
    entschuldigt?: boolean;
  };
}

export const APP_IDS = {
  DOZENTEN: '6a9ae0d5d12309fd2a39c8d5',
  RAEUME: '6a9ae0da768aca3c20fc6276',
  KURSE: '6a9ae0da29ba5927e215786b',
  TEILNEHMER: '6a9ae0db56e49f03519378d8',
  ANMELDUNGEN: '6a9ae0db0ae4338ee1e48cd2',
  ANWESENHEITEN: '6a9ae0dc45c8112648b97d7a',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'kurse': {
    instrument: [{ key: "klavier", get label() { return lookupLabel('kurse', 'instrument', "klavier") ?? "Klavier"; } }, { key: "gitarre", get label() { return lookupLabel('kurse', 'instrument', "gitarre") ?? "Gitarre"; } }, { key: "violine", get label() { return lookupLabel('kurse', 'instrument', "violine") ?? "Violine"; } }, { key: "cello", get label() { return lookupLabel('kurse', 'instrument', "cello") ?? "Cello"; } }, { key: "querfloete", get label() { return lookupLabel('kurse', 'instrument', "querfloete") ?? "Querflöte"; } }, { key: "klarinette", get label() { return lookupLabel('kurse', 'instrument', "klarinette") ?? "Klarinette"; } }, { key: "schlagzeug", get label() { return lookupLabel('kurse', 'instrument', "schlagzeug") ?? "Schlagzeug"; } }, { key: "gesang", get label() { return lookupLabel('kurse', 'instrument', "gesang") ?? "Gesang"; } }, { key: "blockfloete", get label() { return lookupLabel('kurse', 'instrument', "blockfloete") ?? "Blockflöte"; } }],
    niveau: [{ key: "anfaenger", get label() { return lookupLabel('kurse', 'niveau', "anfaenger") ?? "Anfänger"; } }, { key: "fortgeschritten", get label() { return lookupLabel('kurse', 'niveau', "fortgeschritten") ?? "Fortgeschritten"; } }, { key: "profi", get label() { return lookupLabel('kurse', 'niveau', "profi") ?? "Profi"; } }],
    wochentage: [{ key: "montag", get label() { return lookupLabel('kurse', 'wochentage', "montag") ?? "Montag"; } }, { key: "dienstag", get label() { return lookupLabel('kurse', 'wochentage', "dienstag") ?? "Dienstag"; } }, { key: "mittwoch", get label() { return lookupLabel('kurse', 'wochentage', "mittwoch") ?? "Mittwoch"; } }, { key: "donnerstag", get label() { return lookupLabel('kurse', 'wochentage', "donnerstag") ?? "Donnerstag"; } }, { key: "freitag", get label() { return lookupLabel('kurse', 'wochentage', "freitag") ?? "Freitag"; } }, { key: "samstag", get label() { return lookupLabel('kurse', 'wochentage', "samstag") ?? "Samstag"; } }],
    status: [{ key: "geplant", get label() { return lookupLabel('kurse', 'status', "geplant") ?? "Geplant"; } }, { key: "laeuft", get label() { return lookupLabel('kurse', 'status', "laeuft") ?? "Läuft"; } }, { key: "abgeschlossen", get label() { return lookupLabel('kurse', 'status', "abgeschlossen") ?? "Abgeschlossen"; } }, { key: "abgesagt", get label() { return lookupLabel('kurse', 'status', "abgesagt") ?? "Abgesagt"; } }],
  },
  'anmeldungen': {
    status: [{ key: "abgemeldet", get label() { return lookupLabel('anmeldungen', 'status', "abgemeldet") ?? "Abgemeldet"; } }, { key: "neu", get label() { return lookupLabel('anmeldungen', 'status', "neu") ?? "Neu"; } }, { key: "bestaetigt", get label() { return lookupLabel('anmeldungen', 'status', "bestaetigt") ?? "Bestätigt"; } }, { key: "warteliste", get label() { return lookupLabel('anmeldungen', 'status', "warteliste") ?? "Warteliste"; } }],
  },
};

// Optimistic LookupValue writes: never re-type a label — resolve the schema
// option instead (its label is a locale-aware getter; falls back to the key).
// WRONG: status: { key: 'offen', label: 'Offen' }   (frozen in one language)
// RIGHT: status: lookupOption('<appKey>', 'status', 'offen')
export function lookupOption(app: string, field: string, key: string): LookupValue {
  return LOOKUP_OPTIONS[app]?.[field]?.find(o => o.key === key) ?? { key, label: key };
}

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'dozenten': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'instrumente': 'string/textarea',
    'aktiv': 'bool',
  },
  'raeume': {
    'name': 'string/text',
    'plaetze': 'number',
    'klavier_vorhanden': 'bool',
  },
  'kurse': {
    'titel': 'string/text',
    'instrument': 'lookup/select',
    'niveau': 'lookup/radio',
    'wochentage': 'multiplelookup/checkbox',
    'dozent': 'applookup/select',
    'raum': 'applookup/select',
    'beginn': 'date/date',
    'ende': 'date/date',
    'uhrzeit': 'date/datetimeminute',
    'maximale_teilnehmer': 'number',
    'preis': 'number',
    'status': 'lookup/select',
  },
  'teilnehmer': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'geburtsdatum': 'date/date',
    'email': 'string/email',
    'telefon': 'string/tel',
    'erziehungsberechtigte_person': 'string/text',
    'notizen': 'string/textarea',
  },
  'anmeldungen': {
    'kurs': 'applookup/select',
    'teilnehmer': 'applookup/select',
    'anmeldedatum': 'date/date',
    'status': 'lookup/select',
    'bezahlt': 'bool',
    'bemerkung': 'string/textarea',
  },
  'anwesenheiten': {
    'kurs': 'applookup/select',
    'teilnehmer': 'applookup/select',
    'datum': 'date/date',
    'anwesend': 'bool',
    'entschuldigt': 'bool',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateDozenten = StripLookup<Dozenten['fields']>;
export type CreateRaeume = StripLookup<Raeume['fields']>;
export type CreateKurse = StripLookup<Kurse['fields']>;
export type CreateTeilnehmer = StripLookup<Teilnehmer['fields']>;
export type CreateAnmeldungen = StripLookup<Anmeldungen['fields']>;
export type CreateAnwesenheiten = StripLookup<Anwesenheiten['fields']>;