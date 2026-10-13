import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import type { LevelPoint } from '../features/health/facts';
import { STRENGTH_LABEL } from '../features/health/facts';
import { statusColors, colors, fontFamilies, fontSizes } from '../theme/tokens';

const HEIGHT = 150;
const PAD_Y = 18;
const PAD_X = 14;
const LABEL_WIDTH = 34;
const ANOMALY_COLOR = statusColors.danger.text;

// 봉세 단계별 점 색 — 선 자체는 중립색이고, 약함만 눈에 띄게 한다.
const POINT_COLOR: Record<number, string> = {
  3: statusColors.normal.text,
  2: statusColors.observe.text,
  1: statusColors.caution.text,
};

// 봉세를 기록한 날의 점. anomaly가 true면 그날 특이점(이상 징후·응애·말벌·여왕벌 없음)이 있었다는 뜻.
export type TrendPoint = LevelPoint & { anomaly?: boolean };

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function yFor(rank: number): number {
  return PAD_Y + ((HEIGHT - PAD_Y * 2) * (3 - rank)) / 2;
}

function LegendDot({ color, ring, label }: { color: string; ring?: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: ring ? 'transparent' : color,
          borderWidth: ring ? 2 : 0,
          borderColor: color,
        }}
      />
      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

export function StrengthTrendChart({
  points,
  anomalyOnly = [],
}: {
  points: TrendPoint[];
  // 그날 봉세 기록은 없지만 특이점이 있었던 날 — 그래프 위쪽에 작은 빨간 점으로만 표시한다.
  anomalyOnly?: { at: number }[];
}) {
  const [width, setWidth] = useState(0);

  const times = [...points.map((p) => p.at), ...anomalyOnly.map((a) => a.at)];
  const tMin = times.length ? Math.min(...times) : 0;
  const tMax = times.length ? Math.max(...times) : 0;
  const xFor = (t: number) => {
    if (times.length <= 1 || tMax === tMin) return width / 2;
    return PAD_X + ((t - tMin) / (tMax - tMin)) * (width - PAD_X * 2);
  };

  const coords = points.map((p) => ({ x: xFor(p.at), y: yFor(p.rank), point: p }));
  const hasAnomaly = anomalyOnly.length > 0 || points.some((p) => p.anomaly);

  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: LABEL_WIDTH, height: HEIGHT }}>
          {[3, 2, 1].map((rank) => (
            <Text
              key={rank}
              style={{
                position: 'absolute',
                top: yFor(rank) - 8,
                fontFamily: fontFamilies.semibold,
                fontSize: fontSizes.xs,
                color: colors.textMuted,
              }}
            >
              {STRENGTH_LABEL[rank]}
            </Text>
          ))}
        </View>

        <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <>
              <Svg width={width} height={HEIGHT}>
                {[3, 2, 1].map((rank) => (
                  <Line
                    key={rank}
                    x1={0}
                    x2={width}
                    y1={yFor(rank)}
                    y2={yFor(rank)}
                    stroke={colors.border}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                ))}
                {coords.length > 1 && (
                  <Polyline
                    points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                )}
                {anomalyOnly.map((a) => (
                  <Circle key={`a-${a.at}`} cx={xFor(a.at)} cy={6} r={4.5} fill={ANOMALY_COLOR} />
                ))}
                {coords.map((c) => (
                  <Circle
                    key={c.point.at}
                    cx={c.x}
                    cy={c.y}
                    r={c.point.anomaly ? 6.5 : 5.5}
                    fill={c.point.anomaly ? ANOMALY_COLOR : POINT_COLOR[c.point.rank]}
                    stroke={c.point.anomaly ? ANOMALY_COLOR : colors.surface}
                    strokeWidth={2}
                  />
                ))}
              </Svg>
              {times.length > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>
                    {formatDate(tMin)}
                  </Text>
                  {times.length > 1 && tMax !== tMin && (
                    <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>
                      {formatDate(tMax)}
                    </Text>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, paddingLeft: LABEL_WIDTH }}>
        <LegendDot color={POINT_COLOR[3]} label="강함" />
        <LegendDot color={POINT_COLOR[2]} label="보통" />
        <LegendDot color={POINT_COLOR[1]} label="약함" />
        {hasAnomaly && <LegendDot color={ANOMALY_COLOR} label="특이점 있던 날" />}
      </View>
    </View>
  );
}
