import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, ScrollView, Text, View } from 'react-native';

import { parseRecordQueryWithAI } from '../../ai/parseRecordQuery';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { RiskBadge } from '../../components/RiskBadge';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { STRENGTH_LABEL } from '../../features/health/facts';
import { FOOD_LABEL } from '../../features/health/report';
import {
  compareWintering,
  describeQuery,
  ingredientLabel,
  INGREDIENT_OPTIONS,
  OUTCOME_LABEL,
  OUTCOME_ORDER,
  parseQueryRules,
  RecordQuery,
  searchText,
  searchTreatments,
  TEXT_SOURCE_LABEL,
  WinteringEntry,
  YEAR_LABEL,
  YearFilter,
} from '../../features/search/recordSearch';
import { useSearchSource } from '../../repositories/searchRepository';
import { colors, fontFamilies, fontSizes, spacing, statusColors } from '../../theme/tokens';

const EXAMPLES = ['작년에 쓴 방제 약품과 용량', '월동에 실패한 봉군', '말벌 얘기한 기록'];
const YEARS: YearFilter[] = ['this', 'last', 'all'];
const INSULATION_LABEL = { done: '완료', partial: '일부 완료', not_done: '미완료' } as const;
const HIVE_LABEL = { good: '양호', needs_check: '확인 필요' } as const;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
}
function md(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const mutedXs = { fontFamily: fontFamilies.semibold, fontSize: fontSizes.xs, color: colors.textMuted } as const;

function FactLine({ label, value, at }: { label: string; value: string | null; at?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Text style={{ width: 64, fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>{label}</Text>
      <Text
        style={{
          flex: 1,
          fontFamily: fontFamilies.semibold,
          fontSize: fontSizes.sm,
          color: value ? colors.textPrimary : colors.textMuted,
        }}
      >
        {value ?? '기록 없음'}
        {value && at ? `  (${md(at)})` : ''}
      </Text>
    </View>
  );
}

function WinteringCard({ entry }: { entry: WinteringEntry }) {
  return (
    <Card
      size="medium"
      onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId: entry.colonyId } })}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>{entry.colonyAlias}</Text>
          <Text style={mutedXs}>결과 기록 {formatDate(entry.resultAt)}</Text>
        </View>
        <FactLine label="봉세" value={entry.strength ? STRENGTH_LABEL[entry.strength.rank] : null} at={entry.strength?.at} />
        <FactLine label="먹이" value={entry.food ? FOOD_LABEL[entry.food.rank] : null} at={entry.food?.at} />
        <FactLine label="여왕벌" value={entry.queen ? (entry.queen.present ? '있음' : '없음') : null} at={entry.queen?.at} />
        <FactLine label="보온 준비" value={entry.insulation ? INSULATION_LABEL[entry.insulation.value] : null} at={entry.insulation?.at} />
        <FactLine label="환기·벌통" value={entry.hiveCondition ? HIVE_LABEL[entry.hiveCondition.value] : null} at={entry.hiveCondition?.at} />
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Text style={{ width: 64, fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>응애</Text>
          {entry.mite ? (
            <>
              <RiskBadge level={entry.mite.riskLevel} />
              <Text style={mutedXs}>({md(entry.mite.at)})</Text>
            </>
          ) : (
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>기록 없음</Text>
          )}
        </View>
        <Text style={mutedXs}>월동 점검 기록 {entry.winteringCheckCount}회</Text>
      </View>
    </Card>
  );
}

export default function SearchScreen() {
  const source = useSearchSource();
  const [question, setQuestion] = useState('');
  const [query, setQuery] = useState<RecordQuery | null>(null);
  const [by, setBy] = useState<'ai' | 'rules' | 'quick' | null>(null);
  const [loading, setLoading] = useState(false);

  const colonyRefs = useMemo(() => (source?.colonies ?? []).map((c) => ({ id: c.id, alias: c.alias })), [source]);
  const colonyAlias = query?.colonyId ? (colonyRefs.find((c) => c.id === query.colonyId)?.alias ?? null) : null;

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    Keyboard.dismiss();
    setQuestion(trimmed);
    setLoading(true);
    const rules = parseQueryRules(trimmed, colonyRefs);
    try {
      const ai = await parseRecordQueryWithAI(trimmed, colonyRefs);
      // AI가 문장 검색인데 단어를 못 뽑았으면 규칙 기반 단어로 채운다.
      setQuery(ai.intent === 'text' && ai.keywords.length === 0 ? { ...ai, keywords: rules.keywords } : ai);
      setBy('ai');
    } catch (err) {
      console.warn('[search] AI 해석을 못 써서 규칙 기반으로 해석해요:', err instanceof Error ? err.message : err);
      setQuery(rules);
      setBy('rules');
    } finally {
      setLoading(false);
    }
  };

  const quick = (intent: RecordQuery['intent']) => {
    Keyboard.dismiss();
    setQuestion('');
    setQuery({ intent, year: 'all', ingredient: null, keywords: [], colonyId: null });
    setBy('quick');
  };

  const treatments = useMemo(
    () => (source && query?.intent === 'treatment' ? searchTreatments(source, query) : null),
    [source, query],
  );
  const wintering = useMemo(
    () => (source && query?.intent === 'wintering' ? compareWintering(source, query) : null),
    [source, query],
  );
  const texts = useMemo(() => (source && query?.intent === 'text' ? searchText(source, query) : null), [source, query]);
  const winteringTotal = wintering ? OUTCOME_ORDER.reduce((n, k) => n + wintering[k].length, 0) : 0;

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.xl }}>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.display4, color: colors.textPrimary }}>기록 찾기</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}
      >
        <TextField
          label="무엇을 찾을까요?"
          value={question}
          onChangeText={setQuestion}
          placeholder="예) 작년에 쓴 방제 약품과 용량"
          returnKeyType="search"
          onSubmitEditing={() => void ask(question)}
        />
        <Button label="AI로 찾기" onPress={() => void ask(question)} loading={loading} disabled={!question.trim() || !source} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {EXAMPLES.map((ex) => (
            <Chip key={ex} label={ex} onPress={() => void ask(ex)} />
          ))}
        </ScrollView>

        <Text style={{ ...mutedXs, lineHeight: 16 }}>
          AI는 질문 문장만 해석해요. 내 기록은 이 기기 안에서만 찾고, 결과에는 기록에 적힌 내용만 그대로 나와요.
        </Text>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
          <Chip label="방제 이력 보기" onPress={() => quick('treatment')} />
          <Chip label="월동 결과 비교" onPress={() => quick('wintering')} />
        </View>

        {query && (
          <Card size="medium" tint={colors.surfaceTint}>
            <View style={{ gap: spacing.sm }}>
              <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.primary }}>
                이렇게 찾았어요: {describeQuery(query, colonyAlias).join(' · ')}
              </Text>
              {by === 'rules' && (
                <Text style={mutedXs}>AI를 쓸 수 없어서 기본 규칙으로 해석했어요. 해석이 다르면 아래 조건을 바꿔보세요.</Text>
              )}
              {by === 'ai' && <Text style={mutedXs}>해석이 다르면 아래 조건을 바꿔보세요.</Text>}

              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                {YEARS.map((y) => (
                  <Chip key={y} label={YEAR_LABEL[y]} selected={query.year === y} onPress={() => setQuery({ ...query, year: y })} />
                ))}
                {query.colonyId && <Chip label="봉군 조건 해제" onPress={() => setQuery({ ...query, colonyId: null })} />}
              </View>

              {query.intent === 'treatment' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  <Chip label="성분 전체" selected={query.ingredient === null} onPress={() => setQuery({ ...query, ingredient: null })} />
                  {INGREDIENT_OPTIONS.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      selected={query.ingredient === o.value}
                      onPress={() => setQuery({ ...query, ingredient: o.value })}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          </Card>
        )}

        {treatments && (
          <>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
              방제 기록 {treatments.length}건
            </Text>
            {treatments.length === 0 && (
              <Card size="large">
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                  조건에 맞는 방제 기록이 없어요. 연도를 &quot;전체&quot;로 바꾸거나 성분을 &quot;전체&quot;로 바꿔 보세요.
                </Text>
              </Card>
            )}
            {treatments.map((t) => (
              <Card
                key={t.recordId}
                size="medium"
                onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId: t.colonyId } })}
              >
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.md, color: colors.textPrimary }}>{t.colonyAlias}</Text>
                    <Text style={mutedXs}>{formatDate(t.at)}</Text>
                  </View>
                  <FactLine label="성분" value={ingredientLabel(t.ingredient)} />
                  <FactLine label="제품명" value={t.product} />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Text style={{ width: 64, fontFamily: fontFamilies.semibold, fontSize: fontSizes.sm, color: colors.textMuted }}>용량</Text>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: fontFamilies.semibold,
                        fontSize: fontSizes.sm,
                        color: t.dose ? colors.textPrimary : statusColors.caution.text,
                      }}
                    >
                      {t.dose ?? '용량 기록 없음'}
                    </Text>
                  </View>
                  {t.legacyMethod && <FactLine label="약제·방법" value={t.legacyMethod} />}
                  {t.note && <Text style={{ ...mutedXs, lineHeight: 16 }}>메모: {t.note}</Text>}
                </View>
              </Card>
            ))}
          </>
        )}

        {wintering && (
          <>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
              월동 결과가 기록된 봉군 {winteringTotal}개
            </Text>
            {winteringTotal === 0 && (
              <Card size="large">
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                  월동 결과(성공·약세·폐사)가 기록된 봉군이 없어요. 겨울이 지난 뒤 봉군 상세에서 &quot;월동 결과·폐군&quot;을 기록하면 여기서 비교할 수 있어요.
                </Text>
              </Card>
            )}
            {OUTCOME_ORDER.map((outcome) =>
              wintering[outcome].length === 0 ? null : (
                <View key={outcome} style={{ gap: spacing.sm }}>
                  <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.body, color: colors.textPrimary }}>
                    {OUTCOME_LABEL[outcome]} ({wintering[outcome].length})
                  </Text>
                  {wintering[outcome].map((entry) => (
                    <WinteringCard key={`${entry.colonyId}-${entry.resultAt}`} entry={entry} />
                  ))}
                </View>
              ),
            )}
            {winteringTotal > 0 && (
              <Text style={{ ...mutedXs, lineHeight: 16 }}>
                결과를 기록하기 전에 마지막으로 기록한 값이에요(괄호는 기록한 날). 봉군 수가 적으면 우연일 수 있어서, 원인을
                단정하는 자료가 아니라 나란히 놓고 보는 참고용이에요.
              </Text>
            )}
          </>
        )}

        {texts && (
          <>
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodyLg, color: colors.textPrimary }}>
              기록 속 문장 {texts.length}건
            </Text>
            {query?.keywords.length === 0 && (
              <Card size="large">
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                  찾을 단어를 질문에서 뽑지 못했어요. 찾고 싶은 단어를 넣어서 다시 물어봐 주세요. 예) &quot;말벌 얘기한 기록&quot;
                </Text>
              </Card>
            )}
            {query && query.keywords.length > 0 && texts.length === 0 && (
              <Card size="large">
                <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                  &quot;{query.keywords.join(', ')}&quot;이(가) 들어 있는 메모·음성 원문이 없어요.
                </Text>
              </Card>
            )}
            {texts.map((hit, i) => (
              <Card
                key={`${hit.recordId}-${hit.source}-${i}`}
                size="medium"
                onPress={() => router.push({ pathname: '/(tabs)/colonies/[colonyId]/detail', params: { colonyId: hit.colonyId } })}
              >
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.bodySm, color: colors.textPrimary }}>
                      {hit.colonyAlias} · {TEXT_SOURCE_LABEL[hit.source]}
                    </Text>
                    <Text style={mutedXs}>{formatDate(hit.at)}</Text>
                  </View>
                  <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textSecondary, lineHeight: 20 }}>
                    &ldquo;{hit.sentence}&rdquo;
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
