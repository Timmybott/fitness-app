import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { bridge } from '@/lib/bridge';
import { sumMacros, type PortionItem, type Recipe } from '@/lib/types';

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const recipes = useApi<Recipe[]>(id ? '/recipes' : null).data;
  const existing = recipes?.find((r) => String(r.id) === id);
  // A recipe read from a photo arrives as a draft to review before saving.
  const [draft] = useState(() => (id ? null : bridge.takeRecipeDraft()));

  if (id && !existing) return null;
  return <RecipeForm key={existing?.id ?? 'new'} recipe={existing} draft={draft} />;
}

function RecipeForm({ recipe, draft }: { recipe?: Recipe; draft: ReturnType<typeof bridge.takeRecipeDraft> }) {
  const [name, setName] = useState(recipe?.name ?? draft?.name ?? '');
  const [servings, setServings] = useState(recipe?.servings ?? draft?.servings ?? 1);
  const [items, setItems] = useState<PortionItem[]>(recipe?.items ?? draft?.items ?? []);
  const [saving, setSaving] = useState(false);

  const total = sumMacros(items);
  const per = (n: number) => Math.round(n / servings);

  const addIngredient = () => {
    bridge.onIngredientPicked((item) => setItems((l) => [...l, item]));
    router.push('/food-picker');
  };

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return Alert.alert('Name fehlt', 'Gib dem Rezept einen Namen.');
    if (items.length === 0) return Alert.alert('Keine Zutaten', 'Füge mindestens eine Zutat hinzu.');
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
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name, z. B. Overnight Oats"
        placeholderTextColor={Colors.textTertiary}
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
              key={`${it.name}-${i}`}
              title={it.name}
              subtitle={`${Math.round(it.grams)} g · P ${Math.round(it.protein)} · K ${Math.round(it.carbs)} · F ${Math.round(it.fat)}`}
              value={`${Math.round(it.kcal)} kcal`}
              onLongPress={() => setItems((l) => l.filter((_, j) => j !== i))}
            />
          ))}
          <Row title="Zutat hinzufügen" icon="plus" onPress={addIngredient} />
        </List>
      </Section>

      {items.length > 0 && (
        <Section title={servings > 1 ? 'Pro Portion' : 'Nährwerte'}>
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
});
