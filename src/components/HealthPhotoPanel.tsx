import { Text, View } from 'react-native';

import { AnalysisStatus } from '../features/health/useAnalysis';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { Button } from './Button';
import { Card } from './Card';
import { PhotoPicker, PickedPhoto } from './PhotoPicker';

type Props = {
  // "이렇게 찍으면 잘 판독돼요" 촬영 요령 — 일정한 방식으로 찍을수록 AI 판독이 정확해진다.
  tipsTitle: string;
  tips: string[];
  photos: PickedPhoto[];
  onPhotosChange: (photos: PickedPhoto[]) => void;
  maxPhotos?: number;
  status: AnalysisStatus;
  error: string | null;
  analyzeLabel: string;
  onAnalyze: () => void;
  // 분석에 꼭 필요한 선택(예: 검사 방법)이 비어 있으면 버튼을 막고 이유를 보여준다.
  analyzeDisabled?: boolean;
  analyzeHint?: string;
};

export function HealthPhotoPanel({
  tipsTitle,
  tips,
  photos,
  onPhotosChange,
  maxPhotos = 3,
  status,
  error,
  analyzeLabel,
  onAnalyze,
  analyzeDisabled,
  analyzeHint,
}: Props) {
  return (
    <View style={{ gap: spacing.md }}>
      <Card size="medium" tint={colors.surfaceTint}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>{tipsTitle}</Text>
        <View style={{ gap: 4, marginTop: spacing.xs }}>
          {tips.map((tip) => (
            <Text key={tip} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 19 }}>
              • {tip}
            </Text>
          ))}
        </View>
      </Card>

      <PhotoPicker photos={photos} onChange={onPhotosChange} maxPhotos={maxPhotos} label={`사진 (최대 ${maxPhotos}장)`} quality={0.95} />

      {photos.length > 0 && (
        <Button
          label={status === 'done' ? '다시 분석하기' : analyzeLabel}
          variant="accent"
          onPress={onAnalyze}
          loading={status === 'running'}
          disabled={analyzeDisabled}
        />
      )}
      {photos.length > 0 && analyzeDisabled && analyzeHint && (
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: '#C0821E', textAlign: 'center' }}>{analyzeHint}</Text>
      )}
      {status === 'running' && (
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' }}>
          사진을 분석하고 있어요. 몇 초 걸릴 수 있어요.
        </Text>
      )}
      {status === 'error' && (
        <Card size="medium" tint="#FBE6E4">
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: '#C1443A' }}>AI 분석에 실패했어요</Text>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
            {error} — 아래에서 직접 입력해서 기록할 수 있어요.
          </Text>
        </Card>
      )}
    </View>
  );
}
