import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Button } from '../../../../../components/Button';
import { Card } from '../../../../../components/Card';
import { PhotoPicker, PickedPhoto } from '../../../../../components/PhotoPicker';
import { ReferenceNote } from '../../../../../components/ReferenceNote';
import { RecordFieldsForm } from '../../../../../components/RecordFieldsForm';
import { RiskBadge } from '../../../../../components/RiskBadge';
import { Screen } from '../../../../../components/Screen';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { TextField } from '../../../../../components/TextField';
import { ChecklistItems, ChecklistSummary, ChecklistTodos } from '../../../../../components/WinteringChecklistView';
import { RecordType } from '../../../../../db/schema';
import { extractColonySeries, buildWinteringFacts } from '../../../../../features/health/facts';
import { getHornetGuidance, getMiteGuidance } from '../../../../../features/health/guidance';
import { assessHornetRisk, getHornetSpeciesLabel } from '../../../../../features/health/hornetRisk';
import { getMiteMethodGuide } from '../../../../../features/health/miteMethodGuide';
import { assessMite, formatMiteMetric, getMiteMethodLabel } from '../../../../../features/health/miteRisk';
import { daysBetween, seasonOf } from '../../../../../features/health/time';
import { checkIngredientRotation, rotationNotice } from '../../../../../features/health/treatmentRotation';
import { computeWinteringChecklist } from '../../../../../features/health/winteringReadiness';
import {
  EMPTY_INPUT_STATE,
  FieldInputState,
  getMissingRequiredFields,
  getRecordTypeConfig,
  getValueStateLabel,
  RECORD_TYPE_LABELS,
} from '../../../../../features/records/recordTypesConfig';
import { useColony } from '../../../../../repositories/colonyRepository';
import { useHealthSource } from '../../../../../repositories/healthRepository';
import { createRecord } from '../../../../../repositories/recordRepository';
import { upsertVisitColonyStatus } from '../../../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../../../theme/tokens';

function Bullets({ items, color = colors.textSecondary }: { items: string[]; color?: string }) {
  return (
    <>
      {items.map((t) => (
        <Text key={t} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color, lineHeight: 20 }}>
          • {t}
        </Text>
      ))}
    </>
  );
}

