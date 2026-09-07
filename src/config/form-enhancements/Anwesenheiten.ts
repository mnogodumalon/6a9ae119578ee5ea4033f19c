import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'kurs',
    'teilnehmer',
    'datum',
    'anwesend',
    'entschuldigt',
  ],
  defaults: {
    'datum': { kind: 'today' },
    'anwesend': { kind: 'literal', value: false },
    'entschuldigt': { kind: 'literal', value: false },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};

export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
