import { useEffect, useMemo, useState } from 'react';
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface Kurs {
  id: string;
  titel: string;
  instrument: string;
  niveau: string | null;
  wochentage: string[];
  beginn: string;
  ende: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number;
  preis: number | null;
  status: string;
  dozentRef: string | null;
  raumRef: string | null;
}

interface Dozent {
  id: string;
  vorname: string;
  nachname: string;
}

interface Raum {
  id: string;
  name: string;
}

// ─── Label maps ──────────────────────────────────────────────────────────────

const WOCHENTAG_ORDER = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractId(ref: string | null): string | null {
  if (!ref) return null;
  const parts = ref.split('/records/');
  return parts.length === 2 ? parts[1] : null;
}

function parseRecord(r: PublicRecordResult): Kurs {
  const f = r.fields;
  const wochentageRaw = f.wochentage as string[] | null;
  return {
    id: r.id,
    titel: (f.titel as string) ?? '',
    instrument: (f.instrument as string) ?? '',
    niveau: (f.niveau as string | null) ?? null,
    wochentage: Array.isArray(wochentageRaw) ? wochentageRaw : [],
    beginn: (f.beginn as string) ?? '',
    ende: (f.ende as string | null) ?? null,
    uhrzeit: (f.uhrzeit as string | null) ?? null,
    maximale_teilnehmer: (f.maximale_teilnehmer as number) ?? 0,
    preis: (f.preis as number | null) ?? null,
    status: (f.status as string) ?? '',
    dozentRef: (f.dozent as string | null) ?? null,
    raumRef: (f.raum as string | null) ?? null,
  };
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd.MM.yyyy');
  } catch {
    return dateStr;
  }
}

function formatTime(datetimeStr: string): string {
  try {
    return format(parseISO(datetimeStr), 'HH:mm');
  } catch {
    return '';
  }
}

