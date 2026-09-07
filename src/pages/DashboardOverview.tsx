import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { lookupKey, formatDate, displayMultiLookup } from '@/lib/formatters';
import { tx, appLabel } from '@/i18n';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import { useMemo, useState } from 'react';
import { format, isToday, parseISO } from 'date-fns';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { KanbanWidget, type KanbanCard, type KanbanColumn, type KanbanTone } from '@/components/widgets/KanbanWidget';
import { Button } from '@/components/ui/button';
import {
  IconPlus,
  IconSchool,
  IconUsers,
  IconClipboardList,
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconBookmark,
} from '@tabler/icons-react';

function toneForKursStatus(status: string | undefined): KanbanTone {
  if (status === 'laeuft') return 'success';
  if (status === 'geplant') return 'primary';
  if (status === 'abgeschlossen') return 'default';
  if (status === 'abgesagt') return 'default';
  return 'default';
}

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const {
    kurse, anmeldungen, anwesenheiten, teilnehmer, dozenten,
    kurseMap, setKurse, fetchAll,
  } = data;

  const crud = useEntityCrud(data, {
    footer: (top) => {
      if (top.type === 'anmeldungen') {
        const a = anmeldungen.find(x => x.record_id === top.record.record_id);
        if (!a) return undefined;
        const status = lookupKey(a.fields.status);
        if (status === 'neu') {
          return {
            label: tx('Bestätigen'),
            onClick: () => confirmAnmeldung(a.record_id),
          };
        }
      }
      return undefined;
    },
  });

  const enrichedKurse = crud.enriched.kurse;
  const enrichedAnmeldungen = crud.enriched.anmeldungen;

  const clock = useClock();
  const [kursFilter, setKursFilter] = useState<string | null>(null);

  // Kurs-Status-Kanban-Spalten (innerhalb der Komponente — locale-aware getter)
  const KURS_COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['kurse']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Cards für Kanban
  const kursCards = useMemo<KanbanCard[]>(
    () =>
      enrichedKurse.map(k => {
        const status = lookupKey(k.fields.status) ?? 'geplant';
        const anmeldungenFürKurs = anmeldungen.filter(
          a => extractRecordId(a.fields.kurs) === k.record_id
        );
        const bestätigt = anmeldungenFürKurs.filter(a => lookupKey(a.fields.status) === 'bestaetigt').length;
        const max = k.fields.maximale_teilnehmer ?? 0;
        const subtitle = [
          k.dozentName,
          k.fields.wochentage && k.fields.wochentage.length > 0
            ? displayMultiLookup(k.fields.wochentage)
            : null,
          max > 0 ? tx`${bestätigt}/${max} Pl.` : null,
        ].filter(Boolean).join(' · ');
        return {
          id: `kurs:${k.record_id}`,
          column: status,
          title: k.fields.titel ?? tx('Ohne Titel'),
          subtitle,
          tone: toneForKursStatus(status),
        };
      }),
    [enrichedKurse, anmeldungen],
  );

  // Neue Anmeldungen (Status "neu") — Handlungsbedarf
  const neueAnmeldungen = useMemo(
    () => enrichedAnmeldungen.filter(a => lookupKey(a.fields.status) === 'neu'),
    [enrichedAnmeldungen],
  );

  // Wartelisten-Anmeldungen
  const wartelisteAnmeldungen = useMemo(
    () => enrichedAnmeldungen.filter(a => lookupKey(a.fields.status) === 'warteliste'),
    [enrichedAnmeldungen],
  );

  // Laufende Kurse
  const laufendeKurse = useMemo(
    () => kurse.filter(k => lookupKey(k.fields.status) === 'laeuft'),
    [kurse],
  );

  // Geplante Kurse
  const geplanteKurse = useMemo(
    () => kurse.filter(k => lookupKey(k.fields.status) === 'geplant'),
    [kurse],
  );

  // KPI: ungezahlte bestätigte Anmeldungen
  const ungezahlte = useMemo(
    () => enrichedAnmeldungen.filter(
      a => lookupKey(a.fields.status) === 'bestaetigt' && !a.fields.bezahlt
    ),
    [enrichedAnmeldungen],
  );

  // Kontext-Zeile
  const dozentenHeute = useMemo(() => {
    const heute = format(clock, 'yyyy-MM-dd');
    // Zeige Dozenten mit aktiven Kursen
    return dozenten.filter(d => d.fields.aktiv !== false);
  }, [dozenten, clock]);

  const kontextZeile = useMemo(() => {
    const aktiveDozenten = dozenten.filter(d => d.fields.aktiv !== false);
    if (laufendeKurse.length === 0 && geplanteKurse.length === 0) {
      return tx('Noch keine Kurse angelegt — fang gleich an!');
    }
    return tx`${laufendeKurse.length} Kurse laufen, ${geplanteKurse.length} in Planung — ${aktiveDozenten.length} Dozenten aktiv.`;
  }, [laufendeKurse, geplanteKurse, dozenten]);

  // Anmeldung bestätigen
  const confirmAnmeldung = async (id: string) => {
    const prev = anmeldungen.find(a => a.record_id === id);
    if (!prev) return;
    const prevStatus = prev.fields.status;
    // Optimistisch
    data.setAnmeldungen(all =>
      all.map(a =>
        a.record_id === id
          ? { ...a, fields: { ...a.fields, status: lookupOption('anmeldungen', 'status', 'bestaetigt') } }
          : a
      )
    );
    try {
      await LivingAppsService.updateAnmeldungenEntry(id, { status: 'bestaetigt' });
      undoToast(tx('Anmeldung bestätigt'), async () => {
        data.setAnmeldungen(all =>
          all.map(a => a.record_id === id ? { ...a, fields: { ...a.fields, status: prevStatus } } : a)
        );
        await LivingAppsService.updateAnmeldungenEntry(id, { status: lookupKey(prevStatus) ?? 'neu' });
      });
    } catch {
      await fetchAll();
    }
  };

  // Kurs-Status per Drag ändern
  const moveKursCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    const kurs = kurse.find(k => k.record_id === rid);
    if (!kurs) return;
    const prevStatus = kurs.fields.status;
    // Optimistisch
    setKurse(prev =>
      prev.map(k =>
        k.record_id === rid
          ? { ...k, fields: { ...k.fields, status: lookupOption('kurse', 'status', newColumn) } }
          : k
      )
    );
    try {
      await LivingAppsService.updateKurseEntry(rid, { status: newColumn });
      undoToast(tx('Kursstatus aktualisiert'), async () => {
        setKurse(prev =>
          prev.map(k => k.record_id === rid ? { ...k, fields: { ...k.fields, status: prevStatus } } : k)
        );
        await LivingAppsService.updateKurseEntry(rid, { status: lookupKey(prevStatus) ?? newColumn });
      });
    } catch {
      await fetchAll();
    }
  };

  // Hero: neue Anmeldungen brauchen Bestätigung
  const heroContent = neueAnmeldungen.length > 0 ? (
    <HeroBanner
      icon={<IconAlertCircle size={18} />}
      action={{
        label: tx('Bestätigen'),
        onClick: () => confirmAnmeldung(neueAnmeldungen[0].record_id),
      }}
    >
      <b>{namen(neueAnmeldungen.map(a => a.teilnehmerName))}</b>
      {neueAnmeldungen.length === 1
        ? tx` — neue Anmeldung wartet auf Bestätigung.`
        : tx` — ${neueAnmeldungen.length} neue Anmeldungen warten auf Bestätigung.`}
    </HeroBanner>
  ) : undefined;

  return (
    <div className="space-y-6">
      {/* Seitenkopf */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {gruss(clock)}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{kontextZeile}</p>
        </div>
        <Button
          onClick={() => crud.kurse.openCreate({ status: 'geplant' })}
          className="shrink-0"
        >
          <IconPlus size={16} className="shrink-0 mr-1" />
          {tx('Neuer Kurs')}
        </Button>
      </div>

      <DashboardGrid
        variant="wide"
        hero={heroContent}
        kpis={
          <StatStrip>
            <StatStripItem
              title={tx('Laufende Kurse')}
              value={laufendeKurse.length}
              icon={<IconSchool size={16} />}
              tone={laufendeKurse.length > 0 ? 'success' : 'default'}
              onClick={() => setKursFilter(f => f === 'laeuft' ? null : 'laeuft')}
              active={kursFilter === 'laeuft'}
            />
            <StatStripItem
              title={tx('Neue Anmeldungen')}
              value={neueAnmeldungen.length}
              icon={<IconClipboardList size={16} />}
              tone={neueAnmeldungen.length > 0 ? 'warning' : 'default'}
              onClick={() => setKursFilter(f => f === '__neu' ? null : '__neu')}
              active={kursFilter === '__neu'}
            />
            <StatStripItem
              title={tx('Warteliste')}
              value={wartelisteAnmeldungen.length}
              icon={<IconBookmark size={16} />}
              tone={wartelisteAnmeldungen.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title={tx('Unbezahlt')}
              value={ungezahlte.length}
              icon={<IconAlertCircle size={16} />}
              tone={ungezahlte.length > 0 ? 'destructive' : 'default'}
              onClick={() => setKursFilter(f => f === '__unbezahlt' ? null : '__unbezahlt')}
              active={kursFilter === '__unbezahlt'}
            />
            <StatStripItem
              title={appLabel('teilnehmer')}
              value={teilnehmer.length}
              icon={<IconUsers size={16} />}
              tone="default"
            />
          </StatStrip>
        }
        primary={
          <KanbanWidget
            cards={
              kursFilter === 'laeuft'
                ? kursCards.filter(c => c.column === 'laeuft')
                : kursFilter === '__neu'
                ? kursCards.filter(c =>
                    neueAnmeldungen.some(a => extractRecordId(a.fields.kurs) === c.id.split(':')[1])
                  )
                : kursFilter === '__unbezahlt'
                ? kursCards.filter(c =>
                    ungezahlte.some(a => extractRecordId(a.fields.kurs) === c.id.split(':')[1])
                  )
                : kursCards
            }
            columns={KURS_COLUMNS}
            defaultCollapsed={['abgeschlossen', 'abgesagt']}
            onCardClick={card => {
              const rid = card.id.split(':')[1];
              const kurs = enrichedKurse.find(k => k.record_id === rid);
              if (kurs) crud.kurse.openDetail(kurs);
            }}
            onCardMove={moveKursCard}
            onAddCard={column => crud.kurse.openCreate({ status: column })}
          />
        }
        aside={
          <>
            <WorkList
              title={tx('Neue Anmeldungen')}
              items={neueAnmeldungen.slice(0, 8).map(a => ({
                id: a.record_id,
                title: a.teilnehmerName || tx('Unbekannt'),
                secondLine: (
                  <>
                    <span className="text-muted-foreground">{a.kursName}</span>
                    {a.fields.anmeldedatum && (
                      <span className="text-muted-foreground"> · {formatDate(a.fields.anmeldedatum)}</span>
                    )}
                  </>
                ),
                action: {
                  label: tx('✓ Bestätigen'),
                  onClick: () => confirmAnmeldung(a.record_id),
                },
              }))}
              onItemClick={id => {
                const a = enrichedAnmeldungen.find(x => x.record_id === id);
                if (a) crud.anmeldungen.openDetail(a);
              }}
              empty={{
                text: tx('Keine neuen Anmeldungen — alles bestätigt!'),
                action: {
                  label: tx('Neue Anmeldung'),
                  onClick: () => crud.anmeldungen.openCreate({ status: 'neu' }),
                },
              }}
            />
            <WorkList
              title={tx('Warteliste')}
              items={wartelisteAnmeldungen.slice(0, 6).map(a => ({
                id: a.record_id,
                title: a.teilnehmerName || tx('Unbekannt'),
                secondLine: (
                  <span className="text-muted-foreground">{a.kursName}</span>
                ),
                action: {
                  label: tx('→ Bestätigen'),
                  onClick: () => confirmAnmeldung(a.record_id),
                },
              }))}
              onItemClick={id => {
                const a = enrichedAnmeldungen.find(x => x.record_id === id);
                if (a) crud.anmeldungen.openDetail(a);
              }}
              empty={{
                text: tx('Keine Einträge auf der Warteliste.'),
              }}
            />
          </>
        }
      />

      {/* Leerzustand: kein Kurs angelegt */}
      {kurse.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <IconSchool size={48} className="text-muted-foreground" />
          <div>
            <h2 className="font-semibold text-foreground mb-1">{tx('Willkommen in der Musikschule!')}</h2>
            <p className="text-sm text-muted-foreground">
              {tx('Lege deinen ersten Kurs an, um loszulegen.')}
            </p>
          </div>
          <Button onClick={() => crud.kurse.openCreate({ status: 'geplant' })}>
            <IconPlus size={16} className="mr-1 shrink-0" />
            {tx('Ersten Kurs anlegen')}
          </Button>
        </div>
      )}

      {crud.surfaces}
    </div>
  );
}
