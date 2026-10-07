import { useState } from 'react';

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';

// 사진 AI 판독 한 번의 상태(진행 중/성공/실패)와 결과를 들고 있는 작은 훅. 화면마다
// 같은 try/catch/상태 전환을 반복하지 않으려고 뺐다.
export function useAnalysis<T>() {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<T>): Promise<T | null> => {
    setStatus('running');
    setError(null);
    try {
      const value = await fn();
      setResult(value);
      setStatus('done');
      return value;
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
      return null;
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
  };

  return { status, result, error, run, reset };
}
