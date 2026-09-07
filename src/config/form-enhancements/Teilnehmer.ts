import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'vorname',
    'nachname',
    'geburtsdatum',
    { row: ['email', 'telefon'], cols: '1fr 1fr' },
    'erziehungsberechtigte_person',
    'notizen',
  ],
  defaults: {},
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
