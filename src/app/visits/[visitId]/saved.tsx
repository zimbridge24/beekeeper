import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '../../../components/Button';
import { CheckIcon } from '../../../components/icons';
import { ReferenceNote } from '../../../components/ReferenceNote';
import { Screen } from '../../../components/Screen';
import { useColony } from '../../../repositories/colonyRepository';
import { endVisit } from '../../../repositories/visitRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../../../theme/tokens';

// 응애·말벌·월동 준비는 "같은 점검을 다른 봉군에도" 이어서 하는 일이 흔해서, 해당 봉군 선택
// 화면으로 바로 보내준다. 그 밖의 기록(방제·급이 …)은 방문의 봉군 목록으로 간다.
const SAME_TYPE_NEXT: Record<string, { label: string; go: () => void }> = {
  mite: { label: '다른 봉군도 응애 체크하기', go: () => router.replace({ pathname: '/health/pick-colony', params: { recordType: 'mite' } }) },
  hornet: { label: '다른 봉군 말벌 기록하기', go: () => router.replace({ pathname: '/health/pick-colony', params: { recordType: 'hornet' } }) },
  wintering_prep: { label: '다른 봉군도 월동 점검하기', go: () => router.replace('/health/wintering') },
};

export default function RecordSavedScreen() {
  const { visitId, colonyId, recordType, recordTypeTitle, summary } = useLocalSearchParams<{
    visitId: string;
    colonyId?: string;
    // 추가 기록 폼(응애·말벌·월동 준비·방제 …)에서 저장했을 때만 넘어온다. 없으면 빠른 내검/음성 흐름.
    recordType?: string;
    recordTypeTitle?: string;
    summary?: string;
  }>();
  const { data: colonyRows } = useColony(colonyId || undefined);
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
        <Text
          style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display1, color: colors.textPrimary, textAlign: 'center' }}
        >
          {colony?.alias ?? ''} {recordTypeTitle ?? ''} 기록 저장 완료
        </Text>
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, textAlign: 'center' }}>
          입력한 내용이 봉군 이력에 연결되었어요
        </Text>
        {summary ? (
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.primary, textAlign: 'center' }}>{summary}</Text>
        ) : null}
        {summary ? <ReferenceNote kind="general" /> : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        {recordType && colonyId ? (
          <>
            {/* 추가 기록(응애·말벌·월동 준비 …) 뒤: "다음 음성 내검"이 아니라 이 봉군에 더 남기거나,
                같은 종류를 다른 봉군에 이어서 남기는 동작을 보여준다. */}
            <Button
              label="이 봉군에 다른 기록 추가하기"
              onPress={() => router.replace({ pathname: '/visits/[visitId]/[colonyId]/quick-check', params: { visitId, colonyId } })}
            />
            {SAME_TYPE_NEXT[recordType] ? (
              <Button label={SAME_TYPE_NEXT[recordType].label} variant="surface" onPress={SAME_TYPE_NEXT[recordType].go} />
            ) : (
              <Button
                label="다음 봉군 선택하기"
                variant="surface"
                onPress={() => router.replace({ pathname: '/visits/[visitId]/progress', params: { visitId } })}
              />
            )}
          </>
        ) : (
          <>
            <Button
              label="다음도 음성으로 기록하기"
              onPress={() => router.replace({ pathname: '/visits/[visitId]/voice-record', params: { visitId } })}
            />
            <Button
              label="목록에서 봉군 선택하기"
              variant="surface"
              onPress={() => router.replace({ pathname: '/visits/[visitId]/progress', params: { visitId } })}
            />
          </>
        )}
        <Button label="방문 종료하기" variant="ghost" onPress={handleEndVisit} loading={ending} />
      </View>
    </Screen>
  );
}
