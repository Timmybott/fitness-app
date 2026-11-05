import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState, List, PrimaryButton, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { logEntryToHealth } from '@/lib/health';
import { bridge } from '@/lib/bridge';
import { pickPhoto, type PickedPhoto } from '@/lib/photo';
import { MEALS, parseNum, portionToFood, sumMacros, type Entry, type Meal, type PortionItem } from '@/lib/types';

type AiItem = PortionItem & { isWater?: boolean };
type Result = { items: AiItem[]; note: string | null };
type EditableItem = AiItem & { amount: string; include: boolean };

export default function PhotoScreen() {
  const { date, meal: initialMeal, mode } = useLocalSearchParams<{ date: string; meal: Meal; mode?: 'food' | 'drink' }>();
  const status = useApi<{ enabled: boolean }>('/ai/status').data;
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [items, setItems] = useState<EditableItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [busy, setBusy] = useState(false);

  const analyze = async (picked: PickedPhoto) => {
    try {
      setPhoto(picked);
      setItems(null);
      setBusy(true);
      const r = await api.post<Result>('/ai/food-photo', { image: picked.base64, mimeType: 'image/jpeg' });
      setItems(r.items.map((i) => ({ ...i, amount: String(Math.round(i.grams)), include: true })));
      setNote(r.note);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Analyse fehlgeschlagen', (e as Error).message, [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setBusy(false);
    }
  };

  // Macros scale with the amount the user corrected.
  const scaled = (i: EditableItem): AiItem => {
    const g = parseNum(i.amount);
    const f = i.grams > 0 ? g / i.grams : 0;
    return { name: i.name, grams: g, kcal: i.kcal * f, protein: i.protein * f, carbs: i.carbs * f, fat: i.fat * f, isWater: i.isWater };
  };
  const chosen = (items ?? []).filter((i) => i.include && parseNum(i.amount) > 0).map(scaled);
  const total = sumMacros(chosen);

  const save = async () => {
    setBusy(true);
    try {
      for (const item of chosen) {
        // Plain water goes to the water tracker (grams = ml), everything else into the diary.
        if (item.isWater) {
          await api.post('/water', { date, ml: Math.round(item.grams), name: item.name });
          continue;
        }
        const entry = await api.post<Entry>('/entries', { food: portionToFood(item), grams: item.grams, date, meal, saveFood: false });
        logEntryToHealth(entry);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      router.back();
    } catch (e) {
      setBusy(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  // The photo was taken before this screen opened (see startPhotoEntry); analyze it right away.
  const started = useRef(false);
  useEffect(() => {
    if (status?.enabled && !started.current) {
      started.current = true;
      const pending = bridge.takePhoto();
      // Started after the effect (not synchronously inside it) to avoid a cascading render.
      if (pending) Promise.resolve().then(() => analyze(pending));
    }
  });

  const retake = async () => {
    try {
      const picked = await pickPhoto('camera');
      if (picked) analyze(picked);
    } catch (e) {
      Alert.alert('Foto', (e as Error).message);
    }
  };

  const update = (index: number, patch: Partial<EditableItem>) =>
    setItems((list) => list && list.map((x, i) => (i === index ? { ...x, ...patch } : x)));

  if (status && !status.enabled) {
    return (
      <Screen>
        <Stack.Screen options={{ title: mode === 'drink' ? 'Getränk' : 'Foto' }} />
        <Card>
          <EmptyState
            icon="sparkles"
            title="KI noch nicht eingerichtet"
            text="Auf deinem Server fehlt noch der API-Key für das KI-Modell. Sobald er eingetragen ist, funktioniert die Foto-Analyse hier."
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: mode === 'drink' ? 'Getränk' : 'Foto' }} />

      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.image} contentFit="cover" />
      ) : (
        !busy && <PrimaryButton title="Foto aufnehmen" onPress={retake} />
      )}

      {busy && !items && (
        <View style={styles.busy}>
          <ActivityIndicator color={Colors.accent} />
          <AppText color={Colors.textSecondary}>Analysiere dein Essen…</AppText>
        </View>
      )}

      {items && items.length === 0 && (
        <Card>
          <EmptyState icon="questionmark.circle" title="Nichts erkannt" text={note ?? 'Versuch es mit einem anderen Foto.'} />
        </Card>
      )}

      {items && items.length > 0 && (
        <>
          <Section title="Erkannt" footer={note ?? undefined}>
            <List>
              {items.map((item, i) => {
                const s = scaled(item);
                return (
                  <View key={i} style={styles.item}>
                    <Pressable onPress={() => update(i, { include: !item.include })} hitSlop={8}>
                      <SymbolView
                        name={item.include ? 'checkmark.circle.fill' : 'circle'}
                        size={24}
                        tintColor={item.include ? Colors.accent : Colors.textTertiary}
                      />
                    </Pressable>
                    <View style={styles.flex}>
                      <AppText numberOfLines={1} color={item.include ? Colors.text : Colors.textTertiary}>
                        {item.name}
                      </AppText>
                      <AppText type="caption" color={Colors.textSecondary}>
                        {Math.round(s.kcal)} kcal · P {Math.round(s.protein)} · K {Math.round(s.carbs)} · F {Math.round(s.fat)}
                      </AppText>
                    </View>
                    <TextInput
                      value={item.amount}
                      onChangeText={(v) => update(i, { amount: v })}
                      keyboardType="number-pad"
                      selectTextOnFocus
                      style={styles.amount}
                    />
                    <AppText color={Colors.textSecondary}>g</AppText>
                  </View>
                );
              })}
            </List>
          </Section>

          <View style={styles.chips}>
            {MEALS.map((m) => (
              <Chip key={m.key} label={m.label} active={meal === m.key} onPress={() => setMeal(m.key)} />
            ))}
          </View>

          <PrimaryButton
            title={`${chosen.length} ${chosen.length === 1 ? 'Eintrag' : 'Einträge'} hinzufügen · ${Math.round(total.kcal)} kcal`}
            onPress={save}
            disabled={chosen.length === 0}
            loading={busy}
          />
          <List>
            <Row title="Neues Foto" icon="camera.fill" onPress={retake} />
          </List>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: Radius.large },
  busy: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.three },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  amount: {
    minWidth: 56,
    height: 34,
    textAlign: 'center',
    borderRadius: Radius.small,
    backgroundColor: Colors.cardElevated,
    color: Colors.text,
    fontSize: 16,
    fontWeight: 600,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
