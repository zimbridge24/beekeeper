import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useCurrentLocation } from '../location/useCurrentLocation';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../theme/tokens';
import { Button } from './Button';
import { TextField } from './TextField';

export type ApiaryFormValues = {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  initial?: Partial<ApiaryFormValues>;
  submitLabel: string;
  onSubmit: (values: ApiaryFormValues) => Promise<void> | void;
  saving?: boolean;
};

export function ApiaryForm({ initial, submitLabel, onSubmit, saving }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const { state: locationState, detect } = useCurrentLocation();

  const handleDetect = async () => {
    await detect();
  };

  // Auto-detect on mount for a brand-new apiary (no saved location yet) so
  // the user doesn't have to tap first. Never auto-run when editing an
  // existing apiary (`initial` has coordinates) — that would silently
  // overwrite its saved location with wherever the device happens to be
  // the moment the edit screen opens.
  useEffect(() => {
    if (initial?.latitude == null || initial?.longitude == null) {
      void detect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived, not synced via effect: once a detection succeeds, its result
  // *is* the location for every subsequent render — no need to copy it into
  // a second piece of state (and no risk of the copy going stale).
  const initialLocation =
    initial?.latitude != null && initial?.longitude != null
      ? { latitude: initial.latitude, longitude: initial.longitude, address: initial.address ?? null }
      : null;
  const location = locationState.status === 'success' ? locationState : initialLocation;

  return (
    <View style={{ gap: spacing.xl }}>
      <TextField label="양봉장 이름" value={name} onChangeText={setName} placeholder="예) 햇살양봉장" />

      <View>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>위치</Text>
        <Pressable onPress={handleDetect} disabled={locationState.status === 'loading'}>
          <View
            style={{
              marginTop: spacing.xs,
              backgroundColor: colors.surfaceTint,
              borderRadius: radius.cardMedium,
              padding: spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, flexShrink: 0 }} />
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.body, color: colors.primary, flex: 1 }}>
              {locationState.status === 'loading'
                ? '위치 확인 중...'
                : location
                  ? `현재 위치로 자동 감지됨 · ${location.address ?? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`}`
                  : locationState.status === 'denied'
                    ? '위치 권한이 거부되었어요 · 탭하여 다시 시도'
                    : locationState.status === 'error'
                      ? '위치를 가져오지 못했어요 · 탭하여 다시 시도'
                      : '탭하여 현재 위치 자동 감지'}
            </Text>
          </View>
        </Pressable>
      </View>

      <Button
        label={submitLabel}
        loading={saving}
        disabled={!name.trim()}
        onPress={() =>
          onSubmit({
            name: name.trim(),
            address: location?.address ?? null,
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
          })
        }
      />
    </View>
  );
}
