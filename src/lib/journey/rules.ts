/**
 * Field rules — GENERATED from the app metadata. Do not edit.
 *
 * The mechanical truth about every field: what kind it is, whether the
 * platform's base view marks it required, which lookup keys exist, where an
 * applookup points, what the label is. `useStepForm` validates against these
 * rules and phrases its messages with the real labels; `toWirePayload` uses
 * them to shape the create payload; `SHAPES` tells a page which input FORM
 * fits the data (a date pair wants a calendar, not two fields) — it is a
 * signal, not a gate.
 */
import { appLabel, fieldLabel, lookupLabel } from '@/i18n';
import { LOOKUP_OPTIONS } from '@/types/app';

export type EntityKey = 'dozenten' | 'raeume' | 'kurse' | 'teilnehmer' | 'anmeldungen' | 'anwesenheiten';

/** The text fields of each entity — what a search may run over (generated;
 *  `never` for an entity without text of its own, e.g. a link table). */
export interface StringFields {
  "dozenten": "vorname" | "nachname" | "email" | "telefon" | "instrumente";
  "raeume": "name";
  "kurse": "titel";
  "teilnehmer": "vorname" | "nachname" | "email" | "telefon" | "erziehungsberechtigte_person" | "notizen";
  "anmeldungen": "bemerkung";
  "anwesenheiten": never;
}
export type StringFieldKey<E extends EntityKey> = E extends keyof StringFields ? StringFields[E] : never;

/** The applookup fields of each entity (generated). A pick stored through
 *  `form.set` on one of these must carry its display name — at compile time
 *  (`StepForm.set`), because the review would otherwise show the id. */
export interface RecordFields {
  "dozenten": never;
  "raeume": never;
  "kurse": "dozent" | "raum";
  "teilnehmer": never;
  "anmeldungen": "kurs" | "teilnehmer";
  "anwesenheiten": "kurs" | "teilnehmer";
}
export type RecordFieldKey<E extends EntityKey> = E extends keyof RecordFields ? RecordFields[E] : never;

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'bool'
  | 'date'
  | 'datetime'
  | 'lookup'
  | 'multilookup'
  | 'record'
  | 'multirecord'
  | 'file'
  | 'geo';

export interface FieldRule {
  key: string;
  fulltype: string;
  kind: FieldKind;
  /** From the app's base view. A public page may override this per field. */
  required: boolean;
  /** Build-time label — `labelOf()` prefers the runtime i18n bundle. */
  label: string;
  /** Whether a journey may write it (`file` is upload-only, never via a journey). */
  writable: boolean;
  maxLength?: number;
  /** lookup / multilookup: the ONLY valid write values. */
  options?: string[];
  /** record / multirecord: the target app (always) and its entity key (when inside this appgroup). */
  targetAppId?: string;
  targetEntity?: EntityKey;
  format?: 'currency';
  /** HTML autocomplete token derived from the field name (given-name, email, tel, …). */
  autoComplete?: string;
}

export interface EntityInfo {
  key: EntityKey;
  appId: string;
  label: string;
  /** PascalCase plural — `get<pascal>()` on the service. */
  pascal: string;
  /** The single-record suffix — `create<single>()` on the service. */
  single: string;
}

/** Input-form signals per entity: which data shape each field (pair) has.
 *  `range`  — two date fields that form a stay/period → AvailabilityRangePicker
 *  `choice` — a lookup with few options → ChoiceGroup pills instead of a select
 *  `record` — an applookup → EntitySelectStep with search, never a raw id field
 *  `stock`  — a quantity that has a stock/capacity counterpart → show it, warn on overshoot */
export type Shape =
  | { kind: 'range'; from: string; to: string }
  | { kind: 'choice'; field: string; count: number }
  | { kind: 'record'; field: string; targetEntity?: EntityKey }
  | { kind: 'stock'; field: string };

