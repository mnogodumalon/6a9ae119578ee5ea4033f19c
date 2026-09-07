import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { lookupOption } from '@/types/app';
import { LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';
import type { ChartRow } from '@/components/widgets/ChartWidget';
import {
  IconMusic,
  IconUsers,
  IconCalendarCheck,
  IconAlertCircle,
  IconUserPlus,
  IconCheck,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, anmeldungen, anwesenheiten, dozenten,
    kurseMap, teilnehmerMap,
    fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const rec = top.record;
        const statusKey = lookupKey(rec.fields.status);
        if (statusKey === 'neu') {
          return {
            label: tx('Anmeldung bestätigen'),
            onClick: async () => {
              const snap = rec.fields.status;
              const newStatus = lookupOption('anmeldungen', 'status', 'bestaetigt');
              try {
                await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'bestaetigt' });
                fetchAll();
                undoToast(tx`${rec.record_id} — bestätigt`, async () => {
                  await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: snap?.key ?? 'neu' });
                  fetchAll();
                });
              } catch { fetchAll(); }
            },
          };
        }
        if (statusKey === 'warteliste') {
          return {
            label: tx('Auf bestätigt setzen'),
            onClick: async () => {
              const snap = rec.fields.status;
              try {
                await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'bestaetigt' });
                fetchAll();
                undoToast(tx`Warteliste — bestätigt`, async () => {
                  await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: snap?.key ?? 'warteliste' });
                  fetchAll();
                });
              } catch { fetchAll(); }
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

  // Kurs-Status-Kanban
  const kursColumns: KanbanColumn[] = useMemo(() =>
    (LOOKUP_OPTIONS['kurse']?.['status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'laeuft' ? 'success' as const
        : o.key === 'abgesagt' ? 'destructive' as const
        : o.key === 'geplant' ? 'primary' as const
        : 'default' as const,
    })),
  []);

  const kursCards: KanbanCard[] = useMemo(() =>
    enrichedKurse.map(k => {
      const anmeldungenFuerKurs = anmeldungen.filter(a =>
        extractRecordId(a.fields.kurs) === k.record_id &&
        lookupKey(a.fields.status) !== 'abgemeldet'
      );
      const aktive = anmeldungenFuerKurs.filter(a => lookupKey(a.fields.status) === 'bestaetigt').length;
      const max = k.fields.maximale_teilnehmer ?? 0;
      const auslastung = max > 0 ? `${aktive}/${max}` : `${aktive}`;
      const tage = (k.fields.wochentage as Array<{ label: string }> | undefined)?.map(w => w.label).join(', ');
      return {
        id: `kurs:${k.record_id}`,
        column: lookupKey(k.fields.status) ?? '',
        title: k.fields.titel ?? tx('Unbenannter Kurs'),
        subtitle: (
          <span className="text-xs text-muted-foreground space-y-0.5">
            <span className="block">{k.dozentName || tx('Kein Dozent')}{tage ? ` · ${tage}` : ''}</span>
            <span className="block">{tx('Teilnehmer')}: {auslastung}{max > 0 && aktive >= max ? <span className="ml-1 text-amber-600 font-medium">{tx('Voll')}</span> : null}</span>
          </span>
        ),
        tone: max > 0 && aktive >= max && lookupKey(k.fields.status) === 'laeuft' ? 'warning' as const : undefined,
      };
    }),
  [enrichedKurse, anmeldungen]);

  // KPIs
  const aktiveKurse = kurse.filter(k => lookupKey(k.fields.status) === 'laeuft').length;
  const geplantKurse = kurse.filter(k => lookupKey(k.fields.status) === 'geplant').length;
  const neueAnmeldungen = anmeldungen.filter(a => lookupKey(a.fields.status) === 'neu').length;
  const wartelisteCount = anmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste').length;

  // Neue Anmeldungen WorkList
  const neueAnmeldungenListe = useMemo(() =>
    enrichedAnmeldungen
      .filter(a => lookupKey(a.fields.status) === 'neu')
      .sort((a, b) => (b.fields.anmeldedatum ?? '').localeCompare(a.fields.anmeldedatum ?? ''))
      .slice(0, 8)
      .map(a => {
        const kurs = kurseMap.get(extractRecordId(a.fields.kurs) ?? '');
        return {
          id: a.record_id,
          title: a.teilnehmerName || tx('Unbekannt'),
          secondLine: (
            <span>
              <span className="text-muted-foreground">{kurs?.fields.titel ?? tx('Kurs unbekannt')}</span>
              {a.fields.anmeldedatum && (
                <span className="text-muted-foreground"> · {formatDate(a.fields.anmeldedatum)}</span>
              )}
            </span>
          ),
          action: {
            label: tx('Bestätigen'),
            onClick: async () => {
              const snap = a.fields.status;
              try {
                await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: 'bestaetigt' });
                fetchAll();
                undoToast(tx`${a.teilnehmerName} — bestätigt`, async () => {
                  await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status: snap?.key ?? 'neu' });
                  fetchAll();
                });
              } catch { fetchAll(); }
            },
          },
        };
      }),
  [enrichedAnmeldungen, kurseMap]);

  // Anwesenheiten heute WorkList (Kurse die heute stattfinden könnten)
  const heutigeAnwesenheiten = useMemo(() => {
    const anwHeuteMap = new Map<string, typeof anwesenheiten>();
    anwesenheiten.forEach(a => {
      if (a.fields.datum === today) {
        const kursId = extractRecordId(a.fields.kurs) ?? '';
        if (!anwHeuteMap.has(kursId)) anwHeuteMap.set(kursId, []);
        anwHeuteMap.get(kursId)!.push(a);
      }
    });
    return anwHeuteMap;
  }, [anwesenheiten, today]);

  // Chart rows für Instrument-Verteilung
  type KursChartRow = ChartRow<{ status: string; instrument: string }>;
  const instrumentRows: KursChartRow[] = useMemo(() =>
    kurse.map(k => ({
      id: `kurs:${k.record_id}`,
      data: {
        status: lookupKey(k.fields.status) ?? '',
        instrument: k.fields.instrument?.label ?? '',
      },
    })),
  [kurse]);

  // Hero: Warteliste-Anmeldungen die freie Plätze haben
  const wartelisteMitFreienPlaetzen = useMemo(() => {
    return enrichedAnmeldungen.filter(a => {
      if (lookupKey(a.fields.status) !== 'warteliste') return false;
      const kursId = extractRecordId(a.fields.kurs);
      if (!kursId) return false;
      const kurs = kurseMap.get(kursId);
      if (!kurs || lookupKey(kurs.fields.status) === 'abgesagt') return false;
      const max = kurs.fields.maximale_teilnehmer ?? 0;
      if (max === 0) return false;
      const aktive = anmeldungen.filter(x =>
        extractRecordId(x.fields.kurs) === kursId &&
        lookupKey(x.fields.status) === 'bestaetigt'
      ).length;
      return aktive < max;
    });
  }, [enrichedAnmeldungen, kurseMap, anmeldungen]);

  const advanceWarteliste = async () => {
    if (wartelisteMitFreienPlaetzen.length === 0) return;
    const first = wartelisteMitFreienPlaetzen[0];
    const snap = first.fields.status;
    try {
      await LivingAppsService.updateAnmeldungenEntry(first.record_id, { status: 'bestaetigt' });
      fetchAll();
      undoToast(tx`${first.teilnehmerName} — von Warteliste bestätigt`, async () => {
        await LivingAppsService.updateAnmeldungenEntry(first.record_id, { status: snap?.key ?? 'warteliste' });
        fetchAll();
      });
    } catch { fetchAll(); }
  };

  const handleKursCardMove = async (cardId: string, newColumn: string) => {
    const kursId = cardId.split(':')[1];
    const kurs = kurseMap.get(kursId);
    if (!kurs) return;
    const snap = kurs.fields.status;
    // Optimistic update
    data.setKurse(prev => prev.map(k =>
      k.record_id === kursId
        ? { ...k, fields: { ...k.fields, status: lookupOption('kurse', 'status', newColumn) } }
        : k
    ));
    try {
      await LivingAppsService.updateKurseEntry(kursId, { status: newColumn });
      undoToast(tx`Kurs — Status geändert`, async () => {
        data.setKurse(prev => prev.map(k =>
          k.record_id === kursId
            ? { ...k, fields: { ...k.fields, status: snap } }
            : k
        ));
        await LivingAppsService.updateKurseEntry(kursId, { status: snap?.key ?? newColumn });
      });
    } catch {
      fetchAll();
    }
  };

  const contextLine = useMemo(() => {
    const laeuft = kurse.filter(k => lookupKey(k.fields.status) === 'laeuft');
    if (laeuft.length === 0 && geplantKurse === 0) {
      return tx('Noch keine Kurse angelegt — fange gleich an!');
    }
    const dozentenNamen = dozenten
      .filter(d => d.fields.aktiv !== false)
      .map(d => [d.fields.vorname, d.fields.nachname].filter(Boolean).join(' '));
    const nameStr = namen(dozentenNamen);
    if (neueAnmeldungen > 0) {
      return tx`${neueAnmeldungen} neue Anmeldung${neueAnmeldungen === 1 ? '' : 'en'} warten auf Bestätigung — Dozenten: ${nameStr}`;
    }
    return tx`${laeuft.length} laufende Kurse, ${geplantKurse} in Planung — Dozenten: ${nameStr}`;
  }, [kurse, dozenten, geplantKurse, neueAnmeldungen]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{contextLine}</p>
        </div>
        <button
          onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium shrink-0 hover:bg-primary/90 transition-colors"
        >
          <IconMusic size={16} className="shrink-0" />
          {tx('Neuer Kurs')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={wartelisteMitFreienPlaetzen.length > 0 && (
          <HeroBanner
            icon={<IconUserPlus size={18} />}
            action={{ label: tx('Jetzt bestätigen'), onClick: advanceWarteliste }}
          >
            <b>{namen(wartelisteMitFreienPlaetzen.map(a => a.teilnehmerName))}</b>{' '}
            {wartelisteMitFreienPlaetzen.length === 1 ? tx('steht auf der Warteliste — ein Platz ist frei geworden.') : tx('stehen auf der Warteliste — Plätze sind frei geworden.')}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Laufende Kurse')}
              value={aktiveKurse}
              icon={<IconCalendarCheck size={16} />}
              tone={aktiveKurse > 0 ? 'success' : 'default'}
            />
            <StatStripItem
              title={tx('In Planung')}
              value={geplantKurse}
              icon={<IconMusic size={16} />}
              tone="default"
            />
            <StatStripItem
              title={tx('Neue Anmeldungen')}
              value={neueAnmeldungen}
              icon={<IconUserPlus size={16} />}
              tone={neueAnmeldungen > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Warteliste')}
              value={wartelisteCount}
              icon={<IconUsers size={16} />}
              tone={wartelisteMitFreienPlaetzen.length > 0 ? 'destructive' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kursColumns}
            cards={kursCards}
            defaultCollapsed={['abgeschlossen', 'abgesagt']}
            onCardClick={(card) => {
              const kursId = card.id.split(':')[1];
              const kurs = kurseMap.get(kursId);
              if (kurs) crud.kurse.openDetail(kurs);
            }}
            onCardMove={handleKursCardMove}
            onAddCard={(column) => crud.kurse.openCreate({ status: column })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Neue Anmeldungen')}
              items={neueAnmeldungenListe}
              onItemClick={(id) => {
                const anm = anmeldungen.find(a => a.record_id === id);
                if (anm) crud.anmeldungen.openDetail(anm);
              }}
              empty={{
                text: tx('Keine neuen Anmeldungen — alles bestätigt.'),
                action: {
                  label: tx('Anmeldung erfassen'),
                  onClick: () => crud.anmeldungen.openCreate({ status: 'neu' }),
                },
              }}
            />
            <ChartWidget
              title={tx('Kurse nach Instrument')}
              rows={instrumentRows}
              dimension={{
                kind: 'category',
                accessor: (r) => r.data.instrument,
              }}
            />
          </>
        }
      />

      {/* Anmeldungen Button */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => crud.anmeldungen.openCreate({ status: 'neu' })}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          <IconCheck size={16} className="shrink-0" />
          {tx('Anmeldung hinzufügen')}
        </button>
        <button
          onClick={() => crud.teilnehmer.openCreate({})}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
        >
          <IconUsers size={16} className="shrink-0" />
          {tx('Neuen Schüler anlegen')}
        </button>
      </div>

      {crud.surfaces}
    </div>
  );
}
