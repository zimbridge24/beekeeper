import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  isOnline,
  listPendingCaptures,
  nextAutoProcessable,
  processPendingCapture,
  usePendingVoiceCaptures,
} from './pendingCaptures';

const RECHECK_INTERVAL_MS = 60_000;
// 한 번의 순회에서 처리를 시도하는 최대 횟수 — 예상 못 한 상태에서도 무한히 돌지 않게 하는 안전장치.
const MAX_ROUNDS = 20;

// 대기열에 남은 음성 녹음을 인터넷이 닿을 때 조용히 하나씩 정리해 둔다. 사용자가 "나중에 처리"를 눌렀거나
// 산에서 오프라인으로 녹음한 경우, 집에 와서 앱을 열면 이미 정리가 끝나 있고 검토·저장만 하면 된다.
// 한 번에 하나씩만 돌리고(순서대로), 실패는 대기열 항목에 기록돼 일정 간격·횟수 안에서만 다시 시도한다.
export function usePendingVoiceProcessor(enabled: boolean) {
  const captures = usePendingVoiceCaptures();
  const running = useRef(false);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const next = nextAutoProcessable(await listPendingCaptures());
        if (!next) break;
        if (!(await isOnline())) break;
        try {
          await processPendingCapture(next.id);
        } catch {
          // 실패 횟수와 메시지는 대기열 항목에 이미 기록됐다. 다음 대기 항목으로 넘어간다.
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  // 대기열이 바뀔 때 (새 녹음이 올라왔거나 앱이 켜졌을 때)
  useEffect(() => {
    if (enabled && captures.length > 0) void drain();
  }, [enabled, captures, drain]);

  // 인터넷이 다시 닿을 때, 앱이 앞으로 돌아올 때, 그리고 가끔 — 실패 후 재시도 간격이 지났는지 확인한다.
  useEffect(() => {
    if (!enabled) return;
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      if (state.isConnected) void drain();
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drain();
    });
    const timer = setInterval(() => void drain(), RECHECK_INTERVAL_MS);
    return () => {
      unsubscribeNet();
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [enabled, drain]);
}
