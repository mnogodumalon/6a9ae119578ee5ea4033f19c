import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicRecordResult,
} from '@/lib/publicClient';
import { PublicShell } from '@/components/PublicShell';
import { tx, dateFnsLocale } from '@/i18n';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { format, parseISO } from 'date-fns';
import {
  IconMusic,
  IconCalendar,
  IconClock,
  IconUser,
  IconCurrencyEuro,
  IconUsersGroup,
  IconChevronRight,
} from '@tabler/icons-react';

const SLUG = 'kursuebersicht';

interface KursRecord {
  id: string;
  titel: string;
  instrument: { key: string; label: string } | null;
  niveau: { key: string; label: string } | null;
  wochentage: Array<{ key: string; label: string }>;
  uhrzeit: string | null;
  beginn: string | null;
  ende: string | null;
  maximale_teilnehmer: number;
  preis: number | null;
  status: { key: string; label: string } | null;
  dozentRef: string | null;
}

interface DozentRecord {
  id: string;
  vorname: string;
  nachname: string;
}

function extractRecordIdFromRef(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const parts = ref.split('/records/');
  return parts.length === 2 ? parts[1] : null;
}

function formatUhrzeit(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'HH:mm', { locale: dateFnsLocale() });
  } catch {
    return iso;
  }
}

function formatDatum(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy', { locale: dateFnsLocale() });
  } catch {
    return iso;
  }
}

