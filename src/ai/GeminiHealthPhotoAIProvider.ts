import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';

import { getCurrentUserId } from '../auth/currentUser';
import type { MiteMethod } from '../features/health/miteRisk';
import { supabase } from '../supabase/client';
import { invokeEdgeFunction } from '../supabase/edgeFunctionClient';
import type {
  HealthPhotoAIProvider,
  HornetPhotoAnalysis,
  MitePhotoAnalysis,
  WinteringPhotoAnalysis,
} from './HealthPhotoAIProvider';

const STORAGE_BUCKET = 'inspection-photos';
const MAX_ANALYSIS_PHOTOS = 4;

// 사진을 요청 본문(base64)에 싣지 않고 Storage에 임시로 올린 뒤 경로만 Edge
// Function에 넘긴다 — 원본 해상도 사진은 몇 MB라 JSON 본문으로 보내기엔 크고, 응애
// 같은 작은 대상은 해상도를 줄이면 판독 자체가 어려워진다. 임시 파일은 Edge
// Function이 분석 직후 지운다 (기록에 첨부된 정식 사진은 src/sync/photos.ts가 따로
// 올린다).
async function uploadForAnalysis(uris: string[]): Promise<string[]> {
  const userId = getCurrentUserId();
  const paths: string[] = [];
  for (const uri of uris.slice(0, MAX_ANALYSIS_PHOTOS)) {
    const path = `${userId}/ai-analysis/${randomUUID()}.jpg`;
    const bytes = await new File(uri).arrayBuffer();
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
    if (error) throw new Error(`사진 업로드에 실패했어요: ${error.message}`);
    paths.push(path);
  }
  return paths;
}

async function analyze<T>(kind: 'mite' | 'hornet' | 'wintering', uris: string[], context: Record<string, unknown>): Promise<T> {
  if (uris.length === 0) throw new Error('분석할 사진이 없어요.');
  const startedAt = Date.now();
  try {
    const paths = await uploadForAnalysis(uris);
    const result = await invokeEdgeFunction<T & { model?: string }>('analyze-health-photo', { kind, paths, context });
    const elapsedMs = Date.now() - startedAt;
    // 개발 중 실제 호출이 일어났는지 Metro 로그로도 확인할 수 있게 남긴다.
    console.log(`[health-ai] ${kind} photos=${uris.length} -> gemini model=${result.model ?? '?'} ${elapsedMs}ms`);
    return { ...result, provider: 'gemini', elapsedMs };
  } catch (err) {
    console.warn(`[health-ai] ${kind} failed after ${Date.now() - startedAt}ms:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

export class GeminiHealthPhotoAIProvider implements HealthPhotoAIProvider {
  analyzeMitePhotos(photoUris: string[], context: { method: MiteMethod }) {
    return analyze<MitePhotoAnalysis>('mite', photoUris, context);
  }

  analyzeHornetPhotos(photoUris: string[]) {
    return analyze<HornetPhotoAnalysis>('hornet', photoUris, {});
  }

  analyzeWinteringPhotos(photoUris: string[], context: { species: 'western' | 'native' }) {
    return analyze<WinteringPhotoAnalysis>('wintering', photoUris, context);
  }
}
