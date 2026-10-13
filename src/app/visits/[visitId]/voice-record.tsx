import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';

import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import { BackChevronIcon, CheckIcon, MicIcon } from '../../../components/icons';
import { Button } from '../../../components/Button';
import { Chip } from '../../../components/Chip';
import { Screen } from '../../../components/Screen';
import {
  addPendingCapture,
  listPendingCaptures,
  processPendingCapture,
  reviewParamsFor,
} from '../../../features/voice/pendingCaptures';
import { useColony } from '../../../repositories/colonyRepository';
import { useApiaryColoniesWithVisitStatus, useVisit } from '../../../repositories/visitRepository';
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
  // resumeCaptureId가 있으면 "나중에 처리"로 남겨 둔 녹음을 다시 정리하러 온 것 — 녹음 단계를 건너뛰고
  // 바로 변환·분석을 이어간다.
  const {
    visitId,
    colonyId: initialColonyId,
    resumeCaptureId,
    savedAlias,
  } = useLocalSearchParams<{ visitId: string; colonyId?: string; resumeCaptureId?: string; savedAlias?: string }>();
  const { data: visitRows } = useVisit(visitId);
  const visit = visitRows?.[0];
  // 기록할 봉군. 봉군 상세·목록·"다음도 기록하기"에서 들어오면 정해져 있고, 비어 있으면 말한 내용에서 AI가
  // 찾는다. 녹음 전에 화면에서 바꿀 수 있다 — 어느 봉군에 남는지가 항상 눈에 보이게 한다.
  const [targetColonyId, setTargetColonyId] = useState(initialColonyId || '');
  const [picking, setPicking] = useState(false);
  const { data: lockedColonyRows } = useColony(targetColonyId || undefined);
  const lockedColony = lockedColonyRows?.[0];
  const { data: colonyStatusRows } = useApiaryColoniesWithVisitStatus(visit?.apiaryId, visitId);

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' });

  // 이어서 처리하러 온 경우(resumeCaptureId)에는 녹음 단계 없이 곧바로 "정리 중"으로 시작한다.
  const [stage, setStage] = useState<Stage>(resumeCaptureId ? 'transcribing' : 'idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  // 녹음이 끝나면 곧바로 기기 대기열에 올라간다 — 정리가 실패해도 이 id로 같은 녹음을 다시 돌린다.
  const [captureId, setCaptureId] = useState<string | null>(resumeCaptureId || null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 정리 도중 사용자가 화면을 나가도 처리는 계속되는데, 끝난 뒤 엉뚱한 화면을 덮어쓰지 않게 한다.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const runCapture = async (id: string) => {
    try {
      const result = await processPendingCapture(id, (next) => {
        if (mountedRef.current) setStage(next);
      });
      const capture = (await listPendingCaptures()).find((c) => c.id === id);
      if (!capture) throw new Error('저장된 녹음을 찾을 수 없어요.');
      if (!mountedRef.current) return;
      // 녹음 직후 흐름(= 이어서 처리하러 온 게 아님)이면 저장 뒤 바로 다음 봉군 녹음으로 넘어가게 표시한다.
      router.replace({
        pathname: '/visits/[visitId]/voice-review',
        params: { ...reviewParamsFor(capture, result), ...(resumeCaptureId ? {} : { autoNext: '1' }) },
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStage('error');
    }
  };

  const processCapture = (id: string) => {
    setErrorMessage('');
    setStage('transcribing');
    return runCapture(id);
  };

  useEffect(() => {
    if (resumeCaptureId) void runCapture(resumeCaptureId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!uri) throw new Error('녹음 파일을 찾을 수 없어요.');

      // 변환·분석보다 먼저 기기 대기열에 올린다. 이 시점부터는 인터넷이 끊기거나 앱이 꺼져도 녹음이 남는다.
      setStage('transcribing');
      const capture = await addPendingCapture({
        visitId,
        apiaryId: visit?.apiaryId ?? '',
        lockedColonyId: targetColonyId || null,
        audioUri: uri,
        durationSec,
      });
      setCaptureId(capture.id);
      await processCapture(capture.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStage('error');
    }
  };

  // 정리에 실패했지만 녹음은 대기열에 있다 — 같은 녹음을 다시 돌린다. 대기열에 못 올린 경우(captureId 없음)만
  // 처음부터 다시 녹음한다.
  const retry = () => {
    if (captureId) {
      void processCapture(captureId);
      return;
    }
    setErrorMessage('');
    setStage('idle');
  };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const handleBack = () => {
    if (stage === 'recording') {
      Alert.alert('녹음을 그만할까요?', '지금 나가면 이번 녹음은 저장되지 않아요.', [
        { text: '계속 녹음', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: leave },
      ]);
      return;
    }
    leave();
  };

  const busy = stage === 'transcribing' || stage === 'structuring';
  const offlineError = errorMessage.startsWith('인터넷에 연결');
  const headerTitle = lockedColony ? lockedColony.alias : '음성으로 내검하기';

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
        <Pressable onPress={handleBack} hitSlop={12} style={{ width: 40 }}>
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
        {!picking && (
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
        )}
        {stage === 'idle' && savedAlias ? (
          <View style={{ backgroundColor: '#E1F1E8', borderRadius: radius.cardMedium, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: '#2C7A57' }}>
              ✓ {savedAlias} 저장됐어요 · 이어서 다음 봉군을 기록해요
            </Text>
          </View>
        ) : null}

        {(stage === 'idle' || stage === 'recording') && (
          <View
            style={[
              { backgroundColor: colors.surface, borderRadius: radius.cardMedium, padding: spacing.lg, gap: spacing.md },
              shadows.cardSmall,
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: colors.textMuted }}>기록할 봉군</Text>
                <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xl, color: colors.textPrimary, marginTop: 2 }}>
                  {lockedColony ? lockedColony.alias : '말씀하시면 자동으로 찾아요'}
                </Text>
                {!lockedColony && (
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 }}>
                    &quot;1번 봉군은…&quot;처럼 봉군 이름을 같이 말씀해 주세요
                  </Text>
                )}
              </View>
              {stage === 'idle' && (
                <Pressable onPress={() => setPicking((p) => !p)} hitSlop={10}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>
                    {picking ? '닫기' : lockedColony ? '바꾸기' : '직접 고르기'}
                  </Text>
                </Pressable>
              )}
            </View>
            {picking && stage === 'idle' && (
              <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  <Chip
                    label="말해서 알려줄게요"
                    selected={!targetColonyId}
                    onPress={() => {
                      setTargetColonyId('');
                      setPicking(false);
                    }}
                  />
                  {[...(colonyStatusRows ?? [])]
                    .sort((x, y) => Number(x.colony.internalCode) - Number(y.colony.internalCode))
                    .map(({ colony, visitColony }) => (
                      <Chip
                        key={colony.id}
                        label={`${colony.alias}${visitColony?.status === 'done' ? ' ✓' : ''}`}
                        selected={targetColonyId === colony.id}
                        onPress={() => {
                          setTargetColonyId(colony.id);
                          setPicking(false);
                        }}
                      />
                    ))}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {stage === 'idle' && !lockedColony && !picking && (
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
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.lg, color: colors.textPrimary, textAlign: 'center' }}>
              {captureId && offlineError ? '지금은 정리할 수 없어요' : captureId ? '정리하지 못했어요' : '녹음을 저장하지 못했어요'}
            </Text>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: '#C1443A', textAlign: 'center' }}>
              {errorMessage}
            </Text>
            {captureId ? (
              <>
                <Text
                  style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}
                >
                  말씀하신 녹음은 이 기기에 안전하게 저장돼 있어요. 연결이 되면 알아서 정리해 두고, 홈에서 확인하고 저장할 수 있어요.
                </Text>
                <Button label="지금 다시 정리하기" onPress={retry} />
                <Button label="나중에 처리하기" variant="surface" onPress={leave} />
              </>
            ) : (
              <Button label="다시 녹음하기" onPress={retry} />
            )}
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
              {busy
                ? '화면을 나가도 정리는 계속돼요. 끝나면 홈에서 확인할 수 있어요'
                : '인터넷이 없어도 녹음은 이 기기에 안전하게 저장돼요'}
            </Text>
          </View>
        )}

        {(stage === 'idle' || stage === 'recording') && !picking && (
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
