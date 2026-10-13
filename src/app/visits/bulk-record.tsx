import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CheckBox } from '../../components/CheckBox';
import { Chip } from '../../components/Chip';
import { RecordFieldsForm } from '../../components/RecordFieldsForm';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  EMPTY_INPUT_STATE,
  FieldInputState,
  hasAnyValue,
  pruneHiddenValues,
  QUICK_CHECK_FIELDS,
} from '../../features/records/recordTypesConfig';
import { useApiaries } from '../../repositories/apiaryRepository';
import { createBulkQuickChecks } from '../../repositories/recordRepository';
import { ensureActiveVisit, useActiveVisit, useApiaryColoniesWithVisitStatus } from '../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing, statusColors } from '../../theme/tokens';

type Saved = { visitId: string; recordIds: Record<string, string>; colonyIds: string[] };

function ActionPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        {
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceTint,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>{label}</Text>
    </Pressable>
  );
}

// 이상 없는 봉군을 한꺼번에 기록하고, 특이한 봉군만 저장한 뒤 따로 고치거나 응애·말벌을 기록하는 화면.
// 일괄로 남기는 건 빠른 내검 4항목뿐이다 — 응애·말벌 같은 세부 항목은 봉군마다 달라서 일괄 대상이 아니다.
export default function BulkRecordScreen() {
  const params = useLocalSearchParams<{ apiaryId?: string }>();
  const { data: apiaries } = useApiaries();

  const [apiaryChoice, setApiaryChoice] = useState<string | null>(params.apiaryId ?? null);
  const apiaryId = apiaries?.some((a) => a.id === apiaryChoice) ? apiaryChoice! : apiaries?.[0]?.id;

  // 오늘 이미 열린 방문이 있으면 그 방문에서 "완료"된 봉군은 기본으로 빼 둔다 (이미 기록한 봉군에 또 남기지 않게).
  const { data: activeVisits } = useActiveVisit(apiaryId);
  const { data: statusRows } = useApiaryColoniesWithVisitStatus(apiaryId, activeVisits?.[0]?.id);
  const rows = useMemo(
    () => [...(statusRows ?? [])].sort((a, b) => Number(a.colony.internalCode) - Number(b.colony.internalCode)),
    [statusRows],
  );

  // 사용자가 직접 바꾼 봉군만 기억하고, 나머지는 "아직 안 한 봉군이면 선택"을 기본값으로 쓴다.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const isSelected = (row: (typeof rows)[number]) => manual[row.colony.id] ?? row.visitColony?.status !== 'done';
  const selectedIds = rows.filter(isSelected).map((r) => r.colony.id);

  const [state, setState] = useState<FieldInputState>(EMPTY_INPUT_STATE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);

  const hasValue = hasAnyValue(QUICK_CHECK_FIELDS, pruneHiddenValues(QUICK_CHECK_FIELDS, state));

  const setAll = (value: boolean) => setManual(Object.fromEntries(rows.map((r) => [r.colony.id, value])));

  const run = async () => {
    if (!apiaryId) return;
    setSaving(true);
    try {
      const visitId = await ensureActiveVisit(apiaryId);
      const recordIds = await createBulkQuickChecks({ visitId, colonyIds: selectedIds, state });
      setSaved({ visitId, recordIds, colonyIds: selectedIds });
    } catch (err) {
      Alert.alert('저장하지 못했어요', `${err instanceof Error ? err.message : String(err)}\n\n선택한 내용은 그대로 남아 있어요. 다시 눌러 주세요.`);
    } finally {
      setSaving(false);
    }
  };

  const confirmSave = () => {
    Alert.alert(
      `${selectedIds.length}개 봉군에 기록할까요?`,
      '선택한 봉군 모두에 같은 내용으로 "빠른 내검"을 남겨요. 특이한 봉군은 저장한 뒤 값을 고치거나 응애·말벌을 따로 기록할 수 있어요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '기록하기', onPress: () => void run() },
      ],
    );
  };

  // ---- 저장 후: 특이한 봉군만 골라서 이어서 기록 ----
  if (saved) {
    const aliasOf = (id: string) => rows.find((r) => r.colony.id === id)?.colony.alias ?? '';
    return (
      <Screen scroll={false} padded={false}>
        <ScreenHeader title="일괄 기록 완료" />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
          <Card size="large" tint={statusColors.normal.bg}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: statusColors.normal.text }}>
              {saved.colonyIds.length}개 봉군에 기록했어요
            </Text>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: statusColors.normal.text, marginTop: 4, lineHeight: 20 }}>
              특이한 봉군이 있으면 아래에서 그 봉군만 값을 고치거나 응애·말벌을 기록하세요. 없으면 완료를 누르면 돼요.
            </Text>
          </Card>

          {saved.colonyIds.map((colonyId) => (
            <Card key={colonyId} size="medium">
              <View style={{ gap: spacing.md }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.textPrimary }}>{aliasOf(colonyId)}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  <ActionPill
                    label="값 고치기"
                    onPress={() => router.push({ pathname: '/records/[recordId]/edit', params: { recordId: saved.recordIds[colonyId] } })}
                  />
                  <ActionPill
                    label="응애 기록"
                    onPress={() =>
                      router.push({
                        pathname: '/visits/[visitId]/[colonyId]/record-form/[recordType]',
                        params: { visitId: saved.visitId, colonyId, recordType: 'mite' },
                      })
                    }
                  />
                  <ActionPill
                    label="말벌 기록"
                    onPress={() =>
                      router.push({
                        pathname: '/visits/[visitId]/[colonyId]/record-form/[recordType]',
                        params: { visitId: saved.visitId, colonyId, recordType: 'hornet' },
                      })
                    }
                  />
                  <ActionPill
                    label="상세"
                    onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId } })}
                  />
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
        <View style={{ padding: spacing.xl }}>
          <Button label="완료" onPress={() => router.replace('/(tabs)/home')} />
        </View>
      </Screen>
    );
  }

  // ---- 저장 전: 봉군 선택 + 일괄 값 ----
  const multiApiary = (apiaries?.length ?? 0) > 1;
  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="봉군 일괄 기록" onBack={() => router.back()} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl }}>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
          이상 없는 봉군을 한꺼번에 기록해요. 특이한 봉군은 저장한 뒤 따로 값을 고치거나 응애·말벌을 기록할 수 있어요. 말한
          것(고른 것)만 기록되고, 고르지 않은 항목은 비워 둬요.
        </Text>

        {multiApiary && (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>양봉장</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {apiaries?.map((a) => (
                <Chip
                  key={a.id}
                  label={a.name}
                  selected={a.id === apiaryId}
                  onPress={() => {
                    setApiaryChoice(a.id);
                    setManual({});
                  }}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
              기록할 봉군 {selectedIds.length}/{rows.length}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.lg }}>
              <Pressable onPress={() => setAll(true)} hitSlop={8}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>전체 선택</Text>
              </Pressable>
              <Pressable onPress={() => setAll(false)} hitSlop={8}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>전체 해제</Text>
              </Pressable>
            </View>
          </View>

          {apiaries && apiaries.length === 0 && (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              등록된 양봉장이 없어요. 양봉장과 봉군을 먼저 등록해 주세요.
            </Text>
          )}
          {apiaryId && statusRows !== undefined && rows.length === 0 && (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
              이 양봉장에 등록된 봉군이 없어요.
            </Text>
          )}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {rows.map((row) => {
              const checked = isSelected(row);
              const done = row.visitColony?.status === 'done';
              return (
                <Pressable
                  key={row.colony.id}
                  onPress={() => setManual((prev) => ({ ...prev, [row.colony.id]: !checked }))}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.cardSmall,
                      backgroundColor: colors.surface,
                      opacity: pressed ? 0.85 : 1,
                    },
                    shadows.cardSmall,
                  ]}
                >
                  <CheckBox checked={checked} />
                  <View>
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>{row.colony.alias}</Text>
                    {done && <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: statusColors.normal.text }}>오늘 기록함</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>일괄로 남길 내용</Text>
          <RecordFieldsForm fields={QUICK_CHECK_FIELDS} state={state} onChange={setState} />
        </View>
      </ScrollView>

      <View style={{ padding: spacing.xl, gap: spacing.xs }}>
        {!hasValue && (
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' }}>
            남길 내용을 하나 이상 골라 주세요
          </Text>
        )}
        <Button
          label={selectedIds.length > 0 ? `${selectedIds.length}개 봉군에 일괄 기록` : '봉군을 선택해 주세요'}
          onPress={confirmSave}
          loading={saving}
          disabled={selectedIds.length === 0 || !hasValue}
        />
      </View>
    </Screen>
  );
}
