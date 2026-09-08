export type WeatherSnapshot = {
  observedAt: number; // epoch ms — when the reading is FOR (may lag "now" slightly)
  temperatureC: number | null;
  humidityPercent: number | null;
  precipitationMm: number | null;
  windSpeedMs: number | null;
  weatherCode: string | null; // provider-specific raw code, kept for later reference
  source: string; // e.g. 'kma' — required so mixed-source data stays analyzable later
};

export interface WeatherProvider {
  fetchSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot>;
}

// 업체 미설정 상태에서도 앱이 깨지지 않도록 두는 mock — 실제 관측값 없이 null
// 필드만 채운 스냅샷을 반환한다.
export class MockWeatherProvider implements WeatherProvider {
  async fetchSnapshot(): Promise<WeatherSnapshot> {
    return {
      observedAt: Date.now(),
      temperatureC: null,
      humidityPercent: null,
      precipitationMm: null,
      windSpeedMs: null,
      weatherCode: null,
      source: 'mock',
    };
  }
}
