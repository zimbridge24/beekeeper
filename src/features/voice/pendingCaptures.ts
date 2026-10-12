import NetInfo from '@react-native-community/netinfo';
import { and, eq, isNull } from 'drizzle-orm';
import { File } from 'expo-file-system';
import { useMemo } from 'react';

import { inspectionAIProvider, speechToTextProvider } from '../../ai';
import type { StructuredRecordDraft } from '../../ai/InspectionAIProvider';
import { db } from '../../db/client';
import { colonies, visits } from '../../db/schema';
import { getAppMetaValue, setAppMetaValue, useAppMetaValue } from '../../repositories/appMetaRepository';

// 음성 녹음을 "변환·분석이 끝나고 사용자가 저장할 때까지" 기기에 붙잡아 두는 대기열.
//
// 예전에는 녹음 → 변환 → 분석 → 검토가 한 화면의 메모리에서만 이어져서, 중간에 인터넷이 끊기거나
// 앱이 꺼지면 길게 말한 내용이 그대로 사라졌다. 이제 녹음을 마치는 즉시 이 대기열에 올리고,
// 처리 결과도 같이 보관한다 — 저장(또는 삭제)할 때만 빠진다. 별도 테이블 대신 app_meta의 JSON을 써서
// 로컬 DB 마이그레이션 없이 넣었다 (로그아웃 때 같이 지워지므로 로그아웃 경고에도 센다).

const KEY = 'pending_voice_captures';

export type PendingResult = {
  transcript: string;
  drafts: StructuredRecordDraft[];
  notes: string | null;
  confidenceScore: number;
  colonyId: string | null;
};

export type PendingVoiceCapture = {
  id: string;
  visitId: string;
  apiaryId: string;
  // 봉군 상세에서 시작해 봉군이 정해진 녹음이면 그 봉군. 아니면 AI가 말한 내용에서 찾는다.
  lockedColonyId: string | null;
  audioUri: string;
  durationSec: number;
  createdAt: number;
  // pending: 아직 변환·분석 전이거나 실패해서 대기 / ready: 정리가 끝나 검토·저장만 남음
  status: 'pending' | 'ready';
  // 인터넷이 있는 상태에서 서버가 실패한 횟수 (오프라인 시도는 세지 않는다)
  attempts: number;
  lastAttemptAt: number | null;
  lastError: string | null;
  result: PendingResult | null;
};

export const MAX_AUTO_ATTEMPTS = 5;
const AUTO_RETRY_GAP_MS = 30_000;

function parseList(raw: string | null | undefined): PendingVoiceCapture[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as PendingVoiceCapture[]) : [];
  } catch {
    return [];
  }
}

