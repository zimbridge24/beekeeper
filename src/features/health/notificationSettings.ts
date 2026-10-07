import { useCallback, useMemo } from 'react';

import { getCurrentUserId } from '../../auth/currentUser';
import { setAppMetaValue, useAppMetaValue } from '../../repositories/appMetaRepository';
import { supabase } from '../../supabase/client';
import { DEFAULT_REMINDER_SETTINGS, ReminderSettings } from './reminders';

// 알림 설정(동의 + 항목별 ON/OFF)의 "원본"은 서버(notification_settings)다 — 서버가 이 값을 보고
// 알림을 보낼지 판단한다. 기기에는 화면을 빠르게 그리고 오프라인에서도 마지막 값을 보여주려는
// 캐시만 둔다 (같은 키라 이전 로컬 알림 버전이 저장해 둔 동의도 그대로 읽힌다).

export const REMINDER_SETTINGS_KEY = 'reminder_settings';

export function parseReminderSettings(raw: string | null | undefined): ReminderSettings {
  if (!raw) return DEFAULT_REMINDER_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    return {
      consent: parsed.consent === 'granted' || parsed.consent === 'declined' ? parsed.consent : null,
      categories: { ...DEFAULT_REMINDER_SETTINGS.categories, ...(parsed.categories ?? {}) },
    };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

async function writeCache(settings: ReminderSettings): Promise<void> {
  await setAppMetaValue(REMINDER_SETTINGS_KEY, JSON.stringify(settings));
}

type SettingsRow = {
  consent: 'granted' | 'declined' | null;
  mite: boolean;
  post_treatment: boolean;
  wintering: boolean;
  trend: boolean;
  treatment_season: boolean;
};

function fromRow(row: SettingsRow): ReminderSettings {
  return {
    consent: row.consent,
    categories: {
      mite: row.mite,
      post_treatment: row.post_treatment,
      wintering: row.wintering,
      trend: row.trend,
      treatment_season: row.treatment_season ?? true,
    },
  };
}

async function fetchRemote(): Promise<ReminderSettings | null> {
  const { data, error } = await supabase
    .from('notification_settings')
    .select('consent, mite, post_treatment, wintering, trend, treatment_season')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as SettingsRow) : null;
}

async function saveRemote(settings: ReminderSettings): Promise<void> {
  const { error } = await supabase.from('notification_settings').upsert(
    {
      user_id: getCurrentUserId(),
      consent: settings.consent,
      mite: settings.categories.mite,
      post_treatment: settings.categories.post_treatment,
      wintering: settings.categories.wintering,
      trend: settings.categories.trend,
      treatment_season: settings.categories.treatment_season,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
}

// 서버 설정을 가져와 캐시에 반영한다. 서버에 행이 아직 없는데 기기에 이미 동의가 있으면(로컬 알림
// 버전에서 한 동의) 그 값을 서버로 올린다 — 업데이트했다고 동의를 다시 묻지 않는다.
// 서버에 닿지 못하면 false (캐시는 그대로).
export async function syncSettingsFromServer(cached: ReminderSettings): Promise<boolean> {
  try {
    const remote = await fetchRemote();
    if (remote) {
      await writeCache(remote);
    } else if (cached.consent !== null) {
      await saveRemote(cached);
    }
    return true;
  } catch (err) {
    console.warn('[notifications] settings sync failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

// 설정 화면과 알림 관리자가 같은 값을 보도록 캐시(로컬 DB의 라이브 쿼리)를 공유한다. 서버와 맞추는
// 시점(refresh)은 호출하는 쪽이 정한다.
// 저장은 서버에 먼저 반영하고(원본), 실패하면 화면 값을 되돌리고 오류를 던진다.
export function useNotificationSettings() {
  const raw = useAppMetaValue(REMINDER_SETTINGS_KEY);
  const settings = useMemo(() => parseReminderSettings(raw), [raw]);
  const loaded = raw !== undefined;

  const refresh = useCallback(async (): Promise<boolean> => syncSettingsFromServer(settings), [settings]);

  const update = useCallback(
    async (next: ReminderSettings): Promise<void> => {
      const previous = settings;
      await writeCache(next);
      try {
        await saveRemote(next);
      } catch (err) {
        await writeCache(previous);
        throw err;
      }
    },
    [settings],
  );

  return { settings, loaded, refresh, update };
}
