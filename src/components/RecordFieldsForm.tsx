import { Text, View } from 'react-native';

import { FieldInputState, getVisibleFields, RecordTypeField } from '../features/records/recordTypesConfig';
import { colors, fontFamilies, fontSizes, radius, spacing } from '../theme/tokens';
import { FieldStateSelector } from './FieldStateSelector';
import { NumberField } from './NumberField';
import { TextField } from './TextField';

type Props = {
  fields: RecordTypeField[];
  state: FieldInputState;
  onChange: (next: FieldInputState) => void;
  // AI(음성·사진)가 채운 필드 — "AI 추정" 표시를 붙여 사용자가 한 번 더 확인하게 한다.
  aiSuggestedKeys?: ReadonlySet<string>;
};

function AiBadge() {
  return (
    <View style={{ alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: '#E3EDF3' }}>
      <Text style={{ fontFamily: fontFamilies.bold, fontSize: fontSizes.xs, color: '#3B6E90' }}>AI 추정</Text>
    </View>
  );
}

// 기록 폼 네 곳(빠른 내검 · 추가 기록 · 사진 AI · 음성 검토)이 전부 이 하나로 필드를 그린다.
// 수동으로 입력하든 AI가 채웠든 같은 필드, 같은 입력 컴포넌트 — 세부 항목은 부모 값에
// 따라 열려서 빠른 기록 화면이 길어지지 않는다.
export function RecordFieldsForm({ fields, state, onChange, aiSuggestedKeys }: Props) {
  const visible = getVisibleFields(fields, state);

  return (
    <View style={{ gap: spacing.xl }}>
      {visible.map((field) => {
        const aiSuggested = aiSuggestedKeys?.has(field.key) ?? false;
        if (field.kind === 'number') {
          return (
            <NumberField
              key={field.key}
              label={field.label}
              value={state.numbers[field.key]}
              onChange={(v) => onChange({ ...state, numbers: { ...state.numbers, [field.key]: v } })}
              unit={field.unit}
              max={field.max}
              step={field.step}
              hint={field.hint}
              aiSuggested={aiSuggested}
            />
          );
        }
        if (field.kind === 'text') {
          return (
            <View key={field.key} style={{ gap: 4 }}>
              {aiSuggested && <AiBadge />}
              <TextField
                label={field.label}
                value={state.texts[field.key] ?? ''}
                onChangeText={(t) => onChange({ ...state, texts: { ...state.texts, [field.key]: t } })}
                placeholder={field.hint}
              />
            </View>
          );
        }
        return (
          <View key={field.key} style={{ gap: 4 }}>
            {aiSuggested && <AiBadge />}
            <FieldStateSelector
              label={field.required ? `${field.label} (필수)` : field.label}
              kind={field.kind}
              value={state.values[field.key]}
              onChange={(v) => onChange({ ...state, values: { ...state.values, [field.key]: v } })}
            />
          </View>
        );
      })}
      {visible.length === 0 && (
        <Text style={{ fontFamily: fontFamilies.semibold, fontSize: fontSizes.bodySm, color: colors.textMuted }}>입력할 항목이 없어요.</Text>
      )}
    </View>
  );
}
