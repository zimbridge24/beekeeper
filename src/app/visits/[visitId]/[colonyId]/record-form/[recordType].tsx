import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import {
  healthPhotoAIProvider,
  HornetPhotoAnalysis,
  MitePhotoAnalysis,
  WinteringPhotoAnalysis,
} from '../../../../../ai';
import { AIResultCard } from '../../../../../components/AIResultCard';
import { Button } from '../../../../../components/Button';
import { Card } from '../../../../../components/Card';
import { Chip } from '../../../../../components/Chip';
import { HealthPhotoPanel } from '../../../../../components/HealthPhotoPanel';
import { InputMode, ModeTabs } from '../../../../../components/ModeTabs';
import { PhotoPicker, PickedPhoto } from '../../../../../components/PhotoPicker';
import { ReadinessHeadline, ReadinessItems, ReadinessTodos } from '../../../../../components/ReadinessItems';
import { ReferenceNote } from '../../../../../components/ReferenceNote';
import { RecordFieldsForm } from '../../../../../components/RecordFieldsForm';
import { RiskBadge } from '../../../../../components/RiskBadge';
import { Screen } from '../../../../../components/Screen';
import { ScreenHeader } from '../../../../../components/ScreenHeader';
import { TextField } from '../../../../../components/TextField';
import { RecordType } from '../../../../../db/schema';
import { extractColonySeries, buildWinteringFacts } from '../../../../../features/health/facts';
import { getHornetGuidance, getMiteGuidance } from '../../../../../features/health/guidance';
import { assessHornetRisk, getHornetSpeciesLabel } from '../../../../../features/health/hornetRisk';
import { assessMite, formatMiteMetric, getMiteMethodLabel, MiteMethod, PHOTO_MITE_METHODS } from '../../../../../features/health/miteRisk';
import { hornetDraftFromPhoto, miteDraftFromPhoto, winteringDraftFromPhoto } from '../../../../../features/health/photoDrafts';
import { daysBetween, seasonOf } from '../../../../../features/health/time';
import { useAnalysis } from '../../../../../features/health/useAnalysis';
import { computeWinteringReadiness } from '../../../../../features/health/winteringReadiness';
import {
  EMPTY_INPUT_STATE,
  FieldInputState,
  getRecordTypeConfig,
  getValueStateLabel,
  RECORD_TYPE_LABELS,
} from '../../../../../features/records/recordTypesConfig';
import { useColony } from '../../../../../repositories/colonyRepository';
import { useHealthSource } from '../../../../../repositories/healthRepository';
import { AiAnalysisInput, createRecord } from '../../../../../repositories/recordRepository';
import { upsertVisitColonyStatus } from '../../../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../../../theme/tokens';

const MITE_TIPS: Record<MiteMethod, string[]> = {
  sticky_board: [
    '흰 바닥 위에 끈끈이판 전체가 한 화면에 들어오게, 위에서 수직으로 찍어주세요.',
    '판이 크면 2~3구역으로 나눠 겹치지 않게 찍어주세요 (각각 따로 세어 더해요).',
    '그림자·플래시 반사가 없는 밝은 곳에서, 응애가 또렷하게 초점이 맞도록 가까이 찍어주세요.',
  ],
  sugar_roll: [
    '떨어진 응애만 흰 종이나 흰 접시 위에 모아 펼쳐 찍어주세요 (벌 사체와 분리).',
    '위에서 수직으로, 초점이 맞게 가까이 찍어주세요. 자나 동전을 옆에 두면 크기 비교에 도움이 돼요.',
    '매번 같은 배경·같은 거리로 찍으면 AI 판독이 일정해져요.',
  ],
  alcohol_wash: [
    '체에 걸러 흰 접시에 옮긴 응애를 위에서 수직으로 찍어주세요 (벌 사체와 분리).',
    '알코올이 반사되지 않게 밝은 곳에서, 초점이 맞도록 가까이 찍어주세요.',
    '매번 같은 배경·같은 거리로 찍으면 AI 판독이 일정해져요.',
  ],
};

const HORNET_TIPS = [
  '말벌의 머리·가슴·배 무늬가 모두 보이도록 가까이서, 몸 전체가 나오게 찍어주세요.',
  '벌통 입구 앞에서 사냥 중인 모습이나, 포획틀에 잡힌 개체를 찍어도 좋아요.',
  '여러 마리라면 한 화면에 모아 찍거나 2~3장으로 나눠 찍어주세요. 벌집(둥지)이 보이면 함께 찍어주세요.',
  '말벌에 너무 가까이 다가가지 마세요. 안전한 거리에서 확대해서 찍어도 괜찮아요.',
];

