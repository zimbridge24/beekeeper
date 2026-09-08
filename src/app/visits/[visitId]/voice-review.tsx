import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Chip } from '../../../components/Chip';
import { PhotoPicker, PickedPhoto } from '../../../components/PhotoPicker';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { TextField } from '../../../components/TextField';
import { TriState, TriStateField } from '../../../components/TriStateField';
import { RecordType } from '../../../db/schema';
import { getFieldsForRecordType, RECORD_TYPE_LABELS } from '../../../features/records/recordTypesConfig';
import { useColonies } from '../../../repositories/colonyRepository';
import { createVoiceRecord, FieldValueState } from '../../../repositories/recordRepository';
import { upsertVisitColonyStatus, useVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../../../theme/tokens';

// 이 확신도 미만이면 "검토 필요" 배지를 보여준다.
const CONFIDENCE_REVIEW_THRESHOLD = 0.85;

export default function VoiceReviewScreen() {
  const params = useLocalSearchParams<{
    visitId: string;
    colonyId: string;
    colonyLocked: string;
    recordType: RecordType;
    values: string;
    notes: string;
    transcript: string;
    confidenceScore: string;
    audioLocalUri?: string;
    audioDurationSec?: string;
  }>();
  const { visitId, recordType, transcript } = params;
  const isLocked = params.colonyLocked === '1';

  const { data: visitRows } = useVisit(visitId);
  const visit = visitRows?.[0];
  const { data: apiaryColonies } = useColonies(visit?.apiaryId);

  const [selectedColonyId, setSelectedColonyId] = useState(params.colonyId || '');
  const selectedColony = apiaryColonies?.find((c) => c.id === selectedColonyId);

  const fields = getFieldsForRecordType(recordType);
  const confidenceScore = Number(params.confidenceScore) || 0;
  const needsReview = confidenceScore < CONFIDENCE_REVIEW_THRESHOLD;

  const [values, setValues] = useState<Record<string, TriState>>(() => {
    try {
      return JSON.parse(params.values) as Record<string, TriState>;
    } catch {
      return {};
    }
  });
  const [notes, setNotes] = useState(params.notes ?? '');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const setField = (key: string, state: TriState) => setValues((prev) => ({ ...prev, [key]: state }));

  const handleSave = async () => {
    if (!selectedColonyId) return;
    setSaving(true);
    try {
      await createVoiceRecord({
        visitId,
        colonyId: selectedColonyId,
        recordType,
        fields,
        values: values as Record<string, FieldValueState>,
        notes: notes.trim() || null,
        rawTranscript: transcript,
        aiConfidenceScore: confidenceScore,
        audioLocalUri: params.audioLocalUri ?? null,
        audioDurationSec: params.audioDurationSec ? Number(params.audioDurationSec) : null,
        photos,
      });
      await upsertVisitColonyStatus(visitId, selectedColonyId, 'done');
      router.replace({
        pathname: '/visits/[visitId]/saved',
        params: { visitId, colonyId: selectedColonyId, recordTypeTitle: RECORD_TYPE_LABELS[recordType] },
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
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                {selectedColony.alias}
              </Text>
            )
          ) : (
            <View>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
                {selectedColonyId ? '감지된 봉군' : '어느 봉군인가요?'}
              </Text>
              {!selectedColonyId && (
                <Text
                  style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, marginTop: 4 }}
                >
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
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                음성 인식 결과
              </Text>
              <View
                style={{
                  paddingVertical: 3,
                  paddingHorizontal: 9,
                  borderRadius: radius.pill,
                  backgroundColor: needsReview ? '#FBEED9' : '#E1F1E8',
                }}
              >
                <Text
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: fontSizes.xs,
                    color: needsReview ? '#C0821E' : '#2C7A57',
                  }}
                >
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

          <View style={{ gap: spacing.xl }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
              AI가 구조화한 내용 (확인 후 수정 가능)
            </Text>
            {fields.map((field) => (
              <TriStateField key={field.key} label={field.label} value={values[field.key]} onChange={(v) => setField(field.key, v)} />
            ))}
          </View>

          <TextField label="자유메모" value={notes} onChangeText={setNotes} placeholder="추가로 남길 내용" multiline />

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
