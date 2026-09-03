import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { ApiaryForm, ApiaryFormValues } from '../../components/ApiaryForm';
import { Screen } from '../../components/Screen';
import { ScreenHeader } from '../../components/ScreenHeader';
import { createApiary } from '../../repositories/apiaryRepository';
import { spacing } from '../../theme/tokens';

export default function NewApiaryScreen() {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: ApiaryFormValues) => {
    setSaving(true);
    try {
      await createApiary(values);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <ScreenHeader title="양봉장 추가" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}>
        <ApiaryForm submitLabel="추가" onSubmit={handleSubmit} saving={saving} />
      </ScrollView>
    </Screen>
  );
}
