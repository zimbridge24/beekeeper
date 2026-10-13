import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import type { StructuredRecordDraft } from '../../../ai';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { CheckBox } from '../../../components/CheckBox';
import { Chip } from '../../../components/Chip';
import { PhotoPicker, PickedPhoto } from '../../../components/PhotoPicker';
import { RecordFieldsForm } from '../../../components/RecordFieldsForm';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { TextField } from '../../../components/TextField';
import { RecordType } from '../../../db/schema';
import { summarizeInputState } from '../../../features/records/fieldState';
import { findUnregisteredColonyNumber } from '../../../features/voice/mentionedColony';
import { pickNextColony } from '../../../features/voice/nextColony';
import { removePendingCapture } from '../../../features/voice/pendingCaptures';
import {
  DETAIL_RECORD_TYPES,
  EMPTY_INPUT_STATE,
  FieldInputState,
  getFieldsForRecordType,
  getMissingRequiredFields,
  GENERAL_RECORD_TITLE,
  hasAnyValue,
  pruneHiddenValues,
  QUICK_CHECK_FIELDS,
  RECORD_TYPE_LABELS,
} from '../../../features/records/recordTypesConfig';
import { createColony, useColonies } from '../../../repositories/colonyRepository';
import { createVoiceCaptureForColonies, VoiceCaptureSection } from '../../../repositories/recordRepository';
import { useApiaryColoniesWithVisitStatus, useVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../../../theme/tokens';

// 이 확신도 미만이면 "검토 필요" 배지를 보여준다.
const CONFIDENCE_REVIEW_THRESHOLD = 0.85;

const stateFromDraft = (draft: StructuredRecordDraft | undefined): FieldInputState =>
  draft ? { values: { ...draft.values }, numbers: { ...draft.numberValues }, texts: { ...draft.textValues } } : EMPTY_INPUT_STATE;

export default function VoiceReviewScreen() {
  const params = useLocalSearchParams<{
    visitId: string;
    colonyId: string;
    aiDraftColonyId?: string;
    colonyLocked: string;
    drafts: string;
    notes: string;
    transcript: string;
    confidenceScore: string;
    audioLocalUri?: string;
    audioDurationSec?: string;
    // 대기열(나중에 처리)에서 이어 온 녹음이면 그 id — 저장에 성공하면 대기열에서 뺀다.
    pendingCaptureId?: string;
    // 녹음 직후 흐름이면 '1' — 저장하면 저장 완료 화면 대신 다음 봉군 녹음으로 바로 넘어간다.
    autoNext?: string;
  }>();
  const { visitId, transcript } = params;
  const isLocked = params.colonyLocked === '1';

  const { data: visitRows } = useVisit(visitId);
  const visit = visitRows?.[0];
  const { data: apiaryColonies } = useColonies(visit?.apiaryId);
  const { data: statusRows } = useApiaryColoniesWithVisitStatus(visit?.apiaryId, visitId);
  const [creatingColony, setCreatingColony] = useState(false);

  // 기록할 봉군들. 한 번 말한 내용이 여러 봉군에 해당하면("오늘 전부 괜찮아") 여러 개를 골라 같은 기록을
  // 한꺼번에 남긴다. 처음 값은 AI가 찾았거나 봉군이 고정된 한 개(없으면 비어 있음).
  const [selectedColonyIds, setSelectedColonyIds] = useState<string[]>(params.colonyId ? [params.colonyId] : []);
  // 봉군을 정했는지 — false면 검토 폼 대신 봉군 선택 단계를 먼저 보여준다.
  const [colonyConfirmed, setColonyConfirmed] = useState(!!params.colonyId);
  const selectedColonyId = selectedColonyIds[0] ?? '';
  const selectedColony = apiaryColonies?.find((c) => c.id === selectedColonyId);
  const multi = selectedColonyIds.length > 1;
  // 봉군 번호 순서로 보여준다 (목록 기본 순서는 만든 시각이라 일괄 등록한 봉군이 뒤섞여 보인다).
  const sortedColonies = useMemo(
    () => [...(apiaryColonies ?? [])].sort((a, b) => Number(a.internalCode) - Number(b.internalCode)),
    [apiaryColonies],
  );
  const toggleColony = (id: string) =>
    setSelectedColonyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confidenceScore = Number(params.confidenceScore) || 0;
  const needsReview = confidenceScore < CONFIDENCE_REVIEW_THRESHOLD;

  // AI의 원본 제안 — 사용자가 아래에서 수정해도 이 값들은 절대 바뀌지 않는다. 저장할 때
  // 각 필드의 ai_draft_*로 확정값과 별도로 영구 보존된다.
  const aiDrafts = useMemo(() => {
    try {
      return JSON.parse(params.drafts || '[]') as StructuredRecordDraft[];
    } catch {
      return [];
    }
  }, [params.drafts]);
  const aiDraftByType = useMemo(() => new Map(aiDrafts.map((d) => [d.recordType, d])), [aiDrafts]);
  const aiDraftNotes = params.notes ?? '';
  const aiDraftColonyId = params.aiDraftColonyId || null;

  // 영역별 입력 상태. 처음에는 AI가 채운 영역만 열려 있다.
  const [sections, setSections] = useState<Partial<Record<RecordType, FieldInputState>>>(() => {
    const initial: Partial<Record<RecordType, FieldInputState>> = {};
    for (const d of aiDrafts) initial[d.recordType] = stateFromDraft(d);
    return initial;
  });
  const [notes, setNotes] = useState(aiDraftNotes);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  // 확신도가 충분하고 필수 항목이 다 찬 결과는 "이렇게 기록할게요" 요약만 먼저 보여주고 한 번에 저장할 수
  // 있게 한다. 요약에는 저장될 값이 전부 보이고, "수정하기"로 언제든 전체 폼을 연다. 확신도가 낮거나
  // 필수 항목이 비면 처음부터 전체 폼으로 시작한다. (봉군은 이 화면 전에 먼저 고르게 한다 — 아래 참고.)
  const simpleEligible = useMemo(
    () =>
      !needsReview &&
      aiDrafts.length > 0 &&
      aiDrafts.every((d) => getMissingRequiredFields(getFieldsForRecordType(d.recordType), stateFromDraft(d)).length === 0),
    [needsReview, aiDrafts],
  );
  const [expanded, setExpanded] = useState(false);
  const simple = simpleEligible && !expanded;

  const openTypes = DETAIL_RECORD_TYPES.filter((t) => sections[t.recordType]);
  const closedTypes = DETAIL_RECORD_TYPES.filter((t) => !sections[t.recordType]);
  const general = sections.general_observation ?? EMPTY_INPUT_STATE;

  const setSection = (recordType: RecordType, next: FieldInputState) => setSections((prev) => ({ ...prev, [recordType]: next }));

  const handleSave = async () => {
    if (selectedColonyIds.length === 0) return;

    // 값이 하나라도 있는 영역만 기록으로 만든다. 빠른 상태(general)가 먼저 와서 대표 기록이 된다.
    const order: RecordType[] = ['general_observation', ...DETAIL_RECORD_TYPES.map((t) => t.recordType)];
    const built: VoiceCaptureSection[] = [];
    for (const recordType of order) {
      const state = sections[recordType];
      if (!state) continue;
      const fields = getFieldsForRecordType(recordType);
      if (!hasAnyValue(fields, pruneHiddenValues(fields, state))) continue;
      const draft = aiDraftByType.get(recordType);
      built.push({ recordType, state, aiDraft: stateFromDraft(draft) });
    }
    // 아무 필드도 못 채웠어도(예: 메모만 남기는 발화) 원문 전사가 사라지지 않게 빈 빠른 기록으로 남긴다.
    if (built.length === 0) built.push({ recordType: 'general_observation', state: EMPTY_INPUT_STATE, aiDraft: EMPTY_INPUT_STATE });

    // 방제처럼 필수 항목이 있는 영역은 비워두고 저장할 수 없다 (AI가 약제 성분을 못 들었으면 직접 고른다).
    for (const section of built) {
      const missing = getMissingRequiredFields(getFieldsForRecordType(section.recordType), section.state);
      if (missing.length > 0) {
        setExpanded(true);
        Alert.alert(`${RECORD_TYPE_LABELS[section.recordType]}: ${missing.map((f) => f.label).join(', ')}을(를) 골라주세요`, missing.map((f) => f.hint).filter(Boolean).join('\n') || undefined);
        return;
      }
    }

    // 여러 봉군에 같은 내용을 남기는 건 한 번 저장하면 봉군마다 따로 지워야 해서 한 번 더 확인한다.
    if (selectedColonyIds.length > 1) {
      Alert.alert(
        `${selectedColonyIds.length}개 봉군에 기록할까요?`,
        '선택한 봉군 모두에 같은 내용을 남겨요. 특이한 봉군은 저장한 뒤 그 봉군의 기록만 따로 고칠 수 있어요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '기록하기', onPress: () => void persist(built) },
        ],
      );
      return;
    }
    await persist(built);
  };

  const persist = async (built: VoiceCaptureSection[]) => {
    setSaving(true);
    try {
      await createVoiceCaptureForColonies({
        visitId,
        colonyIds: selectedColonyIds,
        sections: built,
        notes: notes.trim() || null,
        rawTranscript: transcript,
        aiConfidenceScore: confidenceScore,
        audioLocalUri: params.audioLocalUri ?? null,
        audioDurationSec: params.audioDurationSec ? Number(params.audioDurationSec) : null,
        // 여러 봉군에 남길 때 사진은 첫 봉군에만 붙는다 — 아래 화면에서는 그때 사진 첨부를 숨긴다.
        photos: multi ? [] : photos,
        aiDraftColonyId,
        aiDraftNotes,
      });
      // 기록으로 저장됐으니 대기열에서 뺀다. 원본 음성 파일은 기록에 연결돼 있으므로 지우지 않는다.
      if (params.pendingCaptureId) await removePendingCapture(params.pendingCaptureId);

      // 녹음 직후 흐름이면 "저장 완료" 화면을 거치지 않고 바로 다음 봉군 녹음으로 간다 (장갑 낀 채로 단계를 줄인다).
      // 쌓여 있던 녹음을 목록에서 열어 저장한 경우에는 그 목록 흐름을 끊지 않도록 기존 화면으로 간다.
      const remaining = statusRows?.filter((r) => !selectedColonyIds.includes(r.colony.id));
      const next = params.autoNext === '1' && remaining ? pickNextColony(remaining, undefined)?.colony : undefined;
      if (next) {
        router.replace({
          pathname: '/visits/[visitId]/voice-record',
          params: {
            visitId,
            colonyId: next.id,
            savedAlias: multi ? `${selectedColonyIds.length}개 봉군` : (selectedColony?.alias ?? ''),
          },
        });
        return;
      }
      router.replace({
        pathname: '/visits/[visitId]/saved',
        params: {
          visitId,
          colonyId: selectedColonyId,
          colonyCount: String(selectedColonyIds.length),
          recordTypeTitle: built.map((s) => RECORD_TYPE_LABELS[s.recordType]).join('·'),
        },
      });
    } catch (err) {
      // 저장이 실패해도 녹음과 이 화면의 내용은 그대로다 — 조용히 멈춰 있으면 사용자가 저장됐다고 착각한다.
      Alert.alert('저장하지 못했어요', (err instanceof Error ? err.message : String(err)) + '\n\n내용은 그대로 남아 있어요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const selectedColonyNames = (() => {
    const names = selectedColonyIds
      .map((id) => apiaryColonies?.find((c) => c.id === id)?.alias)
      .filter((n): n is string => !!n);
    return names.length <= 6 ? names.join(', ') : `${names.slice(0, 6).join(', ')} 외 ${names.length - 6}개`;
  })();

  // 요약 모드에서 보여줄 "저장될 내용" — 저장 때와 같은 규칙(summarizeInputState)으로 만든다.
  const summaryBlocks = (['general_observation', ...DETAIL_RECORD_TYPES.map((t) => t.recordType)] as RecordType[])
    .map((recordType) => {
      const state = sections[recordType];
      if (!state) return null;
      const lines = summarizeInputState(getFieldsForRecordType(recordType), state);
      if (lines.length === 0) return null;
      const config = DETAIL_RECORD_TYPES.find((t) => t.recordType === recordType);
      return {
        recordType,
        title: config ? `${config.emoji} ${config.title}` : `${GENERAL_RECORD_TITLE} · 기본 상태`,
        lines,
      };
    })
    .filter((block): block is NonNullable<typeof block> => block !== null);

  // 말한 봉군이 아직 등록되지 않은 경우(예: "12번 통…"인데 12번 봉군이 없음) 새로 만들지 제안한다.
  // 자동으로 만들지는 않는다 — 번호를 잘못 알아들었을 수 있어서 사용자가 누를 때만 만든다.
  const mentionedNumber = useMemo(
    () => (apiaryColonies ? findUnregisteredColonyNumber(transcript ?? '', apiaryColonies.map((c) => c.alias)) : null),
    [apiaryColonies, transcript],
  );
  const createMentioned = async (species: 'western' | 'native') => {
    if (!visit?.apiaryId || mentionedNumber === null) return;
    setCreatingColony(true);
    try {
      const id = await createColony({ apiaryId: visit.apiaryId, alias: `${mentionedNumber}번 봉군`, species });
      setSelectedColonyIds([id]);
      setColonyConfirmed(true);
    } catch (err) {
      Alert.alert('봉군을 만들지 못했어요', err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingColony(false);
    }
  };

  // 어느 봉군인지 모르면(말한 내용에 봉군이 없었거나 못 찾았을 때) 검토 폼보다 먼저 봉군부터 고르게 한다.
  // 폼 맨 위의 작은 선택칸이면 놓치기 쉽고, 저장 버튼이 잠긴 이유도 알기 어렵다.
  if (!isLocked && !colonyConfirmed) {
    return (
      <Screen scroll={false} padded={false}>
        <ScreenHeader title="어느 봉군인가요?" onBack={() => router.back()} subdued />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}>
          <View style={{ gap: spacing.lg }}>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
              {params.colonyId
                ? '이 기록을 남길 봉군을 골라 주세요.'
                : '말씀하신 내용에서 봉군을 찾지 못했어요. 이 기록을 남길 봉군을 골라 주세요.'}{' '}
              여러 봉군에 해당하면 전체 선택 후 빼고 싶은 봉군만 해제하면 한꺼번에 남길 수 있어요.
            </Text>
            {transcript ? (
              <Card size="medium">
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: 4 }}>말씀하신 내용</Text>
                <Text numberOfLines={4} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                  {transcript}
                </Text>
              </Card>
            ) : null}
            {mentionedNumber !== null && visit?.apiaryId ? (
              <Card size="medium" tint="#FBEED9">
                <View style={{ gap: spacing.sm }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: '#8A5A0F' }}>
                    &quot;{mentionedNumber}번&quot;은 등록된 봉군이 아니에요
                  </Text>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: '#8A5A0F', lineHeight: 18 }}>
                    말씀하신 {mentionedNumber}번 봉군을 새로 만들고 이 기록을 남길까요? 아니면 아래에서 기존 봉군을 골라 주세요.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Button label="서양벌로 만들기" disabled={creatingColony} onPress={() => void createMentioned('western')} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="토종벌로 만들기" variant="surface" disabled={creatingColony} onPress={() => void createMentioned('native')} />
                    </View>
                  </View>
                </View>
              </Card>
            ) : null}
            {apiaryColonies === undefined ? (
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>봉군을 불러오는 중...</Text>
            ) : apiaryColonies.length === 0 ? (
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
                이 양봉장에 등록된 봉군이 없어요. 봉군을 먼저 만든 뒤 홈의 &quot;저장하지 않은 음성 녹음&quot;에서 다시 열어 주세요.
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                    선택 {selectedColonyIds.length}/{sortedColonies.length}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                    <Pressable onPress={() => setSelectedColonyIds(sortedColonies.map((c) => c.id))} hitSlop={8}>
                      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>전체 선택</Text>
                    </Pressable>
                    <Pressable onPress={() => setSelectedColonyIds([])} hitSlop={8}>
                      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>전체 해제</Text>
                    </Pressable>
                  </View>
                </View>
                {sortedColonies.map((c) => (
                  <Card key={c.id} size="medium" onPress={() => toggleColony(c.id)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <CheckBox checked={selectedColonyIds.includes(c.id)} />
                      <Text style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.textPrimary }}>{c.alias}</Text>
                      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
                        {c.species === 'western' ? '서양벌' : '토종벌'}
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
        <View style={{ padding: spacing.xl }}>
          <Button
            label={selectedColonyIds.length > 0 ? `${selectedColonyIds.length}개 봉군으로 계속` : '봉군을 선택해 주세요'}
            disabled={selectedColonyIds.length === 0}
            onPress={() => setColonyConfirmed(true)}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="AI 내검 검토" onBack={() => router.back()} subdued />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg }}>
        <View style={{ gap: spacing.xl }}>
          {isLocked ? (
            selectedColony && (
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>{selectedColony.alias}</Text>
            )
          ) : (
            <View style={{ gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                  {multi
                    ? `기록할 봉군 ${selectedColonyIds.length}개`
                    : selectedColonyId === (params.colonyId || '')
                      ? '감지된 봉군'
                      : '선택한 봉군'}
                </Text>
                <Pressable onPress={() => setColonyConfirmed(false)} hitSlop={10}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>바꾸기</Text>
                </Pressable>
              </View>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                {selectedColonyNames}
              </Text>
            </View>
          )}

          <Card size="large">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>음성 인식 결과 (원문)</Text>
              <View
                style={{
                  paddingVertical: 3,
                  paddingHorizontal: 9,
                  borderRadius: radius.pill,
                  backgroundColor: needsReview ? '#FBEED9' : '#E1F1E8',
                }}
              >
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: needsReview ? '#C0821E' : '#2C7A57' }}>
                  {needsReview ? '검토 필요' : '확인 완료'} · {Math.round(confidenceScore * 100)}%
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: fontSizes.bodySm,
                color: colors.textSecondary,
                marginTop: spacing.sm,
                lineHeight: 20,
              }}
            >
              {transcript}
            </Text>
          </Card>

          {simple ? (
            <>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                이렇게 기록할게요
              </Text>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: -spacing.md }}>
                위 원문과 맞는지 확인하세요. 말씀하지 않은 항목은 비워 둬요.
              </Text>
              {summaryBlocks.map((block) => (
                <Card key={block.recordType} size="large">
                  <View style={{ gap: spacing.sm }}>
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>{block.title}</Text>
                    {block.lines.map((line) => (
                      <Text key={line.key} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                        {line.label}: <Text style={{ color: colors.textSecondary }}>{line.value}</Text>
                      </Text>
                    ))}
                  </View>
                </Card>
              ))}
              {notes.trim().length > 0 && (
                <Card size="medium">
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                    메모: {notes.trim()}
                  </Text>
                </Card>
              )}
            </>
          ) : (
            <>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
            AI가 구조화한 내용 (확인 후 수정 가능)
          </Text>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, marginTop: -spacing.md }}>
            말씀하지 않은 항목은 비워둬요. AI가 추측해서 채우지 않아요.
          </Text>

          <SectionCard title={`${GENERAL_RECORD_TITLE} · 기본 상태`}>
            <RecordFieldsForm
              fields={QUICK_CHECK_FIELDS}
              state={general}
              onChange={(next) => setSection('general_observation', next)}
              aiSuggestedKeys={aiKeys(aiDraftByType.get('general_observation'), general)}
            />
          </SectionCard>

          {openTypes.map((t) => (
            <SectionCard
              key={t.recordType}
              title={`${t.emoji} ${t.title}`}
              onRemove={() =>
                setSections((prev) => {
                  const { [t.recordType]: _removed, ...rest } = prev;
                  return rest;
                })
              }
            >
              <RecordFieldsForm
                fields={t.fields}
                state={sections[t.recordType] ?? EMPTY_INPUT_STATE}
                onChange={(next) => setSection(t.recordType, next)}
                aiSuggestedKeys={aiKeys(aiDraftByType.get(t.recordType), sections[t.recordType] ?? EMPTY_INPUT_STATE)}
              />
            </SectionCard>
          ))}

          {closedTypes.length > 0 && (
            <View>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>다른 항목도 기록하기</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
                {closedTypes.map((t) => (
                  <Chip key={t.recordType} label={`${t.emoji} ${t.title}`} onPress={() => setSection(t.recordType, EMPTY_INPUT_STATE)} />
                ))}
              </View>
            </View>
          )}

          <TextField
            label="자유메모 (필드에 담기지 않은 내용)"
            value={notes}
            onChangeText={setNotes}
            placeholder="추가로 남길 내용"
            multiline
          />

          {multi ? (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 18 }}>
              여러 봉군에 한꺼번에 남길 때는 사진을 붙일 수 없어요. 사진은 저장한 뒤 봉군별 기록에서 붙여 주세요.
            </Text>
          ) : (
            <PhotoPicker photos={photos} onChange={setPhotos} />
          )}
            </>
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ padding: spacing.xl, gap: spacing.sm }}>
        <Button
          label={multi ? `${selectedColonyIds.length}개 봉군에 ${simple ? '이대로 ' : ''}저장` : simple ? '이대로 저장' : '검토 완료 · 저장'}
          onPress={handleSave}
          loading={saving}
          disabled={selectedColonyIds.length === 0}
        />
        {simple && <Button label="수정하기" variant="surface" onPress={() => setExpanded(true)} disabled={saving} />}
      </View>
    </Screen>
  );
}

// 사용자가 고친 필드는 더 이상 AI 값이 아니므로, 현재 값이 AI 제안과 같은 필드만 표시한다.
function aiKeys(draft: StructuredRecordDraft | undefined, state: FieldInputState): ReadonlySet<string> {
  const keys = new Set<string>();
  if (!draft) return keys;
  for (const [k, v] of Object.entries(draft.values)) if (state.values[k] === v) keys.add(k);
  for (const [k, v] of Object.entries(draft.numberValues)) if (state.numbers[k] === v) keys.add(k);
  for (const [k, v] of Object.entries(draft.textValues)) if (state.texts[k] === v) keys.add(k);
  return keys;
}

function SectionCard({ title, onRemove, children }: { title: string; onRemove?: () => void; children: React.ReactNode }) {
  return (
    <Card size="large">
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>{title}</Text>
          {onRemove && (
            <Pressable onPress={onRemove} hitSlop={8}>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>빼기</Text>
            </Pressable>
          )}
        </View>
        {children}
      </View>
    </Card>
  );
}
