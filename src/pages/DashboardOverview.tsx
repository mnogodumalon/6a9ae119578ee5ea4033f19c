import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { LOOKUP_OPTIONS, lookupOption, APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard } from '@/components/widgets/KanbanWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';
import { useState, useMemo } from 'react';
import {
  IconAlertCircle,
  IconMusicCheck,
  IconUsers,
  IconList,
  IconClockHour4,
  IconCurrencyEuro,
  IconSchool,
} from '@tabler/icons-react';
import { format } from 'date-fns';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, teilnehmer, anmeldungen, dozenten,
    kurseMap, teilnehmerMap,
    fetchAll,
  } = data;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const rec = top.record;
        const status = lookupKey(rec.fields.status);
        if (status === 'neu') {
          return {
            label: tx('Bestätigen'),
            onClick: async () => {
              const prev = rec.fields.status;
              data.setAnmeldungen(prev =>
                prev.map(a =>
                  a.record_id === rec.record_id
                    ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
                    : a
                )
              );
              try {
                await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'bestaetigt' });
                undoToast(tx`${rec.record_id} — bestätigt`, async () => {
                  await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'neu' });
                  fetchAll();
                });
              } catch {
                fetchAll();
              }
            },
          };
        }
      }
      return undefined;
    },
  });

  const enrichedKurse = crud.enriched.kurse;
  const enrichedAnmeldungen = crud.enriched.anmeldungen;

  // Derived
  const laufendeKurse = useMemo(
    () => kurse.filter(k => lookupKey(k.fields.status) === 'laeuft'),
    [kurse]
  );
  const geplanteKurse = useMemo(
    () => kurse.filter(k => {
      const s = lookupKey(k.fields.status);
      return s === 'geplant' || s === 'laeuft';
    }),
    [kurse]
  );

  // Anmeldung counts
  const neueAnmeldungen = useMemo(
    () => anmeldungen.filter(a => lookupKey(a.fields.status) === 'neu'),
    [anmeldungen]
  );
  const wartelisteAnmeldungen = useMemo(
    () => anmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste'),
    [anmeldungen]
  );
  const unbezahltBestaetigt = useMemo(
    () => anmeldungen.filter(a => lookupKey(a.fields.status) === 'bestaetigt' && !a.fields.bezahlt),
    [anmeldungen]
  );

  // KPI filter state
  const [kpiFilter, setKpiFilter] = useState<string | null>(null);

  // Context line — names people waiting for confirmation
  const contextLine = useMemo(() => {
    if (neueAnmeldungen.length > 0) {
      const names = neueAnmeldungen.slice(0, 3).map(a => {
        const tid = extractRecordId(a.fields.teilnehmer);
        const t = tid ? teilnehmerMap.get(tid) : undefined;
        return t ? `${t.fields.vorname ?? ''} ${t.fields.nachname ?? ''}`.trim() : '';
      }).filter(Boolean);
      const nStr = namen(names);
      return neueAnmeldungen.length === 1
        ? tx`${nStr} wartet auf Bestätigung.`
        : tx`${nStr} und weitere warten auf Bestätigung.`;
    }
    if (laufendeKurse.length > 0) {
      const n = String(laufendeKurse.length);
      return tx`${n} Kurse laufen gerade — alles im Zeitplan.`;
    }
    return tx('Noch keine Daten — leg den ersten Kurs an.');
  }, [neueAnmeldungen, laufendeKurse, teilnehmerMap]);

  // Hero: unbestätigte Anmeldungen
  const advanceFirst = async () => {
    const a = neueAnmeldungen[0];
    if (!a) return;
    const prev = a.fields.status;
    data.setAnmeldungen(prev =>
      prev.map(x =>
        x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
          : x
      )
    );
    try {
      await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: 'bestaetigt' });
      const tid = extractRecordId(a.fields.teilnehmer);
      const t = tid ? teilnehmerMap.get(tid) : undefined;
      const name = t ? `${t.fields.vorname ?? ''} ${t.fields.nachname ?? ''}`.trim() : tx('Anmeldung');
      undoToast(tx`${name} — bestätigt`, async () => {
        await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: 'neu' });
        fetchAll();
      });
    } catch {
      fetchAll();
    }
  };

  // Kanban columns — MUST be inside component body (locale-aware getters)
  const kanbanColumns = (LOOKUP_OPTIONS['anmeldungen']?.['status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: o.key === 'neu'
      ? ('warning' as const)
      : o.key === 'bestaetigt'
      ? ('success' as const)
      : o.key === 'warteliste'
      ? ('default' as const)
      : ('default' as const),
  }));

  // Kanban cards
  const kanbanCards: KanbanCard[] = useMemo(() => {
    const filtered = kpiFilter
      ? anmeldungen.filter(a => lookupKey(a.fields.status) === kpiFilter)
      : anmeldungen;
    return filtered
      .filter(a => lookupKey(a.fields.status) !== 'abgemeldet')
      .map(a => {
        const kursId = extractRecordId(a.fields.kurs);
        const kurs = kursId ? kurseMap.get(kursId) : undefined;
        const teilId = extractRecordId(a.fields.teilnehmer);
        const teil = teilId ? teilnehmerMap.get(teilId) : undefined;
        const name = teil
          ? `${teil.fields.vorname ?? ''} ${teil.fields.nachname ?? ''}`.trim()
          : tx('Unbekannt');
        const status = lookupKey(a.fields.status);
        return {
          id: `anmeldung:${a.record_id}`,
          column: status ?? 'neu',
          title: name,
          subtitle: kurs?.fields.titel
            ? `${kurs.fields.titel}${a.fields.bezahlt ? '' : ` · ${tx('unbezahlt')}`}`
            : a.fields.bezahlt ? undefined : tx('unbezahlt'),
          tone: !a.fields.bezahlt && status === 'bestaetigt'
            ? ('warning' as const)
            : status === 'neu'
            ? ('primary' as const)
            : ('default' as const),
        };
      })
      .sort((a, b) => a.title.toString().localeCompare(b.title.toString()));
  }, [anmeldungen, kpiFilter, kurseMap, teilnehmerMap]);

  // onCardMove — optimistic + undo
  const handleCardMove = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    const anm = anmeldungen.find(a => a.record_id === rid);
    if (!anm) return;
    const prev = anm.fields.status;
    data.setAnmeldungen(prev =>
      prev.map(a =>
        a.record_id === rid
          ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', newColumn) } }
          : a
      )
    );
    try {
      await LivingAppsService.updateAnmeldungenEntry(rid, { status: newColumn });
      const colLabel = kanbanColumns.find(c => c.key === newColumn)?.label ?? newColumn;
      undoToast(tx`Status → ${colLabel}`, async () => {
        const prevKey = lookupKey(prev) ?? 'neu';
        await LivingAppsService.updateAnmeldungenEntry(rid, { status: prevKey });
        fetchAll();
      });
    } catch {
      fetchAll();
    }
  };

  // WorkList: neue Anmeldungen (bestätigen)
  const neueItems = useMemo(() =>
    neueAnmeldungen.slice(0, 8).map(a => {
      const kursId = extractRecordId(a.fields.kurs);
      const kurs = kursId ? kurseMap.get(kursId) : undefined;
      const teilId = extractRecordId(a.fields.teilnehmer);
      const teil = teilId ? teilnehmerMap.get(teilId) : undefined;
      const name = teil
        ? `${teil.fields.vorname ?? ''} ${teil.fields.nachname ?? ''}`.trim()
        : tx('Unbekannt');
      return {
        id: a.record_id,
        title: name,
        secondLine: (
          <span className="text-muted-foreground text-xs">
            {kurs?.fields.titel ?? tx('Kurs unbekannt')}
            {' · '}
            <span className="text-amber-600 font-medium">{tx('Neu')}</span>
          </span>
        ),
        action: {
          label: tx('✓ Bestätigen'),
          onClick: async () => {
            data.setAnmeldungen(prev =>
              prev.map(x =>
                x.record_id === a.record_id
                  ? { ...x, fields: { ...x.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
                  : x
              )
            );
            try {
              await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: 'bestaetigt' });
              undoToast(tx`${name} — bestätigt`, async () => {
                await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: 'neu' });
                fetchAll();
              });
            } catch {
              fetchAll();
            }
          },
        },
      };
    }),
    [neueAnmeldungen, kurseMap, teilnehmerMap, data, fetchAll]
  );

  // WorkList: laufende Kurse mit Auslastung
  const kursItems = useMemo(() =>
    laufendeKurse.slice(0, 8).map(k => {
      const aktiveAnmeldungen = anmeldungen.filter(a => {
        const kursId = extractRecordId(a.fields.kurs);
        return kursId === k.record_id && lookupKey(a.fields.status) === 'bestaetigt';
      });
      const max = k.fields.maximale_teilnehmer ?? 0;
      const belegt = aktiveAnmeldungen.length;
      const voll = max > 0 && belegt >= max;
      const enriched = enrichedKurse.find(e => e.record_id === k.record_id);
      return {
        id: k.record_id,
        title: k.fields.titel ?? tx('Kurs'),
        secondLine: (
          <span className="text-xs text-muted-foreground">
            {enriched?.dozentName ?? ''}
            {' · '}
            <span className={voll ? 'text-destructive font-medium' : 'text-emerald-600 font-medium'}>
              {belegt}/{max} {tx('Plätze')}
            </span>
          </span>
        ),
        action: voll
          ? undefined
          : {
              label: tx('+ Anmelden'),
              onClick: () => crud.anmeldungen.openCreate({
                kurs: createRecordUrl(APP_IDS.KURSE, k.record_id),
                status: 'bestaetigt',
                anmeldedatum: today,
              }),
            },
      };
    }),
    [laufendeKurse, anmeldungen, enrichedKurse, crud, today]
  );

  // Chart rows for instrument distribution
  const chartRows = useMemo(() =>
    geplanteKurse.map(k => ({
      id: `kurs:${k.record_id}`,
      data: k,
    })),
    [geplanteKurse]
  );

  // Empty state
  if (kurse.length === 0 && anmeldungen.length === 0 && teilnehmer.length === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1">{tx('Richte deine Musikschule ein — leg den ersten Kurs an.')}</p>
        </div>
        <div className="rounded-[20px] border bg-card p-10 flex flex-col items-center gap-4 text-center max-w-md">
          <IconSchool size={48} className="text-muted-foreground" stroke={1.5} />
          <div>
            <p className="font-medium text-lg">{tx('Noch keine Daten')}</p>
            <p className="text-muted-foreground text-sm mt-1">{tx('Erstelle deinen ersten Kurs und beginne mit der Anmeldung von Schülern.')}</p>
          </div>
          <button
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-5 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
          >
            {tx('Ersten Kurs anlegen')}
          </button>
        </div>
        {crud.surfaces}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          className="shrink-0 inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          onClick={() => crud.anmeldungen.openCreate({ status: 'neu', anmeldedatum: today })}
        >
          <IconUsers size={16} className="shrink-0" />
          {tx('Neue Anmeldung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          neueAnmeldungen.length > 0 ? (
            <HeroBanner
              icon={<IconAlertCircle size={18} />}
              action={{ label: tx('Erste bestätigen'), onClick: advanceFirst }}
            >
              {neueAnmeldungen.length === 1
                ? tx`1 neue Anmeldung wartet auf Bestätigung.`
                : tx`${String(neueAnmeldungen.length)} neue Anmeldungen warten auf Bestätigung.`
              }
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Anmeldungen gesamt')}
              value={anmeldungen.filter(a => lookupKey(a.fields.status) !== 'abgemeldet').length}
              icon={<IconList size={16} className="shrink-0" />}
              tone="default"
              onClick={() => setKpiFilter(f => f === null ? null : null)}
            />
            <StatStripItem
              title={tx('Neu & unbestätigt')}
              value={neueAnmeldungen.length}
              icon={<IconMusicCheck size={16} className="shrink-0" />}
              tone={neueAnmeldungen.length > 0 ? 'warning' : 'default'}
              onClick={() => setKpiFilter(f => f === 'neu' ? null : 'neu')}
              active={kpiFilter === 'neu'}
            />
            <StatStripItem
              title={tx('Warteliste')}
              value={wartelisteAnmeldungen.length}
              icon={<IconClockHour4 size={16} className="shrink-0" />}
              tone={wartelisteAnmeldungen.length > 0 ? 'warning' : 'default'}
              onClick={() => setKpiFilter(f => f === 'warteliste' ? null : 'warteliste')}
              active={kpiFilter === 'warteliste'}
            />
            <StatStripItem
              title={tx('Unbezahlt (bestätigt)')}
              value={unbezahltBestaetigt.length}
              icon={<IconCurrencyEuro size={16} className="shrink-0" />}
              tone={unbezahltBestaetigt.length > 0 ? 'destructive' : 'default'}
              onClick={() => setKpiFilter(f => f === 'bezahlt_ausstehend' ? null : 'bezahlt_ausstehend')}
              active={kpiFilter === 'bezahlt_ausstehend'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kpiFilter === 'bezahlt_ausstehend'
              ? kanbanCards.filter(c => {
                const rid = c.id.split(':')[1];
                const a = anmeldungen.find(x => x.record_id === rid);
                return a && !a.fields.bezahlt && lookupKey(a.fields.status) === 'bestaetigt';
              })
              : kanbanCards
            }
            defaultCollapsed={['abgemeldet']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const a = anmeldungen.find(x => x.record_id === rid);
              if (a) crud.anmeldungen.openDetail(a);
            }}
            onCardMove={handleCardMove}
            onAddCard={column =>
              crud.anmeldungen.openCreate({ status: column, anmeldedatum: today })
            }
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Neue Anmeldungen')}
              items={neueItems}
              onItemClick={id => {
                const a = anmeldungen.find(x => x.record_id === id);
                if (a) crud.anmeldungen.openDetail(a);
              }}
              empty={{
                text: tx('Keine neuen Anmeldungen — alles bestätigt.'),
                action: {
                  label: tx('Neue Anmeldung'),
                  onClick: () => crud.anmeldungen.openCreate({ status: 'neu', anmeldedatum: today }),
                },
              }}
            />
            <WorkList
              title={tx('Laufende Kurse')}
              items={kursItems}
              onItemClick={id => {
                const k = kurse.find(x => x.record_id === id);
                if (k) crud.kurse.openDetail(k);
              }}
              empty={{
                text: tx('Noch kein Kurs aktiv — plane den ersten.'),
                action: {
                  label: tx('Kurs planen'),
                  onClick: () => crud.kurse.openCreate({ status: 'geplant' }),
                },
              }}
            />
          </>
        }
      />

      {/* Chart: Anmeldungen pro Instrument */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartWidget
          title={tx('Kurse nach Instrument')}
          rows={chartRows}
          dimension={{
            kind: 'category',
            accessor: r => r.data.fields.instrument,
          }}
        />
        <ChartWidget
          title={tx('Anmeldungen nach Status')}
          rows={anmeldungen.map(a => ({ id: `anmeldung:${a.record_id}`, data: a }))}
          dimension={{
            kind: 'category',
            accessor: r => r.data.fields.status,
          }}
        />
      </div>

      {crud.surfaces}
    </div>
  );
}
