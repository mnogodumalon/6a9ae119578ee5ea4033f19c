import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: null,
  defaults: {
    'plaetze': { kind: 'literal', value: 1 },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
