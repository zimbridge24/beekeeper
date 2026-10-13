import { useState } from 'react';
import { Text, View } from 'react-native';

import { parseColonyRange } from '../features/colonies/colonyRange';
import { ColonySpecies } from '../repositories/colonyRepository';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../theme/tokens';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';

export type ColonyFormValues = {
  alias: string;
  species: ColonySpecies;
};

export type ColonyBatchValues = {
  aliases: string[];
  species: ColonySpecies;
};

type Props = {
  initial?: Partial<ColonyFormValues>;
  submitLabel: string;
  onSubmit: (values: ColonyFormValues) => Promise<void> | void;
  // 주어지면 "여러 개 한 번에 만들기"가 켜진다 — 수정 화면처럼 새로 만들지 않는 곳에서는 넘기지 않는다.
  onSubmitBatch?: (values: ColonyBatchValues) => Promise<void> | void;
  saving?: boolean;
};

const MAX_BATCH = 100;
const MAX_START_NUMBER = 9999;

function toInt(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  return Number(digits);
}

export function batchAliases(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${start + i}번 봉군`);
}

export function ColonyForm({ initial, submitLabel, onSubmit, onSubmitBatch, saving }: Props) {
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [species, setSpecies] = useState<ColonySpecies>(initial?.species ?? 'western');
  const [batch, setBatch] = useState(false);
  const [startText, setStartText] = useState('1');
  const [countText, setCountText] = useState('');

  const start = toInt(startText);
  const count = toInt(countText);
  const batchValid =
    start !== null && start >= 1 && start <= MAX_START_NUMBER && count !== null && count >= 1 && count <= MAX_BATCH;
  const aliases = batchValid ? batchAliases(start, count) : [];

  // 이름칸에 "1~20"처럼 범위를 쓰면 하나의 이름이 아니라 일괄 등록으로 알아듣는다.
  const range = onSubmitBatch && !batch ? parseColonyRange(alias) : null;
  const rangeCount = range ? range.end - range.start + 1 : 0;
  const rangeTooMany = range !== null && (rangeCount > MAX_BATCH || range.end > MAX_START_NUMBER);
  const rangeAliases = range && !rangeTooMany ? batchAliases(range.start, rangeCount) : [];

  return (
    <View style={{ gap: spacing.xl }}>
      {batch && onSubmitBatch ? (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <TextField
                label="시작 번호"
                value={startText}
                onChangeText={setStartText}
                keyboardType="number-pad"
                placeholder="1"
                maxLength={4}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                label="만들 개수"
                value={countText}
                onChangeText={setCountText}
                keyboardType="number-pad"
                placeholder="20"
                maxLength={3}
              />
            </View>
          </View>
          <View style={{ backgroundColor: colors.surfaceTint, borderRadius: radius.cardMedium, padding: spacing.lg }}>
            <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.primary, lineHeight: 20 }}>
              {batchValid
                ? `${aliases[0]} ~ ${aliases[aliases.length - 1]} (${aliases.length}개)를 만들어요`
                : `시작 번호와 개수(1~${MAX_BATCH})를 입력하면 한 번에 만들어요`}
            </Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <TextField label="봉군 이름/번호" value={alias} onChangeText={setAlias} placeholder="예) 1번 봉군  또는  1~20" />
          {range && (
            <View style={{ backgroundColor: colors.surfaceTint, borderRadius: radius.cardMedium, padding: spacing.lg }}>
              <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.primary, lineHeight: 20 }}>
                {rangeTooMany
                  ? `한 번에 최대 ${MAX_BATCH}개까지, 번호는 ${MAX_START_NUMBER}번까지 만들 수 있어요`
                  : `이름이 아니라 번호 범위로 보여요. ${rangeAliases[0]} ~ ${rangeAliases[rangeAliases.length - 1]} (${rangeAliases.length}개)를 한 번에 만들어요`}
              </Text>
            </View>
          )}
        </View>
      )}

      <View>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>
          벌 종류{batch ? ' (모두 같은 종류로 만들어져요)' : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <Chip label="서양벌" selected={species === 'western'} onPress={() => setSpecies('western')} flex />
          <Chip label="토종벌" selected={species === 'native'} onPress={() => setSpecies('native')} flex />
        </View>
      </View>

      {batch && onSubmitBatch ? (
        <Button
          label={batchValid ? `${aliases.length}개 한 번에 만들기` : submitLabel}
          loading={saving}
          disabled={!batchValid}
          onPress={() => onSubmitBatch({ aliases, species })}
        />
      ) : (
        <Button
          label={range && !rangeTooMany ? `${rangeAliases.length}개 한 번에 만들기` : submitLabel}
          loading={saving}
          disabled={!alias.trim() || rangeTooMany}
          onPress={() => (range && onSubmitBatch ? onSubmitBatch({ aliases: rangeAliases, species }) : onSubmit({ alias: alias.trim(), species }))}
        />
      )}

      {onSubmitBatch && (
        <Button
          label={batch ? '하나씩 만들기' : '여러 개 한 번에 만들기'}
          variant="surface"
          onPress={() => setBatch((b) => !b)}
        />
      )}
    </View>
  );
}
