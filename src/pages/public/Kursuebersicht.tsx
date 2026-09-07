import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { tx } from '@/i18n';

// ---- Typen -----------------------------------------------------------------

interface KursFields {
  titel: string;
  instrument: string | null;
  niveau: string | null;
  wochentage: string[] | null;
  beginn: string | null;
  ende: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number | null;
  preis: number | null;
  status: string | null;
}

interface AnmeldungFields {
  kurs: string | null;
  status: string | null;
}

interface Kurs {
  id: string;
  fields: KursFields;
}

interface Anmeldung {
  id: string;
  fields: AnmeldungFields;
}

// ---- Hilfsfunktionen -------------------------------------------------------

const INSTRUMENT_ORDER = [
  'klavier', 'gitarre', 'violine', 'cello',
  'querfloete', 'klarinette', 'schlagzeug', 'gesang', 'blockfloete',
];

function formatBeginn(dateStr: string | null): string {
  if (!dateStr) return '–';
  try {
    return format(parseISO(dateStr), 'dd.MM.yyyy');
  } catch {
    return dateStr;
  }
}

function formatUhrzeit(datetimeStr: string | null): string {
  if (!datetimeStr) return '–';
  try {
    return format(parseISO(datetimeStr), 'HH:mm') + ' Uhr';
  } catch {
    return datetimeStr;
  }
}

