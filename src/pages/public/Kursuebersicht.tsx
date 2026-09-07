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
  IconChevronRight,
  IconAlertCircle,
} from '@tabler/icons-react';

// ---- Typen ----------------------------------------------------------------

interface Kurs {
  id: string;
  titel: string;
  instrument: string;         // lookup key
  instrumentLabel: string;    // lookup label
  niveau: string | null;
  niveauLabel: string | null;
  wochentage: string[];       // array of lookup keys
  wochentageLabels: string[];
  beginn: string | null;
  ende: string | null;
  uhrzeit: string | null;
  dozentRef: string | null;
  maximale_teilnehmer: number;
  preis: number | null;
  status: string;
}

// Lookup-Label-Maps (Deutsch – die Translations-Pipeline überschreibt das)
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

// ---- Helfer ---------------------------------------------------------------

function parseKurs(r: PublicRecordResult): Kurs {
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

  const f = r.fields;
  const instrKey = (f.instrument as string) ?? '';
  const niveauKey = (f.niveau as string) ?? null;
  const wochentageKeys = Array.isArray(f.wochentage) ? (f.wochentage as string[]) : [];
  return {
    id: r.id,
    titel: (f.titel as string) ?? '',
    instrument: instrKey,
    instrumentLabel: INSTRUMENT_LABELS[instrKey] ?? instrKey,
    niveau: niveauKey,
    niveauLabel: niveauKey ? (NIVEAU_LABELS[niveauKey] ?? niveauKey) : null,
    wochentage: wochentageKeys,
    wochentageLabels: wochentageKeys.map(k => WOCHENTAG_LABELS[k] ?? k),
    beginn: (f.beginn as string) ?? null,
    ende: (f.ende as string) ?? null,
    uhrzeit: (f.uhrzeit as string) ?? null,
    dozentRef: (f.dozent as string) ?? null,
    maximale_teilnehmer: ((f.maximale_teilnehmer as number) ?? 0),
    preis: (f.preis as number) ?? null,
    status: (f.status as string) ?? '',
  };
}

function extractId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/records\/([^/]+)\/?$/);
  return m ? m[1] : null;
}

function formatUhrzeit(iso: string | null): string {
  if (!iso) return '–';
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '–';
  }
}

function formatBeginn(iso: string | null): string {
  if (!iso) return '–';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy');
  } catch {
    return '–';
  }
}

// ---- Hauptkomponente -------------------------------------------------------

