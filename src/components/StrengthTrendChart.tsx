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

// 봉세 단계별 점 색 — 선 자체는 중립색이고, 약함만 눈에 띄게 한다.
const POINT_COLOR: Record<number, string> = {
  3: statusColors.normal.text,
  2: statusColors.observe.text,
  1: statusColors.caution.text,
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function yFor(rank: number): number {
  return PAD_Y + ((HEIGHT - PAD_Y * 2) * (3 - rank)) / 2;
}

export function StrengthTrendChart({ points }: { points: LevelPoint[] }) {
  const [width, setWidth] = useState(0);

  const tMin = points.length ? points[0].at : 0;
  const tMax = points.length ? points[points.length - 1].at : 0;
  const xFor = (t: number) => {
    if (points.length <= 1 || tMax === tMin) return width / 2;
    return PAD_X + ((t - tMin) / (tMax - tMin)) * (width - PAD_X * 2);
  };

  const coords = points.map((p) => ({ x: xFor(p.at), y: yFor(p.rank), point: p }));

  return (
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
              {coords.map((c) => (
                <Circle
                  key={c.point.at}
                  cx={c.x}
                  cy={c.y}
                  r={5.5}
                  fill={POINT_COLOR[c.point.rank]}
                  stroke={colors.surface}
                  strokeWidth={2}
                />
              ))}
            </Svg>
            {points.length > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted }}>
                  {formatDate(tMin)}
                </Text>
                {points.length > 1 && (
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
  );
}
