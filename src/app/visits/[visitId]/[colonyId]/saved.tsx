import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../../../../components/Button';
import { CheckIcon } from '../../../../components/icons';
import { Screen } from '../../../../components/Screen';
import { useColony } from '../../../../repositories/colonyRepository';
import { endVisit } from '../../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../../theme/tokens';

export default function RecordSavedScreen() {
  const { visitId, colonyId, recordTypeTitle } = useLocalSearchParams<{
    visitId: string;
    colonyId: string;
    recordTypeTitle?: string;
  }>();
  const { data: colonyRows } = useColony(colonyId);
  const colony = colonyRows?.[0];
  const [ending, setEnding] = useState(false);

  const handleEndVisit = async () => {
    setEnding(true);
    try {
      await endVisit(visitId);
      router.replace('/(tabs)/home');
    } finally {
      setEnding(false);
    }
  };

  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#3F7D5C',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon />
        </View>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display1, color: colors.textPrimary }}>
          {colony?.alias ?? ''} {recordTypeTitle ?? ''} 기록 저장 완료
        </Text>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, textAlign: 'center' }}>
          입력한 내용이 봉군 이력에 연결되었어요
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Button label="다음 봉군 선택하기" onPress={() => router.replace({ pathname: '/visits/[visitId]/progress', params: { visitId } })} />
        <Button label="방문 종료하기" variant="ghost" onPress={handleEndVisit} loading={ending} />
      </View>
    </Screen>
  );
}