export default function RecordFormScreen() {
  const { visitId, colonyId, recordType } = useLocalSearchParams<{
    visitId: string;
    colonyId: string;
    recordType: RecordType;
  }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];
  const config = getRecordTypeConfig(recordType);
  const source = useHealthSource();

  const [state, setState] = useState<FieldInputState>(EMPTY_INPUT_STATE);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  // --- 현재 입력 기준 즉석 판정 (저장 전 미리보기) -------------------------------
  const series = useMemo(() => (source && colonyId ? extractColonySeries(source, colonyId) : null), [source, colonyId]);
  const now = source?.now ?? 0;

  const miteCount = state.numbers.mite_count;
  const miteAssessment =
    recordType === 'mite' && state.values.mite_infestation && miteCount !== undefined
      ? assessMite({
          method: state.values.mite_method,
          miteCount,
          sampleBees: state.numbers.mite_sample_bees,
          observationDays: state.numbers.mite_observation_days,
          season: now ? seasonOf(now) : null,
          species: colony?.species === 'native' ? 'native' : colony?.species === 'western' ? 'western' : null,
        })
      : null;
  const miteGuide = recordType === 'mite' ? getMiteMethodGuide(state.values.mite_method) : null;

  const rotation = useMemo(
    () => (recordType === 'treatment' && series ? rotationNotice(checkIngredientRotation(series.treatmentDetails, state.values.treatment_ingredient ?? null)) : null),
    [recordType, series, state.values.treatment_ingredient],
  );

  const hornetSpecies = state.values.wasp_species ?? 'unknown_species';
  const hornetCount =
    state.numbers.wasp_count_number ??
    (state.values.wasp_count ? ({ few_1_5: 3, several_6_20: 10, many_20_plus: 25 } as Record<string, number>)[state.values.wasp_count] : undefined);
  const hornetActive = recordType === 'hornet' && state.values.wasp_observed === 'present';
  const hornetRisk = hornetActive ? assessHornetRisk(hornetSpecies, hornetCount ?? 1) : null;

  const winteringChecklist = useMemo(() => {
    if (recordType !== 'wintering_prep' || !source || !colonyId) return null;
    const facts = buildWinteringFacts(source, colonyId, {
      strength: state.values.colony_strength,
      food: state.values.feed_status,
      queenPresent: state.values.queen_status === 'present' ? true : state.values.queen_status === 'absent' ? false : null,
      insulation: state.values.winter_insulation,
      hiveCondition: state.values.winter_hive_condition,
    });
    return facts ? computeWinteringChecklist(facts) : null;
  }, [recordType, source, colonyId, state]);

  if (!config) {
    return (
      <Screen scroll={false} padded={false}>
        <ScreenHeader title="기록" onBack={() => router.back()} />
      </Screen>
    );
  }

  const lastMite = series?.miteChecks.filter((c) => c.result !== 'indeterminate').at(-1) ?? null;
  const lastHornet = series?.hornetEvents.at(-1) ?? null;

  const buildSummary = (): string | undefined => {
    if (recordType === 'mite' && miteAssessment?.metricValue != null) return `응애 ${formatMiteMetric(miteAssessment.metricValue, miteAssessment.metricUnit)}`;
    if (recordType === 'hornet' && hornetRisk) return `${getHornetSpeciesLabel(hornetSpecies)} · 말벌 위험도 ${hornetRisk === 'high' ? '높음' : hornetRisk === 'caution' ? '주의' : '낮음'}`;
    if (recordType === 'wintering_prep' && winteringChecklist) return `월동 점검 · 충족 ${winteringChecklist.okCount} · 보완 ${winteringChecklist.improveCount} · 정보 없음 ${winteringChecklist.unknownCount}`;
    return undefined;
  };

  const handleSave = async () => {
    // 방제처럼 "이 항목이 없으면 기록의 의미가 약해지는" 필드는 비워두고 저장할 수 없다.
    const missing = getMissingRequiredFields(config.fields, state);
    if (missing.length > 0) {
      Alert.alert(`${missing.map((f) => f.label).join(', ')}을(를) 골라주세요`, missing.map((f) => f.hint).filter(Boolean).join('\n') || undefined);
      return;
    }

    setSaving(true);
    try {
      await createRecord({
        visitId,
        colonyId,
        recordType,
        state,
        notes: notes.trim() || null,
        photos,
        inputMethod: 'quick_select',
      });
      await upsertVisitColonyStatus(visitId, colonyId, 'done');
      router.replace({
        pathname: '/visits/[visitId]/saved',
        params: { visitId, colonyId, recordType, recordTypeTitle: config.title, summary: buildSummary() },
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title={`${colony?.alias ?? ''} · ${config.title}`} onBack={() => router.back()} subdued />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
        <View style={{ gap: spacing.xl }}>
          {/* 기억장치: 지난 기록 한 줄 */}
          {recordType === 'mite' && (
            <Card size="medium" tint={lastMite ? colors.surfaceTint : '#FBEED9'}>
              {lastMite ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                    마지막 응애 검사는 {daysBetween(lastMite.at, now)}일 전이에요
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <RiskBadge level={lastMite.riskLevel} />
                    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary }}>
                      {getMiteMethodLabel(lastMite.method)}
                      {lastMite.count !== null ? ` · ${lastMite.count}마리` : ''}
                      {lastMite.metricValue !== null ? ` · ${formatMiteMetric(lastMite.metricValue, lastMite.metricUnit)}` : ''}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: '#8A5A0F' }}>
                  이 봉군의 응애 검사 기록이 아직 없어요. 오늘 첫 기록을 남겨보세요.
                </Text>
              )}
            </Card>
          )}
          {recordType === 'treatment' && (
            <Card size="medium" tint={colors.surfaceTint}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                {series?.treatmentDetails.length
                  ? `마지막 방제는 ${daysBetween(series.treatmentDetails.at(-1)!.at, now)}일 전 · ${
                      series.treatmentDetails.at(-1)!.ingredient ? getValueStateLabel('treatment_ingredient', series.treatmentDetails.at(-1)!.ingredient!) : '약제 성분 미기록'
                    }이에요`
                  : '이 봉군의 방제 기록이 아직 없어요.'}
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
                같은 성분을 연속해서 쓰지 않고 바꿔가며 쓰는 것이 권고돼서, 약제는 성분 기준으로 기록해요.
              </Text>
            </Card>
          )}
          {recordType === 'hornet' && lastHornet && (
            <Card size="medium" tint={colors.surfaceTint}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                마지막 말벌 기록은 {daysBetween(lastHornet.at, now)}일 전 · {getHornetSpeciesLabel(lastHornet.species)}
                {lastHornet.count !== null ? ` ${lastHornet.count}마리` : ''}
                {lastHornet.damage ? ' · 피해 있음' : ''}
              </Text>
            </Card>
          )}

          <RecordFieldsForm fields={config.fields} state={state} onChange={setState} />

          {/* 같은 성분 연속 사용 안내 */}
          {rotation && (
            <Card size="medium" tint={rotation.tone === 'warning' ? '#FBEED9' : colors.surfaceTint}>
              <Text
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: fontSizes.bodySm,
                  color: rotation.tone === 'warning' ? '#8A5A0F' : colors.textSecondary,
                  lineHeight: 20,
                }}
              >
                {rotation.text}
              </Text>
            </Card>
          )}

          {/* 응애: 세는 방법·판단 기준 안내 (사진 AI 대신) */}
          {recordType === 'mite' && (
            <Card size="large">
              <View style={{ gap: spacing.sm }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                  {miteGuide ? `${miteGuide.title} — 어떻게 세고 판단하나요?` : '응애는 어떻게 세고 판단하나요?'}
                </Text>
                {miteGuide ? (
                  <>
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textPrimary }}>세는 방법</Text>
                    <Bullets items={miteGuide.howToCount} />
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textPrimary, marginTop: 4 }}>
                      판단 기준{miteGuide.official ? ' (농진청)' : ''}
                    </Text>
                    <Bullets items={miteGuide.howToJudge} />
                    {miteGuide.caveat && (
                      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 16 }}>{miteGuide.caveat}</Text>
                    )}
                  </>
                ) : (
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                    위에서 검사 방법을 고르면 그 방법으로 응애를 세는 법과 판단 기준을 보여줘요. 위험도는 농촌진흥청 기준(벌집판 한 장당 10마리 이상 방제 · 30마리 이상 집중 방제,
                    가루설탕법은 감염률 10%)을 우선 쓰고, 공식 기준이 없는 방법은 일반 참고값으로 계산하면서 그렇게 표시해요.
                  </Text>
                )}
              </View>
            </Card>
          )}

          {/* 즉석 판정 */}
          {miteAssessment && (
            <Card size="large">
              <View style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>응애 위험도</Text>
                  <RiskBadge level={miteAssessment.riskLevel} />
                </View>
                {miteAssessment.metricValue !== null ? (
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display1, color: colors.textPrimary }}>
                    {formatMiteMetric(miteAssessment.metricValue, miteAssessment.metricUnit)}
                  </Text>
                ) : (
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: '#C0821E' }}>{miteAssessment.missing}</Text>
                )}
                {miteAssessment.riskLevel && (
                  <>
                    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textPrimary, lineHeight: 20 }}>
                      {getMiteGuidance(miteAssessment.riskLevel, miteAssessment.threshold?.id).headline}
                    </Text>
                    {miteAssessment.threshold && (
                      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: miteAssessment.threshold.status === 'validated' ? colors.primary : '#8A5A0F', lineHeight: 18 }}>
                        계산 기준: {miteAssessment.threshold.label}
                        {miteAssessment.threshold.status === 'validated' ? '' : ' — 국내 공식 기준이 아니에요'}
                      </Text>
                    )}
                    <ReferenceNote
                      kind="mite"
                      basis={miteAssessment.threshold ? `${miteAssessment.threshold.label} v${miteAssessment.threshold.version} · ${miteAssessment.threshold.source}` : null}
                    />
                  </>
                )}
              </View>
            </Card>
          )}

          {hornetRisk && (
            <Card size="large">
              <View style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>말벌 위험도</Text>
                  <RiskBadge level={hornetRisk} />
                </View>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary, lineHeight: 20 }}>
                  {getHornetGuidance(hornetSpecies, hornetCount ?? 1).headline}
                </Text>
                {getHornetGuidance(hornetSpecies, hornetCount ?? 1).actions.map((a) => (
                  <Text key={a} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                    • {a}
                  </Text>
                ))}
                <ReferenceNote kind="hornet" />
              </View>
            </Card>
          )}

          {winteringChecklist && (
            <Card size="large">
              <View style={{ gap: spacing.lg }}>
                <ChecklistSummary checklist={winteringChecklist} />
                <ChecklistItems items={winteringChecklist.items} />
                {winteringChecklist.firstAction && (
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>
                    가장 먼저 확인할 것: {winteringChecklist.firstAction.todo}
                  </Text>
                )}
                <ChecklistTodos items={winteringChecklist.items} />
                <ReferenceNote kind="readiness" />
              </View>
            </Card>
          )}

          <TextField label="자유메모 (선택)" value={notes} onChangeText={setNotes} placeholder="추가로 남길 내용" multiline />
          <PhotoPicker photos={photos} onChange={setPhotos} />
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ padding: spacing.xl }}>
        <Button label={`${RECORD_TYPE_LABELS[recordType]} 저장`} onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}
