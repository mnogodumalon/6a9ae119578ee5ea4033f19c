import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: null,
  defaults: {
    'anmeldedatum': { kind: 'today' },
    'status': { kind: 'lookup', key: 'neu', label: 'Neu' },
    'bezahlt': { kind: 'literal', value: false },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
