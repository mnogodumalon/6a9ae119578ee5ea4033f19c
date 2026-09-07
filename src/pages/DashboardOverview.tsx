import { useMemo, useState } from 'react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget, type KanbanCard, type KanbanColumn } from '@/components/widgets/KanbanWidget';
import { ChartWidget, type ChartRow } from '@/components/widgets/ChartWidget';
import { IconAlertCircle, IconUsers, IconSchool, IconCalendarEvent, IconCoin } from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, teilnehmer, anmeldungen, anwesenheiten,
    dozentenMap, raeumeMap, kurseMap, teilnehmerMap,
    setAnmeldungen,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const rec = top.record;
        const statusKey = lookupKey(rec.fields.status);
        if (statusKey === 'neu') {
          return {
            label: tx('Bestätigen'),
            onClick: async () => {
              const prev = rec.fields.status;
              setAnmeldungen(list =>
                list.map(a => a.record_id === rec.record_id
                  ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
                  : a
                )
              );
              undoToast(tx`${rec.record_id} — bestätigt`, async () => {
                setAnmeldungen(list =>
                  list.map(a => a.record_id === rec.record_id
                    ? { ...a, fields: { ...a.fields, status: prev } }
                    : a
                  )
                );
                await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: statusKey });
              });
              try {
                await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'bestaetigt' });
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

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  // --- Derived data ---
  const aktiveKurse = useMemo(
    () => enrichedKurse.filter(k => {
      const s = lookupKey(k.fields.status);
      return s === 'geplant' || s === 'laeuft';
    }),
    [enrichedKurse]
  );

  const neueAnmeldungen = useMemo(
    () => enrichedAnmeldungen.filter(a => lookupKey(a.fields.status) === 'neu'),
    [enrichedAnmeldungen]
  );

  const unbezahlt = useMemo(
    () => enrichedAnmeldungen.filter(a => !a.fields.bezahlt && lookupKey(a.fields.status) === 'bestaetigt'),
    [enrichedAnmeldungen]
  );

  const warteliste = useMemo(
    () => enrichedAnmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste'),
    [enrichedAnmeldungen]
  );

  // Context line: names of today's relevant people
  const neuNames = neueAnmeldungen.map(a => a.teilnehmerName).filter(Boolean);
  const contextLine = useMemo(() => {
    if (neueAnmeldungen.length > 0) {
      return tx`${namen(neuNames)} – neue Anmeldung${neueAnmeldungen.length === 1 ? '' : 'en'} zu bearbeiten.`;
    }
    if (aktiveKurse.length > 0) {
      return tx`${aktiveKurse.length} aktive Kurse laufen gerade.`;
    }
    return tx('Heute keine neuen Anmeldungen — alles im Griff!');
  }, [neueAnmeldungen, aktiveKurse, neuNames]);

  // --- Kanban: Anmeldungen nach Status ---
  const anmeldungColumns = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['anmeldungen']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    []
  );

  const anmeldungCards = useMemo<KanbanCard[]>(
    () => enrichedAnmeldungen.map(a => {
      const statusKey = lookupKey(a.fields.status) ?? 'neu';
      const bezahlt = a.fields.bezahlt;
      return {
        id: `anmeldung:${a.record_id}`,
        column: statusKey,
        title: a.teilnehmerName || tx('Unbekannt'),
        subtitle: a.kursName
          ? `${a.kursName}${!bezahlt && statusKey === 'bestaetigt' ? ' · 💶 offen' : ''}` /* i18n-exempt */
          : undefined,
        tone: statusKey === 'neu' ? 'warning'
          : statusKey === 'bestaetigt' && !bezahlt ? 'primary'
          : statusKey === 'warteliste' ? 'default'
          : statusKey === 'abgemeldet' ? 'default'
          : 'success',
      };
    }),
    [enrichedAnmeldungen]
  );

  const handleCardMove = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const anmeldung = anmeldungen.find(a => a.record_id === rid);
    if (!anmeldung) return;
    const prev = anmeldung.fields.status;
    setAnmeldungen(list =>
      list.map(a => a.record_id === rid
        ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', newColumn) } }
        : a
      )
    );
    undoToast(tx`Status auf ${newColumn} gesetzt`, async () => {
      setAnmeldungen(list =>
        list.map(a => a.record_id === rid
          ? { ...a, fields: { ...a.fields, status: prev } }
          : a
        )
      );
      await LivingAppsService.updateAnmeldungenEntry(rid, { status: lookupKey(prev) ?? newColumn });
    });
    try {
      await LivingAppsService.updateAnmeldungenEntry(rid, { status: newColumn });
    } catch {
      fetchAll();
    }
  };

  // --- Confirm newest ---
  const confirmAnmeldung = async (a: typeof enrichedAnmeldungen[0]) => {
    const prev = a.fields.status;
    const name = a.teilnehmerName || tx('Teilnehmer');
    setAnmeldungen(list =>
      list.map(x => x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
        : x
      )
    );
    undoToast(tx`${name} — bestätigt`, async () => {
      setAnmeldungen(list =>
        list.map(x => x.record_id === a.record_id
          ? { ...x, fields: { ...x.fields, status: prev } }
          : x
        )
      );
      await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: lookupKey(prev) ?? 'neu' });
    });
    try {
      await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: 'bestaetigt' });
    } catch {
      fetchAll();
    }
  };

  // Chart rows for Kurse nach Instrument
  type KursChartData = { instrument: unknown };
  const kursChartRows = useMemo<ChartRow<KursChartData>[]>(
    () => enrichedKurse.map(k => ({ id: `kurse:${k.record_id}`, data: { instrument: k.fields.instrument } })),
    [enrichedKurse]
  );

  // WorkList: Kurse heute (by Wochentag)
  const weekdayKey = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'][clock.getDay()];
  const heutigeKurse = useMemo(
    () => aktiveKurse.filter(k => {
      const days = (k.fields.wochentage ?? []).map((d: { key: string }) => d.key);
      return days.includes(weekdayKey);
    }),
    [aktiveKurse, weekdayKey]
  );

  // Empty app state
  const isEmpty = anmeldungen.length === 0 && kurse.length === 0 && teilnehmer.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
        <IconSchool size={48} className="text-muted-foreground" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{tx('Klangraum einrichten')}</h2>
          <p className="text-muted-foreground max-w-sm">{tx('Lege zuerst Dozenten und Räume an, dann plane deinen ersten Kurs.')}</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
            onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
          >
            {tx('Ersten Kurs anlegen')}
          </button>
          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium"
            onClick={() => crud.teilnehmer.openCreate({})}
          >
            {tx('Ersten Schüler anlegen')}
          </button>
        </div>
        {crud.surfaces}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1 text-sm truncate">{contextLine}</p>
        </div>
        <button
          className="shrink-0 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
          onClick={() => crud.anmeldungen.openCreate({ status: 'neu', anmeldedatum: today })}
        >
          {tx('Neue Anmeldung')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={neueAnmeldungen.length > 0 && (
          <HeroBanner
            icon={<IconAlertCircle size={18} />}
            action={{
              label: tx('Jetzt bestätigen'),
              onClick: () => confirmAnmeldung(neueAnmeldungen[0]),
            }}
          >
            <b>{namen(neueAnmeldungen.map(a => a.teilnehmerName))}</b>
            {' '}{neueAnmeldungen.length === 1 ? tx('wartet auf Bestätigung') : tx('warten auf Bestätigung')}
            {neueAnmeldungen[0]?.kursName ? tx` — Kurs: ${neueAnmeldungen[0].kursName}` : null}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Aktive Kurse')}
              value={aktiveKurse.length}
              icon={<IconSchool size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={appLabel('teilnehmer')}
              value={teilnehmer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tx('Warteliste')}
              value={warteliste.length}
              tone={warteliste.length > 0 ? 'warning' : 'default'}
              icon={<IconCalendarEvent size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tx('Unbezahlt')}
              value={unbezahlt.length}
              tone={unbezahlt.length > 0 ? 'destructive' : 'default'}
              icon={<IconCoin size={16} className="shrink-0" />}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={anmeldungCards}
            columns={anmeldungColumns}
            defaultCollapsed={['abgemeldet']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const rec = anmeldungen.find(a => a.record_id === rid);
              if (rec) crud.anmeldungen.openDetail(rec);
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
              title={tx('Kurse heute')}
              items={heutigeKurse.map(k => ({
                id: k.record_id,
                title: k.fields.titel ?? tx('Ohne Titel'),
                secondLine: (
                  <>
                    <span className="font-medium text-foreground">{k.dozentName}</span>
                    {k.raumName && (
                      <span className="text-muted-foreground"> · {k.raumName}</span>
                    )}
                    {k.fields.uhrzeit && (
                      <span className="text-muted-foreground"> · {k.fields.uhrzeit.slice(11, 16)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('Anwesenheit'),
                  onClick: () => crud.kurse.openDetail(kurse.find(x => x.record_id === k.record_id) ?? kurse[0]),
                },
              }))}
              onItemClick={id => {
                const rec = kurse.find(k => k.record_id === id);
                if (rec) crud.kurse.openDetail(rec);
              }}
              empty={{
                text: tx('Heute keine Kurse geplant'),
                action: { label: tx('Kurs planen'), onClick: () => crud.kurse.openCreate({ status: 'geplant' }) },
              }}
            />
            <ChartWidget
              title={tx('Kurse nach Instrument')}
              rows={kursChartRows}
              dimension={{
                kind: 'category',
                accessor: (row) => row.data.instrument,
                label: tx('Instrument'),
              }}
            />
          </>
        }
      />
      {crud.surfaces}
    </div>
  );
}
