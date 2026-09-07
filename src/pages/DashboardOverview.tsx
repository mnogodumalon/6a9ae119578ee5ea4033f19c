import { useMemo, useState } from 'react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { lookupKey, formatDate } from '@/lib/formatters';
import { LivingAppsService } from '@/services/livingAppsService';
import { tx } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { format } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { HeroBanner } from '@/components/HeroBanner';
import { WorkList } from '@/components/WorkList';
import { KanbanWidget, type KanbanCard, type KanbanColumn } from '@/components/widgets/KanbanWidget';
import {
  IconAlertCircle,
  IconMusic,
  IconUsers,
  IconCash,
  IconCheck,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, anmeldungen, anwesenheiten,
    kurseMap, raeumeMap,
    setAnmeldungen, fetchAll,
  } = data;

  const clock = useClock();

  // Kanban columns — inside body: o.label is a locale-aware getter (gate 22)
  const anmeldungColumns = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['anmeldungen']?.['status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: (o.key === 'neu' ? 'warning' : o.key === 'bestaetigt' ? 'success' : o.key === 'warteliste' ? 'primary' : 'default') as KanbanColumn['tone'],
    })),
    [],
  );

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const statusKey = lookupKey(top.record.fields.status);
        if (statusKey === 'neu') {
          return {
            label: tx('Anmeldung bestätigen'),
            onClick: () => void confirmAnmeldung(top.record.record_id),
          };
        }
      }
      return undefined;
    },
  });

  const enrichedKurse = crud.enriched.kurse;
  const enrichedAnmeldungen = crud.enriched.anmeldungen;

  // Today key and weekday
  const todayKey = format(clock, 'yyyy-MM-dd');
  const dayOfWeekMap: Record<number, string> = {
    0: 'sonntag', 1: 'montag', 2: 'dienstag', 3: 'mittwoch',
    4: 'donnerstag', 5: 'freitag', 6: 'samstag',
  };
  const todayDow = dayOfWeekMap[clock.getDay()];

  const aktiveKurse = useMemo(() => kurse.filter(k => {
    const s = lookupKey(k.fields.status);
    return s === 'geplant' || s === 'laeuft';
  }), [kurse]);

  const heutigeKurse = useMemo(() => aktiveKurse.filter(k => {
    const days = k.fields.wochentage;
    if (!Array.isArray(days)) return false;
    return days.some(d => {
      const key = typeof d === 'object' && d !== null && 'key' in d ? (d as { key: string }).key : String(d);
      return key === todayDow;
    });
  }), [aktiveKurse, todayDow]);

  const neueAnmeldungen = useMemo(() =>
    enrichedAnmeldungen.filter(a => lookupKey(a.fields.status) === 'neu'),
    [enrichedAnmeldungen]
  );

  const unbezahlt = useMemo(() =>
    enrichedAnmeldungen.filter(a => !a.fields.bezahlt && lookupKey(a.fields.status) === 'bestaetigt'),
    [enrichedAnmeldungen]
  );

  const anwesenheitsrate = useMemo(() => {
    if (anwesenheiten.length === 0) return null;
    const anwesend = anwesenheiten.filter(a => a.fields.anwesend).length;
    return Math.round((anwesend / anwesenheiten.length) * 100);
  }, [anwesenheiten]);

  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const kanbanCards = useMemo<KanbanCard[]>(() =>
    enrichedAnmeldungen.map(a => {
      const statusK = lookupKey(a.fields.status) ?? 'neu';
      return {
        id: `anmeldung:${a.record_id}`,
        column: statusK,
        title: a.teilnehmerName || tx('Unbekannt'),
        subtitle: a.kursName || undefined,
        tone: (statusK === 'neu' ? 'warning' : statusK === 'bestaetigt' ? 'success' : statusK === 'warteliste' ? 'primary' : 'default') as KanbanCard['tone'],
      };
    }),
    [enrichedAnmeldungen]
  );

  const filteredCards = useMemo(() =>
    filterStatus ? kanbanCards.filter(c => c.column === filterStatus) : kanbanCards,
    [kanbanCards, filterStatus]
  );

  // Context greeting line
  const contextLine = useMemo(() => {
    const anzahlHeute = heutigeKurse.length;
    const dozNamen = heutigeKurse
      .map(k => enrichedKurse.find(e => e.record_id === k.record_id)?.dozentName ?? '')
      .filter(Boolean);
    if (anzahlHeute === 0 && neueAnmeldungen.length > 0) {
      return tx`${neueAnmeldungen.length} neue Anmeldungen warten auf Bestätigung.`;
    }
    if (anzahlHeute === 0) {
      return tx('Heute keine Kurse — alles ruhig.');
    }
    const dosStr = namen(dozNamen);
    return anzahlHeute === 1
      ? tx`Heute 1 Kurs mit ${dosStr}.`
      : tx`Heute ${anzahlHeute} Kurse — u. a. mit ${dosStr}.`;
  }, [heutigeKurse, enrichedKurse, neueAnmeldungen]);

  // Confirm registration: neu → bestätigt
  async function confirmAnmeldung(id: string) {
    const snapshot = anmeldungen.map(a => ({ ...a }));
    setAnmeldungen(prev => prev.map(a =>
      a.record_id === id
        ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
        : a
    ));
    try {
      await LivingAppsService.updateAnmeldungenEntry(id, { status: 'bestaetigt' });
      const name = enrichedAnmeldungen.find(a => a.record_id === id)?.teilnehmerName ?? '';
      undoToast(tx`${name} — Anmeldung bestätigt`, async () => {
        setAnmeldungen(snapshot);
        await LivingAppsService.updateAnmeldungenEntry(id, { status: 'neu' });
      });
    } catch {
      await fetchAll();
    }
  }

  // Kanban drag handler
  async function moveCard(cardId: string, newColumn: string): Promise<void | string> {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const snapshot = anmeldungen.map(a => ({ ...a }));
    const col = anmeldungColumns.find(c => c.key === newColumn);
    setAnmeldungen(prev => prev.map(a =>
      a.record_id === rid
        ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', newColumn) } }
        : a
    ));
    try {
      await LivingAppsService.updateAnmeldungenEntry(rid, { status: newColumn });
      undoToast(tx`Status → ${col?.label ?? newColumn}`, async () => {
        setAnmeldungen(snapshot);
        const oldStatus = snapshot.find(a => a.record_id === rid)?.fields.status;
        await LivingAppsService.updateAnmeldungenEntry(rid, { status: lookupKey(oldStatus) ?? 'neu' });
      });
    } catch {
      await fetchAll();
    }
  }

  const hero = neueAnmeldungen.length > 0 ? (
    <HeroBanner
      icon={<IconAlertCircle size={18} />}
      action={{
        label: tx('Älteste bestätigen'),
        onClick: () => {
          const first = neueAnmeldungen[0];
          if (first) void confirmAnmeldung(first.record_id);
        },
      }}
    >
      <b>{namen(neueAnmeldungen.map(a => a.teilnehmerName))}</b>
      {' '}
      {neueAnmeldungen.length === 1
        ? tx('— 1 neue Anmeldung wartet auf Bestätigung.')
        : tx`— ${neueAnmeldungen.length} neue Anmeldungen warten auf Bestätigung.`}
    </HeroBanner>
  ) : undefined;

  const kpis = (
    <StatStrip>
      <StatStripItem
        title={tx('Neue Anmeldungen')}
        value={neueAnmeldungen.length}
        icon={<IconAlertCircle size={16} className="shrink-0" />}
        tone={neueAnmeldungen.length > 0 ? 'warning' : 'default'}
        onClick={() => setFilterStatus(f => f === 'neu' ? null : 'neu')}
        active={filterStatus === 'neu'}
      />
      <StatStripItem
        title={tx('Aktive Kurse')}
        value={aktiveKurse.length}
        icon={<IconMusic size={16} className="shrink-0" />}
        tone="default"
      />
      <StatStripItem
        title={tx('Zahlung offen')}
        value={unbezahlt.length}
        icon={<IconCash size={16} className="shrink-0" />}
        tone={unbezahlt.length > 0 ? 'destructive' : 'default'}
        onClick={() => setFilterStatus(f => f === 'bestaetigt' ? null : 'bestaetigt')}
        active={filterStatus === 'bestaetigt'}
      />
      {anwesenheitsrate !== null && (
        <StatStripItem
          title={tx('Anwesenheitsrate')}
          value={`${anwesenheitsrate}\u202f%`}
          icon={<IconUsers size={16} className="shrink-0" />}
          tone={anwesenheitsrate >= 80 ? 'success' : anwesenheitsrate >= 60 ? 'warning' : 'destructive'}
        />
      )}
    </StatStrip>
  );

  const primary = (
    <KanbanWidget
      cards={filteredCards}
      columns={anmeldungColumns}
      defaultCollapsed={['abgemeldet']}
      onCardClick={card => {
        const rid = card.id.split(':')[1];
        if (!rid) return;
        const rec = anmeldungen.find(a => a.record_id === rid);
        if (rec) crud.anmeldungen.openDetail(rec);
      }}
      onCardMove={moveCard}
      onAddCard={column => crud.anmeldungen.openCreate({ status: column })}
    />
  );

  const aside = (
    <>
      <WorkList
        title={tx('Kurse heute')}
        items={heutigeKurse.map(k => {
          const ek = enrichedKurse.find(e => e.record_id === k.record_id);
          const uhrzeitStr = k.fields.uhrzeit ? format(new Date(k.fields.uhrzeit), 'HH:mm') : null;
          return {
            id: k.record_id,
            title: k.fields.titel ?? tx('Kurs'),
            secondLine: (
              <>
                <span className="font-medium text-foreground">{ek?.dozentName ?? '—'}</span>
                {uhrzeitStr && (
                  <span className="text-muted-foreground"> · {uhrzeitStr}</span>
                )}
              </>
            ),
            action: {
              label: tx('Anwesenheit'),
              onClick: () => crud.anwesenheiten.openCreate({ kurs: k.record_id }),
            },
          };
        })}
        onItemClick={id => {
          const rec = kurse.find(k => k.record_id === id);
          if (rec) crud.kurse.openDetail(rec);
        }}
        empty={{
          text: aktiveKurse.length > 0
            ? tx('Heute kein Kurs geplant.')
            : tx('Noch keine Kurse angelegt.'),
          action: { label: tx('Kurs anlegen'), onClick: () => crud.kurse.openCreate({ status: 'geplant' }) },
        }}
      />
      <WorkList
        title={tx('Zahlung ausstehend')}
        items={unbezahlt.slice(0, 8).map(a => ({
          id: a.record_id,
          title: a.teilnehmerName || tx('Unbekannt'),
          secondLine: (
            <span className="text-muted-foreground">{a.kursName}</span>
          ),
          action: {
            label: (
              <span className="flex items-center gap-1">
                <IconCheck size={14} className="shrink-0" />
                {tx('Bezahlt')}
              </span>
            ),
            onClick: async () => {
              const snapshot = anmeldungen.map(x => ({ ...x }));
              setAnmeldungen(prev => prev.map(x =>
                x.record_id === a.record_id
                  ? { ...x, fields: { ...x.fields, bezahlt: true } }
                  : x
              ));
              try {
                await LivingAppsService.updateAnmeldungenEntry(a.record_id, { bezahlt: true });
                undoToast(tx`${a.teilnehmerName} — als bezahlt markiert`, async () => {
                  setAnmeldungen(snapshot);
                  await LivingAppsService.updateAnmeldungenEntry(a.record_id, { bezahlt: false });
                });
              } catch {
                await fetchAll();
              }
            },
          },
        }))}
        onItemClick={id => {
          const rec = anmeldungen.find(a => a.record_id === id);
          if (rec) crud.anmeldungen.openDetail(rec);
        }}
        empty={{
          text: tx('Alle Beiträge bezahlt — alles im Grünen!'),
        }}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
        <p className="text-muted-foreground mt-1">{contextLine}</p>
      </div>

      <DashboardGrid
        variant="wide"
        hero={hero}
        kpis={kpis}
        primary={primary}
        aside={aside}
      />

      {crud.surfaces}
    </div>
  );
}
