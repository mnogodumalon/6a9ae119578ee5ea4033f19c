import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { formatDate, lookupKey, lookupKeys } from '@/lib/formatters';
import { lookupOption, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanColumn, KanbanCard } from '@/components/widgets/KanbanWidget';
import {
  IconMusic,
  IconUsers,
  IconClock,
  IconAlertCircle,
  IconPlus,
  IconCheck,
  IconCalendar,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    dozenten, kurse, teilnehmer, anmeldungen, anwesenheiten,
    kurseMap, teilnehmerMap,
    setAnmeldungen, fetchAll,
  } = data;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const rec = top.record;
        const statusKey = lookupKey(rec.fields.status);
        if (statusKey === 'neu') {
          return {
            label: tx('Bestätigen'),
            onClick: () => handleConfirmAnmeldung(rec),
          };
        }
      }
      return undefined;
    },
  });

  const enrichedKurse = crud.enriched.kurse;
  const enrichedAnmeldungen = crud.enriched.anmeldungen;

  // ── Derived data ─────────────────────────────────────────────────────────

  // Anmeldungen counts per Kurs
  const anmeldungenByKurs = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of anmeldungen) {
      const kursId = extractRecordId(a.fields.kurs);
      if (!kursId) continue;
      const statusK = lookupKey(a.fields.status);
      if (statusK === 'abgemeldet') continue;
      m.set(kursId, (m.get(kursId) ?? 0) + 1);
    }
    return m;
  }, [anmeldungen]);

  // KPI counts
  const aktiveKurse = useMemo(() => kurse.filter(k => lookupKey(k.fields.status) === 'laeuft'), [kurse]);
  const geplanteKurse = useMemo(() => kurse.filter(k => lookupKey(k.fields.status) === 'geplant'), [kurse]);
  const neueAnmeldungen = useMemo(() => anmeldungen.filter(a => lookupKey(a.fields.status) === 'neu'), [anmeldungen]);
  const unbezahlteBestaetigt = useMemo(() =>
    anmeldungen.filter(a => lookupKey(a.fields.status) === 'bestaetigt' && a.fields.bezahlt === false),
    [anmeldungen]
  );
  const wartelisteCount = useMemo(() => anmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste').length, [anmeldungen]);

  // Heutige Kursstunden (Kurse die heute stattfinden, nach Wochentag)
  const tagHeute = useMemo(() => {
    const dayNames = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
    return dayNames[clock.getDay()];
  }, [clock]);

  const heutigeKurse = useMemo(() => {
    return enrichedKurse.filter(k => {
      const statusK = lookupKey(k.fields.status);
      if (statusK !== 'laeuft' && statusK !== 'geplant') return false;
      const wochentage = lookupKeys(k.fields.wochentage);
      return wochentage.includes(tagHeute);
    }).sort((a, b) => (a.fields.uhrzeit ?? '').localeCompare(b.fields.uhrzeit ?? ''));
  }, [enrichedKurse, tagHeute]);

  // Filter state for KPI
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleConfirmAnmeldung = async (rec: typeof anmeldungen[0]) => {
    const prev = [...anmeldungen];
    const nextStatus = lookupOption('anmeldungen', 'status', 'bestaetigt');
    setAnmeldungen(anmeldungen.map(a =>
      a.record_id === rec.record_id ? { ...a, fields: { ...a.fields, status: nextStatus } } : a
    ));
    const teilnehmerName = (() => {
      const id = extractRecordId(rec.fields.teilnehmer);
      const t = id ? teilnehmerMap.get(id) : undefined;
      return t ? `${t.fields.vorname ?? ''} ${t.fields.nachname ?? ''}`.trim() : tx('Teilnehmer');
    })();
    undoToast(tx`${teilnehmerName} — Anmeldung bestätigt`, async () => {
      setAnmeldungen(prev);
      await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'neu' });
      fetchAll();
    });
    try {
      await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'bestaetigt' });
    } catch {
      setAnmeldungen(prev);
      fetchAll();
    }
  };

  // Kurs status advance (Kanban drag)
  const handleCardMove = async (cardId: string, newColumn: string): Promise<string | void> => {
    const kurs = kurse.find(k => k.record_id === cardId);
    if (!kurs) return;
    const prevKurse = [...kurse];
    data.setKurse(kurse.map(k =>
      k.record_id === cardId
        ? { ...k, fields: { ...k.fields, status: lookupOption('kurse', 'status', newColumn) } }
        : k
    ));
    const statusLabel = LOOKUP_OPTIONS['kurse']?.['status']?.find(o => o.key === newColumn)?.label ?? newColumn;
    undoToast(tx`${kurs.fields.titel ?? ''} — ${statusLabel}`, async () => {
      data.setKurse(prevKurse);
      await LivingAppsService.updateKurseEntry(kurs.record_id, { status: lookupKey(kurs.fields.status) });
      fetchAll();
    });
    try {
      await LivingAppsService.updateKurseEntry(kurs.record_id, { status: newColumn });
    } catch {
      data.setKurse(prevKurse);
      fetchAll();
    }
  };

  // ── Kanban columns ────────────────────────────────────────────────────────
  const kanbanColumns: KanbanColumn[] = useMemo(() => {
    const opts = LOOKUP_OPTIONS['kurse']?.['status'] ?? [];
    return opts.map(o => ({ key: o.key, label: o.label }));
  }, []);

  const kanbanCards: KanbanCard[] = useMemo(() => {
    const filtered = filterStatus
      ? enrichedKurse.filter(k => lookupKey(k.fields.status) === filterStatus)
      : enrichedKurse;
    return filtered.map(k => {
      const kursId = k.record_id;
      const anmeldeCount = anmeldungenByKurs.get(kursId) ?? 0;
      const maxTn = k.fields.maximale_teilnehmer ?? 0;
      const auslastung = maxTn > 0 ? Math.round((anmeldeCount / maxTn) * 100) : null;
      const isFull = maxTn > 0 && anmeldeCount >= maxTn;
      const wochentage = k.fields.wochentage
        ? (Array.isArray(k.fields.wochentage)
            ? k.fields.wochentage.map((w: { label?: string }) => w.label ?? '').join(', ')
            : '')
        : '';
      return {
        id: k.record_id,
        column: lookupKey(k.fields.status) ?? 'geplant',
        title: k.fields.titel ?? tx('Unbenannter Kurs'),
        subtitle: [k.dozentName, wochentage, k.fields.uhrzeit ? k.fields.uhrzeit.slice(11, 16) : '']
          .filter(Boolean).join(' · '),
        meta: auslastung !== null
          ? tx`${anmeldeCount}/${maxTn} Plätze${isFull ? ' — voll' : ''}`
          : undefined,
        tone: isFull ? 'warning' : undefined,
      };
    });
  }, [enrichedKurse, anmeldungenByKurs, filterStatus]);

  // ── Context line ──────────────────────────────────────────────────────────
  const contextLine = useMemo(() => {
    if (heutigeKurse.length === 0) {
      return neueAnmeldungen.length > 0
        ? tx`${neueAnmeldungen.length} neue Anmeldungen warten auf Bestätigung.`
        : tx('Heute keine Kurse geplant.');
    }
    const kursNamen = namen(heutigeKurse.map(k => k.fields.titel ?? ''));
    return tx`Heute: ${kursNamen}`;
  }, [heutigeKurse, neueAnmeldungen]);

  // ── Hero: unbezahlte bestätigte Anmeldungen ──────────────────────────────
  const heroUnbezahlt = unbezahlteBestaetigt.slice(0, 3);

  // ── WorkList items: Neue Anmeldungen ─────────────────────────────────────
  const neueAnmeldungenItems = useMemo(() => {
    return enrichedAnmeldungen
      .filter(a => lookupKey(a.fields.status) === 'neu')
      .slice(0, 8)
      .map(a => {
        const kursId = extractRecordId(a.fields.kurs);
        const kurs = kursId ? kurseMap.get(kursId) : undefined;
        return {
          id: a.record_id,
          title: a.teilnehmerName || tx('Unbekannt'),
          secondLine: (
            <span className="text-muted-foreground text-sm truncate">
              {kurs?.fields.titel ?? ''}
              {a.fields.anmeldedatum && (
                <> · <span>{formatDate(a.fields.anmeldedatum)}</span></>
              )}
            </span>
          ),
          action: {
            label: tx('Bestätigen'),
            onClick: () => handleConfirmAnmeldung(a),
          },
        };
      });
  }, [enrichedAnmeldungen, kurseMap]);

  // ── WorkList items: Heutige Kurse ────────────────────────────────────────
  const heutigeKurseItems = useMemo(() => {
    return heutigeKurse.slice(0, 6).map(k => {
      const kursId = k.record_id;
      const anmeldeCount = anmeldungenByKurs.get(kursId) ?? 0;
      const maxTn = k.fields.maximale_teilnehmer ?? 0;
      return {
        id: k.record_id,
        title: k.fields.titel ?? tx('Kurs'),
        secondLine: (
          <span className="text-muted-foreground text-sm">
            {k.fields.uhrzeit ? (
              <span className="font-medium text-foreground">{k.fields.uhrzeit.slice(11, 16)}</span>
            ) : null}
            {k.dozentName ? <> · {k.dozentName}</> : null}
            {maxTn > 0 ? (
              <> · <span className={anmeldeCount >= maxTn ? 'text-amber-600 font-medium' : ''}>
                {anmeldeCount}/{maxTn}
              </span></>
            ) : null}
          </span>
        ),
        action: {
          label: tx('Öffnen'),
          onClick: () => crud.kurse.openDetail(k),
        },
      };
    });
  }, [heutigeKurse, anmeldungenByKurs]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{contextLine}</p>
        </div>
        <button
          onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neuer Kurs')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroUnbezahlt.length > 0 && (
          <HeroBanner
            icon={<IconAlertCircle size={18} />}
            action={{
              label: tx('Alle bestätigen'),
              onClick: () => crud.anmeldungen.openDetail(
                anmeldungen.find(a => lookupKey(a.fields.status) === 'bestaetigt' && !a.fields.bezahlt) ?? anmeldungen[0]
              ),
            }}
          >
            {(() => {
              const names = namen(
                heroUnbezahlt.map(a => {
                  const id = extractRecordId(a.fields.teilnehmer);
                  const t = id ? teilnehmerMap.get(id) : undefined;
                  return t ? `${t.fields.vorname ?? ''}`.trim() : '';
                }).filter(Boolean)
              );
              return (
                <>
                  <b>{names}</b>{' '}
                  {tx`${unbezahlteBestaetigt.length} bestätigte Anmeldung${unbezahlteBestaetigt.length === 1 ? '' : 'en'} noch unbezahlt.`}
                </>
              );
            })()}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={appLabel('kurse') + ' ' + tx('aktiv')}
              value={aktiveKurse.length}
              icon={<IconMusic size={16} className="shrink-0" />}
              tone={aktiveKurse.length > 0 ? 'primary' : 'default'}
              onClick={() => setFilterStatus(f => f === 'laeuft' ? null : 'laeuft')}
              active={filterStatus === 'laeuft'}
            />
            <StatStripItem
              title={tx('Geplant')}
              value={geplanteKurse.length}
              icon={<IconCalendar size={16} className="shrink-0" />}
              tone="default"
              onClick={() => setFilterStatus(f => f === 'geplant' ? null : 'geplant')}
              active={filterStatus === 'geplant'}
            />
            <StatStripItem
              title={appLabel('teilnehmer')}
              value={teilnehmer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tx('Neue Anmeldungen')}
              value={neueAnmeldungen.length}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone={neueAnmeldungen.length > 0 ? 'warning' : 'default'}
              onClick={() => {/* WorkList below handles this */}}
            />
            <StatStripItem
              title={tx('Warteliste')}
              value={wartelisteCount}
              icon={<IconClock size={16} className="shrink-0" />}
              tone={wartelisteCount > 0 ? 'warning' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            onCardClick={(card) => {
              const k = kurse.find(k => k.record_id === card.id);
              if (k) crud.kurse.openDetail(k);
            }}
            onCardMove={handleCardMove}
            onAddCard={(columnKey) => crud.kurse.openCreate({ status: columnKey })}
            defaultCollapsed={['abgeschlossen', 'abgesagt']}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Neue Anmeldungen')}
              items={neueAnmeldungenItems}
              onItemClick={(id) => {
                const a = anmeldungen.find(a => a.record_id === id);
                if (a) crud.anmeldungen.openDetail(a);
              }}
              empty={{
                text: tx('Alle Anmeldungen sind bestätigt.'),
                action: {
                  label: tx('Anmeldung erfassen'),
                  onClick: () => crud.anmeldungen.openCreate({ status: 'neu' }),
                },
              }}
            />
            <WorkList
              title={tx('Heute')}
              items={heutigeKurseItems}
              onItemClick={(id) => {
                const k = kurse.find(k => k.record_id === id);
                if (k) crud.kurse.openDetail(k);
              }}
              empty={{
                text: tx('Heute keine Kurse.'),
                action: {
                  label: tx('Kurs planen'),
                  onClick: () => crud.kurse.openCreate({ status: 'geplant' }),
                },
              }}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
