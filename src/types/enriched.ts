import type { Anmeldungen, Anwesenheiten, Kurse } from './app';

export type EnrichedKurse = Kurse & {
  dozentName: string;
  raumName: string;
};

export type EnrichedAnmeldungen = Anmeldungen & {
  kursName: string;
  teilnehmerName: string;
};

export type EnrichedAnwesenheiten = Anwesenheiten & {
  kursName: string;
  teilnehmerName: string;
};
