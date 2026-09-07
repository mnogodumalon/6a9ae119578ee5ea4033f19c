import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: ['titel', 'instrument', 'niveau', 'wochentage', 'dozent', 'raum', { row: ['beginn', 'ende'] }, 'uhrzeit', 'maximale_teilnehmer', 'preis', 'status'],
  defaults: {
    'beginn': { kind: 'today' },
    'status': { kind: 'lookup', key: 'geplant', label: 'Geplant' },
    'maximale_teilnehmer': { kind: 'literal', value: 1 },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
