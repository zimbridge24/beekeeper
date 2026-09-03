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

  return { state, detect };
}
