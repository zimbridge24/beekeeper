import * as ImagePicker from 'expo-image-picker';
import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Alert, Image, Pressable, Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes, radius, spacing } from '../theme/tokens';

export type PickedPhoto = { id: string; uri: string; width: number | null; height: number | null };

type Props = {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  maxPhotos?: number;
};

// 촬영/선택한 사진은 항상 document 디렉터리로 복사해둔다 — expo-image-picker의
// 원본 uri는 캐시 디렉터리를 가리킬 수 있고, 캐시는 OS가 임의로 비울 수 있어서
// (녹음 파일을 document에 저장한 것과 같은 이유).
async function persistPickedAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  const id = randomUUID();
  const dest = new File(Paths.document, `${id}.jpg`);
  await new File(asset.uri).copy(dest);
  return { id, uri: dest.uri, width: asset.width ?? null, height: asset.height ?? null };
}

export function PhotoPicker({ photos, onChange, maxPhotos = 5 }: Props) {
  const pickFrom = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        '권한 필요',
        source === 'camera' ? '사진을 촬영하려면 카메라 접근을 허용해주세요.' : '사진을 첨부하려면 사진 보관함 접근을 허용해주세요.',
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] });
    if (result.canceled || !result.assets?.[0]) return;

    const picked = await persistPickedAsset(result.assets[0]);
    onChange([...photos, picked]);
  };

  const handleAddPress = () => {
    Alert.alert('사진 추가', undefined, [
      { text: '카메라로 촬영', onPress: () => pickFrom('camera') },
      { text: '사진 보관함에서 선택', onPress: () => pickFrom('library') },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const handleRemove = (id: string) => onChange(photos.filter((p) => p.id !== id));

  return (
    <View>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>사진 (선택)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
        {photos.map((photo) => (
          <View key={photo.id} style={{ width: 72, height: 72 }}>
            <Image source={{ uri: photo.uri }} style={{ width: 72, height: 72, borderRadius: radius.cardSmall }} />
            <Pressable
              onPress={() => handleRemove(photo.id)}
              hitSlop={8}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: colors.textPrimary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.surface, lineHeight: fontSizes.md }}>
                ×
              </Text>
            </Pressable>
          </View>
        ))}
        {photos.length < maxPhotos && (
          <Pressable
            onPress={handleAddPress}
            style={{
              width: 72,
              height: 72,
              borderRadius: radius.cardSmall,
              borderWidth: 1.5,
              borderColor: '#C4CFC2',
              borderStyle: 'dashed',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xl, color: colors.primary }}>+</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
