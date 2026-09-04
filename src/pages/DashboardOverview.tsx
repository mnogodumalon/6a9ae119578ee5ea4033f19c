import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { tx, appLabel } from '@/i18n';
import { lookupOption } from '@/types/app';
import { LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard } from '@/components/widgets/KanbanWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';
import {
  IconAlertCircle,
  IconUsers,
  IconBook,
  IconClock,
  IconCurrencyEuro,
  IconCheck,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, teilnehmer, anmeldungen,
    dozentenMap, kurseMap, teilnehmerMap,
    setKurse, setAnmeldungen,
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
            onClick: () => confirmAnmeldung(rec),
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

  // Anmeldungen nach Status
  const neuAnmeldungen = useMemo(
    () => enrichedAnmeldungen.filter(a => lookupKey(a.fields.status) === 'neu'),
    [enrichedAnmeldungen]
  );
  const wartelisteAnmeldungen = useMemo(
    () => enrichedAnmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste'),
    [enrichedAnmeldungen]
  );
  const unbezahlt = useMemo(
    () => enrichedAnmeldungen.filter(
      a => lookupKey(a.fields.status) === 'bestaetigt' && !a.fields.bezahlt
    ),
    [enrichedAnmeldungen]
  );

  // Aktive Kurse
  const aktiveKurse = useMemo(
    () => kurse.filter(k => {
      const s = lookupKey(k.fields.status);
      return s === 'laeuft' || s === 'geplant';
    }),
    [kurse]
  );

  // Belegungs-Map: kursId → Anzahl bestätigter Anmeldungen
  const belegungMap = useMemo(() => {
    const m = new Map<string, number>();
    anmeldungen.forEach(a => {
      const statusK = lookupKey(a.fields.status);
      if (statusK === 'bestaetigt' || statusK === 'neu') {
        const kid = a.fields.kurs ? a.fields.kurs.match(/([a-f0-9]{24})$/i)?.[1] : null;
        if (kid) m.set(kid, (m.get(kid) ?? 0) + 1);
      }
    });
    return m;
  }, [anmeldungen]);

  // Confirm-Anmeldung (Neu → Bestätigt)
  async function confirmAnmeldung(rec: (typeof enrichedAnmeldungen)[number]) {
    const before = rec.fields.status;
    const newStatus = lookupOption('anmeldungen', 'status', 'bestaetigt');
    const snapshot = [...anmeldungen];
    setAnmeldungen(prev =>
      prev.map(a =>
        a.record_id === rec.record_id
          ? { ...a, fields: { ...a.fields, status: newStatus } }
          : a
      )
    );
    const name = rec.teilnehmerName || tx('Teilnehmer');
    try {
      await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: 'bestaetigt' });
      undoToast(
        tx`${name} — Anmeldung bestätigt`,
        async () => {
          setAnmeldungen(snapshot);
          await LivingAppsService.updateAnmeldungenEntry(rec.record_id, { status: before ? lookupKey(before) : 'neu' });
        }
      );
    } catch {
      setAnmeldungen(snapshot);
      fetchAll();
    }
  }

  // Kurs-Status-Wechsel via Kanban
  async function handleCardMove(cardId: string, newColumn: string) {
    const kursId = cardId.split(':')[1];
    const kurs = kurse.find(k => k.record_id === kursId);
    if (!kurs) return;
    const newStatus = lookupOption('kurse', 'status', newColumn);
    const snapshot = [...kurse];
    setKurse(prev =>
      prev.map(k =>
        k.record_id === kursId
          ? { ...k, fields: { ...k.fields, status: newStatus } }
          : k
      )
    );
    const titel = kurs.fields.titel ?? tx('Kurs');
    try {
      await LivingAppsService.updateKurseEntry(kursId, { status: newColumn });
      const colLabel = LOOKUP_OPTIONS['kurse']?.['status']?.find(o => o.key === newColumn)?.label ?? newColumn;
      undoToast(
        tx`${titel} — ${colLabel}`,
        async () => {
          setKurse(snapshot);
          const oldKey = lookupKey(kurs.fields.status) ?? 'geplant';
          await LivingAppsService.updateKurseEntry(kursId, { status: oldKey });
        }
      );
    } catch {
      setKurse(snapshot);
      fetchAll();
    }
  }

  // Kanban columns (INSIDE body — locale-aware getters)
  const kursColumns = useMemo(
    () => (LOOKUP_OPTIONS['kurse']?.['status'] ?? []).map(o => ({
      key: o.key,
      label: o.label,
      tone: o.key === 'laeuft' ? ('success' as const)
        : o.key === 'abgesagt' ? ('destructive' as const)
        : o.key === 'abgeschlossen' ? ('default' as const)
        : ('primary' as const),
    })),
    []
  );

  // Kanban cards
  const kursCards = useMemo((): KanbanCard[] =>
    enrichedKurse.map(k => {
      const statusK = lookupKey(k.fields.status) ?? '';
      const belegung = belegungMap.get(k.record_id) ?? 0;
      const max = k.fields.maximale_teilnehmer ?? 0;
      const instrument = k.fields.instrument?.label ?? '';
      const dozent = k.dozentName;
      const voll = max > 0 && belegung >= max;
      return {
        id: `kurs:${k.record_id}`,
        column: statusK,
        title: k.fields.titel ?? tx('Kurs'),
        subtitle: (
          <span className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span>{instrument}{dozent ? ` · ${dozent}` : ''}</span>
            {max > 0 && (
              <span className={voll ? 'text-amber-600 font-medium' : ''}>
                {belegung}/{max} {tx('Plätze')}
                {voll ? ` · ${tx('voll')}` : ''}
              </span>
            )}
          </span>
        ),
        tone: voll && statusK === 'laeuft' ? 'warning' : 'default',
      };
    }),
    [enrichedKurse, belegungMap]
  );

  // Context line
  const contextLine = useMemo(() => {
    const neuN = neuAnmeldungen.length;
    const warteN = wartelisteAnmeldungen.length;
    if (neuN > 0) {
      const names = neuAnmeldungen.slice(0, 3).map(a => a.teilnehmerName || '');
      return neuN === 1
        ? tx`${namen(names)} wartet auf Bestätigung.`
        : tx`${neuN} neue Anmeldungen warten auf Bestätigung — darunter ${namen(names)}.`;
    }
    if (warteN > 0) {
      return tx`${warteN} Schüler auf der Warteliste.`;
    }
    return tx('Alle Anmeldungen bestätigt — gute Lage!');
  }, [neuAnmeldungen, wartelisteAnmeldungen]);

  // ChartWidget rows für Anmeldungen nach Instrument
  const chartRows = useMemo(() =>
    enrichedAnmeldungen
      .filter(a => lookupKey(a.fields.status) !== 'abgemeldet')
      .map(a => {
        const kid = a.fields.kurs ? a.fields.kurs.match(/([a-f0-9]{24})$/i)?.[1] : null;
        const kurs = kid ? kurseMap.get(kid) : undefined;
        return { id: `anmeldung:${a.record_id}`, data: { instrument: kurs?.fields.instrument } };
      }),
    [enrichedAnmeldungen, kurseMap]
  );

  // WorkList items: Neu-Anmeldungen
  const worklistItems = useMemo(() =>
    neuAnmeldungen.slice(0, 20).map(a => ({
      id: a.record_id,
      title: a.teilnehmerName || tx('Unbekannt'),
      secondLine: (
        <span>
          <span className="font-medium text-amber-600">{tx('Neu')}</span>
          {a.kursName ? <span className="text-muted-foreground"> · {a.kursName}</span> : null}
          {a.fields.anmeldedatum ? <span className="text-muted-foreground"> · {formatDate(a.fields.anmeldedatum)}</span> : null}
        </span>
      ),
      action: {
        label: tx('Bestätigen'),
        onClick: () => confirmAnmeldung(a),
      },
    })),
    [neuAnmeldungen]
  );

  // WorkList items: Warteliste
  const warteItems = useMemo(() =>
    wartelisteAnmeldungen.slice(0, 10).map(a => ({
      id: a.record_id,
      title: a.teilnehmerName || tx('Unbekannt'),
      secondLine: (
        <span>
          <span className="font-medium text-primary">{tx('Warteliste')}</span>
          {a.kursName ? <span className="text-muted-foreground"> · {a.kursName}</span> : null}
        </span>
      ),
    })),
    [wartelisteAnmeldungen]
  );

  // Hero: Neue Anmeldungen warten
  const firstNeu = neuAnmeldungen[0];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{contextLine}</p>
        </div>
        <button
          className="shrink-0 mt-2 sm:mt-0 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
        >
          <IconBook size={16} className="shrink-0" />
          {tx('Neuer Kurs')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          neuAnmeldungen.length > 0 && firstNeu ? (
            <HeroBanner
              icon={<IconAlertCircle size={18} />}
              action={{
                label: tx('Jetzt bestätigen'),
                onClick: () => confirmAnmeldung(firstNeu),
              }}
            >
              <b>{namen(neuAnmeldungen.slice(0, 3).map(a => a.teilnehmerName || ''))}</b>
              {neuAnmeldungen.length === 1
                ? tx` — neue Anmeldung wartet auf Bestätigung.`
                : tx` und ${neuAnmeldungen.length - 1} weitere — neue Anmeldungen warten auf Bestätigung.`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Aktive Kurse')}
              value={aktiveKurse.length}
              icon={<IconBook size={16} className="shrink-0" />}
              tone="primary"
            />
            <StatStripItem
              title={tx('Schüler')}
              value={teilnehmer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
            />
            <StatStripItem
              title={tx('Neu / Warteliste')}
              value={`${neuAnmeldungen.length} / ${wartelisteAnmeldungen.length}`}
              icon={<IconClock size={16} className="shrink-0" />}
              tone={neuAnmeldungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Unbezahlt')}
              value={unbezahlt.length}
              icon={<IconCurrencyEuro size={16} className="shrink-0" />}
              tone={unbezahlt.length > 0 ? 'destructive' : 'default'}
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kursColumns}
            cards={kursCards}
            defaultCollapsed={['abgeschlossen', 'abgesagt']}
            onCardClick={card => {
              const kursId = card.id.split(':')[1];
              const kurs = kurse.find(k => k.record_id === kursId);
              if (kurs) crud.kurse.openDetail(kurs);
            }}
            onCardMove={handleCardMove}
            onAddCard={columnKey => crud.kurse.openCreate({ status: columnKey })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Neue Anmeldungen')}
              items={worklistItems}
              onItemClick={id => {
                const a = anmeldungen.find(x => x.record_id === id);
                if (a) crud.anmeldungen.openDetail(a);
              }}
              empty={{
                text: tx('Keine neuen Anmeldungen — alles bestätigt.'),
                action: {
                  label: tx('Neue Anmeldung'),
                  onClick: () => crud.anmeldungen.openCreate({ status: 'neu' }),
                },
              }}
            />
            <ChartWidget
              title={tx('Anmeldungen nach Instrument')}
              rows={chartRows}
              dimension={{
                kind: 'category',
                accessor: r => r.data.instrument,
              }}
            />
          </>
        }
      />

      {/* Warteliste below, only if non-empty */}
      {wartelisteAnmeldungen.length > 0 && (
        <div className="max-w-md">
          <WorkList
            title={tx('Warteliste')}
            items={warteItems}
            onItemClick={id => {
              const a = anmeldungen.find(x => x.record_id === id);
              if (a) crud.anmeldungen.openDetail(a);
            }}
            empty={{ text: tx('Warteliste leer.') }}
          />
        </div>
      )}

      {crud.surfaces}
    </div>
  );
}
