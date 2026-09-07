import type { Dozenten, Kurse } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface DozentenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Dozenten;
  /** 1:N „Kurse" (dozent): VOLLE Liste — der Block filtert auf diesen Record. */
  kurseList: Kurse[];
  /** Zeilen-Klick → overlay.push auf das Kurse-Detail (nie der Edit-Dialog). */
  onOpenKurse: (record: Kurse) => void;
  /** Kontextuelles „+": öffnet den Kurse-Dialog mit diesem Record vorgesetzt. */
  onAddKurse: () => void;
}

export function DozentenDetails({
  record,
  kurseList,
  onOpenKurse,
  onAddKurse,
}: DozentenDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('dozenten', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('dozenten', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('dozenten', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('dozenten', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('dozenten', 'instrumente')} value={record.fields.instrumente} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('dozenten', 'aktiv')} value={record.fields.aktiv} format="bool" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('kurse')}
        items={kurseList.filter(r => extractRecordId(r.fields.dozent) === record.record_id)}
        map={r => ({ name: r.fields.titel ?? appLabel('kurse'), meta: r.fields.beginn })}
        onOpen={onOpenKurse}
        onAdd={onAddKurse}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.DOZENTEN} recordId={record.record_id} />
    </>
  );
}
