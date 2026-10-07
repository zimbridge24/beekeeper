import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

// "N일 전" 계산의 기준 시각. 렌더 중에 Date.now()를 직접 부르면 렌더 결과가 호출할
// 때마다 달라지므로(React 규칙 위반), 처음 한 번 잡아두고 화면이 다시 포커스될
// 때마다 갱신한다 — 앱을 며칠 켜둬도 다른 화면에 갔다 오면 날짜가 맞게 바뀐다.
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );
  return now;
}
