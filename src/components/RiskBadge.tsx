import { RiskLevel } from '../db/schema';
import { RISK_LEVEL_LABELS, RISK_LEVEL_TONES } from '../features/health/miteRisk';
import { StatusBadge } from './StatusBadge';

// 낮음 / 주의 / 높음 — 응애·말벌 위험단계를 어디서든 같은 색·같은 말로 보여준다.
export function RiskBadge({ level, prefix }: { level: RiskLevel | null | undefined; prefix?: string }) {
  if (!level) return null;
  return <StatusBadge tone={RISK_LEVEL_TONES[level]} label={`${prefix ? `${prefix} ` : ''}${RISK_LEVEL_LABELS[level]}`} />;
}