export const ENTITIES: Record<EntityKey, EntityInfo> = {
  "dozenten": {
    "key": "dozenten",
    "appId": "6a9ae0d5d12309fd2a39c8d5",
    "label": "Dozenten",
    "pascal": "Dozenten",
    "single": "DozentenEntry"
  },
  "raeume": {
    "key": "raeume",
    "appId": "6a9ae0da768aca3c20fc6276",
    "label": "Räume",
    "pascal": "Raeume",
    "single": "RaeumeEntry"
  },
  "kurse": {
    "key": "kurse",
    "appId": "6a9ae0da29ba5927e215786b",
    "label": "Kurse",
    "pascal": "Kurse",
    "single": "KurseEntry"
  },
  "teilnehmer": {
    "key": "teilnehmer",
    "appId": "6a9ae0db56e49f03519378d8",
    "label": "Teilnehmer",
    "pascal": "Teilnehmer",
    "single": "TeilnehmerEntry"
  },
  "anmeldungen": {
    "key": "anmeldungen",
    "appId": "6a9ae0db0ae4338ee1e48cd2",
    "label": "Anmeldungen",
    "pascal": "Anmeldungen",
    "single": "AnmeldungenEntry"
  },
  "anwesenheiten": {
    "key": "anwesenheiten",
    "appId": "6a9ae0dc45c8112648b97d7a",
    "label": "Anwesenheiten",
    "pascal": "Anwesenheiten",
    "single": "AnwesenheitenEntry"
  }
};

