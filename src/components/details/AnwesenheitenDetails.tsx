import type { Anwesenheiten, Kurse, Teilnehmer } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';

export interface AnwesenheitenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Anwesenheiten;
  /** N:1-Ziel „Kurse": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  kurseList: Kurse[];
  /** Klick auf die Kurse-Relation → overlay.push auf dessen Detail. */
  onOpenKurse?: (record: Kurse) => void;
  /** N:1-Ziel „Teilnehmer": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  teilnehmerList: Teilnehmer[];
  /** Klick auf die Teilnehmer-Relation → overlay.push auf dessen Detail. */
  onOpenTeilnehmer?: (record: Teilnehmer) => void;
}

export function AnwesenheitenDetails({
  record,
  kurseList,
  onOpenKurse,
  teilnehmerList,
  onOpenTeilnehmer,
}: AnwesenheitenDetailsProps) {
  const kursTarget = kurseList.find(r => r.record_id === extractRecordId(record.fields.kurs));
  const teilnehmerTarget = teilnehmerList.find(r => r.record_id === extractRecordId(record.fields.teilnehmer));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('anwesenheiten', 'datum')} value={record.fields.datum} format="date" />
        <RecordField label={fieldLabel('anwesenheiten', 'anwesend')} value={record.fields.anwesend} format="bool" />
        <RecordField label={fieldLabel('anwesenheiten', 'entschuldigt')} value={record.fields.entschuldigt} format="bool" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('anwesenheiten', 'kurs')}
          name={kursTarget?.fields.titel ?? '—'}
          meta={undefined}
          onClick={kursTarget && onOpenKurse ? () => onOpenKurse!(kursTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('anwesenheiten', 'teilnehmer')}
          name={teilnehmerTarget?.fields.vorname ?? '—'}
          meta={[teilnehmerTarget?.fields.email, teilnehmerTarget?.fields.telefon].filter(Boolean).join(' · ') || undefined}
          onClick={teilnehmerTarget && onOpenTeilnehmer ? () => onOpenTeilnehmer!(teilnehmerTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.ANWESENHEITEN} recordId={record.record_id} />
    </>
  );
}
