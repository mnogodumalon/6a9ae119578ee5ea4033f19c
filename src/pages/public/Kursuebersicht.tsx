import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, listPublicRecords,
  type PublicPagesConfig, type PublicPageConfig, type PublicRecordResult,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import { format, parseISO } from 'date-fns';
import {
  IconMusic, IconCalendar, IconClock, IconUsers, IconCurrencyEuro,
  IconStar, IconChevronRight, IconFilter,
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
  beginn: string | null;
  ende: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number | null;
  preis: number | null;
  status: string | null;
}

interface AnmeldungRecord {
  id: string;
  kurs: string | null;
  status: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractKursId(kursUrl: string | null): string | null {
  if (!kursUrl) return null;
  const parts = kursUrl.split('/records/');
  return parts[1] ?? null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(parseISO(dateStr), 'dd.MM.yyyy');
  } catch {
    return dateStr;
  }
}

function formatTime(datetimeStr: string | null): string {
  if (!datetimeStr) return '—';
  try {
    return format(parseISO(datetimeStr), 'HH:mm') + ' Uhr';
  } catch {
    return datetimeStr;
  }
}

function formatPreis(preis: number | null): string {
  if (preis == null) return '—';
  return preis.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Kursuebersicht() {
  const STATUS_LABELS: Record<string, string> = {
  geplant: 'Geplant',
  laeuft: 'Läuft',
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
  const [anmeldungen, setAnmeldungen] = useState<AnmeldungRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [filterInstrument, setFilterInstrument] = useState<string>('');
  const [filterNiveau, setFilterNiveau] = useState<string>('');

  // Load config
  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht').then(c => {
      setCfg(c);
      setPage(c?.pages['kursuebersicht'] ?? null);
      setLoading(false);
    });
  }, []);

  // Load data once config is available
  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);

    const kurseEp = page.endpoints?.find(e => e.entity === 'kurse' && e.op === 'list');
    const anmeldungenEp = page.endpoints?.find(e => e.entity === 'anmeldungen' && e.op === 'list');

    const kurseProm = kurseEp?.app_id
      ? listPublicRecords(cfg, page, { appId: kurseEp.app_id, limit: 200 })
      : Promise.resolve<Record<string, PublicRecordResult>>({});

    const anmeldungenProm = anmeldungenEp?.app_id
      ? listPublicRecords(cfg, page, { appId: anmeldungenEp.app_id, limit: 500 })
      : Promise.resolve<Record<string, PublicRecordResult>>({});

    Promise.all([kurseProm, anmeldungenProm]).then(([kursData, anmeldungData]) => {
      setKurse(
        Object.values(kursData).map(r => ({
          id: r.id,
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
        }))
      );
      setAnmeldungen(
        Object.values(anmeldungData).map(r => ({
          id: r.id,
          kurs: (r.fields.kurs as string) ?? null,
          status: (r.fields.status as string) ?? null,
        }))
      );
      setDataLoading(false);
    }).catch(() => setDataLoading(false));
  }, [cfg, page]);

  // Count active registrations per course
  const anmeldungenByKurs = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of anmeldungen) {
      const kursId = extractKursId(a.kurs);
      if (!kursId) continue;
      map[kursId] = (map[kursId] ?? 0) + 1;
    }
    return map;
  }, [anmeldungen]);

  // Unique instruments and niveaus for filter
  const instruments = useMemo(() => {
    const seen = new Set<string>();
    for (const k of kurse) {
      if (k.instrument) seen.add(k.instrument);
    }
    return Array.from(seen).sort();
  }, [kurse]);

  const niveaus = useMemo(() => {
    const seen = new Set<string>();
    for (const k of kurse) {
      if (k.niveau) seen.add(k.niveau);
    }
    return Array.from(seen).sort();
  }, [kurse]);

  // Filtered courses
  const filteredKurse = useMemo(() => {
    return kurse.filter(k => {
      if (filterInstrument && k.instrument !== filterInstrument) return false;
      if (filterNiveau && k.niveau !== filterNiveau) return false;
      return true;
    });
  }, [kurse, filterInstrument, filterNiveau]);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }

  return (
    <PublicShell
      title={tx('Kursübersicht')}
      description={tx('Alle aktuellen und geplanten Kurse der Musikschule Klangraum')}
      fullBleed
    >
      {/* Hero band */}
      <div className="bg-primary/5 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-1">
            <IconMusic size={32} className="text-primary shrink-0" />
            <h2 className="text-2xl font-bold text-foreground">{tx('Unsere Kurse')}</h2>
          </div>
          <p className="text-muted-foreground ml-[44px]">
            {tx('Entdecke das Kursangebot der Musikschule Klangraum und melde dich direkt online an.')}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="border-b border-border bg-background/80 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
            <IconFilter size={15} className="shrink-0" />
            {tx('Filtern:')}
          </div>

          {/* Instrument filter */}
          <select
            className="rounded-md border border-border bg-background text-sm px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={filterInstrument}
            onChange={e => setFilterInstrument(e.target.value)}
            aria-label={tx('Instrument')}
          >
            <option value="">{tx('Alle Instrumente')}</option>
            {instruments.map(i => (
              <option key={i} value={i}>{INSTRUMENT_LABELS[i] ?? i}</option>
            ))}
          </select>

          {/* Niveau filter */}
          <select
            className="rounded-md border border-border bg-background text-sm px-3 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            value={filterNiveau}
            onChange={e => setFilterNiveau(e.target.value)}
            aria-label={tx('Niveau')}
          >
            <option value="">{tx('Alle Niveaus')}</option>
            {niveaus.map(n => (
              <option key={n} value={n}>{NIVEAU_LABELS[n] ?? n}</option>
            ))}
          </select>

          {(filterInstrument || filterNiveau) && (
            <button
              className="text-sm text-primary hover:underline"
              onClick={() => { setFilterInstrument(''); setFilterNiveau(''); }}
            >
              {tx('Filter zurücksetzen')}
            </button>
          )}

          <span className="ml-auto text-sm text-muted-foreground">
            {filteredKurse.length === 1
              ? tx('1 Kurs')
              : `${filteredKurse.length} ${tx('Kurse')}`
            }
          </span>
        </div>
      </div>

      {/* Course list */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {dataLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
                <div className="h-5 bg-muted rounded w-3/4 mb-3" />
                <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-4 bg-muted rounded w-1/3 mb-4" />
                <div className="h-9 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : filteredKurse.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <IconMusic size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">{tx('Keine Kurse gefunden')}</p>
            <p className="text-sm mt-1">{tx('Versuche, die Filter anzupassen.')}</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredKurse.map(kurs => {
              const anmeldungenCount = anmeldungenByKurs[kurs.id] ?? 0;
              const maxTn = kurs.maximale_teilnehmer ?? 0;
              const frei = Math.max(0, maxTn - anmeldungenCount);
              const ausgebucht = maxTn > 0 && frei === 0;
              const wenigeFreiePlaetze = !ausgebucht && maxTn > 0 && frei <= 3;

              return (
                <div
                  key={kurs.id}
                  className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  {/* Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold text-foreground leading-snug">{kurs.titel}</h3>
                      {kurs.status && (
                        <span className={[
                          'shrink-0 text-xs font-medium px-2 py-0.5 rounded-full',
                          kurs.status === 'laeuft'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700',
                        ].join(' ')}>
                          {STATUS_LABELS[kurs.status] ?? kurs.status}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {kurs.instrument && (
                        <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">
                          <IconMusic size={11} className="shrink-0" />
                          {INSTRUMENT_LABELS[kurs.instrument] ?? kurs.instrument}
                        </span>
                      )}
                      {kurs.niveau && (
                        <span className="inline-flex items-center gap-1 text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
                          <IconStar size={11} className="shrink-0" />
                          {NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-sm text-muted-foreground">
                    {(kurs.beginn || kurs.ende) && (
                      <div className="flex items-center gap-2">
                        <IconCalendar size={14} className="shrink-0 text-muted-foreground/60" />
                        <span>
                          {formatDate(kurs.beginn)}
                          {kurs.ende && kurs.ende !== kurs.beginn && ` – ${formatDate(kurs.ende)}`}
                        </span>
                      </div>
                    )}
                    {kurs.uhrzeit && (
                      <div className="flex items-center gap-2">
                        <IconClock size={14} className="shrink-0 text-muted-foreground/60" />
                        <span>{formatTime(kurs.uhrzeit)}</span>
                        {kurs.wochentage && kurs.wochentage.length > 0 && (
                          <span className="flex gap-1">
                            {kurs.wochentage.map(t => (
                              <span key={t} className="text-xs bg-muted rounded px-1">
                                {WOCHENTAG_LABELS[t] ?? t}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    )}
                    {!kurs.uhrzeit && kurs.wochentage && kurs.wochentage.length > 0 && (
                      <div className="flex items-center gap-2">
                        <IconCalendar size={14} className="shrink-0 text-muted-foreground/60" />
                        <span className="flex gap-1">
                          {kurs.wochentage.map(t => (
                            <span key={t} className="text-xs bg-muted rounded px-1">
                              {WOCHENTAG_LABELS[t] ?? t}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                    {maxTn > 0 && (
                      <div className="flex items-center gap-2">
                        <IconUsers size={14} className="shrink-0 text-muted-foreground/60" />
                        {ausgebucht ? (
                          <span className="text-red-600 font-medium">{tx('Ausgebucht')}</span>
                        ) : wenigeFreiePlaetze ? (
                          <span className="text-amber-600 font-medium">
                            {frei === 1
                              ? tx('Nur noch 1 freier Platz')
                              : `${tx('Noch')} ${frei} ${tx('freie Plätze')}`
                            }
                          </span>
                        ) : (
                          <span>
                            {frei} {tx('freie Plätze')} {tx('von')} {maxTn}
                          </span>
                        )}
                      </div>
                    )}
                    {kurs.preis != null && (
                      <div className="flex items-center gap-2">
                        <IconCurrencyEuro size={14} className="shrink-0 text-muted-foreground/60" />
                        <span>{formatPreis(kurs.preis)}</span>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="mt-auto pt-1">
                    {ausgebucht ? (
                      <div className="w-full text-center text-sm text-muted-foreground bg-muted rounded-lg py-2 px-4">
                        {tx('Keine freien Plätze')}
                      </div>
                    ) : (
                      <Link
                        to={`/public/kursanmeldung?kursId=${kurs.id}`}
                        className="flex items-center justify-center gap-2 w-full bg-primary text-primary-foreground rounded-lg py-2 px-4 text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        {tx('Jetzt anmelden')}
                        <IconChevronRight size={16} className="shrink-0" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PublicShell>
  );
}
