// Fetches a best-effort weather snapshot for a lat/lon from the Korea
// Meteorological Administration's own API Hub (기상청 API허브,
// apihub.kma.go.kr), and returns it in a provider-agnostic shape. Called
// once per visit, right when the visit is created, so the reading reflects
// conditions AT inspection time rather than being looked up later — see
// src/repositories/visitRepository.ts's captureVisitContext().
//
// Deploy: supabase functions deploy weather-snapshot
// Required secrets (supabase secrets set ...):
//   KMA_SERVICE_KEY — apihub.kma.go.kr authKey, from applying to "동네예보
//                     (초단기실황·초단기예보·단기예보) 조회" → 4.1
//                     초단기실황조회 + 4.2 초단기예보조회 (VilageFcstInfoService_2.0).
//                     Not data.go.kr — this is KMA's own portal, different
//                     host and query param name (authKey, not serviceKey).
//
// Uses two endpoints against the same 5km grid cell:
//   getUltraSrtNcst (초단기실황) — actual observed temp/humidity/rain/wind,
//     published hourly at :30, safely available from :45.
//   getUltraSrtFcst (초단기예보) — only used for SKY (하늘상태: 맑음/구름많음/
//     흐림), which the observation endpoint doesn't include. Best-effort —
//     if this call fails the snapshot still saves with PTY-only weatherCode.

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// Lat/lon -> KMA 5km Lambert Conformal Conic grid (nx, ny). Standard KMA
// conversion constants/algorithm — see 기상청 단기예보 조회서비스 Open API
// 활용가이드.
const RE = 6371.00877;
const GRID = 5.0;
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 43;
const YO = 136;

function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// KMA publishes each hour's reading at :30 past that hour and it's safely
// queryable ~15min later — before that, the previous hour's base_time must
// be used or the API returns NO_DATA. Deno Deploy runs in UTC, so this
// works entirely in "UTC shifted by +9h" space to get correct KST wall-clock
// components regardless of the runtime's local timezone.
function getKmaBaseDateTime(nowUtc: Date): { base_date: string; base_time: string; observedAtMs: number } {
  const kst = new Date(nowUtc.getTime() + 9 * 60 * 60 * 1000);
  if (kst.getUTCMinutes() < 45) {
    kst.setUTCHours(kst.getUTCHours() - 1);
  }
  kst.setUTCMinutes(0, 0, 0);

  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');

  return {
    base_date: `${yyyy}${mm}${dd}`,
    base_time: `${hh}00`,
    observedAtMs: kst.getTime() - 9 * 60 * 60 * 1000,
  };
}

type KmaItem = { category: string; obsrValue?: string; fcstValue?: string };

const KMA_BASE = 'https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0';

async function fetchKmaItems(
  endpoint: 'getUltraSrtNcst' | 'getUltraSrtFcst',
  authKey: string,
  nx: number,
  ny: number,
  baseDate: string,
  baseTime: string,
  numOfRows: number,
): Promise<KmaItem[]> {
  const url =
    `${KMA_BASE}/${endpoint}?authKey=${encodeURIComponent(authKey)}&pageNo=1&numOfRows=${numOfRows}` +
    `&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

  const res = await fetch(url);
  const text = await res.text();
  // The API returns XML (not JSON) for auth/quota errors even though
  // dataType=JSON was requested — surface that clearly rather than a raw
  // JSON.parse crash.
  let json: { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: { item?: KmaItem | KmaItem[] } } } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KMA ${endpoint} returned non-JSON: ${text.slice(0, 200)}`);
  }

  const resultCode = json.response?.header?.resultCode;
  if (resultCode !== '00') {
    throw new Error(`KMA ${endpoint} error ${resultCode}: ${json.response?.header?.resultMsg}`);
  }

  const item = json.response?.body?.items?.item;
  return Array.isArray(item) ? item : item ? [item] : [];
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const authKey = Deno.env.get('KMA_SERVICE_KEY');
  if (!authKey) return jsonResponse({ error: 'KMA_SERVICE_KEY not configured' }, 500);

  let latitude: number | undefined;
  let longitude: number | undefined;
  try {
    const body = await req.json();
    latitude = body.latitude;
    longitude = body.longitude;
  } catch {
    return jsonResponse({ error: 'expected JSON body { latitude: number, longitude: number }' }, 400);
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return jsonResponse({ error: 'missing latitude/longitude' }, 400);
  }

  const { nx, ny } = latLonToGrid(latitude, longitude);
  const { base_date, base_time, observedAtMs } = getKmaBaseDateTime(new Date());

  try {
    const [ncstItems, fcstItems] = await Promise.all([
      fetchKmaItems('getUltraSrtNcst', authKey, nx, ny, base_date, base_time, 10),
      fetchKmaItems('getUltraSrtFcst', authKey, nx, ny, base_date, base_time, 100).catch(() => [] as KmaItem[]),
    ]);

    const byCategory = (items: KmaItem[], category: string) => items.find((i) => i.category === category);

    const t1h = byCategory(ncstItems, 'T1H')?.obsrValue;
    const reh = byCategory(ncstItems, 'REH')?.obsrValue;
    const rn1 = byCategory(ncstItems, 'RN1')?.obsrValue;
    const wsd = byCategory(ncstItems, 'WSD')?.obsrValue;
    const pty = byCategory(ncstItems, 'PTY')?.obsrValue;
    // SKY(하늘상태: 1 맑음/3 구름많음/4 흐림)는 실황 API에 없어 초단기예보의
    // 가장 가까운 시각 값을 쓴다.
    const sky = byCategory(fcstItems, 'SKY')?.fcstValue;

    const weatherCode = [pty !== undefined ? `PTY${pty}` : null, sky !== undefined ? `SKY${sky}` : null]
      .filter(Boolean)
      .join('_');

    return jsonResponse(
      {
        observedAt: observedAtMs,
        temperatureC: t1h !== undefined ? Number(t1h) : null,
        humidityPercent: reh !== undefined ? Number(reh) : null,
        // "강수없음"은 관측값이 "0"으로 오지만, 방어적으로 파싱 실패 시 0으로 처리.
        precipitationMm: rn1 !== undefined ? Number(rn1) || 0 : null,
        windSpeedMs: wsd !== undefined ? Number(wsd) : null,
        weatherCode: weatherCode || null,
        source: 'kma',
      },
      200,
    );
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});
