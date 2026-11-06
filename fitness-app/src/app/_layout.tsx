import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { installErrorReporting } from '@/lib/error-reporting';

SplashScreen.preventAutoHideAsync();
installErrorReporting();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.accent,
    background: Colors.background,
    card: Colors.card,
    text: Colors.text,
    border: Colors.separator,
  },
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <RootStack />
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootStack() {
  const { state } = useAuth();

  useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === 'loading') return null;
  const signedIn = state.status === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-food" options={{ presentation: 'modal', headerShown: true, title: 'Hinzufügen' }} />
        <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="photo" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="recipe" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="shortcut" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="recipe-scan" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="exercise-picker" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="food-picker" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen
          name="meal"
          options={{ presentation: 'formSheet', headerShown: true, sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }}
        />
        <Stack.Screen
          name="entry"
          options={{ presentation: 'formSheet', headerShown: true, sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true }}
        />
        <Stack.Screen name="my-foods" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="food-edit" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="reminders" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="password" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal', headerShown: true, gestureEnabled: false }} />
        <Stack.Screen name="template" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen
          name="templates"
          options={{ presentation: 'formSheet', headerShown: true, sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true }}
        />
        <Stack.Screen name="workout-log" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="workout-detail" options={{ presentation: 'modal', headerShown: true }} />
        <Stack.Screen name="cardio" options={{ presentation: 'modal', headerShown: true, title: 'Cardio' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
