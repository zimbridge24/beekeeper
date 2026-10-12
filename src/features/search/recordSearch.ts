import { extractColonySeries, HealthSource, LevelPoint, MiteCheckPoint } from '../health/facts';
import { wallClock } from '../health/time';
import { FIELD_KIND_OPTIONS } from '../records/recordTypesConfig';

// "기록 찾기"의 검색 엔진. 전부 기기 안의 기록(records·record_field_values·원문 전사)을 읽는
// 순수 함수라서 오프라인에서도 되고, 같은 기록이면 항상 같은 결과가 나온다. AI는 여기 없다 —
// AI가 하는 일은 사용자의 질문 문장을 아래 RecordQuery(검색 조건)로 바꿔주는 것뿐이고,
// 결과는 항상 기록에 적힌 값 그대로다. 기록에 없는 값(예: 용량)은 "기록 없음"이라고만 하고
// 절대 추정해서 채우지 않는다.

export type SearchColony = {
  id: string;
  apiaryId: string;
  alias: string;
  species: string;
  createdAt: number;
  isArchived: boolean;
};
export type SearchRecord = { id: string; colonyId: string; recordType: string; occurredAt: number; notes: string | null };
export type SearchFieldValue = {
  recordId: string;
  fieldKey: string;
  valueState: string;
  valueNumber: number | null;
  valueText: string | null;
};
export type SearchTranscript = { recordId: string; rawTranscript: string | null };

// HealthSource의 상위 집합 — extractColonySeries(월동 비교에서 봉세·먹이·응애 시계열을 읽는다)에
// 그대로 넘길 수 있다. 보관(archived)된 봉군도 포함한다 (폐군은 보관해 두는 경우가 많다).
export type SearchSource = HealthSource & {
  colonies: SearchColony[];
  records: SearchRecord[];
  fieldValues: SearchFieldValue[];
  transcripts: SearchTranscript[];
};

// ---- 검색 조건 ----------------------------------------------------------------

export type YearFilter = 'this' | 'last' | 'all';
export type QueryIntent = 'treatment' | 'wintering' | 'text';

export type RecordQuery = {
  intent: QueryIntent;
  year: YearFilter;
  // treatment_ingredient 토큰 (null = 성분 전체)
  ingredient: string | null;
  // text 검색에서 원문에 들어 있어야 하는 단어들
  keywords: string[];
  colonyId: string | null;
};

export const YEAR_LABEL: Record<YearFilter, string> = { this: '올해', last: '작년', all: '전체' };
export const INTENT_LABEL: Record<QueryIntent, string> = { treatment: '방제 이력', wintering: '월동 결과 비교', text: '기록 속 문장 찾기' };

export const INGREDIENT_OPTIONS = FIELD_KIND_OPTIONS.treatment_ingredient;
export function ingredientLabel(token: string | null | undefined): string | null {
  if (!token) return null;
  return INGREDIENT_OPTIONS.find((o) => o.value === token)?.label ?? null;
}

function inYear(at: number, year: YearFilter, now: number, tz?: number): boolean {
  if (year === 'all') return true;
  const current = wallClock(now, tz).year;
  const y = wallClock(at, tz).year;
  return year === 'this' ? y === current : y === current - 1;
}

type FieldCell = { state: string; num: number | null; text: string | null };

function indexFields(source: SearchSource): Map<string, Map<string, FieldCell>> {
  const byRecord = new Map<string, Map<string, FieldCell>>();
  for (const fv of source.fieldValues) {
    if (fv.valueState === 'unset') continue;
    let m = byRecord.get(fv.recordId);
    if (!m) byRecord.set(fv.recordId, (m = new Map()));
    m.set(fv.fieldKey, { state: fv.valueState, num: fv.valueNumber, text: fv.valueText?.trim() ? fv.valueText.trim() : null });
  }
  return byRecord;
}

function colonyAliasMap(source: SearchSource): Map<string, string> {
  return new Map(source.colonies.map((c) => [c.id, c.alias]));
}

// ---- 방제 이력 ----------------------------------------------------------------

