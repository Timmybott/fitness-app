import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountForm } from '@/components/amount-form';
import { AppText } from '@/components/app-text';
import { IconButton } from '@/components/icon-button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { fetchProductByBarcode } from '@/lib/openfoodfacts';
import { type Food, type Meal } from '@/lib/types';

type State =
  | { kind: 'scanning' }
  | { kind: 'loading'; code: string }
  | { kind: 'found'; food: Food }
  | { kind: 'notFound'; code: string };

export default function ScanScreen() {
  const { date, meal, mode } = useLocalSearchParams<{ date: string; meal: Meal; mode?: 'drink' }>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<State>({ kind: 'scanning' });
  // The camera fires many events per second; only handle the first one.
  const locked = useRef(false);

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setState({ kind: 'loading', code: data });
    try {
      const food = await fetchProductByBarcode(data);
      setState(food ? { kind: 'found', food } : { kind: 'notFound', code: data });
    } catch {
      setState({ kind: 'notFound', code: data });
    }
  };

  const rescan = () => {
    locked.current = false;
    setState({ kind: 'scanning' });
  };

  if (state.kind === 'found') {
    return (
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={[styles.sheetContent, { paddingTop: insets.top + Spacing.three }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.sheetHeader}>
          <IconButton icon="xmark" onPress={() => router.back()} />
        </View>
        <AmountForm drink={mode === 'drink'} food={state.food} date={date} initialMeal={meal} onSaved={() => router.back()} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={state.kind === 'scanning' ? onScanned : undefined}
        />
      ) : (
        <View style={styles.center}>
          <AppText type="headline">Kamerazugriff benötigt</AppText>
          <AppText color={Colors.textSecondary} style={styles.centerText}>
            Um Barcodes zu scannen, braucht die App Zugriff auf die Kamera.
          </AppText>
          <Pressable style={styles.button} onPress={requestPermission}>
            <AppText type="headline" color={Colors.onAccent}>
              Zugriff erlauben
            </AppText>
          </Pressable>
        </View>
      )}

      <View style={[styles.topBar, { top: insets.top + Spacing.two }]}>
        <IconButton icon="xmark" onPress={() => router.back()} />
      </View>

      {permission?.granted && <View style={styles.frame} pointerEvents="none" />}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.four }]}>
        {state.kind === 'scanning' && <AppText type="headline">Barcode in den Rahmen halten</AppText>}
        {state.kind === 'loading' && <ActivityIndicator color={Colors.accent} size="large" />}
        {state.kind === 'notFound' && (
          <View style={styles.notFound}>
            <AppText type="headline">Produkt nicht gefunden</AppText>
            <AppText color={Colors.textSecondary}>Barcode {state.code}</AppText>
            <Pressable style={styles.button} onPress={rescan}>
              <AppText type="headline" color={Colors.onAccent}>
                Nochmal scannen
              </AppText>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  centerText: { textAlign: 'center' },
  topBar: { position: 'absolute', left: Spacing.three },
  frame: {
    position: 'absolute',
    top: '32%',
    left: '12%',
    right: '12%',
    height: 160,
    borderWidth: 3,
    borderColor: Colors.accent,
    borderRadius: Radius.large,
  },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', padding: Spacing.three },
  notFound: {
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.card,
    borderRadius: Radius.large,
    padding: Spacing.four,
    alignSelf: 'stretch',
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetContent: { padding: Spacing.three, paddingBottom: Spacing.six },
  sheetHeader: { alignItems: 'flex-end', marginBottom: Spacing.two },
});