function formatPreis(preis: number | null): string {
  if (preis === null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(preis);
}

// ─── KursCard ────────────────────────────────────────────────────────────────

interface KursCardProps {
  kurs: Kurs;
  dozentName: string;
  raumName: string;
  freiePlaetze: number;
}

function KursCard({ kurs, dozentName, raumName, freiePlaetze }: KursCardProps) {
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

  const sortedTage = kurs.wochentage
    .slice()
    .sort((a, b) => WOCHENTAG_ORDER.indexOf(a) - WOCHENTAG_ORDER.indexOf(b));

  const freiePlaetzeLabel =
    freiePlaetze <= 0
      ? tx('Ausgebucht')
      : freiePlaetze === 1
      ? tx`${freiePlaetze} freier Platz`
      : tx`${freiePlaetze} freie Plätze`;

  const isFull = freiePlaetze <= 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      {/* Status stripe */}
      <div className={`h-1 w-full ${kurs.status === 'laeuft' ? 'bg-emerald-500' : 'bg-blue-400'}`} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div>
          <h3 className="text-base font-semibold text-gray-900 leading-tight">{kurs.titel}</h3>
          {kurs.niveau && (
            <span className="text-xs text-gray-500 mt-0.5 inline-block">
              {NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau}
            </span>
          )}
        </div>

        {/* Details grid */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {sortedTage.length > 0 && (
            <>
              <dt className="text-gray-500">{tx('Tage')}</dt>
              <dd className="text-gray-800 font-medium">
                {sortedTage.map(t => WOCHENTAG_LABELS[t] ?? t).join(', ')}
              </dd>
            </>
          )}
          {kurs.uhrzeit && (
            <>
              <dt className="text-gray-500">{tx('Uhrzeit')}</dt>
              <dd className="text-gray-800 font-medium">{formatTime(kurs.uhrzeit)} {tx('Uhr')}</dd>
            </>
          )}
          {kurs.beginn && (
            <>
              <dt className="text-gray-500">{tx('Beginn')}</dt>
              <dd className="text-gray-800 font-medium">{formatDate(kurs.beginn)}</dd>
            </>
          )}
          {kurs.ende && (
            <>
              <dt className="text-gray-500">{tx('Ende')}</dt>
              <dd className="text-gray-800 font-medium">{formatDate(kurs.ende)}</dd>
            </>
          )}
          {dozentName && (
            <>
              <dt className="text-gray-500">{tx('Dozent')}</dt>
              <dd className="text-gray-800 font-medium truncate">{dozentName}</dd>
            </>
          )}
          {raumName && (
            <>
              <dt className="text-gray-500">{tx('Raum')}</dt>
              <dd className="text-gray-800 font-medium">{raumName}</dd>
            </>
          )}
          {kurs.preis !== null && (
            <>
              <dt className="text-gray-500">{tx('Preis')}</dt>
              <dd className="text-gray-800 font-semibold">{formatPreis(kurs.preis)}</dd>
            </>
          )}
        </dl>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <span className={`text-sm font-medium ${isFull ? 'text-red-500' : 'text-emerald-600'}`}>
            {freiePlaetzeLabel}
          </span>
          {!isFull ? (
            <Link
              to={`/public/kursanmeldung?kursId=${kurs.id}`}
              className="text-sm font-medium bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
            >
              {tx('Jetzt anmelden')}
            </Link>
          ) : (
            <span className="text-sm text-gray-400 px-4 py-1.5">{tx('Voll')}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Kursuebersicht() {
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
  const [dozenten, setDozenten] = useState<Record<string, Dozent>>({});
  const [raeume, setRaeume] = useState<Record<string, Raum>>({});
  const [anmeldungCounts, setAnmeldungCounts] = useState<Record<string, number>>({});
  const [dataLoading, setDataLoading] = useState(true);

  // Load config
  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht').then(c => {
      setCfg(c);
      setPage(c?.pages['kursuebersicht'] ?? null);
      setLoading(false);
    }).catch(err => {
      if (err instanceof PageUnavailableError) setUnavailable(true);
      setLoading(false);
    });
  }, []);

  // Load data once config is ready
  useEffect(() => {
    if (!cfg || !page) return;

    const kursEp = page.endpoints?.find(e => e.entity === 'kurse' && e.op === 'list');
    const dozentEp = page.endpoints?.find(e => e.entity === 'dozenten' && e.op === 'list');
    const raumEp = page.endpoints?.find(e => e.entity === 'raeume' && e.op === 'list');
    const anmeldungEp = page.endpoints?.find(e => e.entity === 'anmeldungen' && e.op === 'list');

    if (!kursEp?.app_id) { setDataLoading(false); return; }

    Promise.all([
      listPublicRecords(cfg, page, { appId: kursEp.app_id, limit: 500 }),
      dozentEp?.app_id
        ? listPublicRecords(cfg, page, { appId: dozentEp.app_id, limit: 500 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
      raumEp?.app_id
        ? listPublicRecords(cfg, page, { appId: raumEp.app_id, limit: 500 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
      anmeldungEp?.app_id
        ? listPublicRecords(cfg, page, { appId: anmeldungEp.app_id, limit: 500 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ]).then(([kursRecs, dozentRecs, raumRecs, anmeldungRecs]) => {
      // Parse kurse
      const parsedKurse = Object.values(kursRecs).map(parseRecord);
      setKurse(parsedKurse);

      // Build dozenten map
      const dozentMap: Record<string, Dozent> = {};
      Object.values(dozentRecs).forEach(r => {
        dozentMap[r.id] = {
          id: r.id,
          vorname: (r.fields.vorname as string) ?? '',
          nachname: (r.fields.nachname as string) ?? '',
        };
      });
      setDozenten(dozentMap);

      // Build raeume map
      const raumMap: Record<string, Raum> = {};
      Object.values(raumRecs).forEach(r => {
        raumMap[r.id] = {
          id: r.id,
          name: (r.fields.name as string) ?? '',
        };
      });
      setRaeume(raumMap);

      // Count active anmeldungen per kurs (status != abgemeldet)
      const counts: Record<string, number> = {};
      Object.values(anmeldungRecs).forEach(r => {
        const status = r.fields.status as string | null;
        if (status === 'abgemeldet') return;
        const kursRef = r.fields.kurs as string | null;
        const kursId = extractId(kursRef);
        if (!kursId) return;
        counts[kursId] = (counts[kursId] ?? 0) + 1;
      });
      setAnmeldungCounts(counts);

      setDataLoading(false);
    }).catch(() => {
      setDataLoading(false);
    });
  }, [cfg, page]);

  // Group kurse by instrument, sorted by instrument label
  const grouped = useMemo(() => {
    const sorted = [...kurse].sort((a, b) => {
      const labelA = INSTRUMENT_LABELS[a.instrument] ?? a.instrument;
      const labelB = INSTRUMENT_LABELS[b.instrument] ?? b.instrument;
      return labelA.localeCompare(labelB, 'de');
    });

    const groups: Array<{ instrument: string; label: string; kurse: Kurs[] }> = [];
    const seen = new Map<string, number>();

    for (const kurs of sorted) {
      const key = kurs.instrument || '__unbekannt__';
      if (!seen.has(key)) {
        seen.set(key, groups.length);
        groups.push({
          instrument: key,
          label: INSTRUMENT_LABELS[key] ?? key,
          kurse: [],
        });
      }
      groups[seen.get(key)!].kurse.push(kurs);
    }

    return groups;
  }, [kurse]);

  const totalKurse = kurse.length;

  // ── Render ──

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  return (
    <PublicShell
      title={tx('Kursübersicht')}
      description={tx('Alle aktuellen Kurse der Musikschule Klangraum')}
      fullBleed
    >
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Intro */}
        <div className="mb-8 text-center">
          <p className="text-gray-600 text-base max-w-2xl mx-auto">
            {tx('Entdecke unsere aktuellen Kursangebote und melde dich direkt online an.')}
          </p>
          {!dataLoading && totalKurse > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              {totalKurse === 1
                ? tx`${totalKurse} Kurs verfügbar`
                : tx`${totalKurse} Kurse verfügbar`}
            </p>
          )}
        </div>

        {/* Loading state */}
        {dataLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!dataLoading && grouped.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium">{tx('Aktuell keine Kurse verfügbar')}</p>
            <p className="text-sm mt-2">{tx('Schau bald wieder vorbei!')}</p>
          </div>
        )}

        {/* Grouped course lists */}
        {!dataLoading && grouped.map(group => (
          <section key={group.instrument} className="mb-10">
            <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              {group.label}
              <span className="text-sm font-normal text-gray-400 ml-1">
                ({group.kurse.length})
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.kurse.map(kurs => {
                const dozentId = extractId(kurs.dozentRef);
                const dozent = dozentId ? dozenten[dozentId] : null;
                const dozentName = dozent
                  ? `${dozent.vorname} ${dozent.nachname}`.trim()
                  : '';

                const raumId = extractId(kurs.raumRef);
                const raum = raumId ? raeume[raumId] : null;
                const raumName = raum?.name ?? '';

                const angemeldet = anmeldungCounts[kurs.id] ?? 0;
                const freiePlaetze = Math.max(0, kurs.maximale_teilnehmer - angemeldet);

                return (
                  <KursCard
                    key={kurs.id}
                    kurs={kurs}
                    dozentName={dozentName}
                    raumName={raumName}
                    freiePlaetze={freiePlaetze}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </PublicShell>
  );
}
