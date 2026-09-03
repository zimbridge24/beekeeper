import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/AuthProvider';
import { useDatabaseMigrations } from '../db/migrate';
import { useSyncTriggers } from '../sync/triggers';
import { usePretendardFonts } from '../theme/fonts';

SplashScreen.preventAutoHideAsync();

function AppShell() {
  useSyncTriggers();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(setup)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sync" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = usePretendardFonts();
  const { success: migrationsSuccess, error: migrationsError } = useDatabaseMigrations();

  const ready = (fontsLoaded || !!fontsError) && (migrationsSuccess || !!migrationsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  if (migrationsError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text>데이터베이스 초기화에 실패했습니다: {String(migrationsError)}</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
