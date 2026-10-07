import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '../../../../components/Button';
import { Card } from '../../../../components/Card';
import { ColonyForm, ColonyFormValues } from '../../../../components/ColonyForm';
import { ForwardChevronIcon, MicIcon } from '../../../../components/icons';
import { InsightCard } from '../../../../components/InsightCard';
import { ReferenceNote } from '../../../../components/ReferenceNote';
import { RiskBadge } from '../../../../components/RiskBadge';
import { Screen } from '../../../../components/Screen';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { records } from '../../../../db/schema';
import { computeInsights, insightsForColony } from '../../../../features/health/colonyInsights';
import { buildWinteringFacts, extractColonySeries } from '../../../../features/health/facts';
import { computeWinteringChecklist } from '../../../../features/health/winteringReadiness';
import { openRecordForm } from '../../../../features/records/openRecordForm';
import { daysBetween } from '../../../../features/health/time';
import { useNow } from '../../../../features/health/useNow';
import { RECORD_TYPE_LABELS } from '../../../../features/records/recordTypesConfig';
import { useApiary } from '../../../../repositories/apiaryRepository';
import { setColonyArchived, updateColony, useColony } from '../../../../repositories/colonyRepository';
import { useHealthSource } from '../../../../repositories/healthRepository';
import { useRecordFieldValues, useRecordsForColony } from '../../../../repositories/recordRepository';
import { ensureActiveVisit } from '../../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../../theme/tokens';

// 이 봉군의 "기억장치" — 놓치고 있는 것 알림과 응애·월동 최근 상태, 바로가기. 전부 기록의
// 구조화 필드에서 계산한 값이다 (입력 방법과 무관).
function ColonyHealthSection({ colonyId, apiaryId }: { colonyId: string; apiaryId: string }) {
  const source = useHealthSource();
  const insights = useMemo(() => (source ? insightsForColony(computeInsights(source), colonyId) : []), [source, colonyId]);
  const series = useMemo(() => (source ? extractColonySeries(source, colonyId) : null), [source, colonyId]);
  const checklist = useMemo(() => {
    if (!source) return null;
    const facts = buildWinteringFacts(source, colonyId);
    return facts ? computeWinteringChecklist(facts) : null;
  }, [source, colonyId]);
  const now = useNow();

  const lastMite = series?.miteChecks.filter((c) => c.result !== 'indeterminate').at(-1);
  const lastWinteringAt = series?.winteringChecks.at(-1)?.at;

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>건강체크</Text>
      {insights.map((insight) => (
        <InsightCard key={insight.id} insight={insight} showColonyName={false} />
      ))}
      <Card size="medium">
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              응애 · {lastMite ? `${daysBetween(lastMite.at, now)}일 전 검사` : '검사 기록 없음'}
            </Text>
            <RiskBadge level={lastMite?.riskLevel} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              월동 점검 · {lastWinteringAt ? `${daysBetween(lastWinteringAt, now)}일 전 점검` : '점검 기록 없음'}
            </Text>
            {checklist && (
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                충족 {checklist.okCount} · 보완 {checklist.improveCount} · 정보 없음 {checklist.unknownCount}
              </Text>
            )}
          </View>
          <ReferenceNote kind="general" />
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Button label="🕷 응애" variant="surface" onPress={() => openRecordForm({ apiaryId, colonyId, recordType: 'mite' })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="🐝 말벌" variant="surface" onPress={() => openRecordForm({ apiaryId, colonyId, recordType: 'hornet' })} />
        </View>
      </View>
      <Button label="❄️ 월동 준비 점검" variant="surface" onPress={() => openRecordForm({ apiaryId, colonyId, recordType: 'wintering_prep' })} />
    </View>
  );
}

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
  const [startingVoiceCheck, setStartingVoiceCheck] = useState(false);

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

  const handleVoiceCheck = async () => {
    setStartingVoiceCheck(true);
    try {
      const visitId = await ensureActiveVisit(colony.apiaryId);
      router.push({ pathname: '/visits/[visitId]/voice-record', params: { visitId, colonyId: colony.id } });
    } finally {
      setStartingVoiceCheck(false);
    }
  };

  const recentRecords = colonyRecords?.slice(0, 3);

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
            <Button label="AI 음성으로 내검하기" variant="accent" onPress={handleVoiceCheck} loading={startingVoiceCheck} icon={<MicIcon size={18} />} />

            <ColonyHealthSection colonyId={colony.id} apiaryId={colony.apiaryId} />

            <Pressable onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/health', params: { colonyId } })}>
              <Card size="medium" tint={colors.surfaceTint}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>
                    봉군 건강 변화 보기
                  </Text>
                  <ForwardChevronIcon color={colors.primary} />
                </View>
              </Card>
            </Pressable>

            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                  최근 기록 {colonyRecords ? `(${colonyRecords.length}건)` : ''}
                </Text>
                <Pressable onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/timeline', params: { colonyId } })}>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.primary }}>전체보기</Text>
                </Pressable>
              </View>
              <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                {recentRecords?.length === 0 && (
                  <Card size="large">
                    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
                      아직 기록이 없어요.
                    </Text>
                  </Card>
                )}
                {recentRecords?.map((record) => (
                  <RecordCard key={record.id} record={record} />
                ))}
              </View>
            </View>

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
