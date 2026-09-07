import type { Kurse, Dozenten, Raeume, Anmeldungen, Anwesenheiten } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface KurseDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Kurse;
  /** N:1-Ziel „Dozenten": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  dozentenList: Dozenten[];
  /** Klick auf die Dozenten-Relation → overlay.push auf dessen Detail. */
  onOpenDozenten?: (record: Dozenten) => void;
  /** N:1-Ziel „Raeume": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  raeumeList: Raeume[];
  /** Klick auf die Raeume-Relation → overlay.push auf dessen Detail. */
  onOpenRaeume?: (record: Raeume) => void;
  /** 1:N „Anmeldungen" (kurs): VOLLE Liste — der Block filtert auf diesen Record. */
  anmeldungenList: Anmeldungen[];
  /** Zeilen-Klick → overlay.push auf das Anmeldungen-Detail (nie der Edit-Dialog). */
  onOpenAnmeldungen: (record: Anmeldungen) => void;
  /** Kontextuelles „+": öffnet den Anmeldungen-Dialog mit diesem Record vorgesetzt. */
  onAddAnmeldungen: () => void;
  /** 1:N „Anwesenheiten" (kurs): VOLLE Liste — der Block filtert auf diesen Record. */
  anwesenheitenList: Anwesenheiten[];
  /** Zeilen-Klick → overlay.push auf das Anwesenheiten-Detail (nie der Edit-Dialog). */
  onOpenAnwesenheiten: (record: Anwesenheiten) => void;
  /** Kontextuelles „+": öffnet den Anwesenheiten-Dialog mit diesem Record vorgesetzt. */
  onAddAnwesenheiten: () => void;
}

export function KurseDetails({
  record,
  dozentenList,
  onOpenDozenten,
  raeumeList,
  onOpenRaeume,
  anmeldungenList,
  onOpenAnmeldungen,
  onAddAnmeldungen,
  anwesenheitenList,
  onOpenAnwesenheiten,
  onAddAnwesenheiten,
}: KurseDetailsProps) {
  const dozentTarget = dozentenList.find(r => r.record_id === extractRecordId(record.fields.dozent));
  const raumTarget = raeumeList.find(r => r.record_id === extractRecordId(record.fields.raum));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('kurse', 'titel')} value={record.fields.titel} format="text" />
        <RecordField label={fieldLabel('kurse', 'instrument')} value={record.fields.instrument} format="pill" />
        <RecordField label={fieldLabel('kurse', 'niveau')} value={record.fields.niveau} format="pill" />
        <RecordField label={fieldLabel('kurse', 'wochentage')} value={Array.isArray(record.fields.wochentage) ? record.fields.wochentage.map((v: unknown) => (v && typeof v === 'object' && 'label' in v) ? (v as {label: unknown}).label : v).join(', ') : null} format="text" />
        <RecordField label={fieldLabel('kurse', 'beginn')} value={record.fields.beginn} format="date" />
        <RecordField label={fieldLabel('kurse', 'ende')} value={record.fields.ende} format="date" />
        <RecordField label={fieldLabel('kurse', 'uhrzeit')} value={record.fields.uhrzeit} format="datetime" />
        <RecordField label={fieldLabel('kurse', 'maximale_teilnehmer')} value={record.fields.maximale_teilnehmer} format="text" />
        <RecordField label={fieldLabel('kurse', 'preis')} value={record.fields.preis} format="text" />
        <RecordField label={fieldLabel('kurse', 'status')} value={record.fields.status} format="pill" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('kurse', 'dozent')}
          name={dozentTarget?.fields.vorname ?? '—'}
          meta={[dozentTarget?.fields.email, dozentTarget?.fields.telefon].filter(Boolean).join(' · ') || undefined}
          onClick={dozentTarget && onOpenDozenten ? () => onOpenDozenten!(dozentTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('kurse', 'raum')}
          name={raumTarget?.fields.name ?? '—'}
          meta={undefined}
          onClick={raumTarget && onOpenRaeume ? () => onOpenRaeume!(raumTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title={appLabel('anmeldungen')}
        items={anmeldungenList.filter(r => extractRecordId(r.fields.kurs) === record.record_id)}
        map={r => ({ name: appLabel('anmeldungen'), meta: r.fields.anmeldedatum })}
        onOpen={onOpenAnmeldungen}
        onAdd={onAddAnmeldungen}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('anwesenheiten')}
        items={anwesenheitenList.filter(r => extractRecordId(r.fields.kurs) === record.record_id)}
        map={r => ({ name: appLabel('anwesenheiten'), meta: r.fields.datum })}
        onOpen={onOpenAnwesenheiten}
        onAdd={onAddAnwesenheiten}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.KURSE} recordId={record.record_id} />
    </>
  );
}