const WINTERING_TIPS = [
  '벌통 뚜껑을 열고 프레임 위쪽에서 벌이 덮은 정도와 꿀 저장 부분이 함께 보이게 찍어주세요.',
  '꿀이 채워진 프레임은 따로 한 장 꺼내 앞뒤로 찍으면 저장량을 더 잘 어림해요.',
  '밝은 곳에서, 흔들리지 않게 찍어주세요. 사진 몇 장으로 벌통 전체를 알 수는 없어서 AI 추정은 대략적인 참고용이에요.',
];

const PHOTO_ASSIST_TYPES: RecordType[] = ['mite', 'hornet', 'wintering_prep'];

// 사진 AI가 채운 값(aiDraft)과 현재 값이 같은 필드만 "AI 추정"으로 표시한다 — 사용자가
// 고친 필드는 더 이상 AI 값이 아니다.
function suggestedKeys(aiDraft: FieldInputState | null, state: FieldInputState): ReadonlySet<string> {
  const keys = new Set<string>();
  if (!aiDraft) return keys;
  for (const [k, v] of Object.entries(aiDraft.values)) if (state.values[k] === v) keys.add(k);
  for (const [k, v] of Object.entries(aiDraft.numbers)) if (state.numbers[k] === v) keys.add(k);
  return keys;
}

