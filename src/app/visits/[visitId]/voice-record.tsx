import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import { inspectionAIProvider, speechToTextProvider } from '../../../ai';
import { BackChevronIcon, CheckIcon, MicIcon } from '../../../components/icons';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import { useColonies, useColony } from '../../../repositories/colonyRepository';
import { useVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '../../../theme/tokens';

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

const STAGE_TITLE: Partial<Record<Stage, string>> = {
  idle: '마이크를 눌러 녹음을 시작하세요',
  recording: '말씀을 기록하고 있어요',
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
          // AI가 실제로 추측한 값 그대로 — 잠금 모드에서는 애초에 봉군 매칭을
          // 안 시켰으니 항상 빈 값. colonyId(위)는 화면에 처음 보여줄 선택값일
          // 뿐이고, 이건 "AI가 정말 뭐라고 했는지" 원본 기록용으로 따로 둔다.
          aiDraftColonyId: structured.colonyId ?? '',
          colonyLocked: lockedColonyId ? '1' : '0',
          drafts: JSON.stringify(structured.drafts),
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

  const busy = stage === 'transcribing' || stage === 'structuring';
  const headerTitle = lockedColony ? lockedColony.alias : '음성으로 내검하기';

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
        <Pressable onPress={() => router.back()} hitSlop={12} disabled={busy} style={{ width: 40 }}>
          <BackChevronIcon />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.lg, color: colors.textPrimary }}>
            {headerTitle}
          </Text>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 }}>
            음성 내검
          </Text>
        </View>
        <Text
          style={{ width: 40, fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textSecondary, textAlign: 'right' }}
        >
          {stage === 'recording' ? formatDuration(elapsedSec) : ''}
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Image
            source={require('../../../../assets/beehero-character2.png')}
            style={{ width: 96, height: 96 }}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            {/* Border-triangle tails have no real backing box, so Android's
                elevation shadow ignores them entirely — a small rotated
                square (mostly hidden behind the bubble, tip peeking out)
                is a real filled view, so it picks up the same shadow. */}
            <View
              style={[
                {
                  position: 'absolute',
                  left: -6,
                  top: '50%',
                  marginTop: -6,
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  backgroundColor: colors.surface,
                  transform: [{ rotate: '45deg' }],
                },
                shadows.cardSmall,
              ]}
            />
            <View style={[{ backgroundColor: colors.surface, borderRadius: radius.cardMedium, padding: spacing.lg }, shadows.cardSmall]}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.textPrimary, lineHeight: 22 }}>
                함께 만드는{'\n'}건강한 꿀벌의 내일
              </Text>
            </View>
          </View>
        </View>

        {stage === 'idle' && !lockedColony && (
          <View style={{ backgroundColor: colors.surfaceTint, borderRadius: radius.cardMedium, padding: spacing.lg, gap: spacing.xs }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: colors.primary, textAlign: 'center' }}>
              한 번에 한 봉군씩 말씀해주세요
            </Text>
            <Text
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: fontSizes.bodySm,
                color: colors.textSecondary,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              예: &quot;1번봉군 여왕벌 확인했고{'\n'}봉세는 괜찮은데 응애가 좀 보였어요&quot;
            </Text>
          </View>
        )}

        {stage === 'error' ? (
          <View
            style={[
              { backgroundColor: colors.surface, borderRadius: radius.cardLarge, padding: spacing.xxl, alignItems: 'center', gap: spacing.lg },
              shadows.cardLarge,
            ]}
          >
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: '#C1443A', textAlign: 'center' }}>
              분석에 실패했어요{'\n'}
              {errorMessage}
            </Text>
            <Button label="다시 시도" onPress={retry} />
          </View>
        ) : (
          <View
            style={[
              { backgroundColor: colors.surface, borderRadius: radius.cardLarge, padding: spacing.xxl, alignItems: 'center', gap: spacing.md },
              shadows.cardLarge,
            ]}
          >
            {stage === 'recording' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#C1443A' }} />
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: colors.textMuted }}>듣고 있어요</Text>
              </View>
            )}

            {busy ? (
              <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : (
              <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
                {stage === 'recording' && (
                  <View
                    style={{
                      position: 'absolute',
                      width: 112,
                      height: 112,
                      borderRadius: 56,
                      backgroundColor: 'rgba(224,138,60,0.18)',
                    }}
                  />
                )}
                <Pressable
                  onPress={stage === 'idle' ? startRecording : undefined}
                  disabled={stage !== 'idle'}
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 44,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {stage === 'recording' ? <CheckIcon /> : <MicIcon />}
                </Pressable>
              </View>
            )}

            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.lg, color: colors.textPrimary, textAlign: 'center' }}>
              {STAGE_TITLE[stage]}
            </Text>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted, textAlign: 'center' }}>
              인터넷이 없어도 음성은 안전하게 저장돼요
            </Text>
          </View>
        )}

        {(stage === 'idle' || stage === 'recording') && (
          <View
            style={[
              { backgroundColor: colors.surface, borderRadius: radius.cardMedium, padding: spacing.lg },
              shadows.cardSmall,
            ]}
          >
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: 4 }}>예:</Text>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 21 }}>
              &quot;12번 통 여왕 확인했고 봉세는 보통이에요. 말벌 세 마리 봤고, 응애 검사는 오늘 안 했어요. 설탕물 1리터
              줬어요.&quot;
            </Text>
          </View>
        )}
      </View>

      {stage === 'recording' && (
        <View style={{ padding: spacing.xl }}>
          <Button label="기록 마치고 AI로 정리 ✨" onPress={stopAndAnalyze} />
        </View>
      )}
    </Screen>
  );
}
