import { useState } from 'react';
import { Text, View } from 'react-native';

import { ColonySpecies } from '../repositories/colonyRepository';
import { colors, fontFamilies, fontSizes, spacing } from '../theme/tokens';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';

export type ColonyFormValues = {
  alias: string;
  species: ColonySpecies;
};

type Props = {
  initial?: Partial<ColonyFormValues>;
  submitLabel: string;
  onSubmit: (values: ColonyFormValues) => Promise<void> | void;
  saving?: boolean;
};

export function ColonyForm({ initial, submitLabel, onSubmit, saving }: Props) {
  const [alias, setAlias] = useState(initial?.alias ?? '');
  const [species, setSpecies] = useState<ColonySpecies>(initial?.species ?? 'western');

  return (
    <View style={{ gap: spacing.xl }}>
      <TextField label="봉군 이름/번호" value={alias} onChangeText={setAlias} placeholder="예) 1번 봉군" />

      <View>
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.sm, color: colors.textMuted }}>벌 종류</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <Chip label="서양벌" selected={species === 'western'} onPress={() => setSpecies('western')} flex />
          <Chip label="토종벌" selected={species === 'native'} onPress={() => setSpecies('native')} flex />
        </View>
      </View>

      <Button label={submitLabel} loading={saving} disabled={!alias.trim()} onPress={() => onSubmit({ alias: alias.trim(), species })} />
    </View>
  );
}
