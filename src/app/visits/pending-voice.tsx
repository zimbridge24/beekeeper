import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import {
  MAX_AUTO_ATTEMPTS,
  PendingVoiceCapture,
  removePendingCapture,
  reviewParamsFor,
  usePendingVoiceCaptures,
} from '../../features/voice/pendingCaptures';
import { useColony } from '../../repositories/colonyRepository';
import { colors, fontFamilies, fontSizes, radius, spacing, statusColors } from '../../theme/tokens';

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatLength(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function PendingCard({ capture }: { capture: PendingVoiceCapture }) {
  const colonyId = capture.lockedColonyId ?? capture.result?.colonyId ?? undefined;
  const { data: colonyRows } = useColony(colonyId);
  const colonyName = colonyRows?.[0]?.alias ?? '봉군을 아직 못 찾았어요';
  const ready = capture.status === 'ready' && !!capture.result;

  const review = () => {
    if (!capture.result) return;
    router.push({ pathname: '/visits/[visitId]/voice-review', params: reviewParamsFor(capture, capture.result) });
  };

  const process = () => {
    router.push({
      pathname: '/visits/[visitId]/voice-record',
      params: {
        visitId: capture.visitId,
        resumeCaptureId: capture.id,
        ...(capture.lockedColonyId ? { colonyId: capture.lockedColonyId } : {}),
      },
    });
  };

  const confirmDelete = () => {
    Alert.alert('이 녹음을 삭제할까요?', '녹음 파일이 이 기기에서 지워지고, 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void removePendingCapture(capture.id, { deleteAudio: true }) },
    ]);
  };

  let status: string;
  if (ready) status = '정리가 끝났어요. 내용을 확인하고 저장만 하면 돼요';
  else if (capture.attempts >= MAX_AUTO_ATTEMPTS) status = `자동 정리가 여러 번 실패했어요${capture.lastError ? ` (${capture.lastError})` : ''}`;
  else if (capture.attempts > 0) status = `정리하지 못했어요${capture.lastError ? ` (${capture.lastError})` : ''}. 잠시 뒤 다시 시도해요`;
  else status = '정리를 기다리고 있어요. 인터넷이 닿으면 자동으로 정리해요';

  return (
    <Card size="large">
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
          <Text style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>{colonyName}</Text>
          <View
            style={{
              paddingVertical: 3,
              paddingHorizontal: 9,
              borderRadius: radius.pill,
              backgroundColor: ready ? '#E1F1E8' : '#FBEED9',
            }}
          >
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: ready ? '#2C7A57' : '#C0821E' }}>
              {ready ? '검토 대기' : '정리 대기'}
            </Text>
          </View>
        </View>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>
          {formatWhen(capture.createdAt)} · 녹음 {formatLength(capture.durationSec)}
        </Text>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>{status}</Text>
        {ready && capture.result?.transcript ? (
          <Text
            numberOfLines={2}
            style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 18 }}
          >
            “{capture.result.transcript}”
          </Text>
        ) : null}
        <View style={{ marginTop: spacing.xs, gap: spacing.sm }}>
          {ready ? <Button label="검토하고 저장하기" onPress={review} /> : <Button label="지금 정리하기" onPress={process} />}
          <Pressable onPress={confirmDelete} hitSlop={10} style={{ alignItems: 'center', paddingVertical: spacing.xs }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: statusColors.danger.text }}>이 녹음 삭제</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

export default function PendingVoiceScreen() {
  const captures = usePendingVoiceCaptures();
  // 정리가 끝난 것을 위로, 그다음 오래된 순.
  const sorted = [...captures].sort((a, b) => {
    const aReady = a.status === 'ready' ? 0 : 1;
    const bReady = b.status === 'ready' ? 0 : 1;
    return aReady - bReady || a.createdAt - b.createdAt;
  });

  return (
    <Screen>
      <ScreenHeader title="저장 대기 중인 음성" onBack={() => router.back()} />
      <Card size="medium" tint={colors.surfaceTint}>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.primary, lineHeight: 20 }}>
          녹음은 기록으로 저장하기 전까지 이 기기에 보관돼요. 인터넷이 닿으면 알아서 정리해 두니, 확인하고 저장만 하면 돼요.
        </Text>
      </Card>

      {sorted.length === 0 ? (
        <Card size="large">
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
            저장 대기 중인 음성이 없어요.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing.md }}>
          {sorted.map((capture) => (
            <PendingCard key={capture.id} capture={capture} />
          ))}
        </View>
      )}
    </Screen>
  );
}
