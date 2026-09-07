import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate, lookupKey } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget } from '@/components/widgets/KanbanWidget';
import type { KanbanCard, KanbanColumn } from '@/components/widgets/KanbanWidget';
import { ChartWidget } from '@/components/widgets/ChartWidget';
import {
  IconAlertCircle,
  IconMusic,
  IconUsers,
  IconList,
  IconClock,
  IconCheck,
} from '@tabler/icons-react';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, teilnehmer, anmeldungen,
    dozentenMap, raeumeMap, kurseMap, teilnehmerMap,
    setKurse, setAnmeldungen, fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const a = top.record;
        const statusKey = lookupKey(a.fields.status);
        if (statusKey === 'neu') {
          return {
            label: tx('Anmeldung bestätigen'),
            onClick: () => confirmAnmeldung(a),
          };
        }
        if (statusKey === 'warteliste') {
          return {
            label: tx('Von Warteliste bestätigen'),
            onClick: () => confirmAnmeldung(a),
          };
        }
      }
      return undefined;
    },
  });

  const enrichedKurse = crud.enriched.kurse;
  const enrichedAnmeldungen = crud.enriched.anmeldungen;

  const clock = useClock();

  // --- Derived data ---

  const laufendeKurse = kurse.filter(k => lookupKey(k.fields.status) === 'laeuft');
  const geplante = kurse.filter(k => lookupKey(k.fields.status) === 'geplant');

  const neueAnmeldungen = anmeldungen.filter(
    a => lookupKey(a.fields.status) === 'neu'
  );
  const wartelisteAnmeldungen = anmeldungen.filter(
    a => lookupKey(a.fields.status) === 'warteliste'
  );
  const unbezahlt = anmeldungen.filter(
    a => lookupKey(a.fields.status) === 'bestaetigt' && !a.fields.bezahlt
  );

  // --- Kurs-Kapazitätsberechnung ---
  function getTeilnehmerCount(kursId: string): number {
    return anmeldungen.filter(a => {
      const aId = extractRecordId(a.fields.kurs);
      const key = lookupKey(a.fields.status);
      return aId === kursId && (key === 'bestaetigt' || key === 'neu');
    }).length;
  }

  // --- Anmeldung bestätigen ---
  async function confirmAnmeldung(a: typeof anmeldungen[0]) {
    const prev = anmeldungen.map(x => ({ ...x }));
    const newStatus = lookupOption('anmeldungen', 'status', 'bestaetigt');
    setAnmeldungen(anmeldungen.map(x =>
      x.record_id === a.record_id
        ? { ...x, fields: { ...x.fields, status: newStatus } }
        : x
    ));
    const teilnehmerName =
      teilnehmerMap.get(extractRecordId(a.fields.teilnehmer) ?? '')
        ?.fields.vorname ?? tx('Anmeldung');
    const kursName =
      kurseMap.get(extractRecordId(a.fields.kurs) ?? '')?.fields.titel ?? '';
    undoToast(
      tx`${teilnehmerName} in ${kursName} — bestätigt`,
      async () => {
        setAnmeldungen(prev);
        await LivingAppsService.updateAnmeldungenEntry(a.record_id, {
          status: lookupKey(a.fields.status),
        });
      }
    );
    try {
      await LivingAppsService.updateAnmeldungenEntry(a.record_id, {
        status: 'bestaetigt',
      });
    } catch {
      setAnmeldungen(prev);
      fetchAll();
    }
  }

  // --- Kurs-Status-Wechsel (Kanban) ---
  async function handleCardMove(cardId: string, newColumn: string): Promise<void | string> {
    const kursId = cardId.split(':')[1];
    const kurs = kurse.find(k => k.record_id === kursId);
    if (!kurs) return;

    // Kapazitätsprüfung: Kurs abschließen nur wenn er lief
    const prevStatus = lookupKey(kurs.fields.status);
    if (newColumn === 'laeuft' && prevStatus === 'abgeschlossen') {
      return tx('Abgeschlossene Kurse können nicht wieder geöffnet werden.');
    }

    const prev = kurse.map(k => ({ ...k }));
    const newStatusOption = lookupOption('kurse', 'status', newColumn);
    setKurse(kurse.map(k =>
      k.record_id === kursId
        ? { ...k, fields: { ...k.fields, status: newStatusOption } }
        : k
    ));
    const kursTitle = kurs.fields.titel ?? '';
    const newLabel = newStatusOption.label;
    undoToast(
      tx`${kursTitle} — ${newLabel}`,
      async () => {
        setKurse(prev);
        await LivingAppsService.updateKurseEntry(kursId, {
          status: prevStatus,
        });
      }
    );
    try {
      await LivingAppsService.updateKurseEntry(kursId, { status: newColumn });
    } catch {
      setKurse(prev);
      fetchAll();
    }
  }

  // --- KanbanWidget: Spalten und Karten ---
  const kanbanColumns: KanbanColumn[] = (LOOKUP_OPTIONS['kurse']?.['status'] ?? []).map(o => ({
    key: o.key,
    label: o.label,
    tone: o.key === 'laeuft' ? 'success'
      : o.key === 'geplant' ? 'primary'
      : o.key === 'abgesagt' ? 'destructive'
      : 'default',
  }));

  const kanbanCards: KanbanCard[] = enrichedKurse.map(k => {
    const count = getTeilnehmerCount(k.record_id);
    const max = k.fields.maximale_teilnehmer ?? 0;
    const isFull = max > 0 && count >= max;
    return {
      id: `kurs:${k.record_id}`,
      column: lookupKey(k.fields.status) ?? '',
      title: k.fields.titel ?? appLabel('kurse'),
      subtitle: (
        <span className="flex flex-col gap-0.5">
          <span className="truncate">{k.dozentName || '—'}</span>
          <span className="text-muted-foreground text-xs flex items-center gap-1">
            <IconUsers size={11} className="shrink-0" />
            {count}{max > 0 ? `/${max}` : ''}
            {isFull && (
              <span className="text-amber-600 font-medium ml-1">{tx('Voll')}</span>
            )}
            {k.fields.instrument?.label && (
              <span className="ml-1">{k.fields.instrument.label}</span>
            )}
          </span>
        </span>
      ),
      tone: isFull ? 'warning' : 'default',
    };
  });

  // --- Hero: Neue Anmeldungen, die bestätigt werden müssen ---
  const heroNeu = neueAnmeldungen.slice(0, 3);

  // --- Kontext-Zeile ---
  const contextNames = neueAnmeldungen.slice(0, 3).map(a => {
    const tn = teilnehmerMap.get(extractRecordId(a.fields.teilnehmer) ?? '');
    return tn ? `${tn.fields.vorname ?? ''} ${tn.fields.nachname ?? ''}`.trim() : '';
  }).filter(Boolean);

  const contextLine = neueAnmeldungen.length > 0
    ? tx`${namen(contextNames)} ${neueAnmeldungen.length === 1 ? tx('hat sich neu angemeldet') : tx('haben sich neu angemeldet')} — bitte bestätigen.`
    : laufendeKurse.length > 0
    ? tx`${laufendeKurse.length} ${laufendeKurse.length === 1 ? tx('Kurs läuft') : tx('Kurse laufen')} — alles im Plan.`
    : tx('Willkommen bei der Musikschule Klangraum. Plane deinen ersten Kurs!');

  // --- WorkList: Neue + Warteliste Anmeldungen ---
  const anmeldungenItems = [...neueAnmeldungen, ...wartelisteAnmeldungen]
    .slice(0, 8)
    .map(a => {
      const tn = teilnehmerMap.get(extractRecordId(a.fields.teilnehmer) ?? '');
      const kn = kurseMap.get(extractRecordId(a.fields.kurs) ?? '');
      const statusKey = lookupKey(a.fields.status);
      const isWarteliste = statusKey === 'warteliste';
      return {
        id: a.record_id,
        title: tn
          ? `${tn.fields.vorname ?? ''} ${tn.fields.nachname ?? ''}`.trim()
          : tx('Unbekannt'),
        secondLine: (
          <span className="flex gap-1 items-center flex-wrap">
            <span className={isWarteliste ? 'text-amber-600 font-medium' : 'text-primary font-medium'}>
              {isWarteliste ? tx('Warteliste') : tx('Neu')}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground truncate">{kn?.fields.titel ?? '—'}</span>
          </span>
        ),
        action: !isWarteliste ? {
          label: tx('Bestätigen'),
          onClick: () => confirmAnmeldung(a),
        } : undefined,
      };
    });

  // --- WorkList: Unbezahlte bestätigte Anmeldungen ---
  const unbezahltItems = unbezahlt.slice(0, 5).map(a => {
    const tn = teilnehmerMap.get(extractRecordId(a.fields.teilnehmer) ?? '');
    const kn = kurseMap.get(extractRecordId(a.fields.kurs) ?? '');
    return {
      id: a.record_id,
      title: tn
        ? `${tn.fields.vorname ?? ''} ${tn.fields.nachname ?? ''}`.trim()
        : tx('Unbekannt'),
      secondLine: (
        <span className="flex gap-1 items-center flex-wrap">
          <span className="text-amber-600 font-medium">{tx('Offen')}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground truncate">{kn?.fields.titel ?? '—'}</span>
        </span>
      ),
      action: {
        label: tx('Als bezahlt markieren'),
        onClick: async () => {
          const prev = anmeldungen.map(x => ({ ...x }));
          const tnName = tn
            ? `${tn?.fields.vorname ?? ''} ${tn?.fields.nachname ?? ''}`.trim()
            : tx('Anmeldung');
          setAnmeldungen(anmeldungen.map(x =>
            x.record_id === a.record_id
              ? { ...x, fields: { ...x.fields, bezahlt: true } }
              : x
          ));
          undoToast(
            tx`${tnName} — als bezahlt markiert`,
            async () => {
              setAnmeldungen(prev);
              await LivingAppsService.updateAnmeldungenEntry(a.record_id, { bezahlt: false });
            }
          );
          try {
            await LivingAppsService.updateAnmeldungenEntry(a.record_id, { bezahlt: true });
          } catch {
            setAnmeldungen(prev);
            fetchAll();
          }
        },
      },
    };
  });

  // --- ChartWidget rows für Kurse nach Instrument ---
  const chartRows = enrichedKurse.map(k => ({
    id: `kurs:${k.record_id}`,
    data: k,
  }));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {gruss(clock)}
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">{contextLine}</p>
        </div>
        <button
          className="mt-2 sm:mt-0 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
          onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
        >
          <IconMusic size={16} className="shrink-0" />
          {tx('Neuer Kurs')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroNeu.length > 0 && (
          <HeroBanner
            icon={<IconAlertCircle size={18} />}
            action={{
              label: tx('Alle bestätigen'),
              onClick: () => confirmAnmeldung(heroNeu[0]),
            }}
          >
            <b>{namen(contextNames)}</b>{' '}
            {heroNeu.length === 1
              ? tx('hat eine neue Anmeldung — bitte bestätigen.')
              : tx`hat ${neueAnmeldungen.length} neue Anmeldungen — bitte bestätigen.`}
          </HeroBanner>
        )}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Kurse aktiv')}
              value={laufendeKurse.length}
              icon={<IconMusic size={16} className="shrink-0" />}
              tone={laufendeKurse.length > 0 ? 'success' : 'default'}
              onClick={() => crud.kurse.openCreate({ status: 'laeuft' })}
            />
            <StatStripItem
              title={tx('Geplante Kurse')}
              value={geplante.length}
              icon={<IconClock size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tx('Neue Anmeldungen')}
              value={neueAnmeldungen.length}
              icon={<IconList size={16} className="shrink-0" />}
              tone={neueAnmeldungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Warteliste')}
              value={wartelisteAnmeldungen.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone={wartelisteAnmeldungen.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title={tx('Unbezahlt')}
              value={unbezahlt.length}
              icon={<IconCheck size={16} className="shrink-0" />}
              tone={unbezahlt.length > 0 ? 'destructive' : 'default'}
            />
            <StatStripItem
              title={tx('Schüler gesamt')}
              value={teilnehmer.length}
              icon={<IconUsers size={16} className="shrink-0" />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            columns={kanbanColumns}
            cards={kanbanCards}
            defaultCollapsed={['abgeschlossen', 'abgesagt']}
            onCardClick={card => {
              const kursId = card.id.split(':')[1];
              const kurs = kurse.find(k => k.record_id === kursId);
              if (kurs) crud.kurse.openDetail(kurs);
            }}
            onCardMove={handleCardMove}
            onAddCard={column => crud.kurse.openCreate({ status: column })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Neue Anmeldungen & Warteliste')}
              items={anmeldungenItems}
              onItemClick={id => {
                const a = anmeldungen.find(x => x.record_id === id);
                if (a) crud.anmeldungen.openDetail(a);
              }}
              empty={{
                text: tx('Keine offenen Anmeldungen — alles bestätigt!'),
                action: {
                  label: tx('Neue Anmeldung'),
                  onClick: () => crud.anmeldungen.openCreate({ status: 'neu' }),
                },
              }}
            />
            {unbezahlt.length > 0 && (
              <WorkList
                title={tx('Offene Zahlungen')}
                items={unbezahltItems}
                onItemClick={id => {
                  const a = anmeldungen.find(x => x.record_id === id);
                  if (a) crud.anmeldungen.openDetail(a);
                }}
                empty={{ text: tx('Alle Beiträge bezahlt.') }}
              />
            )}
            <ChartWidget
              title={tx('Kurse nach Instrument')}
              rows={chartRows}
              dimension={{
                kind: 'category',
                accessor: r => r.data.fields.instrument,
              }}
            />
          </>
        }
      />

      {crud.surfaces}
    </div>
  );
}