export const FIELD_RULES: Record<EntityKey, Record<string, FieldRule>> = {
  "dozenten": {
    "vorname": {
      "key": "vorname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Vorname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "given-name"
    },
    "nachname": {
      "key": "nachname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Nachname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "family-name"
    },
    "email": {
      "key": "email",
      "fulltype": "string/email",
      "kind": "email",
      "required": false,
      "label": "E-Mail",
      "writable": true,
      "autoComplete": "email"
    },
    "telefon": {
      "key": "telefon",
      "fulltype": "string/tel",
      "kind": "tel",
      "required": false,
      "label": "Telefon",
      "writable": true,
      "autoComplete": "tel"
    },
    "instrumente": {
      "key": "instrumente",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Instrumente",
      "writable": true
    },
    "aktiv": {
      "key": "aktiv",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Aktiv",
      "writable": true
    }
  },
  "raeume": {
    "name": {
      "key": "name",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Name",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "name"
    },
    "plaetze": {
      "key": "plaetze",
      "fulltype": "number",
      "kind": "number",
      "required": true,
      "label": "Plätze",
      "writable": true
    },
    "klavier_vorhanden": {
      "key": "klavier_vorhanden",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Klavier vorhanden",
      "writable": true
    }
  },
  "kurse": {
    "titel": {
      "key": "titel",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Titel",
      "writable": true,
      "maxLength": 4000
    },
    "instrument": {
      "key": "instrument",
      "fulltype": "lookup/select",
      "kind": "lookup",
      "required": true,
      "label": "Instrument",
      "writable": true,
      "options": [
        "klavier",
        "gitarre",
        "violine",
        "cello",
        "querfloete",
        "klarinette",
        "schlagzeug",
        "gesang",
        "blockfloete"
      ]
    },
    "niveau": {
      "key": "niveau",
      "fulltype": "lookup/radio",
      "kind": "lookup",
      "required": false,
      "label": "Niveau",
      "writable": true,
      "options": [
        "anfaenger",
        "fortgeschritten",
        "profi"
      ]
    },
    "wochentage": {
      "key": "wochentage",
      "fulltype": "multiplelookup/checkbox",
      "kind": "multilookup",
      "required": false,
      "label": "Wochentage",
      "writable": true,
      "options": [
        "montag",
        "dienstag",
        "mittwoch",
        "donnerstag",
        "freitag",
        "samstag"
      ]
    },
    "dozent": {
      "key": "dozent",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Dozent",
      "writable": true,
      "targetAppId": "6a9ae0d5d12309fd2a39c8d5",
      "targetEntity": "dozenten"
    },
    "raum": {
      "key": "raum",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": false,
      "label": "Raum",
      "writable": true,
      "targetAppId": "6a9ae0da768aca3c20fc6276",
      "targetEntity": "raeume"
    },
    "beginn": {
      "key": "beginn",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Beginn",
      "writable": true
    },
    "ende": {
      "key": "ende",
      "fulltype": "date/date",
      "kind": "date",
      "required": false,
      "label": "Ende",
      "writable": true
    },
    "uhrzeit": {
      "key": "uhrzeit",
      "fulltype": "date/datetimeminute",
      "kind": "datetime",
      "required": false,
      "label": "Uhrzeit",
      "writable": true
    },
    "maximale_teilnehmer": {
      "key": "maximale_teilnehmer",
      "fulltype": "number",
      "kind": "number",
      "required": true,
      "label": "Maximale Teilnehmer",
      "writable": true
    },
    "preis": {
      "key": "preis",
      "fulltype": "number",
      "kind": "number",
      "required": false,
      "label": "Preis (Euro)",
      "writable": true,
      "format": "currency"
    },
    "status": {
      "key": "status",
      "fulltype": "lookup/select",
      "kind": "lookup",
      "required": true,
      "label": "Status",
      "writable": true,
      "options": [
        "geplant",
        "laeuft",
        "abgeschlossen",
        "abgesagt"
      ]
    }
  },
  "teilnehmer": {
    "vorname": {
      "key": "vorname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Vorname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "given-name"
    },
    "nachname": {
      "key": "nachname",
      "fulltype": "string/text",
      "kind": "text",
      "required": true,
      "label": "Nachname",
      "writable": true,
      "maxLength": 4000,
      "autoComplete": "family-name"
    },
    "geburtsdatum": {
      "key": "geburtsdatum",
      "fulltype": "date/date",
      "kind": "date",
      "required": false,
      "label": "Geburtsdatum",
      "writable": true,
      "autoComplete": "bday"
    },
    "email": {
      "key": "email",
      "fulltype": "string/email",
      "kind": "email",
      "required": false,
      "label": "E-Mail",
      "writable": true,
      "autoComplete": "email"
    },
    "telefon": {
      "key": "telefon",
      "fulltype": "string/tel",
      "kind": "tel",
      "required": false,
      "label": "Telefon",
      "writable": true,
      "autoComplete": "tel"
    },
    "erziehungsberechtigte_person": {
      "key": "erziehungsberechtigte_person",
      "fulltype": "string/text",
      "kind": "text",
      "required": false,
      "label": "Erziehungsberechtigte Person",
      "writable": true,
      "maxLength": 4000
    },
    "notizen": {
      "key": "notizen",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Notizen",
      "writable": true
    }
  },
  "anmeldungen": {
    "kurs": {
      "key": "kurs",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Kurs",
      "writable": true,
      "targetAppId": "6a9ae0da29ba5927e215786b",
      "targetEntity": "kurse"
    },
    "teilnehmer": {
      "key": "teilnehmer",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Teilnehmer",
      "writable": true,
      "targetAppId": "6a9ae0db56e49f03519378d8",
      "targetEntity": "teilnehmer"
    },
    "anmeldedatum": {
      "key": "anmeldedatum",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Anmeldedatum",
      "writable": true
    },
    "status": {
      "key": "status",
      "fulltype": "lookup/select",
      "kind": "lookup",
      "required": true,
      "label": "Status",
      "writable": true,
      "options": [
        "abgemeldet",
        "neu",
        "bestaetigt",
        "warteliste"
      ]
    },
    "bezahlt": {
      "key": "bezahlt",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Bezahlt",
      "writable": true
    },
    "bemerkung": {
      "key": "bemerkung",
      "fulltype": "string/textarea",
      "kind": "textarea",
      "required": false,
      "label": "Bemerkung",
      "writable": true
    }
  },
  "anwesenheiten": {
    "kurs": {
      "key": "kurs",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Kurs",
      "writable": true,
      "targetAppId": "6a9ae0da29ba5927e215786b",
      "targetEntity": "kurse"
    },
    "teilnehmer": {
      "key": "teilnehmer",
      "fulltype": "applookup/select",
      "kind": "record",
      "required": true,
      "label": "Teilnehmer",
      "writable": true,
      "targetAppId": "6a9ae0db56e49f03519378d8",
      "targetEntity": "teilnehmer"
    },
    "datum": {
      "key": "datum",
      "fulltype": "date/date",
      "kind": "date",
      "required": true,
      "label": "Datum",
      "writable": true
    },
    "anwesend": {
      "key": "anwesend",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Anwesend",
      "writable": true
    },
    "entschuldigt": {
      "key": "entschuldigt",
      "fulltype": "bool",
      "kind": "bool",
      "required": false,
      "label": "Entschuldigt",
      "writable": true
    }
  }
};

