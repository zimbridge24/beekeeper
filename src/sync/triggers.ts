import NetInfo from '@react-native-community/netinfo';
import { count } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { db } from '../db/client';
import { outbox } from '../db/schema';
import { runSync } from './runSync';

const MIN_INTERVAL_MS = 30_000;
// 기록을 저장한 뒤 이 시간 동안 추가 저장이 없으면 바로 동기화한다 — 한 번의 내검이 여러 행을
// 연달아 쓰기 때문에, 잠깐 모아서 한 번에 올린다.
const AFTER_WRITE_DELAY_MS = 2_000;

// Wires the sync triggers: app start, offline→online transition, app-foreground
// resume (throttled), a short delay after local writes, and (elsewhere) a
// manual retry button that calls runSync() directly.
export function useSyncTriggers() {
  const { isAuthenticated } = useAuth();
  const lastRunRef = useRef(0);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPendingRef = useRef<number | null>(null);

  const { data: pendingRows } = useLiveQuery(db.select({ value: count() }).from(outbox));
  const pendingCount = pendingRows?.[0]?.value;

  useEffect(() => {
    if (!isAuthenticated) return;

    const maybeSync = () => {
      const now = Date.now();
      if (now - lastRunRef.current < MIN_INTERVAL_MS) return;
      lastRunRef.current = now;
      runSync().catch((err) => console.warn('[sync] sync cycle failed', err));
    };

    maybeSync();

    const netSubscription = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        maybeSync();
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') maybeSync();
    });

    return () => {
      netSubscription();
      appStateSubscription.remove();
    };
  }, [isAuthenticated]);

  // 앱을 켜 둔 채 기록을 저장해도 위 트리거들은 아무것도 안 일으켜서, 새 기록이 "동기화 대기"로 계속
  // 남아 있었다. 대기열이 *늘어났을 때만* 반응한다 — 실패한 항목이 계속 남아 있어도 같은 값으로는
  // 다시 돌지 않으므로 무한 재시도가 되지 않는다.
  useEffect(() => {
    if (!isAuthenticated || pendingCount === undefined) return;
    const prev = prevPendingRef.current;
    prevPendingRef.current = pendingCount;
    if (prev === null || pendingCount <= prev) return;

    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      writeTimerRef.current = null;
      void NetInfo.fetch().then((state) => {
        if (!state.isConnected || state.isInternetReachable === false) return;
        lastRunRef.current = Date.now();
        runSync().catch((err) => console.warn('[sync] after-write sync failed', err));
      });
    }, AFTER_WRITE_DELAY_MS);
  }, [isAuthenticated, pendingCount]);

  useEffect(
    () => () => {
      if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    },
    [],
  );
}
