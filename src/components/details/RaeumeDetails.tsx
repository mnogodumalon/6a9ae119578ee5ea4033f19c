import type { Raeume, Kurse } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface RaeumeDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Raeume;
  /** 1:N „Kurse" (raum): VOLLE Liste — der Block filtert auf diesen Record. */
  kurseList: Kurse[];
  /** Zeilen-Klick → overlay.push auf das Kurse-Detail (nie der Edit-Dialog). */
  onOpenKurse: (record: Kurse) => void;
  /** Kontextuelles „+": öffnet den Kurse-Dialog mit diesem Record vorgesetzt. */
  onAddKurse: () => void;
}

export function RaeumeDetails({
  record,
  kurseList,
  onOpenKurse,
  onAddKurse,
}: RaeumeDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('raeume', 'name')} value={record.fields.name} format="text" />
        <RecordField label={fieldLabel('raeume', 'plaetze')} value={record.fields.plaetze} format="text" />
        <RecordField label={fieldLabel('raeume', 'klavier_vorhanden')} value={record.fields.klavier_vorhanden} format="bool" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('kurse')}
        items={kurseList.filter(r => extractRecordId(r.fields.raum) === record.record_id)}
        map={r => ({ name: r.fields.titel ?? appLabel('kurse'), meta: r.fields.beginn })}
        onOpen={onOpenKurse}
        onAdd={onAddKurse}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.RAEUME} recordId={record.record_id} />
    </>
  );
}
