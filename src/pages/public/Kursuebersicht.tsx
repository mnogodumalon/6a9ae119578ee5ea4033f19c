import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { tx, dateFnsLocale } from '@/i18n';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { format } from 'date-fns';
import {
  IconMusic,
  IconUsers,
  IconCalendar,
  IconClock,
  IconCurrencyEuro,
  IconChevronRight,
} from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Kurs {
  id: string;
  titel: string;
  instrument: string | null;
  instrumentLabel: string | null;
  niveau: string | null;
  niveauLabel: string | null;
  wochentage: Array<{ key: string; label: string }>;
  dozentId: string | null;
  beginn: string | null;
  ende: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number;
  preis: number | null;
  status: string;
  statusLabel: string | null;
}

interface Dozent {
  id: string;
  vorname: string;
  nachname: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRecordIdFromUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parts = value.split('/records/');
  if (parts.length < 2) return null;
  return parts[parts.length - 1] ?? null;
}

function parseLookupValue(value: unknown): { key: string; label: string } | null {
  if (value && typeof value === 'object' && 'key' in value && 'label' in value) {
    return { key: (value as Record<string, unknown>).key as string, label: (value as Record<string, unknown>).label as string };
  }
  return null;
}

function parseMultiLookup(value: unknown): Array<{ key: string; label: string }> {
  if (!Array.isArray(value)) return [];
  const result: Array<{ key: string; label: string }> = [];
  for (const item of value) {
    const lv = parseLookupValue(item);
    if (lv) result.push(lv);
  }
  return result;
}

function parseDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value;
}

function formatUhrzeit(datetimeIso: string | null): string | null {
  if (!datetimeIso) return null;
  // format HH:mm from datetime string
  const timePart = datetimeIso.includes('T') ? datetimeIso.split('T')[1] : null;
  if (!timePart) return null;
  return timePart.slice(0, 5);
}

function formatBeginn(dateIso: string | null): string | null {
  if (!dateIso) return null;
  try {
    // dateIso is yyyy-MM-dd
    const [year, month, day] = dateIso.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return format(d, 'dd. MMMM yyyy', { locale: dateFnsLocale() });
  } catch {
    return dateIso;
  }
}

function instrumentIcon(instrument: string | null): string {
  const map: Record<string, string> = {
    klavier: '🎹',
    gitarre: '🎸',
    violine: '🎻',
    cello: '🎻',
    querfloete: '🎵',
    klarinette: '🎵',
    schlagzeug: '🥁',
    gesang: '🎤',
    blockfloete: '🎵',
  };
  return instrument ? (map[instrument] ?? '🎵') : '🎵';
}

function niveauTone(niveau: string | null): 'positive' | 'info' | 'warning' | 'neutral' {
  if (niveau === 'anfaenger') return 'positive';
  if (niveau === 'fortgeschritten') return 'info';
  if (niveau === 'profi') return 'warning';
  return 'neutral';
}

