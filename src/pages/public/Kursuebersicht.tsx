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
import {
  IconMusic,
  IconCalendar,
  IconClock,
  IconUser,
  IconUsers,
  IconCurrencyEuro,
  IconChevronRight,
  IconSearch,
  IconX,
} from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KursRecord {
  id: string;
  titel: string;
  instrument: string | null;
  niveau: string | null;
  wochentage: string[] | null;
  dozentUrl: string | null;
  beginn: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number | null;
  preis: number | null;
  status: string | null;
}

interface DozentRecord {
  id: string;
  vorname: string;
  nachname: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1] ?? null;
}

function formatUhrzeit(uhrzeit: string | null): string | null {
  if (!uhrzeit) return null;
  try {
    return format(parseISO(uhrzeit), 'HH:mm');
  } catch {
    return null;
  }
}

function formatBeginn(beginn: string | null): string | null {
  if (!beginn) return null;
  try {
    return format(parseISO(beginn), 'dd.MM.yyyy');
  } catch {
    return null;
  }
}

function mapKurs(r: PublicRecordResult): KursRecord {
  return {
    id: r.id,
    titel: (r.fields.titel as string) ?? '',
    instrument: (r.fields.instrument as string) ?? null,
    niveau: (r.fields.niveau as string) ?? null,
    wochentage: (r.fields.wochentage as string[]) ?? null,
    dozentUrl: (r.fields.dozent as string) ?? null,
    beginn: (r.fields.beginn as string) ?? null,
    uhrzeit: (r.fields.uhrzeit as string) ?? null,
    maximale_teilnehmer: (r.fields.maximale_teilnehmer as number) ?? null,
    preis: (r.fields.preis as number) ?? null,
    status: (r.fields.status as string) ?? null,
  };
}

