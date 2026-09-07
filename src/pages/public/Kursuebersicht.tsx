import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { tx, dateFnsLocale } from '@/i18n';
import { format, parseISO } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Kurs {
  id: string;
  titel: string;
  instrument: string;
  instrumentLabel: string;
  niveau: string | null;
  niveauLabel: string | null;
  wochentage: string[];
  wochentageLabels: string[];
  beginn: string | null;
  ende: string | null;
  uhrzeit: string | null;
  maximale_teilnehmer: number;
  preis: number | null;
  status: string;
}

interface AnmeldungSlim {
  id: string;
  kursId: string | null;
  statusKey: string | null;
}

// ---------------------------------------------------------------------------
// Lookup label maps (static — values from the schema)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractLookupKey(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'key' in v) return (v as { key: string }).key;
  return null;
}

function extractMultiLookupKeys(v: unknown): string[] {
  if (!v || !Array.isArray(v)) return [];
  return v.map(extractLookupKey).filter((k): k is string => k !== null);
}

function extractRefId(v: unknown): string | null {
  if (!v || typeof v !== 'string') return null;
  const parts = v.split('/');
  return parts[parts.length - 1] || null;
}

function formatUhrzeit(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'HH:mm');
  } catch {
    return null;
  }
}

function formatBeginn(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'd. MMMM yyyy', { locale: dateFnsLocale() });
  } catch {
    return null;
  }
}

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
  const instrumentKey = extractLookupKey(f.instrument) ?? '';
  const niveauKey = extractLookupKey(f.niveau);
  const wdKeys = extractMultiLookupKeys(f.wochentage);

  return {
    id: r.id,
    titel: (f.titel as string) ?? '',
    instrument: instrumentKey,
    instrumentLabel: INSTRUMENT_LABELS[instrumentKey] ?? instrumentKey,
    niveau: niveauKey,
    niveauLabel: niveauKey ? (NIVEAU_LABELS[niveauKey] ?? niveauKey) : null,
    wochentage: wdKeys,
    wochentageLabels: wdKeys.map(k => WOCHENTAG_LABELS[k] ?? k),
    beginn: (f.beginn as string) ?? null,
    ende: (f.ende as string) ?? null,
    uhrzeit: (f.uhrzeit as string) ?? null,
    maximale_teilnehmer: (f.maximale_teilnehmer as number) ?? 0,
    preis: (f.preis as number) ?? null,
    status: extractLookupKey(f.status) ?? '',
  };
}

function parseAnmeldung(r: PublicRecordResult): AnmeldungSlim {
  const f = r.fields;
  const kursRef = (f.kurs as string) ?? null;
  return {
    id: r.id,
    kursId: extractRefId(kursRef),
    statusKey: extractLookupKey(f.status),
  };
}

// ---------------------------------------------------------------------------
// Card component
// ---------------------------------------------------------------------------

