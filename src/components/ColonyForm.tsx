import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

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
        <TextField label="봉군 이름/번호" value={alias} onChangeText={setAlias} placeholder="예) 1번 봉군" />
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
        <Button label={submitLabel} loading={saving} disabled={!alias.trim()} onPress={() => onSubmit({ alias: alias.trim(), species })} />
      )}

      {onSubmitBatch && (
        <Pressable onPress={() => setBatch((b) => !b)} hitSlop={10} style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.primary }}>
            {batch ? '하나씩 만들기' : '여러 개 한 번에 만들기 (예: 1번~20번)'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
