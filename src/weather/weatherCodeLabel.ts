// weather_code는 "PTY{n}_SKY{n}" 형태로 저장된다 (supabase/functions/weather-snapshot
// 참고). 강수형태(PTY)가 있으면 그걸 우선 보여주고, 없으면(PTY0/맑은 날) 하늘상태(SKY)를 쓴다.
const PTY_LABELS: Record<string, string> = {
  '1': '비',
  '2': '비/눈',
  '3': '눈',
  '5': '빗방울',
  '6': '빗방울날림',
  '7': '눈날림',
};

const SKY_LABELS: Record<string, string> = {
  '1': '맑음',
  '3': '구름많음',
  '4': '흐림',
};

export function weatherCodeLabel(weatherCode: string | null | undefined): string | null {
  if (!weatherCode) return null;
  const pty = weatherCode.match(/PTY(\d+)/)?.[1];
  if (pty && PTY_LABELS[pty]) return PTY_LABELS[pty];
  const sky = weatherCode.match(/SKY(\d+)/)?.[1];
  if (sky && SKY_LABELS[sky]) return SKY_LABELS[sky];
  return null;
}
