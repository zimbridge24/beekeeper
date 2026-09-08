import { getRecordingPermissionsAsync } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { getCameraPermissionsAsync, getMediaLibraryPermissionsAsync } from 'expo-image-picker';
import { getForegroundPermissionsAsync } from 'expo-location';
import { Linking, Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Screen } from '../../../components/Screen';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

type PermissionRow = { label: string; status: 'granted' | 'denied' | 'undetermined' };

const STATUS_LABELS: Record<PermissionRow['status'], string> = {
  granted: '허용됨',
  denied: '거부됨',
  undetermined: '확인 안 함',
};

const STATUS_COLORS: Record<PermissionRow['status'], string> = {
  granted: '#2C7A57',
  denied: '#C1443A',
  undetermined: colors.textMuted,
};

export default function PermissionsScreen() {
  const [rows, setRows] = useState<PermissionRow[] | null>(null);

  useEffect(() => {
    Promise.all([getRecordingPermissionsAsync(), getCameraPermissionsAsync(), getMediaLibraryPermissionsAsync(), getForegroundPermissionsAsync()]).then(
      ([mic, camera, library, location]) => {
        setRows([
          { label: '마이크 (음성 내검)', status: mic.status },
          { label: '카메라 (사진 촬영)', status: camera.status },
          { label: '사진 보관함 (사진 첨부)', status: library.status },
          { label: '위치 (양봉장 위치, 방문 날씨)', status: location.status },
        ]);
      },
    );
  }, []);

  return (
    <Screen>
      <ScreenHeader title="권한" onBack={() => router.back()} />
      <Card size="large">
        <View style={{ gap: spacing.lg }}>
          {rows?.map((row) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                {row.label}
              </Text>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: STATUS_COLORS[row.status] }}>
                {STATUS_LABELS[row.status]}
              </Text>
            </View>
          ))}
          {rows === null && (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>불러오는 중...</Text>
          )}
        </View>
      </Card>

      <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
        권한을 바꾸려면 기기의 설정 앱으로 이동해야 해요.
      </Text>
      <Button label="설정 앱에서 변경하기" variant="surface" onPress={() => Linking.openSettings()} />
    </Screen>
  );
}
