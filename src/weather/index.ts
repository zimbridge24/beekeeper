import { KmaWeatherProvider } from './KmaWeatherProvider';
import { MockWeatherProvider, WeatherProvider } from './WeatherProvider';

// EXPO_PUBLIC_WEATHER_PROVIDER=kma (기본값: mock)
const WEATHER_PROVIDER = process.env.EXPO_PUBLIC_WEATHER_PROVIDER ?? 'mock';

function createWeatherProvider(): WeatherProvider {
  switch (WEATHER_PROVIDER) {
    case 'kma':
      return new KmaWeatherProvider();
    default:
      return new MockWeatherProvider();
  }
}

export const weatherProvider: WeatherProvider = createWeatherProvider();

export type { WeatherSnapshot } from './WeatherProvider';
