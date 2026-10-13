import { Text, View } from 'react-native';

import { colors, fontFamilies, fontSizes } from '../theme/tokens';

// 여러 개를 고르는 목록(일괄 기록, 여러 봉군에 한 번에 기록)이 같이 쓰는 체크 표시.
export function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: checked ? colors.primary : colors.border,
        backgroundColor: checked ? colors.primary : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && <Text style={{ color: '#FFFFFF', fontFamily: fontFamilies.bold, fontSize: fontSizes.sm }}>✓</Text>}
    </View>
  );
}
