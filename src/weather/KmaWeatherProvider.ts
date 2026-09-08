import { invokeEdgeFunction } from '../supabase/edgeFunctionClient';
import { WeatherProvider, WeatherSnapshot } from './WeatherProvider';

// 실제 관측 스냅샷을 Supabase Edge Function(weather-snapshot)에 위임한다.
// 기상청 공공데이터 서비스키는 클라이언트에 절대 두지 않고 Edge Function
// 환경변수로만 보관한다.
export class KmaWeatherProvider implements WeatherProvider {
  async fetchSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot> {
    return invokeEdgeFunction<WeatherSnapshot>('weather-snapshot', { latitude, longitude });
  }
}
