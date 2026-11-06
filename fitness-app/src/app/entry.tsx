import { DatePicker, Host } from '@expo/ui/swift-ui';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { toDateKey } from '@/lib/date';
import { deleteEntryFromHealth } from '@/lib/health';
import { MEALS, parseNum, type Entry, type Meal } from '@/lib/types';

const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

/** Sheet to change a logged food: amount, meal, day and name. Macros scale with the amount. */
export default function EntryScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const entries = useApi<Entry[]>(`/entries?date=${date}`).data;
  const entry = entries ? entries.find((e) => String(e.id) === id) : undefined;
  if (!entry) return null;
  return <EntryForm key={entry.id} entry={entry} />;
}

function EntryForm({ entry }: { entry: Entry }) {
  'use no memo';
  const [name, setName] = useState(entry.name);
  const [grams, setGrams] = useState(String(Math.round(entry.grams * 10) / 10).replace('.', ','));
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const [day, setDay] = useState(() => keyToDate(entry.date.slice(0, 10)));
  const [saving, setSaving] = useState(false);

  const amount = parseNum(grams);
  const f = entry.grams > 0 ? amount / entry.grams : 0;

  const save = async () => {
    if (saving) return;
    if (amount <= 0) return Alert.alert('Menge fehlt', 'Trag eine Menge größer als 0 ein.');
    setSaving(true);
    try {
      await api.put(`/entries/${entry.id}`, { grams: amount, meal, date: toDateKey(day), name: name.trim() || entry.name });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  const remove = () =>
    Alert.alert(entry.name, 'Eintrag löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await api.del(`/entries/${entry.id}`);
          deleteEntryFromHealth(entry.id);
          invalidate();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Eintrag bearbeiten' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Abbrechen</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={Colors.textTertiary} style={styles.nameInput} />

      <Card style={styles.amountCard}>
        <AppText type="headline" style={styles.flex}>
          Menge
        </AppText>
        <TextInput value={grams} onChangeText={setGrams} keyboardType="decimal-pad" selectTextOnFocus style={styles.input} />
        <AppText color={Colors.textSecondary}>g</AppText>
      </Card>

      <Card style={styles.macros}>
        <Value label="kcal" value={entry.kcal * f} color={Colors.kcal} />
        <Value label="Protein" value={entry.protein * f} color={Colors.protein} unit="g" />
        <Value label="Kohlenh." value={entry.carbs * f} color={Colors.carbs} unit="g" />
        <Value label="Fett" value={entry.fat * f} color={Colors.fat} unit="g" />
      </Card>

      <Section title="Mahlzeit">
        <View style={styles.chips}>
          {MEALS.map((x) => (
            <Chip key={x.key} label={x.label} active={meal === x.key} onPress={() => setMeal(x.key)} />
          ))}
        </View>
      </Section>

      <List>
        <Row
          title="Tag"
          icon="calendar"
          right={
            <Host matchContents>
              <DatePicker selection={day} displayedComponents={['date']} onDateChange={setDay} />
            </Host>
          }
        />
      </List>

      <List>
        <Row title="Eintrag löschen" destructive onPress={remove} />
      </List>
    </Screen>
  );
}

function Value({ label, value, color, unit = '' }: { label: string; value: number; color: string; unit?: string }) {
  return (
    <View style={styles.value}>
      <AppText type="title" color={color}>
        {Math.round(value)}
        {unit}
      </AppText>
      <AppText type="caption" color={Colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nameInput: {
    backgroundColor: Colors.card,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    height: 50,
    color: Colors.text,
    fontSize: 18,
    fontWeight: 600,
  },
  amountCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { minWidth: 90, textAlign: 'right', color: Colors.text, fontSize: 28, fontWeight: 700 },
  macros: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { alignItems: 'center', flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
