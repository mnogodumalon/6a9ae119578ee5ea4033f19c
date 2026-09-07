import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'titel',
    'instrument',
    'niveau',
    'dozent',
    'raum',
    'wochentage',
    { row: ['beginn', 'ende'], cols: '1fr 1fr' },
    'uhrzeit',
    'maximale_teilnehmer',
    'preis',
    'status',
  ],
  defaults: {
    'beginn': { kind: 'today' },
    'status': { kind: 'lookup', key: 'geplant', label: 'Geplant' },
    'maximale_teilnehmer': { kind: 'literal', value: 10 },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
