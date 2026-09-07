import type { Teilnehmer, Anmeldungen, Anwesenheiten } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface TeilnehmerDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Teilnehmer;
  /** 1:N „Anmeldungen" (teilnehmer): VOLLE Liste — der Block filtert auf diesen Record. */
  anmeldungenList: Anmeldungen[];
  /** Zeilen-Klick → overlay.push auf das Anmeldungen-Detail (nie der Edit-Dialog). */
  onOpenAnmeldungen: (record: Anmeldungen) => void;
  /** Kontextuelles „+": öffnet den Anmeldungen-Dialog mit diesem Record vorgesetzt. */
  onAddAnmeldungen: () => void;
  /** 1:N „Anwesenheiten" (teilnehmer): VOLLE Liste — der Block filtert auf diesen Record. */
  anwesenheitenList: Anwesenheiten[];
  /** Zeilen-Klick → overlay.push auf das Anwesenheiten-Detail (nie der Edit-Dialog). */
  onOpenAnwesenheiten: (record: Anwesenheiten) => void;
  /** Kontextuelles „+": öffnet den Anwesenheiten-Dialog mit diesem Record vorgesetzt. */
  onAddAnwesenheiten: () => void;
}

export function TeilnehmerDetails({
  record,
  anmeldungenList,
  onOpenAnmeldungen,
  onAddAnmeldungen,
  anwesenheitenList,
  onOpenAnwesenheiten,
  onAddAnwesenheiten,
}: TeilnehmerDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('teilnehmer', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('teilnehmer', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('teilnehmer', 'geburtsdatum')} value={record.fields.geburtsdatum} format="date" />
        <RecordField label={fieldLabel('teilnehmer', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('teilnehmer', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('teilnehmer', 'erziehungsberechtigte_person')} value={record.fields.erziehungsberechtigte_person} format="text" />
        <RecordField label={fieldLabel('teilnehmer', 'notizen')} value={record.fields.notizen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('anmeldungen')}
        items={anmeldungenList.filter(r => extractRecordId(r.fields.teilnehmer) === record.record_id)}
        map={r => ({ name: appLabel('anmeldungen'), meta: r.fields.anmeldedatum })}
        onOpen={onOpenAnmeldungen}
        onAdd={onAddAnmeldungen}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('anwesenheiten')}
        items={anwesenheitenList.filter(r => extractRecordId(r.fields.teilnehmer) === record.record_id)}
        map={r => ({ name: appLabel('anwesenheiten'), meta: r.fields.datum })}
        onOpen={onOpenAnwesenheiten}
        onAdd={onAddAnwesenheiten}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.TEILNEHMER} recordId={record.record_id} />
    </>
  );
}