export default function Kursuebersicht() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurseRaw, setKurseRaw] = useState<Record<string, PublicRecordResult>>({});
  const [dozenten, setDozenten] = useState<Record<string, PublicRecordResult>>({});
  const [anmeldungen, setAnmeldungen] = useState<Record<string, PublicRecordResult>>({});
  const [dataLoading, setDataLoading] = useState(false);

  // App-IDs
  const KURSE_APP_ID = '6a9ae0da29ba5927e215786b';
  const DOZENTEN_APP_ID = '6a9ae0d5d12309fd2a39c8d5';
  const ANMELDUNGEN_APP_ID = '6a9ae0db0ae4338ee1e48cd2';

  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht')
      .then(c => {
        setCfg(c);
        setPage(c?.pages['kursuebersicht'] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) {
          setUnavailable(true);
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);
    Promise.all([
      listPublicRecords(cfg, page, { appId: KURSE_APP_ID, limit: 500 }),
      listPublicRecords(cfg, page, { appId: DOZENTEN_APP_ID, limit: 200 }),
      listPublicRecords(cfg, page, { appId: ANMELDUNGEN_APP_ID, limit: 500 }),
    ]).then(([k, d, a]) => {
      setKurseRaw(k);
      setDozenten(d);
      setAnmeldungen(a);
    }).finally(() => setDataLoading(false));
  }, [cfg, page]);

  // Anmeldungen pro Kurs zählen (nur aktive Status)
  const registrationsByKurs = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of Object.values(anmeldungen)) {
      const status = (r.fields.status as string) ?? '';
      if (!['neu', 'bestaetigt', 'warteliste'].includes(status)) continue;
      const kursRef = (r.fields.kurs as string) ?? '';
      const kursId = extractId(kursRef);
      if (!kursId) continue;
      counts[kursId] = (counts[kursId] ?? 0) + 1;
    }
    return counts;
  }, [anmeldungen]);

  // Dozenten-Map: id → Name
  const dozentNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [, r] of Object.entries(dozenten)) {
      const vorname = (r.fields.vorname as string) ?? '';
      const nachname = (r.fields.nachname as string) ?? '';
      map[r.id] = [vorname, nachname].filter(Boolean).join(' ');
    }
    return map;
  }, [dozenten]);

  // Kurse parsen, filtern (geplant|laeuft), anreichern
  const kurse: (Kurs & { dozentName: string; freie_plaetze: number })[] = useMemo(() => {
    return Object.values(kurseRaw)
      .map(parseKurs)
      .filter(k => k.status === 'geplant' || k.status === 'laeuft')
      .map(k => {
        const dozentId = extractId(k.dozentRef);
        const dozentName = dozentId ? (dozentNameById[dozentId] ?? '–') : '–';
        const registered = registrationsByKurs[k.id] ?? 0;
        const freie_plaetze = Math.max(0, k.maximale_teilnehmer - registered);
        return { ...k, dozentName, freie_plaetze };
      })
      .sort((a, b) => a.instrumentLabel.localeCompare(b.instrumentLabel));
  }, [kurseRaw, dozentNameById, registrationsByKurs]);

  // Gruppierung nach Instrument
  const grouped = useMemo(() => {
    const groups: Record<string, typeof kurse> = {};
    for (const k of kurse) {
      if (!groups[k.instrument]) groups[k.instrument] = [];
      groups[k.instrument].push(k);
    }
    return groups;
  }, [kurse]);

  if (loading || unavailable) {
    return <PublicShell loading={loading} unavailable={unavailable} />;
  }

  if (!cfg || !page) {
    return <PublicShell unavailable />;
  }

  const instrumentKeys = Object.keys(grouped).sort((a, b) =>
    (INSTRUMENT_LABELS[a] ?? a).localeCompare(INSTRUMENT_LABELS[b] ?? b)
  );

  return (
    <PublicShell
      title={tx('Kursübersicht – Musikschule Klangraum')}
      description={tx('Alle aktuell geplanten und laufenden Kurse auf einen Blick')}
      fullBleed
    >
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
        {dataLoading && (
          <div className="text-center py-16 text-muted-foreground">
            <IconMusic size={40} className="mx-auto mb-3 opacity-40" stroke={1.5} />
            <p>{tx('Kurse werden geladen …')}</p>
          </div>
        )}

        {!dataLoading && kurse.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <IconMusic size={48} className="mx-auto mb-4 opacity-30" stroke={1.5} />
            <p className="text-lg font-medium">{tx('Aktuell keine Kurse verfügbar')}</p>
            <p className="text-sm mt-1">{tx('Schaue bald wieder vorbei – neue Kurse folgen.')}</p>
          </div>
        )}

        {!dataLoading && instrumentKeys.map(instrKey => {
          const group = grouped[instrKey];
          const instrLabel = INSTRUMENT_LABELS[instrKey] ?? instrKey;
          return (
            <section key={instrKey}>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-primary">{instrLabel}</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {group.length === 1
                    ? tx('1 Kurs')
                    : tx`${group.length} Kurse`}
                </span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.map(kurs => {
                  const voll = kurs.freie_plaetze === 0;
                  return (
                    <div
                      key={kurs.id}
                      className="rounded-xl border bg-card p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-base leading-tight truncate">{kurs.titel}</p>
                          {kurs.niveauLabel && (
                            <span className="text-xs text-muted-foreground mt-0.5 block">{kurs.niveauLabel}</span>
                          )}
                        </div>
                        {kurs.status === 'laeuft' && (
                          <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                            {tx('läuft')}
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      <div className="space-y-1.5 text-sm text-muted-foreground">
                        {kurs.wochentageLabels.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <IconCalendar size={14} className="shrink-0" />
                            <span>{kurs.wochentageLabels.join(', ')}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <IconClock size={14} className="shrink-0" />
                          <span>
                            {kurs.uhrzeit ? formatUhrzeit(kurs.uhrzeit) : '–'}
                            {kurs.beginn ? ` · ${tx('ab')} ${formatBeginn(kurs.beginn)}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <IconUser size={14} className="shrink-0" />
                          <span>{kurs.dozentName}</span>
                        </div>
                      </div>

                      {/* Freie Plätze */}
                      <div className={`flex items-center gap-1.5 text-sm font-medium ${voll ? 'text-amber-600' : 'text-emerald-700'}`}>
                        {voll
                          ? <><IconAlertCircle size={14} className="shrink-0" />{tx('Ausgebucht')}</>
                          : <span>{tx`${kurs.freie_plaetze} freie Plätze`}</span>
                        }
                      </div>

                      {/* Preis + CTA */}
                      <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t">
                        <span className="text-sm text-muted-foreground">
                          {kurs.preis != null
                            ? `${kurs.preis.toLocaleString('de-DE')} €`
                            : ''}
                        </span>
                        <Link
                          to={`/public/kursanmeldung?kursId=${kurs.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline shrink-0"
                        >
                          {tx('Jetzt anmelden')}
                          <IconChevronRight size={14} className="shrink-0" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </PublicShell>
  );
}
