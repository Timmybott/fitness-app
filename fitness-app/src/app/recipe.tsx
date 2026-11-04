import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FoodSearch } from '@/components/food-search';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { parseNum, scaleMacros, sumMacros, type Food, type PortionItem, type Recipe } from '@/lib/types';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const recipes = useApi<Recipe[]>(id ? '/recipes' : null).data;
  const existing = recipes?.find((r) => String(r.id) === id);

  if (id && !existing) return null;
  return <RecipeForm key={existing?.id ?? 'new'} recipe={existing} />;
}

function RecipeForm({ recipe }: { recipe?: Recipe }) {
  const [name, setName] = useState(recipe?.name ?? '');
  const [servings, setServings] = useState(recipe?.servings ?? 1);
  const [items, setItems] = useState<PortionItem[]>(recipe?.items ?? []);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const total = sumMacros(items);
  const per = (n: number) => Math.round(n / servings);

  const addFood = (food: Food) => {
    setPicking(false);
    Alert.prompt(
      food.name,
      'Menge in Gramm',
      (value) => {
        const grams = parseNum(value);
        if (grams > 0) setItems((l) => [...l, { name: food.name, grams, ...scaleMacros(food, grams) }]);
      },
      'plain-text',
      String(food.servingGrams ?? 100),
      'number-pad',
    );
  };

  const save = async () => {
    setSaving(true);
    const body = { name: name.trim(), servings, items };
    try {
      if (recipe) await api.put(`/recipes/${recipe.id}`, body);
      else await api.post('/recipes', body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  const remove = () =>
    Alert.alert(`„${recipe!.name}“ löschen?`, 'Bereits eingetragene Mahlzeiten bleiben erhalten.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await api.del(`/recipes/${recipe!.id}`);
          invalidate();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: recipe ? 'Rezept bearbeiten' : 'Neues Rezept' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save} disabled={!name.trim() || items.length === 0 || saving}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name, z. B. Overnight Oats"
        placeholderTextColor={Colors.textTertiary}
        autoFocus={!recipe}
        style={styles.nameInput}
      />

      <List>
        <View style={styles.servings}>
          <AppText style={styles.flex}>Portionen</AppText>
          <Pressable onPress={() => setServings((s) => Math.max(1, s - 1))} hitSlop={8} style={styles.step}>
            <AppText type="headline">−</AppText>
          </Pressable>
          <AppText type="headline" style={styles.servingsValue}>
            {servings}
          </AppText>
          <Pressable onPress={() => setServings((s) => Math.min(50, s + 1))} hitSlop={8} style={styles.step}>
            <AppText type="headline">+</AppText>
          </Pressable>
        </View>
      </List>

      <Section title="Zutaten" footer="Lange drücken zum Entfernen.">
        <List>
          {items.map((it, i) => (
            <Row
              key={i}
              title={it.name}
              subtitle={`${Math.round(it.grams)} g`}
              value={`${Math.round(it.kcal)} kcal`}
              onLongPress={() => setItems((l) => l.filter((_, j) => j !== i))}
            />
          ))}
          <Row title="Zutat hinzufügen" icon="plus" onPress={() => setPicking(true)} />
        </List>
      </Section>

      {items.length > 0 && (
        <Section title="Pro Portion">
          <List>
            <Row title="Kalorien" value={`${per(total.kcal)} kcal`} />
            <Row title="Protein" value={`${per(total.protein)} g`} />
            <Row title="Kohlenhydrate" value={`${per(total.carbs)} g`} />
            <Row title="Fett" value={`${per(total.fat)} g`} />
          </List>
        </Section>
      )}

      {recipe && (
        <List>
          <Row title="Rezept löschen" destructive onPress={remove} />
        </List>
      )}

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <AppText type="headline">Zutat wählen</AppText>
            <Pressable onPress={() => setPicking(false)} hitSlop={10}>
              <AppText color={Colors.accent}>Abbrechen</AppText>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
            <FoodSearch onSelect={addFood} />
          </ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  nameInput: {
    backgroundColor: Colors.card,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    height: 54,
    color: Colors.text,
    fontSize: 20,
    fontWeight: 600,
  },
  servings: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, minHeight: 50 },
  step: { width: 34, height: 30, borderRadius: Radius.small, backgroundColor: Colors.cardElevated, alignItems: 'center', justifyContent: 'center' },
  servingsValue: { minWidth: 24, textAlign: 'center' },
  sheet: { flex: 1, backgroundColor: Colors.background },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three, paddingTop: Spacing.four },
  sheetContent: { padding: Spacing.three, paddingBottom: Spacing.six },
});
