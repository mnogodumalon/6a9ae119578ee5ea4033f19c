import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: null,
  defaults: {
    'datum': { kind: 'today' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