export const SHAPES: Record<EntityKey, Shape[]> = {
  "dozenten": [],
  "raeume": [],
  "kurse": [
    {
      "kind": "range",
      "from": "beginn",
      "to": "ende"
    },
    {
      "kind": "choice",
      "field": "niveau",
      "count": 3
    },
    {
      "kind": "choice",
      "field": "status",
      "count": 4
    },
    {
      "kind": "record",
      "field": "dozent",
      "targetEntity": "dozenten"
    },
    {
      "kind": "record",
      "field": "raum",
      "targetEntity": "raeume"
    }
  ],
  "teilnehmer": [],
  "anmeldungen": [
    {
      "kind": "choice",
      "field": "status",
      "count": 4
    },
    {
      "kind": "record",
      "field": "kurs",
      "targetEntity": "kurse"
    },
    {
      "kind": "record",
      "field": "teilnehmer",
      "targetEntity": "teilnehmer"
    }
  ],
  "anwesenheiten": [
    {
      "kind": "record",
      "field": "kurs",
      "targetEntity": "kurse"
    },
    {
      "kind": "record",
      "field": "teilnehmer",
      "targetEntity": "teilnehmer"
    }
  ]
};

/** The fields a record of this entity is recognised by (a person: first and
 *  last name; else its title-like text field) — the same choice the dashboard's
 *  enrichment makes for `<key>Name`. `useRecordSearch` resolves an applookup to
 *  this name (`ctx.ref('gast')` in `toItem`). */
export const DISPLAY_FIELDS: Record<EntityKey, string[]> = {
  "dozenten": [
    "vorname",
    "nachname"
  ],
  "raeume": [
    "name"
  ],
  "kurse": [
    "titel"
  ],
  "teilnehmer": [
    "vorname",
    "nachname"
  ],
  "anmeldungen": [
    "bemerkung"
  ],
  "anwesenheiten": [
    "kurs"
  ]
};

/** The display name of a record: its display fields joined, else the first
 *  non-empty text value, else ''. */
export function displayNameOf(entity: EntityKey, fields: Record<string, unknown>): string {
  const parts = (DISPLAY_FIELDS[entity] ?? [])
    .map(k => fields[k])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map(v => v.trim());
  if (parts.length > 0) return parts.join(' ');
  for (const [k, rule] of Object.entries(FIELD_RULES[entity] ?? {})) {
    if (rule.kind !== 'text' && rule.kind !== 'email') continue;
    const v = fields[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return '';
}

export function ruleOf(entity: EntityKey, key: string): FieldRule | undefined {
  return FIELD_RULES[entity]?.[key];
}

/** The field label as the user sees it — runtime bundle first, generated label second. */
export function labelOf(entity: EntityKey, key: string): string {
  const fromBundle = fieldLabel(entity, key);
  if (fromBundle !== key) return fromBundle;
  return ruleOf(entity, key)?.label ?? key;
}

export function entityLabel(entity: EntityKey): string {
  const fromBundle = appLabel(entity);
  if (fromBundle !== entity) return fromBundle;
  return ENTITIES[entity]?.label ?? entity;
}

/** Lookup options with runtime labels — the only legitimate source of `{key,label}` pairs. */
export function optionsOf(entity: EntityKey, key: string): Array<{ key: string; label: string }> {
  const generated = (LOOKUP_OPTIONS as Record<string, Record<string, Array<{ key: string; label: string }>>>)[entity]?.[key];
  if (generated && generated.length) return generated.map(o => ({ key: o.key, label: o.label }));
  const keys = ruleOf(entity, key)?.options ?? [];
  return keys.map(k => ({ key: k, label: lookupLabel(entity, key, k) ?? k }));
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && 'from' in (v as object) && 'to' in (v as object)) {
    const r = v as { from: unknown; to: unknown };
    return isEmptyValue(r.from) && isEmptyValue(r.to);
  }
  return false;
}
