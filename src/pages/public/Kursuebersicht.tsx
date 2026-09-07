import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, listPublicRecords, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig, type PublicRecordResult,
} from '@/lib/publicClient';
import { tx } from '@/i18n';
import { format, parseISO } from 'date-fns';
import {
  IconMusic, IconUser, IconCalendar, IconClock, IconUsers,
  IconCurrencyEuro, IconSearch, IconChevronRight,
} from '@tabler/icons-react';

// --- Typen ---
interface KursRecord {
  id: string;
  titel: string;
  instrument: string | null;
  niveau: string | null;
  wochentage: string[] | null;
  uhrzeit: string | null;
  beginn: string | null;
  maximale_teilnehmer: number | null;
  preis: number | null;
  status: string | null;
  dozent: string | null; // record-URL
}

interface DozentRecord {
  id: string;
  vorname: string | null;
  nachname: string | null;
}

interface AnmeldungRecord {
  id: string;
  kurs: string | null; // record-URL
  status: string | null;
}

// --- Lookup-Beschriftungen ---
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

const NIVEAU_LABELS: Record<string, string> = {
  anfaenger: 'Anfänger',
  fortgeschritten: 'Fortgeschritten',
  profi: 'Profi',
};

function extractRecordIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/records\/([^/]+)\/?$/);
  return m ? m[1] : null;
}

function parseKurs(r: PublicRecordResult): KursRecord {
  return {
    id: r.id,
    titel: (r.fields.titel as string) ?? '',
    instrument: (r.fields.instrument as string) ?? null,
    niveau: (r.fields.niveau as string) ?? null,
    wochentage: (r.fields.wochentage as string[]) ?? null,
    uhrzeit: (r.fields.uhrzeit as string) ?? null,
    beginn: (r.fields.beginn as string) ?? null,
    maximale_teilnehmer: (r.fields.maximale_teilnehmer as number) ?? null,
    preis: (r.fields.preis as number) ?? null,
    status: (r.fields.status as string) ?? null,
    dozent: (r.fields.dozent as string) ?? null,
  };
}

function parseDozent(r: PublicRecordResult): DozentRecord {
  return {
    id: r.id,
    vorname: (r.fields.vorname as string) ?? null,
    nachname: (r.fields.nachname as string) ?? null,
  };
}

function parseAnmeldung(r: PublicRecordResult): AnmeldungRecord {
  return {
    id: r.id,
    kurs: (r.fields.kurs as string) ?? null,
    status: (r.fields.status as string) ?? null,
  };
}

function formatUhrzeit(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return '';
  }
}

function formatBeginn(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy');
  } catch {
    return '';
  }
}

// --- Pill-Filter-Komponente ---
interface PillProps {
  label: string;
  active: boolean;
  onClick: () => void;
}
function Pill({ label, active, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      {label}
    </button>
  );
}

// --- Kurs-Karte ---
interface KurskarteProps {
  kurs: KursRecord;
  dozentName: string | null;
  anmeldungen: number;
  kursAnmeldungSlug: string;
}