export type TreatmentHit = {
  recordId: string;
  at: number;
  colonyId: string;
  colonyAlias: string;
  ingredient: string | null;
  product: string | null;
  dose: string | null;
  // 예전 버전이 자유 텍스트로 받던 "약제·방법".
  legacyMethod: string | null;
  note: string | null;
};

export function searchTreatments(source: SearchSource, q: Pick<RecordQuery, 'year' | 'ingredient' | 'colonyId'>): TreatmentHit[] {
  const fields = indexFields(source);
  const aliases = colonyAliasMap(source);
  const hits: TreatmentHit[] = [];

  for (const record of source.records) {
    const colonyAlias = aliases.get(record.colonyId);
    if (colonyAlias === undefined) continue;
    if (q.colonyId && record.colonyId !== q.colonyId) continue;
    if (!inYear(record.occurredAt, q.year, source.now, source.tz)) continue;

    const f = fields.get(record.id);
    if (!f) continue;
    const applied = f.get('treatment_applied')?.state === 'done';
    const ingredientToken = f.get('treatment_ingredient')?.state ?? null;
    const legacyMethod = f.get('treatment_method')?.text ?? null;
    if (!applied && !ingredientToken && !legacyMethod) continue;
    if (q.ingredient && ingredientToken !== q.ingredient) continue;

    hits.push({
      recordId: record.id,
      at: record.occurredAt,
      colonyId: record.colonyId,
      colonyAlias,
      ingredient: ingredientToken,
      product: f.get('treatment_product')?.text ?? null,
      dose: f.get('treatment_dose')?.text ?? null,
      legacyMethod,
      note: record.notes?.trim() ? record.notes.trim() : null,
    });
  }
  return hits.sort((a, b) => b.at - a.at);
}

// ---- 월동 결과 비교 -------------------------------------------------------------

export type WinteringOutcome = 'survived' | 'weak_survived' | 'lost';
export const OUTCOME_ORDER: WinteringOutcome[] = ['survived', 'weak_survived', 'lost'];
export const OUTCOME_LABEL: Record<WinteringOutcome, string> = {
  survived: '월동 성공',
  weak_survived: '약세로 월동',
  lost: '폐사',
};

export type WinteringEntry = {
  colonyId: string;
  colonyAlias: string;
  outcome: WinteringOutcome;
  resultAt: number;
  // 결과를 기록하기 전 "마지막으로 기록한 값" — 각각 기록한 시점을 함께 가진다.
  strength: LevelPoint | null;
  food: LevelPoint | null;
  queen: { at: number; present: boolean } | null;
  mite: MiteCheckPoint | null;
  insulation: { at: number; value: 'done' | 'partial' | 'not_done' } | null;
  hiveCondition: { at: number; value: 'good' | 'needs_check' } | null;
  winteringCheckCount: number;
};

function lastBefore<T extends { at: number }>(items: T[], at: number): T | null {
  let found: T | null = null;
  for (const item of items) if (item.at <= at) found = item;
  return found;
}

