import * as Location from 'expo-location';

export type DeviceLocation = { latitude: number; longitude: number };

// Non-hook variant of useCurrentLocation, for call sites that aren't React
// components (repository functions) or that just want a best-effort
// coordinate without wiring up the hook's loading/denied/error states.
// Never throws — returns null on any denial or failure, since callers treat
// visit-time location as a nice-to-have that falls back to the apiary's
// registered coordinates, not a hard requirement.
export async function getDeviceLocation(): Promise<DeviceLocation | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}