function Kurskarte({ kurs, dozentName, anmeldungen, kursAnmeldungSlug }: KurskarteProps) {
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

  const freie = kurs.maximale_teilnehmer != null
    ? Math.max(0, kurs.maximale_teilnehmer - anmeldungen)
    : null;

  const statusLabel = kurs.status ? STATUS_LABELS[kurs.status] ?? kurs.status : null;
  const isLaeuft = kurs.status === 'laeuft';

  const wochentageText = kurs.wochentage && kurs.wochentage.length > 0
    ? kurs.wochentage.map(w => WOCHENTAG_LABELS[w] ?? w).join(', ')
    : null;

  const uhrzeitText = formatUhrzeit(kurs.uhrzeit);
  const beginnText = formatBeginn(kurs.beginn);
  const niveauLabel = kurs.niveau ? NIVEAU_LABELS[kurs.niveau] ?? kurs.niveau : null;
  const preisText = kurs.preis != null
    ? kurs.preis.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    : null;

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden">
      {/* Oberer farbiger Streifen */}
      <div className={`h-1.5 w-full ${isLaeuft ? 'bg-emerald-500' : 'bg-amber-400'}`} />

      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-base text-foreground leading-tight">{kurs.titel}</h3>
            {kurs.instrument && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {INSTRUMENT_LABELS[kurs.instrument] ?? kurs.instrument}
              </p>
            )}
          </div>
          {statusLabel && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
              isLaeuft ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {statusLabel}
            </span>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col gap-1.5 text-sm">
          {niveauLabel && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <IconMusic size={14} className="shrink-0" />
              <span>{niveauLabel}</span>
            </div>
          )}
          {dozentName && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <IconUser size={14} className="shrink-0" />
              <span>{dozentName}</span>
            </div>
          )}
          {(wochentageText || uhrzeitText) && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <IconCalendar size={14} className="shrink-0" />
              <span>
                {[wochentageText, uhrzeitText].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}
          {beginnText && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <IconClock size={14} className="shrink-0" />
              <span>{tx('ab')} {beginnText}</span>
            </div>
          )}
          {kurs.maximale_teilnehmer != null && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <IconUsers size={14} className="shrink-0" />
              <span>
                {freie != null ? (
                  freie === 0
                    ? tx('Ausgebucht')
                    : tx`${freie} freie Plätze`
                ) : (
                  `${kurs.maximale_teilnehmer} ${tx('Plätze gesamt')}`
                )}
              </span>
            </div>
          )}
          {preisText && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <IconCurrencyEuro size={14} className="shrink-0" />
              <span>{preisText}</span>
            </div>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* CTA */}
        <Link
          to={`/public/${kursAnmeldungSlug}`}
          className="mt-2 flex items-center justify-center gap-1.5 w-full bg-primary text-primary-foreground rounded-lg py-2.5 px-4 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {tx('Jetzt anmelden')}
          <IconChevronRight size={16} className="shrink-0" />
        </Link>
      </div>
    </div>
  );
}

