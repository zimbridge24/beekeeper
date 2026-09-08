import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import { inspectionAIProvider, speechToTextProvider } from '../../../ai';
import { CheckIcon, MicIcon } from '../../../components/icons';
import { Screen } from '../../../components/Screen';
import { useColonies, useColony } from '../../../repositories/colonyRepository';
import { useVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

type Stage = 'idle' | 'recording' | 'transcribing' | 'structuring' | 'error';

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(totalSec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

const STAGE_HINT: Partial<Record<Stage, string>> = {
  idle: '마이크를 눌러 녹음을 시작하세요',
  recording: '내검 내용을 말씀해 주세요',
  transcribing: '음성을 인식하고 있어요',
  structuring: 'AI가 내용을 구조화하고 있어요',
};

export default function VoiceRecordScreen() {
  // colonyId가 있으면 봉군 상세 화면에서 들어온 것 — 그 봉군으로 고정하고 AI
  // 봉군 매칭은 건너뛴다. 없으면(홈 "오늘 내검 시작하기") 말한 내용에서 AI가
  // 봉군을 알아서 찾는다.
  const { visitId, colonyId: lockedColonyId } = useLocalSearchParams<{ visitId: string; colonyId?: string }>();
  const { data: visitRows } = useVisit(visitId);
  const visit = visitRows?.[0];
  const { data: lockedColonyRows } = useColony(lockedColonyId || undefined);
  const lockedColony = lockedColonyRows?.[0];
  const { data: apiaryColonies } = useColonies(visit?.apiaryId);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });

  const [stage, setStage] = useState<Stage>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert('마이크 권한 필요', '음성 내검을 사용하려면 마이크 접근을 허용해주세요.');
      return;
    }

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();

    setElapsedSec(0);
    setStage('recording');
    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
  };

  const stopAndAnalyze = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const durationSec = elapsedSec;

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('녹음 파일을 찾을 수 없습니다.');

      setStage('transcribing');
      const { transcript } = await speechToTextProvider.transcribe({ uri, durationSec });

      setStage('structuring');
      const structured = await inspectionAIProvider.structureInspection(
        transcript,
        lockedColonyId
          ? undefined
          : { colonies: (apiaryColonies ?? []).map((c) => ({ id: c.id, label: `${c.internalCode}번 ${c.alias}` })) },
      );

      router.replace({
        pathname: '/visits/[visitId]/voice-review',
        params: {
          visitId,
          colonyId: lockedColonyId || structured.colonyId || '',
          colonyLocked: lockedColonyId ? '1' : '0',
          recordType: structured.recordType,
          values: JSON.stringify(structured.values),
          notes: structured.notes ?? '',
          transcript,
          confidenceScore: String(structured.confidenceScore),
          audioLocalUri: uri,
          audioDurationSec: String(durationSec),
        },
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStage('error');
    }
  };

  const retry = () => {
    setErrorMessage('');
    setStage('idle');
  };

  const headerTitle = lockedColony ? `${lockedColony.alias} 음성 내검` : '음성으로 내검하기';

  return (
    <Screen dark scroll={false} padded={false}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={stage === 'transcribing' || stage === 'structuring'}>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: '#B7C2B2' }}>취소</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxl, paddingHorizontal: spacing.xxxl }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display3, color: colors.surface, textAlign: 'center' }}>
          {headerTitle}
        </Text>

        {stage === 'error' ? (
          <>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: '#F0A6A0', textAlign: 'center' }}>
              분석에 실패했어요{'\n'}
              {errorMessage}
            </Text>
            <Pressable
              onPress={retry}
              style={{
                paddingVertical: spacing.md,
                paddingHorizontal: spacing.xxl,
                borderRadius: 999,
                backgroundColor: colors.primary,
              }}
            >
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.surface }}>다시 시도</Text>
            </Pressable>
          </>
        ) : (
          <>
            {stage === 'idle' && !lockedColony && (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: spacing.lg, gap: spacing.xs }}>
                <Text
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: fontSizes.xs,
                    color: '#E0A75E',
                    textAlign: 'center',
                  }}
                >
                  한 번에 한 봉군씩 말씀해주세요
                </Text>
                <Text
                  style={{
                    fontFamily: fontFamilies.semibold,
                    fontSize: fontSizes.bodySm,
                    color: '#C7D2C2',
                    textAlign: 'center',
                    lineHeight: 20,
                  }}
                >
                  예: &quot;1번봉군 여왕벌 확인했고{'\n'}봉세는 괜찮은데 응애가 좀 보였어요&quot;
                </Text>
              </View>
            )}

            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: '#9CAB95', textAlign: 'center' }}>
              {STAGE_HINT[stage]}
            </Text>

            {stage === 'recording' && (
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display1, color: colors.surface }}>
                {formatDuration(elapsedSec)}
              </Text>
            )}

            {stage === 'transcribing' || stage === 'structuring' ? (
              <ActivityIndicator size="large" color={colors.surface} />
            ) : (
              <Pressable
                onPress={stage === 'idle' ? startRecording : stopAndAnalyze}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: stage === 'recording' ? colors.accent : colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {stage === 'recording' ? <CheckIcon /> : <MicIcon />}
              </Pressable>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