function mergeDraft(state: FieldInputState, draft: FieldInputState): FieldInputState {
  return {
    values: { ...state.values, ...draft.values },
    numbers: { ...state.numbers, ...draft.numbers },
    texts: { ...state.texts, ...draft.texts },
  };
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

  // --- 사진 AI (응애 · 말벌 · 월동 준비 폼에서만) — 결과는 같은 필드에 채워진다.
  // 응애·말벌은 사진이 핵심이라 사진 탭부터, 월동 준비는 사진이 선택 사항이라 직접 입력부터 연다.
  const [mode, setMode] = useState<InputMode>(recordType === 'wintering_prep' ? 'manual' : 'photo');
  const [aiDraft, setAiDraft] = useState<FieldInputState | null>(null);
  const miteAnalysis = useAnalysis<MitePhotoAnalysis>();
  const hornetAnalysis = useAnalysis<HornetPhotoAnalysis>();
  const winteringAnalysis = useAnalysis<WinteringPhotoAnalysis>();
  const photoAssist = PHOTO_ASSIST_TYPES.includes(recordType);

  // 응애 검사 방법은 기록 필드(mite_method) 하나뿐이다. 사진 탭에서는 사진 위에서 고른 값이
  // 곧 그 필드이고, 직접 입력 탭에서는 폼에서 고른다 — 같은 값을 두 곳에서 따로 받지 않는다.
  const miteMethod: MiteMethod | null = PHOTO_MITE_METHODS.find((m) => m.value === state.values.mite_method)?.value ?? null;

  const activeAnalysis = recordType === 'mite' ? miteAnalysis : recordType === 'hornet' ? hornetAnalysis : winteringAnalysis;

  const resetAnalysis = () => {
    miteAnalysis.reset();
    hornetAnalysis.reset();
    winteringAnalysis.reset();
    setAiDraft(null);
  };

  const handlePhotosChange = (next: PickedPhoto[]) => {
    setPhotos(next);
    if (aiDraft) resetAnalysis(); // 사진이 바뀌면 이전 판독은 더 이상 이 사진들의 결과가 아니다.
  };

  const handleAnalyze = async () => {
    const uris = photos.map((p) => p.uri);
    let draft: FieldInputState | null = null;
    if (recordType === 'mite') {
      if (!miteMethod) return;
      const result = await miteAnalysis.run(() => healthPhotoAIProvider.analyzeMitePhotos(uris, { method: miteMethod }));
      if (result) draft = miteDraftFromPhoto(result, miteMethod);
    } else if (recordType === 'hornet') {
      const result = await hornetAnalysis.run(() => healthPhotoAIProvider.analyzeHornetPhotos(uris));
      if (result) draft = hornetDraftFromPhoto(result);
    } else if (recordType === 'wintering_prep') {
      const species = colony?.species === 'native' ? 'native' : 'western';
      const result = await winteringAnalysis.run(() => healthPhotoAIProvider.analyzeWinteringPhotos(uris, { species }));
      if (result) draft = winteringDraftFromPhoto(result);
    }
    if (draft) {
      setState((prev) => mergeDraft(prev, draft));
      setAiDraft(draft);
    }
  };

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

  const hornetSpecies = state.values.wasp_species ?? 'unknown_species';
  const hornetCount =
    state.numbers.wasp_count_number ??
    (state.values.wasp_count ? ({ few_1_5: 3, several_6_20: 10, many_20_plus: 25 } as Record<string, number>)[state.values.wasp_count] : undefined);
  const hornetActive = recordType === 'hornet' && state.values.wasp_observed === 'present';
  const hornetRisk = hornetActive ? assessHornetRisk(hornetSpecies, hornetCount ?? 1) : null;

  const winteringPreview = useMemo(() => {
    if (recordType !== 'wintering_prep' || !source || !colonyId) return null;
    const facts = buildWinteringFacts(source, colonyId, {
      strength: state.values.colony_strength,
      food: state.values.feed_status,
      queenPresent: state.values.queen_status === 'present' ? true : state.values.queen_status === 'absent' ? false : null,
      insulation: state.values.winter_insulation,
      hiveCondition: state.values.winter_hive_condition,
    });
    return facts ? computeWinteringReadiness(facts) : null;
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
    if (recordType === 'wintering_prep' && winteringPreview && winteringPreview.band !== 'insufficient') return `월동 준비도 ${winteringPreview.score}점 · ${winteringPreview.bandLabel}`;
    return undefined;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = activeAnalysis.result as (MitePhotoAnalysis | HornetPhotoAnalysis | WinteringPhotoAnalysis) | null;
      const analyses: AiAnalysisInput[] =
        aiDraft && result
          ? [
              {
                kind: recordType === 'mite' ? 'mite_photo' : recordType === 'hornet' ? 'hornet_photo' : 'wintering_photo',
                confidence: result.confidence,
                photoQuality: result.photoQuality,
                retakeNeeded: result.retakeNeeded,
                result,
              },
            ]
          : [];
      await createRecord({
        visitId,
        colonyId,
        recordType,
        state,
        notes: notes.trim() || null,
        photos,
        inputMethod: aiDraft ? 'photo_ai' : 'quick_select',
        aiDraft: aiDraft ?? undefined,
        aiAnalyses: analyses,
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

  const mite = miteAnalysis.result;
  const hornet = hornetAnalysis.result;
  const wintering = winteringAnalysis.result;

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
          {recordType === 'hornet' && lastHornet && (
            <Card size="medium" tint={colors.surfaceTint}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                마지막 말벌 기록은 {daysBetween(lastHornet.at, now)}일 전 · {getHornetSpeciesLabel(lastHornet.species)}
                {lastHornet.count !== null ? ` ${lastHornet.count}마리` : ''}
                {lastHornet.damage ? ' · 피해 있음' : ''}
              </Text>
            </Card>
          )}

          {photoAssist && <ModeTabs value={mode} onChange={setMode} />}

          {/* 사진 AI — 사진 탭에서만 */}
          {photoAssist && mode === 'photo' && (
            <View style={{ gap: spacing.md }}>
              {recordType === 'mite' && (
                <View>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                    어떤 검사 사진인가요?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
                    {PHOTO_MITE_METHODS.map((m) => (
                      <Chip
                        key={m.value}
                        label={m.label}
                        selected={miteMethod === m.value}
                        onPress={() => {
                          setState((prev) => ({ ...prev, values: { ...prev.values, mite_method: m.value } }));
                          if (aiDraft) resetAnalysis();
                        }}
                      />
                    ))}
                  </View>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 6 }}>
                    여기서 고른 방법이 기록의 &quot;검사 방법&quot;으로 저장돼요.
                  </Text>
                </View>
              )}
              <HealthPhotoPanel
                tipsTitle={
                  recordType === 'mite'
                    ? '이렇게 찍으면 AI가 더 잘 세어요'
                    : recordType === 'hornet'
                      ? '이렇게 찍으면 종류를 더 잘 알아봐요'
                      : '소비 사진으로 봉세·먹이를 어림해볼 수 있어요 (선택)'
                }
                tips={recordType === 'mite' ? MITE_TIPS[miteMethod ?? 'sugar_roll'] : recordType === 'hornet' ? HORNET_TIPS : WINTERING_TIPS}
                photos={photos}
                onPhotosChange={handlePhotosChange}
                maxPhotos={3}
                status={activeAnalysis.status}
                error={activeAnalysis.error}
                analyzeLabel={recordType === 'mite' ? 'AI로 응애 세기' : recordType === 'hornet' ? 'AI로 말벌 알아보기' : 'AI로 봉세·먹이 어림하기'}
                onAnalyze={handleAnalyze}
                analyzeDisabled={recordType === 'mite' && !miteMethod}
                analyzeHint="검사 방법을 먼저 골라주세요."
              />
              {mite && recordType === 'mite' && (
                <AIResultCard
                  headline={`응애 추정 개체수: ${mite.estimatedCount}마리`}
                  details={[
                    `추정 범위 ${mite.countRangeLow}~${mite.countRangeHigh}마리`,
                    ...(mite.perPhotoCounts.length > 1 ? [`사진별: ${mite.perPhotoCounts.map((n) => `${n}마리`).join(' + ')}`] : []),
                  ]}
                  confidence={mite.confidence}
                  photoQuality={mite.photoQuality}
                  retakeNeeded={mite.retakeNeeded}
                  retakeReasons={mite.retakeReasons}
                  notes={mite.notes}
                  isMock={mite.isMock}
                  source={mite}
                />
              )}
              {hornet && recordType === 'hornet' && (
                <AIResultCard
                  headline={hornet.estimatedCount === 0 ? '말벌이 확인되지 않았어요' : `${getHornetSpeciesLabel(hornet.species)} 추정 ${hornet.estimatedCount}마리`}
                  details={hornet.nestVisible ? ['사진에 벌집(둥지)으로 보이는 것이 있어요 — 직접 제거하지 말고 119·지자체에 신고하세요'] : undefined}
                  confidence={hornet.confidence}
                  photoQuality={hornet.photoQuality}
                  retakeNeeded={hornet.retakeNeeded}
                  retakeReasons={hornet.retakeReasons}
                  notes={hornet.notes}
                  isMock={hornet.isMock}
                  source={hornet}
                />
              )}
              {wintering && recordType === 'wintering_prep' && (
                <AIResultCard
                  headline={`봉세 ${wintering.strength === 'unknown' ? '판단 어려움' : getValueStateLabel('strength_level', wintering.strength)} · 먹이 ${wintering.food === 'unknown' ? '판단 어려움' : getValueStateLabel('food_level', wintering.food)}`}
                  details={wintering.broodVisible === null ? undefined : [wintering.broodVisible ? '봉아가 보여요' : '봉아는 보이지 않아요']}
                  confidence={wintering.confidence}
                  photoQuality={wintering.photoQuality}
                  retakeNeeded={wintering.retakeNeeded}
                  retakeReasons={wintering.retakeReasons}
                  notes={wintering.notes}
                  isMock={wintering.isMock}
                  source={wintering}
                />
              )}
            </View>
          )}

          {/* 사진 탭에서는 분석이 끝난 뒤(또는 실패했을 때)부터 값을 확인·수정하는 폼을 보여준다.
              응애 검사 방법은 위 사진 영역에서 이미 골랐으므로 폼에서는 뺀다. */}
          {photoAssist && mode === 'photo' && activeAnalysis.status !== 'done' && activeAnalysis.status !== 'error' ? (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted, textAlign: 'center' }}>
              사진을 올려 분석하면 AI가 채운 값을 여기서 확인하고 고칠 수 있어요. 사진 없이 기록하려면 &quot;직접 입력&quot; 탭을 눌러주세요.
            </Text>
          ) : (
            <View style={{ gap: spacing.lg }}>
              {photoAssist && mode === 'photo' && activeAnalysis.status === 'done' && (
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                  AI가 채운 값을 확인하고 고쳐주세요
                </Text>
              )}
              <RecordFieldsForm
                fields={recordType === 'mite' && mode === 'photo' ? config.fields.filter((f) => f.key !== 'mite_method') : config.fields}
                state={state}
                onChange={setState}
                aiSuggestedKeys={suggestedKeys(aiDraft, state)}
              />
            </View>
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
                      {getMiteGuidance(miteAssessment.riskLevel).headline}
                    </Text>
                    <ReferenceNote
                      kind="mite"
                      basis={miteAssessment.threshold ? `${miteAssessment.threshold.label} v${miteAssessment.threshold.version}` : null}
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

          {winteringPreview && (
            <Card size="large">
              <View style={{ gap: spacing.lg }}>
                <ReadinessHeadline
                  score={winteringPreview.score}
                  band={winteringPreview.band}
                  bandLabel={winteringPreview.bandLabel}
                  knownCount={winteringPreview.knownCount}
                  knownTotal={winteringPreview.knownTotal}
                />
                <ReadinessItems items={winteringPreview.items} />
                {winteringPreview.firstAction && (
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>
                    가장 먼저 확인할 것: {winteringPreview.firstAction.todo}
                  </Text>
                )}
                <ReadinessTodos items={winteringPreview.items} />
                <ReferenceNote kind="readiness" />
              </View>
            </Card>
          )}

          <TextField label="자유메모 (선택)" value={notes} onChangeText={setNotes} placeholder="추가로 남길 내용" multiline />
          {(!photoAssist || mode === 'manual') && <PhotoPicker photos={photos} onChange={handlePhotosChange} />}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ padding: spacing.xl }}>
        <Button label={`${RECORD_TYPE_LABELS[recordType]} 저장`} onPress={handleSave} loading={saving} />
      </View>
    </Screen>
  );
}