// --- Hauptkomponente ---
export default function Kursuebersicht() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurse, setKurse] = useState<KursRecord[]>([]);
  const [dozenten, setDozenten] = useState<DozentRecord[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<AnmeldungRecord[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [filterInstrument, setFilterInstrument] = useState<string | null>(null);
  const [filterNiveau, setFilterNiveau] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Config laden
  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht').then(c => {
      setCfg(c);
      setPage(c?.pages['kursuebersicht'] ?? null);
      setLoading(false);
    }).catch(err => {
      if (err instanceof PageUnavailableError) {
        setUnavailable(true);
      }
      setLoading(false);
    });
  }, []);

  // Daten laden
  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);

    const kursEp = page.endpoints?.find(e => e.entity === 'kurse' && e.op === 'list');
    const dozentEp = page.endpoints?.find(e => e.entity === 'dozenten' && e.op === 'list');
    const anmeldungEp = page.endpoints?.find(e => e.entity === 'anmeldungen' && e.op === 'list');

    Promise.all([
      kursEp
        ? listPublicRecords(cfg, page, { appId: kursEp.app_id })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
      dozentEp
        ? listPublicRecords(cfg, page, { appId: dozentEp.app_id })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
      anmeldungEp
        ? listPublicRecords(cfg, page, { appId: anmeldungEp.app_id })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ]).then(([kursRes, dozentRes, anmeldungRes]) => {
      setKurse(Object.values(kursRes).map(parseKurs));
      setDozenten(Object.values(dozentRes).map(parseDozent));
      setAnmeldungen(Object.values(anmeldungRes).map(parseAnmeldung));
      setDataLoading(false);
    }).catch(() => {
      setDataLoading(false);
    });
  }, [cfg, page]);

  // Dozenten-Map
  const dozentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dozenten) {
      const name = [d.vorname, d.nachname].filter(Boolean).join(' ');
      if (name) m.set(d.id, name);
    }
    return m;
  }, [dozenten]);

  // Anmeldungen pro Kurs zählen (nur bestaetigt + neu)
  const anmeldungenProKurs = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of anmeldungen) {
      if (a.status !== 'bestaetigt' && a.status !== 'neu') continue;
      const kursId = extractRecordIdFromUrl(a.kurs);
      if (!kursId) continue;
      m.set(kursId, (m.get(kursId) ?? 0) + 1);
    }
    return m;
  }, [anmeldungen]);

  // Verfügbare Instrumente aus den geladenen Kursen
  const verfuegbareInstrumente = useMemo(() => {
    const seen = new Set<string>();
    for (const k of kurse) {
      if (k.instrument) seen.add(k.instrument);
    }
    return Array.from(seen).sort((a, b) =>
      (INSTRUMENT_LABELS[a] ?? a).localeCompare(INSTRUMENT_LABELS[b] ?? b, 'de')
    );
  }, [kurse]);

  // Verfügbare Niveaus
  const verfuegbareNiveaus = useMemo(() => {
    const seen = new Set<string>();
    for (const k of kurse) {
      if (k.niveau) seen.add(k.niveau);
    }
    const order = ['anfaenger', 'fortgeschritten', 'profi'];
    return Array.from(seen).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [kurse]);

  // Gefilterte Kurse
  const gefilterteKurse = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kurse.filter(k => {
      if (filterInstrument && k.instrument !== filterInstrument) return false;
      if (filterNiveau && k.niveau !== filterNiveau) return false;
      if (q) {
        const instrumentLabel = k.instrument ? (INSTRUMENT_LABELS[k.instrument] ?? k.instrument) : '';
        const dozentName = k.dozent
          ? (dozentMap.get(extractRecordIdFromUrl(k.dozent) ?? '') ?? '')
          : '';
        const haystack = [k.titel, instrumentLabel, dozentName].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [kurse, filterInstrument, filterNiveau, search, dozentMap]);

  if (loading) return <PublicShell loading />;
  if (unavailable || !cfg || !page) return <PublicShell unavailable />;

  const kursCount = gefilterteKurse.length;

  return (
    <PublicShell
      title={tx('Kursübersicht')}
      description={tx('Alle laufenden und geplanten Kurse der Musikschule Klangraum')}
      fullBleed
    >
      {/* Hero-Band */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            {tx('Entdecke unsere Kurse und melde dich direkt online an.')}
          </p>
        </div>
      </div>

      {/* Filter-Band */}
      <div className="bg-background border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col gap-3">
          {/* Suche */}
          <div className="relative">
            <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tx('Kurs suchen …')}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Instrument-Pills */}
          {verfuegbareInstrumente.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              <Pill
                label={tx('Alle')}
                active={filterInstrument === null}
                onClick={() => setFilterInstrument(null)}
              />
              {verfuegbareInstrumente.map(instr => (
                <Pill
                  key={instr}
                  label={INSTRUMENT_LABELS[instr] ?? instr}
                  active={filterInstrument === instr}
                  onClick={() => setFilterInstrument(filterInstrument === instr ? null : instr)}
                />
              ))}
            </div>
          )}

          {/* Niveau-Pills */}
          {verfuegbareNiveaus.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
              <Pill
                label={tx('Alle Niveaus')}
                active={filterNiveau === null}
                onClick={() => setFilterNiveau(null)}
              />
              {verfuegbareNiveaus.map(niv => (
                <Pill
                  key={niv}
                  label={NIVEAU_LABELS[niv] ?? niv}
                  active={filterNiveau === niv}
                  onClick={() => setFilterNiveau(filterNiveau === niv ? null : niv)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Kurs-Grid */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {dataLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-muted/40 rounded-xl h-56 animate-pulse" />
            ))}
          </div>
        ) : kursCount === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <IconMusic size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{tx('Keine Kurse gefunden')}</p>
            <p className="text-sm mt-1">
              {(filterInstrument || filterNiveau || search)
                ? tx('Versuche andere Filtereinstellungen.')
                : tx('Aktuell sind keine Kurse verfügbar.')}
            </p>
            {(filterInstrument || filterNiveau || search) && (
              <button
                type="button"
                onClick={() => { setFilterInstrument(null); setFilterNiveau(null); setSearch(''); }}
                className="mt-4 text-sm text-primary underline underline-offset-2"
              >
                {tx('Filter zurücksetzen')}
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              {tx`${kursCount} Kurse gefunden`}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {gefilterteKurse.map(kurs => {
                const dozentId = extractRecordIdFromUrl(kurs.dozent);
                const dozentName = dozentId ? (dozentMap.get(dozentId) ?? null) : null;
                const gebuchte = anmeldungenProKurs.get(kurs.id) ?? 0;
                return (
                  <Kurskarte
                    key={kurs.id}
                    kurs={kurs}
                    dozentName={dozentName}
                    anmeldungen={gebuchte}
                    kursAnmeldungSlug="kursanmeldung"
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </PublicShell>
  );
}
