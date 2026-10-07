import { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type { AnalysisConfidence, PhotoQuality } from '../ai';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

const CONFIDENCE_LABEL: Record<AnalysisConfidence, string> = { low: '낮음', medium: '보통', high: '높음' };
const CONFIDENCE_TONE = { low: 'caution', medium: 'observe', high: 'normal' } as const;
const QUALITY_LABEL: Record<PhotoQuality, string> = { good: '양호', fair: '보통', poor: '나쁨' };
const QUALITY_TONE = { good: 'normal', fair: 'observe', poor: 'danger' } as const;

type Props = {
  // 맨 위 큰 문구 — 예: "응애 추정 개체수: 17마리".
  headline: string;
  // headline 아래 보조 줄들 — 예: "추정 범위 14~21마리".
  details?: string[];
  confidence: AnalysisConfidence;
  photoQuality: PhotoQuality;
  retakeNeeded: boolean;
  retakeReasons: string[];
  notes: string | null;
  isMock?: boolean;
  // 개발 환경에서 가짜/실제 AI 응답을 구분하기 위한 출처 정보.
  source?: { provider?: 'mock' | 'gemini'; model?: string; elapsedMs?: number };
  children?: ReactNode;
};

// 응애·말벌·월동 사진 판독 결과를 같은 모양으로 보여준다 — 추정값, 검출 신뢰도,
// 사진 품질, 재촬영 필요 여부. 어디까지나 "AI 추정"이라는 점을 항상 같이 알린다.
export function AIResultCard({ headline, details, confidence, photoQuality, retakeNeeded, retakeReasons, notes, isMock, source, children }: Props) {
  return (
    <Card size="large">
      <View style={{ gap: spacing.md }}>
        {isMock && (
          <View style={{ backgroundColor: '#FBEED9', borderRadius: 10, padding: spacing.sm }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: '#8A5A0F' }}>
              테스트용 가상 결과예요 — 실제 사진을 분석한 값이 아닙니다.
            </Text>
          </View>
        )}
        {__DEV__ && !isMock && source?.provider === 'gemini' && (
          <View style={{ backgroundColor: '#E1F1E8', borderRadius: 10, padding: spacing.sm }}>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: '#2C7A57' }}>
              [개발 확인] 실제 AI 응답 · Gemini {source.model ?? ''}
              {source.elapsedMs !== undefined ? ` · ${(source.elapsedMs / 1000).toFixed(1)}초` : ''}
            </Text>
          </View>
        )}
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display1, color: colors.textPrimary }}>{headline}</Text>
        {details?.map((line) => (
          <Text key={line} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>
            {line}
          </Text>
        ))}

        <View style={{ gap: spacing.xs }}>
          <Row label="검출 신뢰도">
            <StatusBadge tone={CONFIDENCE_TONE[confidence]} label={CONFIDENCE_LABEL[confidence]} />
          </Row>
          <Row label="사진 품질">
            <StatusBadge tone={QUALITY_TONE[photoQuality]} label={QUALITY_LABEL[photoQuality]} />
          </Row>
          <Row label="재촬영 필요 여부">
            <StatusBadge tone={retakeNeeded ? 'danger' : 'normal'} label={retakeNeeded ? '필요' : '없음'} />
          </Row>
        </View>

        {retakeReasons.length > 0 && (
          <View style={{ gap: 4 }}>
            {retakeReasons.map((reason) => (
              <Text key={reason} style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textPrimary, lineHeight: 20 }}>
                • {reason}
              </Text>
            ))}
          </View>
        )}

        {notes && (
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 18 }}>{notes}</Text>
        )}
        {children}
      </View>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary }}>{label}</Text>
      {children}
    </View>
  );
}