function formatPreis(preis: number | null): string {
  if (preis == null) return '–';
  return preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** Extrahiert die record-ID aus einer Anmeldung.kurs-URL */
function extractKursId(kursUrl: string | null): string | null {
  if (!kursUrl) return null;
  const parts = kursUrl.split('/');
  return parts[parts.length - 1] || null;
}

// ---- Hauptkomponente -------------------------------------------------------

export default function Kursuebersicht() {
  const WOCHENTAG_LABELS: Record<string, string> = {
  montag: 'Mo',
  dienstag: 'Di',
  mittwoch: 'Mi',
  donnerstag: 'Do',
  freitag: 'Fr',
  samstag: 'Sa',
};

  const NIVEAU_LABELS: Record<string, string> = {
  anfaenger: 'Anfänger',
  fortgeschritten: 'Fortgeschritten',
  profi: 'Profi',
};

  const INSTRUMENT_LABELS: Record<string, string> = {
  klavier: 'Klavier',
  gitarre: 'Gitarre',
  violine: 'Violine',
  cello: 'Cello',
  querfloete: 'Querflöte',
  klarinette: 'Klarinette',
  schlagzeug: 'Schlagzeug',
  gesang: 'Gesang',
  blockfloete: 'Blockflöte',
};

  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurse, setKurse] = useState<Kurs[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<Anmeldung[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Alle Hooks vor Early Returns
  const freiesPlaetzeMap = useMemo<Record<string, number>>(() => {
    if (!kurse.length) return {};
    const result: Record<string, number> = {};
    for (const kurs of kurse) {
      const belegte = anmeldungen.filter(a => {
        const kursId = extractKursId(a.fields.kurs);
        return kursId === kurs.id && a.fields.status !== 'abgemeldet';
      }).length;
      const max = kurs.fields.maximale_teilnehmer ?? 0;
      result[kurs.id] = Math.max(0, max - belegte);
    }
    return result;
  }, [kurse, anmeldungen]);

  const gruppiertNachInstrument = useMemo<Array<{ instrument: string; label: string; kurse: Kurs[] }>>(() => {
    const map = new Map<string, Kurs[]>();
    for (const kurs of kurse) {
      const inst = kurs.fields.instrument ?? 'sonstiges';
      if (!map.has(inst)) map.set(inst, []);
      map.get(inst)!.push(kurs);
    }
    // Sortierung nach definierter Reihenfolge
    const result: Array<{ instrument: string; label: string; kurse: Kurs[] }> = [];
    for (const inst of INSTRUMENT_ORDER) {
      if (map.has(inst)) {
        const kurseListe = map.get(inst)!;
        // Sortierung: zuerst nach Beginn
        kurseListe.sort((a, b) => (a.fields.beginn ?? '').localeCompare(b.fields.beginn ?? ''));
        result.push({ instrument: inst, label: INSTRUMENT_LABELS[inst] ?? inst, kurse: kurseListe });
      }
    }
    // Unbekannte Instrumente am Ende
    for (const [inst, kurseListe] of map.entries()) {
      if (!INSTRUMENT_ORDER.includes(inst)) {
        result.push({ instrument: inst, label: INSTRUMENT_LABELS[inst] ?? inst, kurse: kurseListe });
      }
    }
    return result;
  }, [kurse]);

  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht').then(c => {
      if (!c || !c.pages['kursuebersicht']) {
        setUnavailable(true);
        setLoading(false);
        return;
      }
      setCfg(c);
      setPage(c.pages['kursuebersicht']);
      setLoading(false);
    }).catch(err => {
      if (err instanceof PageUnavailableError) setUnavailable(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);
    const kursEp = page.endpoints?.find(e => e.entity === 'kurse' && e.op === 'list');
    const anmEp = page.endpoints?.find(e => e.entity === 'anmeldungen' && e.op === 'list');
    const kursAppId = kursEp?.app_id ?? '';
    const anmAppId = anmEp?.app_id ?? '';

    Promise.all([
      kursAppId
        ? listPublicRecords(cfg, page, { appId: kursAppId, limit: 200 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
      anmAppId
        ? listPublicRecords(cfg, page, { appId: anmAppId, limit: 500 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ]).then(([kursRecs, anmRecs]) => {
      setKurse(
        Object.entries(kursRecs).map(([id, r]) => ({
          id,
          fields: {
            titel: (r.fields.titel as string) ?? '',
            instrument: (r.fields.instrument as string) ?? null,
            niveau: (r.fields.niveau as string) ?? null,
            wochentage: (r.fields.wochentage as string[]) ?? null,
            beginn: (r.fields.beginn as string) ?? null,
            ende: (r.fields.ende as string) ?? null,
            uhrzeit: (r.fields.uhrzeit as string) ?? null,
            maximale_teilnehmer: (r.fields.maximale_teilnehmer as number) ?? null,
            preis: (r.fields.preis as number) ?? null,
            status: (r.fields.status as string) ?? null,
          },
        }))
      );
      setAnmeldungen(
        Object.entries(anmRecs).map(([id, r]) => ({
          id,
          fields: {
            kurs: (r.fields.kurs as string) ?? null,
            status: (r.fields.status as string) ?? null,
          },
        }))
      );
      setDataLoading(false);
    }).catch(() => {
      setDataLoading(false);
    });
  }, [cfg, page]);

  if (loading || unavailable) {
    return <PublicShell loading={loading} unavailable={unavailable} />;
  }

  const isContentLoading = dataLoading;
  const totalKurse = kurse.length;

  return (
    <PublicShell
      title={tx('Kursübersicht')}
      description={tx('Alle aktuellen Kurse der Musikschule Klangraum')}
      fullBleed
    >
      {/* Hero-Band */}
      <div className="bg-primary/5 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <p className="text-muted-foreground text-base mt-1">
            {isContentLoading
              ? tx('Kurse werden geladen …')
              : totalKurse === 0
                ? tx('Derzeit sind keine Kurse verfügbar.')
                : tx(tx`${totalKurse} aktuelle Kurse`)}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {tx('Interessiert? Klicke auf „Jetzt anmelden" oder tritt der Warteliste bei.')}
          </p>
        </div>
      </div>

      {/* Kurs-Gruppen nach Instrument */}
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-12">
        {isContentLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <div className="animate-pulse text-2xl mb-3">♩</div>
            <p>{tx('Kurse werden geladen …')}</p>
          </div>
        )}

        {!isContentLoading && totalKurse === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg font-medium">{tx('Keine aktuellen Kurse')}</p>
            <p className="text-sm mt-1">{tx('Schau später wieder vorbei oder kontaktiere uns direkt.')}</p>
          </div>
        )}

        {!isContentLoading && gruppiertNachInstrument.map(gruppe => (
          <section key={gruppe.instrument}>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-primary">{gruppe.label}</span>
              <span className="text-sm text-muted-foreground font-normal">
                ({gruppe.kurse.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gruppe.kurse.map(kurs => {
                const freie = freiesPlaetzeMap[kurs.id] ?? 0;
                const isFull = freie === 0;
                const max = kurs.fields.maximale_teilnehmer ?? 0;
                const wochentage = kurs.fields.wochentage
                  ?.map(w => WOCHENTAG_LABELS[w] ?? w)
                  .join(', ') ?? '–';
                const niveauLabel = kurs.fields.niveau ? (NIVEAU_LABELS[kurs.fields.niveau] ?? kurs.fields.niveau) : null;
                const istLaeuft = kurs.fields.status === 'laeuft';

                return (
                  <div
                    key={kurs.id}
                    className="rounded-xl border border-border bg-card shadow-sm flex flex-col overflow-hidden"
                  >
                    {/* Status-Streifen */}
                    <div className={`h-1 ${istLaeuft ? 'bg-emerald-500' : 'bg-amber-400'}`} />

                    <div className="p-4 flex flex-col gap-3 flex-1">
                      {/* Titel + Niveau */}
                      <div>
                        <h3 className="font-semibold text-base leading-tight">{kurs.fields.titel}</h3>
                        {niveauLabel && (
                          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {niveauLabel}
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      <dl className="text-sm space-y-1 text-muted-foreground flex-1">
                        <div className="flex gap-2">
                          <dt className="min-w-[80px] shrink-0">{tx('Wochentage')}</dt>
                          <dd className="text-foreground font-medium">{wochentage}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="min-w-[80px] shrink-0">{tx('Uhrzeit')}</dt>
                          <dd className="text-foreground font-medium">{formatUhrzeit(kurs.fields.uhrzeit)}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="min-w-[80px] shrink-0">{tx('Beginn')}</dt>
                          <dd className="text-foreground font-medium">{formatBeginn(kurs.fields.beginn)}</dd>
                        </div>
                        {kurs.fields.preis != null && (
                          <div className="flex gap-2">
                            <dt className="min-w-[80px] shrink-0">{tx('Preis')}</dt>
                            <dd className="text-foreground font-medium">{formatPreis(kurs.fields.preis)}</dd>
                          </div>
                        )}
                      </dl>

                      {/* Verfügbarkeit */}
                      <div className="pt-2 border-t border-border/50">
                        {isFull ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-sm text-amber-600 font-medium">
                              {tx('Kurs ist voll – Warteliste möglich')}
                            </span>
                            <Link
                              to={`/public/kursanmeldung?kursId=${kurs.id}`}
                              className="text-center text-sm px-3 py-1.5 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 transition-colors"
                            >
                              {tx('Warteliste')}
                            </Link>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            <span className="text-sm text-emerald-600 font-medium">
                              {tx(tx`${freie} von ${max} Plätzen frei`)}
                            </span>
                            <Link
                              to={`/public/kursanmeldung?kursId=${kurs.id}`}
                              className="text-center text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
                            >
                              {tx('Jetzt anmelden')}
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Footer-Hinweis */}
      {!isContentLoading && totalKurse > 0 && (
        <div className="border-t border-border mt-4">
          <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
            {tx('Fragen? Kontaktiere uns direkt an der Musikschule Klangraum.')}
          </div>
        </div>
      )}
    </PublicShell>
  );
}