export default function Kursuebersicht() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [kurseRaw, setKurseRaw] = useState<Record<string, PublicRecordResult>>({});
  const [dozenten, setDozenten] = useState<DozentRecord[]>([]);
  const [anmeldungenRaw, setAnmeldungenRaw] = useState<Record<string, PublicRecordResult>>({});
  const [dataLoading, setDataLoading] = useState(false);

  const [instrumentFilter, setInstrumentFilter] = useState<string | null>(null);
  const [niveauFilter, setNiveauFilter] = useState<string | null>(null);

  useEffect(() => {
    loadPublicPagesConfig(SLUG)
      .then(c => {
        setCfg(c);
        setPage(c?.pages[SLUG] ?? null);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof PageUnavailableError) setUnavailable(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!cfg || !page) return;
    setDataLoading(true);

    const kurseEp = page.endpoints?.find(e => e.op === 'list' && (e as { entity?: string }).entity === 'kurse');
    const dozEp = page.endpoints?.find(e => e.op === 'list' && (e as { entity?: string }).entity === 'dozenten');
    const anmEp = page.endpoints?.find(e => e.op === 'list' && (e as { entity?: string }).entity === 'anmeldungen');

    Promise.all([
      kurseEp ? listPublicRecords(cfg, page, { appId: kurseEp.app_id, limit: 200 }) : Promise.resolve<Record<string, PublicRecordResult>>({}),
      dozEp ? listPublicRecords(cfg, page, { appId: dozEp.app_id, limit: 200 }) : Promise.resolve<Record<string, PublicRecordResult>>({}),
      anmEp ? listPublicRecords(cfg, page, { appId: anmEp.app_id, limit: 500 }) : Promise.resolve<Record<string, PublicRecordResult>>({}),
    ]).then(([k, d, a]) => {
      setKurseRaw(k);
      setDozenten(
        Object.values(d).map(r => ({
          id: r.id,
          vorname: (r.fields.vorname as string) ?? '',
          nachname: (r.fields.nachname as string) ?? '',
        }))
      );
      setAnmeldungenRaw(a);
      setDataLoading(false);
    });
  }, [cfg, page]);

  const dozentMap = useMemo(() => {
    const m: Record<string, DozentRecord> = {};
    for (const d of dozenten) m[d.id] = d;
    return m;
  }, [dozenten]);

  const kurse = useMemo<KursRecord[]>(() => {
    return Object.values(kurseRaw).map(r => ({
      id: r.id,
      titel: (r.fields.titel as string) ?? '',
      instrument: (r.fields.instrument as { key: string; label: string }) ?? null,
      niveau: (r.fields.niveau as { key: string; label: string }) ?? null,
      wochentage: (r.fields.wochentage as Array<{ key: string; label: string }>) ?? [],
      uhrzeit: (r.fields.uhrzeit as string) ?? null,
      beginn: (r.fields.beginn as string) ?? null,
      ende: (r.fields.ende as string) ?? null,
      maximale_teilnehmer: (r.fields.maximale_teilnehmer as number) ?? 0,
      preis: (r.fields.preis as number) ?? null,
      status: (r.fields.status as { key: string; label: string }) ?? null,
      dozentRef: extractRecordIdFromRef(r.fields.dozent),
    }));
  }, [kurseRaw]);

  // Anzahl aktiver Anmeldungen pro Kurs (status != 'abgemeldet')
  const anmeldungenByKurs = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of Object.values(anmeldungenRaw)) {
      const statusKey = (r.fields.status as { key: string } | null)?.key;
      if (statusKey === 'abgemeldet') continue;
      const kursRef = extractRecordIdFromRef(r.fields.kurs);
      if (kursRef) map[kursRef] = (map[kursRef] ?? 0) + 1;
    }
    return map;
  }, [anmeldungenRaw]);

  // Filter-Optionen aus den geladenen Kursen ableiten
  const instrumentOptionen = useMemo(() => {
    const seen = new Map<string, string>();
    for (const k of kurse) {
      if (k.instrument && !seen.has(k.instrument.key)) {
        seen.set(k.instrument.key, k.instrument.label);
      }
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [kurse]);

  const niveauOptionen = useMemo(() => {
    const seen = new Map<string, string>();
    for (const k of kurse) {
      if (k.niveau && !seen.has(k.niveau.key)) {
        seen.set(k.niveau.key, k.niveau.label);
      }
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [kurse]);

  const kurseListe = useMemo(() => {
    return kurse.filter(k => {
      if (instrumentFilter && k.instrument?.key !== instrumentFilter) return false;
      if (niveauFilter && k.niveau?.key !== niveauFilter) return false;
      return true;
    });
  }, [kurse, instrumentFilter, niveauFilter]);

  if (loading || unavailable) {
    return <PublicShell loading={loading} unavailable={unavailable} />;
  }

  if (!cfg || !page) {
    return <PublicShell unavailable />;
  }

  return (
    <PublicShell
      title={tx('Kursübersicht')}
      description={tx('Aktuelle und geplante Kurse der Musikschule Klangraum')}
      fullBleed
    >
      {/* Hero-Band */}
      <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <p className="mt-2 text-muted-foreground max-w-xl mx-auto text-base">
            {tx('Entdecke unsere Kurse — vom ersten Griff auf der Gitarre bis zum souveränen Auftritt auf der Bühne.')}
          </p>
        </div>
      </div>

      {/* Filter-Leiste */}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium text-muted-foreground shrink-0">{tx('Filtern:')}</span>

          {instrumentOptionen.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {instrumentOptionen.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setInstrumentFilter(f => f === opt.key ? null : opt.key)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    instrumentFilter === opt.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border text-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {niveauOptionen.length > 0 && (
            <>
              <span className="text-border">|</span>
              <div className="flex flex-wrap gap-1">
                {niveauOptionen.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setNiveauFilter(f => f === opt.key ? null : opt.key)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      niveauFilter === opt.key
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {(instrumentFilter || niveauFilter) && (
            <button
              onClick={() => { setInstrumentFilter(null); setNiveauFilter(null); }}
              className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {tx('Alle anzeigen')}
            </button>
          )}
        </div>
      </div>

      {/* Kursliste */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {dataLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                <div className="h-3 bg-muted rounded w-1/2 mb-2" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : kurseListe.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <IconMusic size={48} className="mx-auto mb-4 text-muted-foreground/40" stroke={1.5} />
            <p className="text-lg font-medium">{tx('Keine Kurse gefunden')}</p>
            <p className="text-sm mt-1">{tx('Versuche einen anderen Filter oder schau bald wieder vorbei.')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kurseListe.map(kurs => {
              const belegte = anmeldungenByKurs[kurs.id] ?? 0;
              const freiePlaetze = Math.max(0, kurs.maximale_teilnehmer - belegte);
              const istVoll = freiePlaetze === 0;
              const dozent = kurs.dozentRef ? dozentMap[kurs.dozentRef] : null;
              const dozentName = dozent ? `${dozent.vorname} ${dozent.nachname}` : null;

              return (
                <div
                  key={kurs.id}
                  className="rounded-xl border border-border bg-card flex flex-col overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Karten-Kopf */}
                  <div className="bg-primary/8 px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-semibold text-base text-foreground leading-snug">{kurs.titel}</h2>
                      <StatusBadge statusKey={kurs.status?.key} label={kurs.status?.label} />
                    </div>
                    {kurs.instrument && (
                      <div className="flex items-center gap-1 mt-1.5 text-sm text-muted-foreground">
                        <IconMusic size={14} className="shrink-0" />
                        <span>{kurs.instrument.label}</span>
                        {kurs.niveau && (
                          <span className="text-muted-foreground/60 before:content-['·'] before:mx-1">
                            {kurs.niveau.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Karten-Body */}
                  <div className="px-5 py-4 flex-1 flex flex-col gap-2.5 text-sm">
                    {/* Wochentage + Uhrzeit */}
                    {(kurs.wochentage.length > 0 || kurs.uhrzeit) && (
                      <div className="flex items-start gap-2 text-foreground">
                        <IconCalendar size={15} className="shrink-0 mt-0.5 text-muted-foreground" />
                        <span>
                          {kurs.wochentage.map(t => t.label).join(', ')}
                          {kurs.uhrzeit && (
                            <span className="text-muted-foreground"> · {formatUhrzeit(kurs.uhrzeit)} {tx('Uhr')}</span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Zeitraum */}
                    {kurs.beginn && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconClock size={15} className="shrink-0" />
                        <span>
                          {formatDatum(kurs.beginn)}
                          {kurs.ende && ` – ${formatDatum(kurs.ende)}`}
                        </span>
                      </div>
                    )}

                    {/* Dozent */}
                    {dozentName && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconUser size={15} className="shrink-0" />
                        <span>{dozentName}</span>
                      </div>
                    )}

                    {/* Preis */}
                    {kurs.preis != null && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <IconCurrencyEuro size={15} className="shrink-0" />
                        <span>
                          {kurs.preis.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} {tx('€ / Kurs')}
                        </span>
                      </div>
                    )}

                    {/* Freie Plätze */}
                    <div className="flex items-center gap-2 mt-auto">
                      <IconUsersGroup size={15} className={`shrink-0 ${istVoll ? 'text-amber-500' : 'text-emerald-600'}`} />
                      {istVoll ? (
                        <span className="font-medium text-amber-600">{tx('Warteliste')}</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">
                          {freiePlaetze === 1
                            ? tx('1 freier Platz')
                            : `${freiePlaetze} ${tx('freie Plätze')}`}
                        </span>
                      )}
                      <span className="text-muted-foreground/60 text-xs">
                        ({tx('von')} {kurs.maximale_teilnehmer})
                      </span>
                    </div>
                  </div>

                  {/* Karten-Fuß */}
                  <div className="px-5 pb-5">
                    <Link
                      to={`/public/kursanmeldung?kursId=${kurs.id}`}
                      className={`flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        istVoll
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      {istVoll ? tx('Auf Warteliste') : tx('Jetzt anmelden')}
                      <IconChevronRight size={15} className="shrink-0" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Zusammenfassung */}
        {!dataLoading && kurseListe.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            {kurseListe.length === 1
              ? tx('1 Kurs wird angeboten')
              : `${kurseListe.length} ${tx('Kurse werden angeboten')}`}
          </p>
        )}
      </div>
    </PublicShell>
  );
}
