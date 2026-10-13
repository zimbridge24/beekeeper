import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

type LocationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; latitude: number; longitude: number; address: string | null }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ status: 'idle' });

  const detect = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState({ status: 'denied' });
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const places = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }).catch(() => [] as Location.LocationGeocodedAddress[]);
      const place = places[0];
      const address = place ? [place.region, place.city, place.district].filter(Boolean).join(' ') : null;
      setState({
        status: 'success',
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        address,
      });
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // 권한 창을 띄우지 않고, 이미 허용돼 있을 때만 위치를 읽는다 — 설명 없이 시스템 권한 창이 뜨는 걸 피하려고
  // 화면이 열릴 때는 이쪽을 쓰고, 처음 허용은 사용자가 설명을 읽고 버튼을 눌렀을 때 detect()로 받는다.
  const detectIfAllowed = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') await detect();
    } catch {
      // 권한 상태를 못 읽으면 조용히 넘어가고, 사용자가 직접 누르면 된다.
    }
  }, [detect]);

  return { state, detect, detectIfAllowed };
}
