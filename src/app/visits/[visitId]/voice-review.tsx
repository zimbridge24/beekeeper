import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { StructuredRecordDraft } from '../../../ai';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Chip } from '../../../components/Chip';
import { PhotoPicker, PickedPhoto } from '../../../components/PhotoPicker';
import { RecordFieldsForm } from '../../../components/RecordFieldsForm';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { TextField } from '../../../components/TextField';
import { RecordType } from '../../../db/schema';
import {
  DETAIL_RECORD_TYPES,
  EMPTY_INPUT_STATE,
  FieldInputState,
  getFieldsForRecordType,
  GENERAL_RECORD_TITLE,
  hasAnyValue,
  pruneHiddenValues,
  QUICK_CHECK_FIELDS,
  RECORD_TYPE_LABELS,
} from '../../../features/records/recordTypesConfig';
import { useColonies } from '../../../repositories/colonyRepository';
import { createVoiceCapture, VoiceCaptureSection } from '../../../repositories/recordRepository';
import { upsertVisitColonyStatus, useVisit } from '../../../repositories/visitRepository';
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
  }>();
  const { visitId, transcript } = params;
  const isLocked = params.colonyLocked === '1';

  const { data: visitRows } = useVisit(visitId);
  const visit = visitRows?.[0];
  const { data: apiaryColonies } = useColonies(visit?.apiaryId);

  const [selectedColonyId, setSelectedColonyId] = useState(params.colonyId || '');
  const selectedColony = apiaryColonies?.find((c) => c.id === selectedColonyId);

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

  const openTypes = DETAIL_RECORD_TYPES.filter((t) => sections[t.recordType]);
  const closedTypes = DETAIL_RECORD_TYPES.filter((t) => !sections[t.recordType]);
  const general = sections.general_observation ?? EMPTY_INPUT_STATE;

  const setSection = (recordType: RecordType, next: FieldInputState) => setSections((prev) => ({ ...prev, [recordType]: next }));

  const handleSave = async () => {
    if (!selectedColonyId) return;

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

    setSaving(true);
    try {
      await createVoiceCapture({
        visitId,
        colonyId: selectedColonyId,
        sections: built,
        notes: notes.trim() || null,
        rawTranscript: transcript,
        aiConfidenceScore: confidenceScore,
        audioLocalUri: params.audioLocalUri ?? null,
        audioDurationSec: params.audioDurationSec ? Number(params.audioDurationSec) : null,
        photos,
        aiDraftColonyId,
        aiDraftNotes,
      });
      await upsertVisitColonyStatus(visitId, selectedColonyId, 'done');
      router.replace({
        pathname: '/visits/[visitId]/saved',
        params: {
          visitId,
          colonyId: selectedColonyId,
          recordTypeTitle: built.map((s) => RECORD_TYPE_LABELS[s.recordType]).join('·'),
        },
      });
    } finally {
      setSaving(false);
    }
  };

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
            <View>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                {selectedColonyId ? '감지된 봉군' : '어느 봉군인가요?'}
              </Text>
              {!selectedColonyId && (
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}>
                  말씀하신 봉군을 정확히 찾지 못했어요. 아래에서 선택해주세요.
                </Text>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
                {apiaryColonies?.map((c) => (
                  <Chip key={c.id} label={c.alias} selected={selectedColonyId === c.id} onPress={() => setSelectedColonyId(c.id)} />
                ))}
              </View>
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

          <PhotoPicker photos={photos} onChange={setPhotos} />
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={{ padding: spacing.xl }}>
        <Button label="검토 완료 · 저장" onPress={handleSave} loading={saving} disabled={!selectedColonyId} />
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
