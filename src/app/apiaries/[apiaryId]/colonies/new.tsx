import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ColonyForm, ColonyFormValues } from '../../../../components/ColonyForm';
import { Screen } from '../../../../components/Screen';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { createColony } from '../../../../repositories/colonyRepository';

export default function NewColonyScreen() {
  const { apiaryId } = useLocalSearchParams<{ apiaryId: string }>();
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (values: ColonyFormValues) => {
    if (!apiaryId) return;
    setSaving(true);
    try {
      await createColony({ apiaryId, ...values });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded>
      <ScreenHeader title="봉군 추가" onBack={() => router.back()} />
      <ColonyForm submitLabel="추가" onSubmit={handleSubmit} saving={saving} />
    </Screen>
  );
}
