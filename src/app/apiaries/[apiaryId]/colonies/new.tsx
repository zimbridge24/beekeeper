import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ColonyBatchValues, ColonyForm, ColonyFormValues } from '../../../../components/ColonyForm';
import { Screen } from '../../../../components/Screen';
import { ScreenHeader } from '../../../../components/ScreenHeader';
import { createColonies, createColony } from '../../../../repositories/colonyRepository';

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

  const handleBatchSubmit = async (values: ColonyBatchValues) => {
    if (!apiaryId) return;
    setSaving(true);
    try {
      await createColonies({ apiaryId, ...values });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded>
      <ScreenHeader title="봉군 추가" onBack={() => router.back()} />
      <ColonyForm submitLabel="추가" onSubmit={handleSubmit} onSubmitBatch={handleBatchSubmit} saving={saving} />
    </Screen>
  );
}