// 읽고-고치고-쓰는 순서를 직렬화해서, 처리기와 화면이 동시에 고쳐도 서로의 변경을 덮어쓰지 않는다.
let queue: Promise<unknown> = Promise.resolve();
function mutate<T>(fn: (list: PendingVoiceCapture[]) => { next: PendingVoiceCapture[]; value: T }): Promise<T> {
  const run = queue.then(async () => {
    const list = parseList(await getAppMetaValue(KEY));
    const { next, value } = fn(list);
    await setAppMetaValue(KEY, JSON.stringify(next));
    return value;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function listPendingCaptures(): Promise<PendingVoiceCapture[]> {
  return parseList(await getAppMetaValue(KEY));
}

export function usePendingVoiceCaptures(): PendingVoiceCapture[] {
  const raw = useAppMetaValue(KEY);
  return useMemo(() => parseList(raw), [raw]);
}

export async function addPendingCapture(
  input: Pick<PendingVoiceCapture, 'visitId' | 'apiaryId' | 'lockedColonyId' | 'audioUri' | 'durationSec'>,
): Promise<PendingVoiceCapture> {
  const capture: PendingVoiceCapture = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    status: 'pending',
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    result: null,
  };
  await mutate((list) => ({ next: [...list, capture], value: undefined }));
  return capture;
}

export async function removePendingCapture(id: string, options: { deleteAudio?: boolean } = {}): Promise<void> {
  const removed = await mutate((list) => ({
    next: list.filter((c) => c.id !== id),
    value: list.find((c) => c.id === id) ?? null,
  }));
  // 저장한 뒤에는 원본 음성이 기록(record_transcripts)에 연결돼 있으므로 파일을 지우지 않는다 —
  // 사용자가 대기열에서 직접 지울 때만 파일도 같이 지운다.
  if (options.deleteAudio && removed) {
    try {
      new File(removed.audioUri).delete();
    } catch {
      // 이미 없으면 그대로 둔다.
    }
  }
}

// 로그아웃·계정 삭제로 로컬 DB를 비우기 직전에 부른다. 대기열 항목은 DB와 함께 사라지므로 남는 건
// 음성 파일뿐인데, 다음에 같은 기기에 로그인하는 사람 기기에 이전 사용자의 녹음이 남지 않게 지운다.
export async function discardPendingCaptureFiles(): Promise<void> {
  try {
    for (const capture of await listPendingCaptures()) {
      try {
        new File(capture.audioUri).delete();
      } catch {
        // 이미 없으면 그대로 둔다.
      }
    }
  } catch {
    // 대기열을 못 읽어도 로그아웃은 막지 않는다.
  }
}

async function patch(id: string, change: Partial<PendingVoiceCapture>): Promise<void> {
  await mutate((list) => ({ next: list.map((c) => (c.id === id ? { ...c, ...change } : c)), value: undefined }));
}

// 한 녹음을 변환 → 분석까지 돌린다. 성공하면 결과를 대기열에 보관(status 'ready')하고 돌려준다.
//
// 같은 녹음을 동시에 두 번 처리하지 않는다 (처리 화면과 백그라운드 처리기가 겹칠 수 있다) —
// 이미 돌고 있으면 그 처리의 결과를 그대로 같이 기다린다. 등록은 첫 await 전에 동기적으로 해서
// 두 호출이 틈새로 같이 들어오는 일이 없게 한다.
const inFlight = new Map<string, Promise<PendingResult>>();

export function isProcessing(id: string): boolean {
  return inFlight.has(id);
}

export async function isOnline(): Promise<boolean> {
  const net = await NetInfo.fetch();
  return !!net.isConnected && net.isInternetReachable !== false;
}

async function runProcessing(
  id: string,
  onStage?: (stage: 'transcribing' | 'structuring') => void,
): Promise<PendingResult> {
  const capture = (await listPendingCaptures()).find((c) => c.id === id);
  if (!capture) throw new Error('처리할 녹음을 찾을 수 없어요.');
  if (capture.result) return capture.result;

  // 오프라인은 실패 횟수에 넣지 않는다 — 산에서 하루 종일 오프라인이어도 연결되면 다시 시도할 수 있어야 한다.
  if (!(await isOnline())) throw new Error('인터넷에 연결되어 있지 않아요.');

  await patch(id, { lastAttemptAt: Date.now() });
  try {
    onStage?.('transcribing');
    const { transcript } = await speechToTextProvider.transcribe({ uri: capture.audioUri, durationSec: capture.durationSec });

    onStage?.('structuring');
    // 봉군이 정해지지 않은 녹음만 AI에게 이 양봉장의 봉군 목록을 준다 (말한 내용에서 어느 봉군인지 찾게).
    let context: { colonies: { id: string; label: string }[] } | undefined;
    if (!capture.lockedColonyId) {
      let apiaryId = capture.apiaryId;
      if (!apiaryId) {
        const [visit] = await db.select({ apiaryId: visits.apiaryId }).from(visits).where(eq(visits.id, capture.visitId)).limit(1);
        apiaryId = visit?.apiaryId ?? '';
      }
      if (apiaryId) {
        const rows = await db
          .select({ id: colonies.id, alias: colonies.alias, internalCode: colonies.internalCode })
          .from(colonies)
          .where(and(eq(colonies.apiaryId, apiaryId), isNull(colonies.deletedAt), eq(colonies.isArchived, false)));
        context = { colonies: rows.map((c) => ({ id: c.id, label: `${c.internalCode}번 ${c.alias}` })) };
      }
    }
    const structured = await inspectionAIProvider.structureInspection(transcript, context);

    const result: PendingResult = {
      transcript,
      drafts: structured.drafts,
      notes: structured.notes,
      confidenceScore: structured.confidenceScore,
      colonyId: structured.colonyId,
    };
    await patch(id, { status: 'ready', result, lastError: null });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patch(id, { attempts: capture.attempts + 1, lastError: message });
    throw err;
  }
}

export function processPendingCapture(
  id: string,
  onStage?: (stage: 'transcribing' | 'structuring') => void,
): Promise<PendingResult> {
  const existing = inFlight.get(id);
  if (existing) return existing;
  const promise = runProcessing(id, onStage).finally(() => inFlight.delete(id));
  inFlight.set(id, promise);
  return promise;
}

// 자동 처리 대상: 아직 결과가 없고, 처리 중이 아니고, 실패 횟수가 한도 안이며, 직전 시도 후 잠깐 지난 것.
export function nextAutoProcessable(list: PendingVoiceCapture[], now = Date.now()): PendingVoiceCapture | null {
  return (
    list.find(
      (c) =>
        c.status === 'pending' &&
        !inFlight.has(c.id) &&
        c.attempts < MAX_AUTO_ATTEMPTS &&
        (c.lastAttemptAt === null || now - c.lastAttemptAt >= AUTO_RETRY_GAP_MS),
    ) ?? null
  );
}

// 검토 화면(voice-review)이 받는 라우트 파라미터 — 처리가 끝난 녹음을 그대로 이어서 연다.
export function reviewParamsFor(
  capture: PendingVoiceCapture,
  result: PendingResult,
): { visitId: string } & Record<string, string> {
  return {
    visitId: capture.visitId,
    colonyId: capture.lockedColonyId || result.colonyId || '',
    // AI가 실제로 추측한 값 그대로 — 잠금 모드에서는 봉군 매칭을 시키지 않았으니 항상 빈 값.
    aiDraftColonyId: result.colonyId ?? '',
    colonyLocked: capture.lockedColonyId ? '1' : '0',
    drafts: JSON.stringify(result.drafts),
    notes: result.notes ?? '',
    transcript: result.transcript,
    confidenceScore: String(result.confidenceScore),
    audioLocalUri: capture.audioUri,
    audioDurationSec: String(capture.durationSec),
    pendingCaptureId: capture.id,
  };
}