function mapDozent(r: PublicRecordResult): DozentRecord {
  return {
    id: r.id,
    vorname: (r.fields.vorname as string) ?? '',
    nachname: (r.fields.nachname as string) ?? '',
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Kursuebersicht() {
  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  laeuft: { bg: 'bg-emerald-100', text: tx('text-emerald-700'), label: tx('Läuft') },
  geplant: { bg: 'bg-sky-100', text: tx('text-sky-700'), label: tx('Geplant') },
};

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
  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [dozenten, setDozenten] = useState<DozentRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [filterInstrument, setFilterInstrument] = useState<string>('');
  const [filterNiveau, setFilterNiveau] = useState<string>('');
  const [search, setSearch] = useState('');

  // All hooks before any early return
  const dozentMap = useMemo(() => {
    const map: Record<string, DozentRecord> = {};
    for (const d of dozenten) {
      map[d.id] = d;
    }
    return map;
  }, [dozenten]);

  const instrumentOptions = useMemo(() => {
    const keys = Array.from(new Set(kurse.map(k => k.instrument).filter(Boolean) as string[]));
    return keys.sort();
  }, [kurse]);

  const niveauOptions = useMemo(() => {
    const keys = Array.from(new Set(kurse.map(k => k.niveau).filter(Boolean) as string[]));
    return keys;
  }, [kurse]);

  const filtered = useMemo(() => {
    return kurse.filter(k => {
      if (filterInstrument && k.instrument !== filterInstrument) return false;
      if (filterNiveau && k.niveau !== filterNiveau) return false;
      if (search) {
        const q = search.toLowerCase();
        const dozentId = extractIdFromUrl(k.dozentUrl);
        const dozent = dozentId ? dozentMap[dozentId] : null;
        const dozentName = dozent ? `${dozent.vorname} ${dozent.nachname}`.toLowerCase() : '';
        const titel = k.titel.toLowerCase();
        const instr = INSTRUMENT_LABELS[k.instrument ?? '']?.toLowerCase() ?? '';
        if (!titel.includes(q) && !dozentName.includes(q) && !instr.includes(q)) return false;
      }
      return true;
    });
  }, [kurse, filterInstrument, filterNiveau, search, dozentMap]);

  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht')
      .then(c => {
        setCfg(c);
        setPage(c?.pages['kursuebersicht'] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);
    const kurseEp = page.endpoints?.find(e => e.entity === 'kurse' && e.op === 'list');
    const dozentEp = page.endpoints?.find(e => e.entity === 'dozenten' && e.op === 'list');
    const appIdKurse = kurseEp?.app_id ?? '';
    const appIdDozenten = dozentEp?.app_id ?? '';
    Promise.all([
      appIdKurse
        ? listPublicRecords(cfg, page, { appId: appIdKurse, limit: 200 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
      appIdDozenten
        ? listPublicRecords(cfg, page, { appId: appIdDozenten, limit: 200 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ])
      .then(([kursRes, dozentRes]) => {
        setKurse(Object.values(kursRes).map(mapKurs));
        setDozenten(Object.values(dozentRes).map(mapDozent));
      })
      .finally(() => setDataLoading(false));
  }, [cfg, page]);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  return (
    <PublicShell
      title={tx('Kursübersicht')}
      description={tx('Alle aktuellen und geplanten Kurse der Musikschule Klangraum.')}
      fullBleed
    >
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white py-14 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-indigo-200 text-sm font-medium uppercase tracking-widest mb-3">
            {tx('Musikschule Klangraum')}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">{tx('Unsere Kurse')}</h1>
          <p className="text-indigo-100 text-lg max-w-xl mx-auto">
            {tx('Entdecke das passende Instrument — von Anfänger bis Profi, für jedes Alter.')}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tx('Kurs suchen …')}
              className="w-full pl-9 pr-9 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={tx('Suche löschen')}
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          {/* Instrument filter */}
          <select
            value={filterInstrument}
            onChange={e => setFilterInstrument(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">{tx('Alle Instrumente')}</option>
            {instrumentOptions.map(key => (
              <option key={key} value={key}>{INSTRUMENT_LABELS[key] ?? key}</option>
            ))}
          </select>

          {/* Niveau filter */}
          <select
            value={filterNiveau}
            onChange={e => setFilterNiveau(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">{tx('Alle Niveaus')}</option>
            {niveauOptions.map(key => (
              <option key={key} value={key}>{NIVEAU_LABELS[key] ?? key}</option>
            ))}
          </select>

          {(filterInstrument || filterNiveau || search) && (
            <button
              onClick={() => { setFilterInstrument(''); setFilterNiveau(''); setSearch(''); }}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {tx('Filter zurücksetzen')}
            </button>
          )}
        </div>
      </div>

      {/* Course grid */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {dataLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border bg-white shadow-sm p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-6" />
                <div className="space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <IconMusic size={48} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">
              {kurse.length === 0
                ? tx('Aktuell sind keine Kurse verfügbar.')
                : tx('Keine Kurse für diese Filter gefunden.')}
            </p>
            {kurse.length > 0 && (
              <button
                onClick={() => { setFilterInstrument(''); setFilterNiveau(''); setSearch(''); }}
                className="mt-4 text-indigo-600 hover:text-indigo-800 text-sm font-medium"
              >
                {tx('Alle Kurse anzeigen')}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-5">
              {/* i18n-exempt: interpolation via tx tagged template */}
              {filtered.length === 1
                ? tx('1 Kurs gefunden')
                : /* @ts-ignore */ tx`${filtered.length} Kurse gefunden`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(kurs => {
                const dozentId = extractIdFromUrl(kurs.dozentUrl);
                const dozent = dozentId ? dozentMap[dozentId] : null;
                const dozentName = dozent
                  ? `${dozent.vorname} ${dozent.nachname}`
                  : null;
                const statusStyle = STATUS_STYLES[kurs.status ?? ''];
                const uhrzeitLabel = formatUhrzeit(kurs.uhrzeit);
                const beginnLabel = formatBeginn(kurs.beginn);
                const wochentageLabels = kurs.wochentage
                  ?.map(t => WOCHENTAG_LABELS[t] ?? t)
                  .join(', ') ?? null;

                return (
                  <article
                    key={kurs.id}
                    className="rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden"
                  >
                    {/* Card header */}
                    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 px-5 pt-5 pb-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h2 className="font-semibold text-base text-gray-900 leading-snug">
                          {kurs.titel}
                        </h2>
                        {statusStyle && (
                          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {kurs.instrument && (
                          <span className="inline-flex items-center gap-1 text-xs bg-white border rounded-full px-2.5 py-0.5 text-gray-700">
                            <IconMusic size={12} className="shrink-0" />
                            {INSTRUMENT_LABELS[kurs.instrument] ?? kurs.instrument}
                          </span>
                        )}
                        {kurs.niveau && (
                          <span className="inline-flex items-center text-xs bg-white border rounded-full px-2.5 py-0.5 text-gray-700">
                            {NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="px-5 py-4 flex-1 space-y-2.5">
                      {dozentName && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <IconUser size={15} className="shrink-0 text-gray-400" />
                          <span className="truncate">{dozentName}</span>
                        </div>
                      )}
                      {wochentageLabels && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <IconCalendar size={15} className="shrink-0 text-gray-400" />
                          <span>{wochentageLabels}</span>
                          {uhrzeitLabel && (
                            <span className="flex items-center gap-1 ml-1">
                              <IconClock size={14} className="shrink-0 text-gray-400" />
                              {uhrzeitLabel}
                            </span>
                          )}
                        </div>
                      )}
                      {beginnLabel && (
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                          <IconCalendar size={15} className="shrink-0 text-gray-400" />
                          <span>{tx('Beginn:')} <strong>{beginnLabel}</strong></span>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
                        {kurs.maximale_teilnehmer != null && (
                          <div className="flex items-center gap-1.5 text-sm text-gray-700">
                            <IconUsers size={15} className="shrink-0 text-gray-400" />
                            {/* @ts-ignore */}
                            <span>{tx`${kurs.maximale_teilnehmer} Plätze`}</span>
                          </div>
                        )}
                        {kurs.preis != null && (
                          <div className="flex items-center gap-1 text-sm text-gray-700">
                            <IconCurrencyEuro size={15} className="shrink-0 text-gray-400" />
                            <span>
                              {kurs.preis.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              {' '}{tx('€ / Monat')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card footer */}
                    <div className="px-5 pb-5">
                      <Link
                        to={`/public/kursanmeldung?kurs=${kurs.id}`}
                        className="flex items-center justify-center gap-2 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 transition-colors"
                      >
                        {tx('Jetzt anmelden')}
                        <IconChevronRight size={16} className="shrink-0" />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer note */}
      <div className="max-w-5xl mx-auto px-4 pb-12 text-center">
        <p className="text-xs text-muted-foreground">
          {tx('Alle Angaben ohne Gewähr. Bei Fragen wende dich bitte direkt an die Musikschule.')}
        </p>
      </div>
    </PublicShell>
  );
}
