import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { formatDate } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import {
  KanbanWidget,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from '@/components/widgets/KanbanWidget';
import {
  IconAlertCircle,
  IconUsers,
  IconBook,
  IconClockHour4,
  IconListCheck,
  IconPlus,
} from '@tabler/icons-react';

function toneForKursStatus(status: string | undefined): KanbanTone {
  if (status === 'laeuft') return 'success';
  if (status === 'geplant') return 'primary';
  if (status === 'abgesagt') return 'warning';
  return 'default'; // abgeschlossen
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, setKurse, anmeldungen, setAnmeldungen,
    teilnehmer, dozentenMap, raeumeMap, kurseMap, teilnehmerMap,
    fetchAll,
  } = data;

  const clock = useClock();
  const today = format(clock, 'yyyy-MM-dd');

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const a = anmeldungen.find(x => x.record_id === top.record.record_id);
        const sk = lookupKey(a?.fields.status);
        if (sk === 'neu') {
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

  const [filterStrip, setFilterStrip] = useState<'neu' | 'warteliste' | 'unbezahlt' | null>(null);

  // --- Derived data ---
  const activeKurse = useMemo(() => kurse.filter(k => {
    const s = lookupKey(k.fields.status);
    return s === 'laeuft' || s === 'geplant';
  }), [kurse]);

  const neueAnmeldungen = useMemo(
    () => anmeldungen.filter(a => lookupKey(a.fields.status) === 'neu'),
    [anmeldungen],
  );

  const wartelisteAnmeldungen = useMemo(
    () => anmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste'),
    [anmeldungen],
  );

  const unbezahlteAnmeldungen = useMemo(
    () => anmeldungen.filter(a => {
      const s = lookupKey(a.fields.status);
      return !a.fields.bezahlt && (s === 'bestaetigt' || s === 'neu');
    }),
    [anmeldungen],
  );

  // Enriched aside: neue Anmeldungen to confirm
  const asideAnmeldungen = useMemo(() => {
    let base = enrichedAnmeldungen;
    if (filterStrip === 'neu') base = base.filter(a => lookupKey(a.fields.status) === 'neu');
    else if (filterStrip === 'warteliste') base = base.filter(a => lookupKey(a.fields.status) === 'warteliste');
    else if (filterStrip === 'unbezahlt') base = base.filter(a => !a.fields.bezahlt && (lookupKey(a.fields.status) === 'bestaetigt' || lookupKey(a.fields.status) === 'neu'));
    else base = base.filter(a => lookupKey(a.fields.status) === 'neu');
    return base.slice(0, 12);
  }, [enrichedAnmeldungen, filterStrip]);

  // --- Kanban: Kurse by Status ---
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['kurse']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  const cards = useMemo<KanbanCard[]>(() => {
    return enrichedKurse.map(k => {
      const status = lookupKey(k.fields.status) ?? 'geplant';
      const anmeldungenFuerKurs = anmeldungen.filter(a => {
        const kursId = a.fields.kurs?.match?.(/([a-f0-9]{24})$/i)?.[1];
        return kursId === k.record_id && lookupKey(a.fields.status) === 'bestaetigt';
      });
      const maxTn = k.fields.maximale_teilnehmer ?? 0;
      const belegtStr = maxTn > 0 ? ` · ${anmeldungenFuerKurs.length}/${maxTn}` : '';
      return {
        id: `kurs:${k.record_id}`,
        column: status,
        title: k.fields.titel ?? appLabel('kurse'),
        subtitle: k.dozentName ? `${k.dozentName}${belegtStr}` : belegtStr || undefined,
        tone: toneForKursStatus(status),
      };
    });
  }, [enrichedKurse, anmeldungen]);

  // --- confirm Anmeldung helper ---
  async function confirmAnmeldung(id: string) {
    const prev = anmeldungen.find(a => a.record_id === id);
    if (!prev) return;
    setAnmeldungen(old =>
      old.map(a =>
        a.record_id === id
          ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
          : a,
      ),
    );
    undoToast(tx('Anmeldung bestätigt'), async () => {
      setAnmeldungen(old =>
        old.map(a => a.record_id === id ? { ...a, fields: { ...a.fields, status: prev.fields.status } } : a),
      );
      await LivingAppsService.updateAnmeldungenEntry(id, { status: 'neu' });
    });
    try {
      await LivingAppsService.updateAnmeldungenEntry(id, { status: 'bestaetigt' });
    } catch {
      await fetchAll();
    }
  }

  // Move kurs between status columns
  async function moveKurs(cardId: string, newStatus: string) {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const prev = kurse.find(k => k.record_id === rid);
    if (!prev) return;
    setKurse(old =>
      old.map(k =>
        k.record_id === rid
          ? { ...k, fields: { ...k.fields, status: lookupOption('kurse', 'status', newStatus) } }
          : k,
      ),
    );
    undoToast(
      tx`Status geändert`,
      async () => {
        const prevKey = lookupKey(prev.fields.status) ?? 'geplant';
        setKurse(old =>
          old.map(k =>
            k.record_id === rid
              ? { ...k, fields: { ...k.fields, status: prev.fields.status } }
              : k,
          ),
        );
        await LivingAppsService.updateKurseEntry(rid, { status: prevKey });
      },
    );
    try {
      await LivingAppsService.updateKurseEntry(rid, { status: newStatus });
    } catch {
      await fetchAll();
    }
  }

  // --- Context line ---
  const dozentenNamen = useMemo(() => {
    const aktive = [...dozentenMap.values()].filter(d => d.fields.aktiv !== false);
    return namen(aktive.map(d => d.fields.vorname ?? ''));
  }, [dozentenMap]);

  const contextLine = useMemo(() => {
    const laufend = kurse.filter(k => lookupKey(k.fields.status) === 'laeuft').length;
    const tn = teilnehmer.length;
    if (laufend > 0 && tn > 0) {
      return tx`${laufend} Kurse laufen aktuell — ${tn} Schüler im System.`;
    }
    if (tn > 0) return tx`${tn} Schüler registriert — plane den nächsten Kurs.`;
    return tx`Willkommen! Lege jetzt den ersten Kurs an.`;
  }, [kurse, teilnehmer]);

  // Hero: neue Anmeldungen die noch nicht bestätigt wurden
  const heroActive = neueAnmeldungen.length > 0;
  const heroName = useMemo(() => {
    const names = neueAnmeldungen.slice(0, 3).map(a => {
      const tn = a.fields.teilnehmer ? teilnehmerMap.get(a.fields.teilnehmer.match(/([a-f0-9]{24})$/i)?.[1] ?? '') : undefined;
      return tn ? `${tn.fields.vorname ?? ''} ${tn.fields.nachname ?? ''}`.trim() : '';
    }).filter(Boolean);
    return namen(names);
  }, [neueAnmeldungen, teilnehmerMap]);

  // Aside: neue Anmeldungen + heute Anwesenheit
  const toggleFilter = (f: 'neu' | 'warteliste' | 'unbezahlt') => {
    setFilterStrip(prev => prev === f ? null : f);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{contextLine}</p>
        </div>
        <button
          onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <IconPlus size={16} className="shrink-0" />
          {tx('Neuer Kurs')}
        </button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={
          heroActive ? (
            <HeroBanner
              icon={<IconAlertCircle size={18} />}
              action={{
                label: tx('Jetzt bestätigen'),
                onClick: () => {
                  const first = neueAnmeldungen[0];
                  if (first) void confirmAnmeldung(first.record_id);
                },
              }}
            >
              <b>{heroName || neueAnmeldungen.length}</b>{' '}
              {neueAnmeldungen.length === 1
                ? tx`neue Anmeldung wartet auf Bestätigung.`
                : tx`neue Anmeldungen warten auf Bestätigung.`}
            </HeroBanner>
          ) : undefined
        }
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Aktive Kurse')}
              value={activeKurse.length}
              icon={<IconBook size={16} className="shrink-0" />}
              tone="default"
            />
            <StatStripItem
              title={tx('Neue Anmeldungen')}
              value={neueAnmeldungen.length}
              icon={<IconListCheck size={16} className="shrink-0" />}
              tone={neueAnmeldungen.length > 0 ? 'warning' : 'default'}
              onClick={() => toggleFilter('neu')}
              active={filterStrip === 'neu'}
            />
            <StatStripItem
              title={tx('Warteliste')}
              value={wartelisteAnmeldungen.length}
              icon={<IconClockHour4 size={16} className="shrink-0" />}
              tone={wartelisteAnmeldungen.length > 0 ? 'primary' : 'default'}
              onClick={() => toggleFilter('warteliste')}
              active={filterStrip === 'warteliste'}
            />
            <StatStripItem
              title={tx('Unbezahlt')}
              value={unbezahlteAnmeldungen.length}
              icon={<IconAlertCircle size={16} className="shrink-0" />}
              tone={unbezahlteAnmeldungen.length > 0 ? 'destructive' : 'default'}
              onClick={() => toggleFilter('unbezahlt')}
              active={filterStrip === 'unbezahlt'}
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
            columns={COLUMNS}
            cards={cards}
            defaultCollapsed={['abgeschlossen', 'abgesagt']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const kurs = kurse.find(k => k.record_id === rid);
              if (kurs) crud.kurse.openDetail(kurs);
            }}
            onCardMove={moveKurs}
            onAddCard={column => {
              crud.kurse.openCreate({ status: column });
            }}
          />
        }
        aside={
          <>
            <WorkList
              title={
                filterStrip === 'warteliste'
                  ? tx('Warteliste')
                  : filterStrip === 'unbezahlt'
                  ? tx('Unbezahlte Anmeldungen')
                  : tx('Neue Anmeldungen')
              }
              items={asideAnmeldungen.map(a => {
                const sk = lookupKey(a.fields.status);
                const isPaid = a.fields.bezahlt;
                const kursName = a.kursName || appLabel('kurse');
                return {
                  id: a.record_id,
                  title: a.teilnehmerName || tx('Unbekannt'),
                  secondLine: (
                    <span className="flex flex-wrap gap-1 text-xs">
                      <span className="text-muted-foreground">{kursName}</span>
                      {sk === 'neu' && (
                        <span className="font-medium text-amber-600">· {tx('Neu')}</span>
                      )}
                      {sk === 'warteliste' && (
                        <span className="font-medium text-blue-600">· {tx('Warteliste')}</span>
                      )}
                      {!isPaid && (sk === 'bestaetigt' || sk === 'neu') && (
                        <span className="font-medium text-destructive">· {tx('unbezahlt')}</span>
                      )}
                      {a.fields.anmeldedatum && (
                        <span className="text-muted-foreground">· {formatDate(a.fields.anmeldedatum)}</span>
                      )}
                    </span>
                  ),
                  action: sk === 'neu'
                    ? {
                        label: tx('✓ Bestätigen'),
                        onClick: () => void confirmAnmeldung(a.record_id),
                      }
                    : undefined,
                };
              })}
              onItemClick={id => {
                const a = anmeldungen.find(x => x.record_id === id);
                if (a) crud.anmeldungen.openDetail(a);
              }}
              empty={{
                text: filterStrip
                  ? tx('Keine Einträge für diesen Filter.')
                  : tx('Keine neuen Anmeldungen — alles bestätigt!'),
                action: {
                  label: tx('Anmeldung erfassen'),
                  onClick: () => crud.anmeldungen.openCreate({
                    status: 'neu',
                    anmeldedatum: today,
                  }),
                },
              }}
            />
            <WorkList
              title={tx('Schüler & Teilnehmer')}
              items={teilnehmer.slice(0, 8).map(t => {
                const tnAnmeldungen = anmeldungen.filter(a => {
                  const tid = a.fields.teilnehmer?.match?.(/([a-f0-9]{24})$/i)?.[1];
                  return tid === t.record_id;
                });
                const aktiveKurse = tnAnmeldungen.filter(a => {
                  const s = lookupKey(a.fields.status);
                  return s === 'bestaetigt' || s === 'neu';
                }).length;
                return {
                  id: t.record_id,
                  title: `${t.fields.vorname ?? ''} ${t.fields.nachname ?? ''}`.trim() || tx('Unbekannt'),
                  secondLine: (
                    <span className="text-xs text-muted-foreground">
                      {aktiveKurse > 0
                        ? aktiveKurse === 1
                          ? tx`${aktiveKurse} Kurs`
                          : tx`${aktiveKurse} Kurse`
                        : tx('Keine aktiven Kurse')}
                      {t.fields.erziehungsberechtigte_person
                        ? ` · ${t.fields.erziehungsberechtigte_person}`
                        : ''}
                    </span>
                  ),
                };
              })}
              onItemClick={id => {
                const t = teilnehmer.find(x => x.record_id === id);
                if (t) crud.teilnehmer.openDetail(t);
              }}
              empty={{
                text: tx('Noch keine Schüler — lege den ersten an.'),
                action: {
                  label: tx('Schüler anlegen'),
                  onClick: () => crud.teilnehmer.openCreate({}),
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