function FreiePlaetze({ total, belegt }: { total: number; belegt: number }) {
  const frei = Math.max(0, total - belegt);
  if (frei === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
        {tx('Warteliste möglich')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      {tx`${frei} freie Plätze`}
    </span>
  );
}

function KursCard({
  kurs,
  belegt,
}: {
  kurs: Kurs;
  belegt: number;
}) {
  const uhrzeit = formatUhrzeit(kurs.uhrzeit);
  const beginn = formatBeginn(kurs.beginn);
  const frei = Math.max(0, kurs.maximale_teilnehmer - belegt);

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Top accent bar */}
      <div
        className="h-1 w-full"
        style={{ background: kurs.status === 'laeuft' ? '#10b981' : '#6366f1' }}
      />
      <div className="flex flex-col gap-3 p-5 flex-1">
        {/* Title + status */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-foreground leading-snug">{kurs.titel}</h3>
          {kurs.status === 'laeuft' ? (
            <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {tx('Läuft')}
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {tx('Geplant')}
            </span>
          )}
        </div>

        {/* Meta rows */}
        <dl className="space-y-1.5 text-sm text-muted-foreground">
          {kurs.niveauLabel && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-foreground">{tx('Niveau')}</dt>
              <dd>{kurs.niveauLabel}</dd>
            </div>
          )}
          {kurs.wochentageLabels.length > 0 && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-foreground">{tx('Tage')}</dt>
              <dd>{kurs.wochentageLabels.join(', ')}</dd>
            </div>
          )}
          {uhrzeit && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-foreground">{tx('Uhrzeit')}</dt>
              <dd>{uhrzeit} {tx('Uhr')}</dd>
            </div>
          )}
          {beginn && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-foreground">{tx('Beginn')}</dt>
              <dd>{beginn}</dd>
            </div>
          )}
          {kurs.preis !== null && (
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-medium text-foreground">{tx('Preis')}</dt>
              <dd>
                {new Intl.NumberFormat('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(kurs.preis)}
                {' '}{tx('/ Kurs')}
              </dd>
            </div>
          )}
        </dl>

        {/* Free spots */}
        <div className="pt-1">
          <FreiePlaetze total={kurs.maximale_teilnehmer} belegt={belegt} />
        </div>
      </div>

      {/* CTA */}
      <div className="border-t border-border px-5 py-3 bg-muted/30">
        {frei > 0 ? (
          <Link
            to={`/public/kursanmeldung?kurs=${kurs.id}`}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {tx('Jetzt anmelden')}
          </Link>
        ) : (
          <Link
            to={`/public/kursanmeldung?kurs=${kurs.id}`}
            className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            {tx('Auf Warteliste')}
          </Link>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const INSTRUMENT_ORDER = [
  'klavier', 'gitarre', 'violine', 'cello',
  'querfloete', 'klarinette', 'schlagzeug', 'gesang', 'blockfloete',
];

export default function Kursuebersicht() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [kurse, setKurse] = useState<Kurs[]>([]);
  const [anmeldungen, setAnmeldungen] = useState<AnmeldungSlim[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [filterInstrument, setFilterInstrument] = useState<string | null>(null);

  // Load config
  useEffect(() => {
    loadPublicPagesConfig('kursuebersicht').then(c => {
      if (!c) { setLoadError(true); setLoading(false); return; }
      setCfg(c);
      setPage(c?.pages['kursuebersicht'] ?? null);
      setLoading(false);
    }).catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  // Load data once config is ready
  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);

    const kursEp = page.endpoints?.find(e => e.op === 'list' && e.entity === 'kurse');
    const anmEp = page.endpoints?.find(e => e.op === 'list' && e.entity === 'anmeldungen');

    Promise.all([
      kursEp
        ? listPublicRecords(cfg, page, { appId: kursEp.app_id, limit: 500 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
      anmEp
        ? listPublicRecords(cfg, page, { appId: anmEp.app_id, limit: 500 })
        : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ]).then(([kursMap, anmMap]) => {
      setKurse(Object.values(kursMap).map(parseKurs));
      setAnmeldungen(Object.values(anmMap).map(parseAnmeldung));
    }).finally(() => setDataLoading(false));
  }, [cfg, page]);

  // Compute active anmeldungen per kurs
  const belegtPerKurs = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of anmeldungen) {
      if (!a.kursId) continue;
      // count where status != abgemeldet
      if (a.statusKey === 'abgemeldet') continue;
      map[a.kursId] = (map[a.kursId] ?? 0) + 1;
    }
    return map;
  }, [anmeldungen]);

  // Active instruments in the data
  const availableInstruments = useMemo(() => {
    const inData = new Set(kurse.map(k => k.instrument));
    return INSTRUMENT_ORDER.filter(i => inData.has(i));
  }, [kurse]);

  // Filtered kurse
  const visibleKurse = useMemo(() => {
    if (!filterInstrument) return kurse;
    return kurse.filter(k => k.instrument === filterInstrument);
  }, [kurse, filterInstrument]);

  // Group by instrument
  const grouped = useMemo(() => {
    const order = filterInstrument ? [filterInstrument] : availableInstruments;
    return order.map(inst => ({
      instrument: inst,
      label: INSTRUMENT_LABELS[inst] ?? inst,
      kurse: visibleKurse.filter(k => k.instrument === inst),
    })).filter(g => g.kurse.length > 0);
  }, [visibleKurse, filterInstrument, availableInstruments]);

  if (loading) {
    return <PublicShell loading />;
  }
  if (loadError || !cfg || !page) {
    return <PublicShell unavailable />;
  }

  return (
    <PublicShell
      title={tx('Kursübersicht – Musikschule Klangraum')}
      description={tx('Entdecke unser Kursangebot und melde dich direkt online an.')}
      fullBleed
    >
      {/* Hero band */}
      <section className="bg-gradient-to-br from-indigo-600 to-indigo-800 py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-200 mb-2">
            {tx('Musikschule Klangraum')}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {tx('Alle Kurse auf einen Blick')}
          </h1>
          <p className="text-indigo-200 text-base sm:text-lg max-w-xl mx-auto">
            {tx('Laufende und geplante Kurse — einfach stöbern und direkt anmelden.')}
          </p>
        </div>
      </section>

      {/* Filter bar */}
      {availableInstruments.length > 1 && (
        <section className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border py-3 px-4">
          <div className="max-w-5xl mx-auto flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-muted-foreground mr-1 shrink-0">
              {tx('Instrument:')}
            </span>
            <button
              onClick={() => setFilterInstrument(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterInstrument === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tx('Alle')}
            </button>
            {availableInstruments.map(inst => (
              <button
                key={inst}
                onClick={() => setFilterInstrument(f => f === inst ? null : inst)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterInstrument === inst
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {INSTRUMENT_LABELS[inst] ?? inst}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Course grid */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        {dataLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
            {tx('Kurse werden geladen …')}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-muted-foreground text-base">
              {tx('Aktuell sind keine Kurse verfügbar.')}
            </p>
            <p className="text-sm text-muted-foreground">
              {tx('Bitte schau später wieder vorbei oder kontaktiere uns direkt.')}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {grouped.map(group => (
              <div key={group.instrument}>
                <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  {group.label}
                  <span className="text-xs font-normal text-muted-foreground">
                    {tx`${group.kurse.length} Kurs${group.kurse.length === 1 ? '' : 'e'}`}
                  </span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.kurse.map(kurs => (
                    <KursCard
                      key={kurs.id}
                      kurs={kurs}
                      belegt={belegtPerKurs[kurs.id] ?? 0}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer note */}
      <div className="border-t border-border py-8 px-4 text-center text-sm text-muted-foreground">
        <p>
          {tx('Fragen? Melde dich bei uns')} —{' '}
          <Link to="/public/kursanmeldung" className="underline underline-offset-2 hover:text-foreground">
            {tx('zur Anmeldung')}
          </Link>
        </p>
      </div>
    </PublicShell>
  );
}
