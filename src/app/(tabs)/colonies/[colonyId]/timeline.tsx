import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

import { Card } from '../../../../components/Card';
import { Chip } from '../../../../components/Chip';
import { Screen } from '../../../../components/Screen';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { records, RecordType } from '../../../../db/schema';
import {
  getFieldKindByKey,
  getFieldLabel,
  getFieldsForRecordType,
  getValueStateLabel,
  RECORD_TYPE_LABELS,
} from '../../../../features/records/recordTypesConfig';
import { useColony } from '../../../../repositories/colonyRepository';
import { usePhotosForRecord } from '../../../../repositories/photoRepository';
import { useRecordFieldValues, useRecordsForColony } from '../../../../repositories/recordRepository';
import { useVisit } from '../../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, radius, spacing, statusColors } from '../../../../theme/tokens';
import { weatherCodeLabel } from '../../../../weather/weatherCodeLabel';

const FILTER_OPTIONS: { key: 'all' | RecordType; label: string }[] = [
  { key: 'all', label: '전체' },
  ...(Object.entries(RECORD_TYPE_LABELS) as [RecordType, string][]).map(([key, label]) => ({ key, label })),
];

function TimelineEntry({ record }: { record: typeof records.$inferSelect }) {
  const { data: fieldValues } = useRecordFieldValues(record.id);
  const { data: photos } = usePhotosForRecord(record.id);
  // record_field_values has no sequence column — sort by the config's field
  // order (queen_status, colony_strength, ...) rather than SQLite's
  // arbitrary row order, so the display order is stable and matches the
  // form the user filled in.
  const fieldOrder = getFieldsForRecordType(record.recordType as RecordType).map((f) => f.key);
  const orderedFieldValues = fieldValues
    ? [...fieldValues].sort((a, b) => fieldOrder.indexOf(a.fieldKey) - fieldOrder.indexOf(b.fieldKey))
    : undefined;

  // 날씨는 방문 단위 스냅샷이라 record.visitId로 조회한다 — 없으면(방문이
  // 날씨 기능 이전에 만들어졌거나 캡처 실패) 뱃지를 그냥 숨긴다.
  const { data: visitRows } = useVisit(record.visitId);
  const visit = visitRows?.[0];
  const weatherLabel = weatherCodeLabel(visit?.weatherCode);
  const weatherBadgeText = [weatherLabel, visit?.temperatureC != null ? `${Math.round(visit.temperatureC)}°C` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card size="large">
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
          {new Date(record.occurredAt).toLocaleString('ko-KR')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {weatherBadgeText.length > 0 && (
            <View
              style={{
                paddingVertical: 3,
                paddingHorizontal: 9,
                borderRadius: 999,
                backgroundColor: statusColors.observe.bg,
              }}
            >
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: statusColors.observe.text }}>
                {weatherBadgeText}
              </Text>
            </View>
          )}
          <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, backgroundColor: colors.surfaceTint }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: colors.primary }}>
              {RECORD_TYPE_LABELS[record.recordType as keyof typeof RECORD_TYPE_LABELS] ?? record.recordType}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: spacing.sm, gap: 4 }}>
        {fieldValues === undefined && (
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>불러오는 중...</Text>
        )}
        {orderedFieldValues?.map((fv) => {
          const kind = getFieldKindByKey(fv.fieldKey);
          return (
            <Text key={fv.id} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
              {getFieldLabel(record.recordType as RecordType, fv.fieldKey)}:{' '}
              <Text style={{ color: colors.textSecondary }}>{kind ? getValueStateLabel(kind, fv.valueState) : fv.valueState}</Text>
            </Text>
          );
        })}
      </View>

      {record.notes && (
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: spacing.sm }}>
          메모: {record.notes}
        </Text>
      )}

      {photos && photos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
          {photos.map((photo) => (
            <Image
              key={photo.id}
              source={{ uri: photo.localUri }}
              style={{ width: 64, height: 64, borderRadius: radius.cardSmall }}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

export default function ColonyTimelineScreen() {
  const { colonyId } = useLocalSearchParams<{ colonyId: string }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];
  const { data: allRecords } = useRecordsForColony(colonyId);
  const [filter, setFilter] = useState<(typeof FILTER_OPTIONS)[number]['key']>('all');

  const filteredRecords = filter === 'all' ? allRecords : allRecords?.filter((r) => r.recordType === filter);

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title={`${colony?.alias ?? ''} · 타임라인`} onBack={() => router.back()} subdued />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, height: 56 }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.sm, alignItems: 'center' }}
      >
        {FILTER_OPTIONS.map((opt) => (
          <Chip key={opt.key} label={opt.label} selected={filter === opt.key} onPress={() => setFilter(opt.key)} />
        ))}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {filteredRecords?.length === 0 && (
          <Card size="large">
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              해당하는 기록이 없어요.
            </Text>
          </Card>
        )}
        {filteredRecords?.map((record) => (
          <TimelineEntry key={record.id} record={record} />
        ))}
      </ScrollView>
    </Screen>
  );
}
