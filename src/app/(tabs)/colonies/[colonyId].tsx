import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { ColonyForm, ColonyFormValues } from '../../../components/ColonyForm';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { records } from '../../../db/schema';
import { RECORD_TYPE_LABELS } from '../../../features/records/recordTypesConfig';
import { useApiary } from '../../../repositories/apiaryRepository';
import { setColonyArchived, updateColony, useColony } from '../../../repositories/colonyRepository';
import { useRecordFieldValues, useRecordsForColony } from '../../../repositories/recordRepository';
import { ensureActiveVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

function RecordCard({ record }: { record: typeof records.$inferSelect }) {
  const { data: fieldValues } = useRecordFieldValues(record.id);
  const syncedFieldCount = fieldValues?.filter((fv) => fv.syncStatus === '동기화 완료').length ?? 0;

  return (
    <Card size="medium">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
          {RECORD_TYPE_LABELS[record.recordType as keyof typeof RECORD_TYPE_LABELS] ?? record.recordType}
        </Text>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>
          {new Date(record.occurredAt).toLocaleString('ko-KR')}
        </Text>
      </View>
      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 4 }}>
        동기화 상태: {record.syncStatus} · 필드값 {fieldValues?.length ?? '–'}개 (동기화됨 {syncedFieldCount}개)
      </Text>
    </Card>
  );
}

export default function ColonyDetailScreen() {
  const { colonyId } = useLocalSearchParams<{ colonyId: string }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];
  const { data: apiaryRows } = useApiary(colony?.apiaryId);
  const apiary = apiaryRows?.[0];
  const { data: colonyRecords } = useRecordsForColony(colonyId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingCheck, setStartingCheck] = useState(false);

  if (!colony) {
    return (
      <Screen>
        <ScreenHeader title="봉군 상세" onBack={() => router.back()} />
      </Screen>
    );
  }

  const handleSave = async (values: ColonyFormValues) => {
    setSaving(true);
    try {
      await updateColony(colony.id, values);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = () => setColonyArchived(colony.id, !colony.isArchived);

  const handleQuickCheck = async () => {
    setStartingCheck(true);
    try {
      const visitId = await ensureActiveVisit(colony.apiaryId);
      router.push({ pathname: '/visits/[visitId]/[colonyId]/quick-check', params: { visitId, colonyId: colony.id } });
    } finally {
      setStartingCheck(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="봉군 상세" onBack={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl }}>
        {editing ? (
          <ColonyForm
            initial={{ alias: colony.alias, species: colony.species as 'western' | 'native' }}
            submitLabel="저장"
            saving={saving}
            onSubmit={handleSave}
          />
        ) : (
          <>
            <Card size="large">
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary }}>
                {colony.alias}
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                {colony.species === 'western' ? '서양벌' : '토종벌'} · {apiary?.name ?? '소속 양봉장 없음'}
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: spacing.md }}>
                동기화 상태: {colony.syncStatus}
                {colony.isArchived ? ' · 보관됨' : ''}
              </Text>
            </Card>

            <Button label="빠른 상태 선택으로 내검하기" onPress={handleQuickCheck} loading={startingCheck} />

            <View>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                최근 기록 {colonyRecords ? `(${colonyRecords.length}건)` : ''}
              </Text>
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {colonyRecords?.length === 0 && (
                  <Card size="large">
                    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
                      아직 기록이 없어요.
                    </Text>
                  </Card>
                )}
                {colonyRecords?.map((record) => (
                  <RecordCard key={record.id} record={record} />
                ))}
              </View>
            </View>

            <Card size="large">
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                음성 내검 기능은 다음 업데이트에서 제공됩니다.
              </Text>
            </Card>

            <View style={{ gap: spacing.md }}>
              <Button label="정보 수정" variant="surface" onPress={() => setEditing(true)} />
              <Button
                label={colony.isArchived ? '보관 해제' : '보관하기'}
                variant="ghost"
                onPress={handleArchiveToggle}
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
