import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

/** Native stack used inside each tab: large collapsing title over a transparent (glass) header. */
export function TabStack({ title }: { title: string }) {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerTintColor: Colors.accent,
        headerTitleStyle: { color: Colors.text },
        headerLargeTitleStyle: { color: Colors.text },
      }}>
      <Stack.Screen name="index" options={{ title }} />
    </Stack>
  );
}