function statusTone(status: string): 'positive' | 'info' | 'neutral' {
  if (status === 'laeuft') return 'positive';
  if (status === 'geplant') return 'info';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Kursuebersicht() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurseRaw, setKurseRaw] = useState<Record<string, PublicRecordResult>>({});
  const [dozentenRaw, setDozentenRaw] = useState<Record<string, PublicRecordResult>>({});
  const [anmeldungenRaw, setAnmeldungenRaw] = useState<Record<string, PublicRecordResult>>({});
  const [dataLoading, setDataLoading] = useState(true);

  const [filterInstrument, setFilterInstrument] = useState<string | null>(null);
  const [filterNiveau, setFilterNiveau] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht')
      .then(c => {
        setCfg(c);
        setPage(c?.pages['kursuebersicht'] ?? null);
        if (!c?.pages['kursuebersicht']) setUnavailable(true);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;

    const epKurse = page.endpoints?.find(e => e.entity === 'kurse' && e.op === 'list');
    const epDozenten = page.endpoints?.find(e => e.entity === 'dozenten' && e.op === 'list');
    const epAnmeldungen = page.endpoints?.find(e => e.entity === 'anmeldungen' && e.op === 'list');

    setDataLoading(true);

    const kursePromise = epKurse?.app_id
      ? listPublicRecords(cfg, page, { appId: epKurse.app_id, limit: 200 })
      : Promise.resolve<Record<string, PublicRecordResult>>({});

    const dozentenPromise = epDozenten?.app_id
      ? listPublicRecords(cfg, page, { appId: epDozenten.app_id, limit: 200 })
      : Promise.resolve<Record<string, PublicRecordResult>>({});

    const anmeldungenPromise = epAnmeldungen?.app_id
      ? listPublicRecords(cfg, page, { appId: epAnmeldungen.app_id, limit: 500 })
      : Promise.resolve<Record<string, PublicRecordResult>>({});

    Promise.all([kursePromise, dozentenPromise, anmeldungenPromise])
      .then(([k, d, a]) => {
        setKurseRaw(k);
        setDozentenRaw(d);
        setAnmeldungenRaw(a);
        setDataLoading(false);
      })
      .catch(() => setDataLoading(false));
  }, [cfg, page]);

  // Build dozenten map: id → name
  const dozentenMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [id, r] of Object.entries(dozentenRaw)) {
      const vorname = (r.fields.vorname as string) ?? '';
      const nachname = (r.fields.nachname as string) ?? '';
      map[id] = `${vorname} ${nachname}`.trim();
    }
    return map;
  }, [dozentenRaw]);

  // Count active Anmeldungen per Kurs
  const anmeldungenPerKurs = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of Object.values(anmeldungenRaw)) {
      const kursRef = r.fields.kurs;
      const kursId = extractRecordIdFromUrl(kursRef);
      if (kursId) {
        counts[kursId] = (counts[kursId] ?? 0) + 1;
      }
    }
    return counts;
  }, [anmeldungenRaw]);

  // Parse kurse
  const kurse: Kurs[] = useMemo(() => {
    return Object.entries(kurseRaw).map(([id, r]) => {
      const instrument = parseLookupValue(r.fields.instrument);
      const niveau = parseLookupValue(r.fields.niveau);
      const status = parseLookupValue(r.fields.status);
      const wochentage = parseMultiLookup(r.fields.wochentage);
      const dozentRef = extractRecordIdFromUrl(r.fields.dozent);

      return {
        id,
        titel: (r.fields.titel as string) ?? '',
        instrument: instrument?.key ?? null,
        instrumentLabel: instrument?.label ?? null,
        niveau: niveau?.key ?? null,
        niveauLabel: niveau?.label ?? null,
        wochentage,
        dozentId: dozentRef,
        beginn: parseDateTime(r.fields.beginn),
        ende: parseDateTime(r.fields.ende),
        uhrzeit: parseDateTime(r.fields.uhrzeit),
        maximale_teilnehmer: (r.fields.maximale_teilnehmer as number) ?? 0,
        preis: typeof r.fields.preis === 'number' ? (r.fields.preis as number) : null,
        status: status?.key ?? '',
        statusLabel: status?.label ?? null,
      };
    });
  }, [kurseRaw]);

  // Available instruments and niveaus for filter
  const instruments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const k of kurse) {
      if (k.instrument && k.instrumentLabel) seen.set(k.instrument, k.instrumentLabel);
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [kurse]);

  const niveaux = useMemo(() => {
    const seen = new Map<string, string>();
    for (const k of kurse) {
      if (k.niveau && k.niveauLabel) seen.set(k.niveau, k.niveauLabel);
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [kurse]);

  // Filtered + sorted kurse
  const filteredKurse = useMemo(() => {
    return kurse
      .filter(k => !filterInstrument || k.instrument === filterInstrument)
      .filter(k => !filterNiveau || k.niveau === filterNiveau)
      .filter(k => !filterStatus || k.status === filterStatus)
      .sort((a, b) => (a.beginn ?? '').localeCompare(b.beginn ?? ''));
  }, [kurse, filterInstrument, filterNiveau, filterStatus]);

  if (loading || unavailable) {
    return <PublicShell loading={loading} unavailable={unavailable} />;
  }

  const isDataReady = !dataLoading;

  return (
    <PublicShell
      title={tx('Kursübersicht')}
      description={tx('Alle laufenden und geplanten Kurse der Musikschule Klangraum')}
      fullBleed
    >
      {/* Hero section */}
      <div className="bg-gradient-to-b from-primary/10 to-transparent pt-10 pb-6">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-muted-foreground text-base max-w-xl">
            {tx('Entdecke unsere aktuellen Kurse — von Einzel- bis Gruppenunterricht für alle Instrumente und Niveaus.')}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium text-muted-foreground shrink-0">{tx('Filtern:')}</span>

          {/* Status filter */}
          <button
            onClick={() => setFilterStatus(f => f === 'laeuft' ? null : 'laeuft')}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${filterStatus === 'laeuft' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          >
            {tx('Läuft')}
          </button>
          <button
            onClick={() => setFilterStatus(f => f === 'geplant' ? null : 'geplant')}
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${filterStatus === 'geplant' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
          >
            {tx('Geplant')}
          </button>

          {instruments.length > 0 && (
            <span className="text-muted-foreground/40 hidden sm:inline">|</span>
          )}

          {/* Instrument filter */}
          {instruments.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterInstrument(f => f === key ? null : key)}
              className={`text-sm px-3 py-1 rounded-full border transition-colors ${filterInstrument === key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
            >
              {instrumentIcon(key)} {label}
            </button>
          ))}

          {niveaux.length > 0 && (
            <span className="text-muted-foreground/40 hidden sm:inline">|</span>
          )}

          {/* Niveau filter */}
          {niveaux.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterNiveau(f => f === key ? null : key)}
              className={`text-sm px-3 py-1 rounded-full border transition-colors ${filterNiveau === key ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}
            >
              {label}
            </button>
          ))}

          {(filterInstrument || filterNiveau || filterStatus) && (
            <button
              onClick={() => { setFilterInstrument(null); setFilterNiveau(null); setFilterStatus(null); }}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {tx('Filter zurücksetzen')}
            </button>
          )}
        </div>
      </div>

      {/* Course list */}
      <div className="max-w-5xl mx-auto px-4 pb-12">
        {!isDataReady ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border bg-card p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-2/3 mb-3" />
                <div className="h-3 bg-muted rounded w-1/2 mb-2" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : filteredKurse.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <IconMusic size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-base">{tx('Keine Kurse gefunden.')}</p>
            {(filterInstrument || filterNiveau || filterStatus) && (
              <button
                onClick={() => { setFilterInstrument(null); setFilterNiveau(null); setFilterStatus(null); }}
                className="mt-3 text-sm underline underline-offset-2 hover:text-foreground"
              >
                {tx('Filter zurücksetzen')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredKurse.map(kurs => {
              const anmeldungen = anmeldungenPerKurs[kurs.id] ?? 0;
              const freiePlaetze = Math.max(0, kurs.maximale_teilnehmer - anmeldungen);
              const ausgebucht = freiePlaetze === 0;
              const dozentName = kurs.dozentId ? dozentenMap[kurs.dozentId] : null;

              return (
                <div
                  key={kurs.id}
                  className="rounded-xl border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-lg" aria-hidden>{instrumentIcon(kurs.instrument)}</span>
                        <StatusBadge
                          statusKey={kurs.status}
                          label={kurs.statusLabel ?? kurs.status}
                          tone={statusTone(kurs.status)}
                        />
                      </div>
                      <h2 className="font-semibold text-base leading-snug">{kurs.titel}</h2>
                    </div>
                    {kurs.niveau && kurs.niveauLabel && (
                      <StatusBadge
                        statusKey={kurs.niveau}
                        label={kurs.niveauLabel}
                        tone={niveauTone(kurs.niveau)}
                        className="shrink-0"
                      />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                    {dozentName && (
                      <div className="flex items-center gap-1.5">
                        <IconUsers size={14} className="shrink-0" />
                        <span className="truncate">{dozentName}</span>
                      </div>
                    )}
                    {kurs.beginn && (
                      <div className="flex items-center gap-1.5">
                        <IconCalendar size={14} className="shrink-0" />
                        <span>{tx('ab')} {formatBeginn(kurs.beginn)}</span>
                      </div>
                    )}
                    {kurs.wochentage.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <IconCalendar size={14} className="shrink-0" />
                        <span className="truncate">{kurs.wochentage.map(w => w.label).join(', ')}</span>
                      </div>
                    )}
                    {kurs.uhrzeit && (
                      <div className="flex items-center gap-1.5">
                        <IconClock size={14} className="shrink-0" />
                        <span>{formatUhrzeit(kurs.uhrzeit)} {tx('Uhr')}</span>
                      </div>
                    )}
                    {kurs.preis !== null && (
                      <div className="flex items-center gap-1.5">
                        <IconCurrencyEuro size={14} className="shrink-0" />
                        <span>
                          {kurs.preis.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {tx('€ / Kurs')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Freie Plätze */}
                  <div className="mt-auto pt-2 border-t flex items-center justify-between gap-2">
                    <div>
                      {ausgebucht ? (
                        <span className="text-sm font-medium text-amber-600">{tx('Ausgebucht')}</span>
                      ) : (
                        <span className="text-sm">
                          <span className="font-semibold text-emerald-600">{freiePlaetze}</span>
                          {' '}
                          {tx('freie Plätze')}
                        </span>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {tx('von')} {kurs.maximale_teilnehmer} {tx('Plätzen gesamt')}
                      </div>
                    </div>

                    {!ausgebucht && (
                      <Link
                        to={`/public/kursanmeldung?kursId=${kurs.id}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline shrink-0"
                      >
                        {tx('Anmelden')}
                        <IconChevronRight size={14} className="shrink-0" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isDataReady && filteredKurse.length > 0 && (
          <p className="text-xs text-muted-foreground text-center mt-8">
            {tx('Angezeigte Kurse:')} {filteredKurse.length}
          </p>
        )}
      </div>
    </PublicShell>
  );
}
