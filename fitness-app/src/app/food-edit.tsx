import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { FAVORITE_COLOR } from '@/lib/food-actions';
import { parseNum, type Food } from '@/lib/types';

const toText = (n: number | null | undefined) => (n ? String(Math.round(n * 10) / 10).replace('.', ',') : '');

/** Edit (with `id`) or create one of the user's own foods. Values are per 100 g. */
export default function FoodEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const foods = useApi<Food[]>(id ? '/foods/recent?all=1' : null).data;
  const food = foods ? foods.find((f) => String(f.id) === id) : undefined;
  if (id && !food) return null;
  return <FoodForm key={food ? food.id : 'new'} food={food} />;
}

function FoodForm({ food }: { food?: Food }) {
  'use no memo';
  const [name, setName] = useState(food ? food.name : '');
  const [brand, setBrand] = useState(food && food.brand ? food.brand : '');
  const [kcal, setKcal] = useState(food ? toText(food.kcal) : '');
  const [protein, setProtein] = useState(food ? toText(food.protein) : '');
  const [carbs, setCarbs] = useState(food ? toText(food.carbs) : '');
  const [fat, setFat] = useState(food ? toText(food.fat) : '');
  const [serving, setServing] = useState(food ? toText(food.servingGrams) : '');
  const [favorite, setFavorite] = useState(food ? !!food.favorite : false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return Alert.alert('Name fehlt', 'Gib dem Lebensmittel einen Namen.');
    setSaving(true);
    const body = {
      name: name.trim(),
      brand: brand.trim() || null,
      kcal: parseNum(kcal),
      protein: parseNum(protein),
      carbs: parseNum(carbs),
      fat: parseNum(fat),
      servingGrams: serving ? parseNum(serving) : null,
      favorite,
    };
    try {
      if (food) await api.put(`/foods/${food.id}`, body);
      else await api.post('/foods', body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  const remove = () =>
    Alert.alert(`„${food!.name}“ löschen?`, 'Bereits eingetragene Mahlzeiten bleiben erhalten.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await api.del(`/foods/${food!.id}`);
          invalidate();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: food ? 'Lebensmittel bearbeiten' : 'Neues Lebensmittel' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Abbrechen</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <List>
        <Field label="Name" value={name} onChange={setName} text autoFocus={!food} />
        <Field label="Marke" value={brand} onChange={setBrand} text placeholder="optional" />
      </List>

      <Section title="Pro 100 g">
        <List>
          <Field label="Kalorien" unit="kcal" value={kcal} onChange={setKcal} />
          <Field label="Protein" unit="g" value={protein} onChange={setProtein} />
          <Field label="Kohlenhydrate" unit="g" value={carbs} onChange={setCarbs} />
          <Field label="Fett" unit="g" value={fat} onChange={setFat} />
        </List>
      </Section>

      <List>
        <Field label="Portion" unit="g" value={serving} onChange={setServing} placeholder="optional" />
        <Row
          title="Favorit"
          icon="star.fill"
          iconColor={FAVORITE_COLOR}
          right={<Switch value={favorite} onValueChange={setFavorite} trackColor={{ true: Colors.accent }} />}
        />
      </List>

      {food && (
        <List>
          <Row title="Lebensmittel löschen" destructive onPress={remove} />
        </List>
      )}
    </Screen>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  text,
  autoFocus,
  placeholder = '0',
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  text?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <AppText style={text ? undefined : styles.label}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={text ? 'default' : 'decimal-pad'}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        autoFocus={autoFocus}
        style={[styles.input, text && styles.textInput]}
      />
      {unit ? (
        <AppText color={Colors.textSecondary} style={styles.unit}>
          {unit}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, minHeight: 50, gap: Spacing.two },
  label: { flex: 1 },
  input: { minWidth: 80, textAlign: 'right', color: Colors.text, fontSize: 17, fontWeight: 600 },
  textInput: { flex: 1 },
  unit: { width: 36 },
});