export function compareWintering(source: SearchSource, q: Pick<RecordQuery, 'year' | 'colonyId'>): Record<WinteringOutcome, WinteringEntry[]> {
  const fields = indexFields(source);
  const aliases = colonyAliasMap(source);
  const grouped: Record<WinteringOutcome, WinteringEntry[]> = { survived: [], weak_survived: [], lost: [] };
  const seen = new Set<string>();

  for (const record of source.records) {
    const colonyAlias = aliases.get(record.colonyId);
    if (colonyAlias === undefined) continue;
    if (q.colonyId && record.colonyId !== q.colonyId) continue;
    if (!inYear(record.occurredAt, q.year, source.now, source.tz)) continue;

    const f = fields.get(record.id);
    if (!f) continue;
    const resultState = f.get('wintering_result')?.state;
    let outcome: WinteringOutcome | null = null;
    if (resultState === 'survived' || resultState === 'weak_survived' || resultState === 'lost') outcome = resultState;
    // 예전 버전이 "폐군 여부"로 남기던 기록.
    else if (f.get('colony_lost')?.state === 'done') outcome = 'lost';
    if (!outcome) continue;

    const w = wallClock(record.occurredAt, source.tz);
    const dedupeKey = `${record.colonyId}|${outcome}|${w.year}-${w.month}-${w.day}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const series = extractColonySeries(source, record.colonyId);
    const T = record.occurredAt;
    const checks = series.winteringChecks.filter((c) => c.at <= T);
    const lastInsulation = lastBefore(
      checks.filter((c) => c.insulation !== null).map((c) => ({ at: c.at, value: c.insulation! })),
      T,
    );
    const lastHive = lastBefore(
      checks.filter((c) => c.hiveCondition !== null).map((c) => ({ at: c.at, value: c.hiveCondition! })),
      T,
    );

    grouped[outcome].push({
      colonyId: record.colonyId,
      colonyAlias,
      outcome,
      resultAt: T,
      strength: lastBefore(series.strength, T),
      food: lastBefore(series.food, T),
      queen: lastBefore(series.queen, T),
      mite: lastBefore(
        series.miteChecks.filter((m) => m.result !== 'indeterminate'),
        T,
      ),
      insulation: lastInsulation,
      hiveCondition: lastHive,
      winteringCheckCount: checks.length,
    });
  }

  for (const key of OUTCOME_ORDER) grouped[key].sort((a, b) => b.resultAt - a.resultAt);
  return grouped;
}

// ---- 기록 속 문장 찾기 (메모·음성 원문·입력한 글) ---------------------------------

export type TextHitSource = 'notes' | 'voice' | 'field';
export const TEXT_SOURCE_LABEL: Record<TextHitSource, string> = { notes: '메모', voice: '음성 원문', field: '입력한 글' };

export type TextHit = {
  recordId: string;
  at: number;
  colonyId: string;
  colonyAlias: string;
  source: TextHitSource;
  sentence: string;
};

const TEXT_FIELD_KEYS = ['treatment_product', 'treatment_dose', 'treatment_method'];
const EXCERPT_RADIUS = 70;

function splitSentences(text: string): string[] {
  return text.match(/[^.!?。\n]+[.!?。]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

// 문장이 너무 길면(마침표 없는 음성 원문) 찾은 단어 주변만 잘라서 보여준다 — 원문을 바꾸지는 않는다.
function excerptAround(sentence: string, keyword: string): string {
  if (sentence.length <= EXCERPT_RADIUS * 2 + keyword.length) return sentence;
  const idx = sentence.toLowerCase().indexOf(keyword.toLowerCase());
  const start = Math.max(0, idx - EXCERPT_RADIUS);
  const end = Math.min(sentence.length, idx + keyword.length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${sentence.slice(start, end)}${end < sentence.length ? '…' : ''}`;
}

export function searchText(
  source: SearchSource,
  q: Pick<RecordQuery, 'keywords' | 'year' | 'colonyId'>,
  limit = 40,
): TextHit[] {
  const keywords = q.keywords.map((k) => k.trim().toLowerCase()).filter((k) => k.length >= 1);
  if (keywords.length === 0) return [];

  const aliases = colonyAliasMap(source);
  const fields = indexFields(source);
  const transcriptByRecord = new Map(source.transcripts.map((t) => [t.recordId, t.rawTranscript]));
  const hits: TextHit[] = [];

  const scan = (record: SearchRecord, colonyAlias: string, text: string | null | undefined, sourceKind: TextHitSource) => {
    if (!text) return;
    const seenSentences = new Set<string>();
    for (const sentence of splitSentences(text)) {
      const lower = sentence.toLowerCase();
      const matched = keywords.find((k) => lower.includes(k));
      if (!matched || seenSentences.has(sentence)) continue;
      seenSentences.add(sentence);
      hits.push({
        recordId: record.id,
        at: record.occurredAt,
        colonyId: record.colonyId,
        colonyAlias,
        source: sourceKind,
        sentence: excerptAround(sentence, matched),
      });
    }
  };

  for (const record of source.records) {
    const colonyAlias = aliases.get(record.colonyId);
    if (colonyAlias === undefined) continue;
    if (q.colonyId && record.colonyId !== q.colonyId) continue;
    if (!inYear(record.occurredAt, q.year, source.now, source.tz)) continue;

    scan(record, colonyAlias, record.notes, 'notes');
    scan(record, colonyAlias, transcriptByRecord.get(record.id), 'voice');
    const f = fields.get(record.id);
    if (f) for (const key of TEXT_FIELD_KEYS) scan(record, colonyAlias, f.get(key)?.text, 'field');
  }

  return hits.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---- 규칙 기반 질문 해석 (AI를 못 쓸 때의 기본값) --------------------------------

const INGREDIENT_WORDS: [RegExp, string][] = [
  [/아미트라즈/, 'amitraz'],
  [/쿠마포스/, 'coumaphos'],
  [/개미산/, 'formic_acid'],
  [/옥살산/, 'oxalic_acid'],
];

const STOP_WORDS = new Set([
  '작년', '올해', '지난해', '재작년', '이번', '지난', '무슨', '어떤', '어떻게', '언제', '얼마', '알려줘', '알려', '찾아줘', '찾아',
  '기록', '했던', '했는지', '있었', '있는', '했어', '했을', '때문', '그리고', '대한', '관련', '내용', '봉군', '이었는지', '였는지',
  '얘기', '이야기', '말한', '말했던', '언급', '적은', '보여줘', '있는지', '있었는지', '날짜', '언제',
]);

// 검색에 쓸 단어에서 '기록', '작년'처럼 거의 모든 문장에 걸리는 말을 뺀다 (AI가 뽑은 단어에도 적용).
export function cleanKeywords(words: string[]): string[] {
  return [...new Set(words.map((w) => w.trim()).filter((w) => w.length >= 2 && !STOP_WORDS.has(w)))];
}

const PARTICLE_SUFFIX = /(으로|에서|에게|이랑|랑|과|와|은|는|이|가|을|를|의|에|도|로|만|까지|부터|했던|하는|한|인지|이었던|였던)$/;

export function parseQueryRules(question: string, colonies: { id: string; alias: string }[]): RecordQuery {
  const text = question.trim();

  const year: YearFilter = /작년|지난해|전년|재작년/.test(text) ? 'last' : /올해|금년|이번 ?해|이번 ?시즌/.test(text) ? 'this' : 'all';

  let ingredient: string | null = null;
  for (const [re, token] of INGREDIENT_WORDS) if (re.test(text)) ingredient = token;

  const wintering = /폐사|폐군|월동 ?(실패|성공|결과)|못 ?넘|월동.*(비교|실패)|(실패|비교).*월동/.test(text);
  const treatment = /방제|약품|약제|성분|용량|퇴치|처치|약을|약 /.test(text) || ingredient !== null;
  let intent: QueryIntent;
  if (wintering) intent = 'wintering';
  else if (treatment) intent = 'treatment';
  else if (/월동|겨울|동절/.test(text)) intent = 'wintering';
  else intent = 'text';

  let colonyId: string | null = null;
  for (const c of colonies) {
    if (text.includes(c.alias)) {
      colonyId = c.id;
      break;
    }
  }
  if (!colonyId) {
    const num = text.match(/(\d+)\s*번/)?.[1];
    if (num) colonyId = colonies.find((c) => new RegExp(`(^|\\D)${num}\\s*번`).test(c.alias))?.id ?? null;
  }

  const keywords = [
    ...new Set(
      (text.match(/[가-힣A-Za-z0-9]+/g) ?? [])
        .map((w) => w.replace(PARTICLE_SUFFIX, ''))
        .filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+번?$/.test(w)),
    ),
  ].slice(0, 5);

  return { intent, year, ingredient, keywords: intent === 'text' ? keywords : [], colonyId };
}

export function describeQuery(q: RecordQuery, colonyAlias?: string | null): string[] {
  const parts: string[] = [YEAR_LABEL[q.year], INTENT_LABEL[q.intent]];
  if (q.intent === 'treatment') parts.push(q.ingredient ? `성분 ${ingredientLabel(q.ingredient) ?? q.ingredient}` : '성분 전체');
  if (q.intent === 'text') parts.push(q.keywords.length > 0 ? `단어: ${q.keywords.join(', ')}` : '단어 없음');
  if (colonyAlias) parts.push(colonyAlias);
  return parts;
}
