import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { type SFSymbol } from 'sf-symbols-typescript';

import { AmountForm } from '@/components/amount-form';
import { AppText } from '@/components/app-text';
import { FoodSearch } from '@/components/food-search';
import { List, PrimaryButton, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, useApi } from '@/lib/api';
import { startPhotoEntry } from '@/lib/photo';
import { parseNum, recipeToFood, sumMacros, type Food, type Meal, type Recipe } from '@/lib/types';

type Selection = { food: Food; recipeId?: number };

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ date: string; meal: Meal; mode?: 'drink'; manual?: string }>();
  const { date, meal } = params;
  const drink = params.mode === 'drink';
  const [selected, setSelected] = useState<Selection | null>(null);
  const [manual, setManual] = useState(params.manual === '1');
  const recipes = useApi<Recipe[]>(drink ? null : '/recipes').data ?? [];
  const title = <Stack.Screen options={{ title: drink ? 'Getränk' : 'Hinzufügen' }} />;

  if (selected) {
    return (
      <Screen>
        {title}
        <AmountForm
          drink={drink}
          food={selected.food}
          date={date}
          initialMeal={meal}
          saveFood={selected.recipeId == null}
          onSaved={() => {
            if (selected.recipeId) api.post(`/recipes/${selected.recipeId}/used`, {}).catch(() => {});
            router.back();
          }}
        />
      </Screen>
    );
  }

  if (manual) {
    return (
      <Screen>
        {title}
        <ManualFoodForm onDone={(food) => setSelected({ food })} />
      </Screen>
    );
  }

  return (
    <Screen>
      {title}
      <FoodSearch onSelect={(food) => setSelected({ food })}>
        {(q) => {
          const matching = recipes.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
          return (
            <>
              {!q && (
                <View style={styles.actions}>
                  <ActionTile icon="barcode.viewfinder" label="Barcode" onPress={() => router.replace({ pathname: '/scan', params: { date, meal, mode: params.mode } })} />
                  <ActionTile icon="camera.fill" label="Foto" onPress={() => startPhotoEntry(date, meal, drink ? 'drink' : 'food')} />
                  {!drink && <ActionTile icon="text.book.closed.fill" label="Rezept" onPress={() => router.push('/recipe-scan')} />}
                  <ActionTile icon="square.and.pencil" label="Manuell" onPress={() => setManual(true)} />
                </View>
              )}
              {!drink && (matching.length > 0 || !q) && (
                <Section title="Rezepte">
                  <List>
                    {matching.map((r) => {
                      const per = sumMacros(r.items).kcal / r.servings;
                      return (
                        <Row
                          key={r.id}
                          title={r.name}
                          subtitle={`${r.items.length} Zutaten · ${r.servings} ${r.servings === 1 ? 'Portion' : 'Portionen'}`}
                          value={`${Math.round(per)} kcal`}
                          onPress={() => setSelected({ food: recipeToFood(r), recipeId: r.id })}
                          onLongPress={() => router.push({ pathname: '/recipe', params: { id: r.id } })}
                        />
                      );
                    })}
                    {!q && <Row title="Neues Rezept" icon="plus" onPress={() => router.push('/recipe')} />}
                  </List>
                </Section>
              )}
            </>
          );
        }}
      </FoodSearch>
    </Screen>
  );
}

function ActionTile({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.dim]}>
      <SymbolView name={icon} size={22} tintColor={Colors.accent} />
      <AppText type="caption">{label}</AppText>
    </Pressable>
  );
}

const MANUAL_FIELDS = [
  { key: 'kcal', label: 'Kalorien (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Kohlenhydrate (g)' },
  { key: 'fat', label: 'Fett (g)' },
] as const;

function ManualFoodForm({ onDone }: { onDone: (f: Food) => void }) {
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const parse = (k: string) => parseNum(values[k]);
  const valid = name.trim().length > 0 && parse('kcal') > 0;

  return (
    <Section title="Eigenes Lebensmittel" footer="Nährwerte pro 100 g, wie auf der Verpackung.">
      <List>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name, z. B. Haferflocken"
          placeholderTextColor={Colors.textTertiary}
          autoFocus
          style={[styles.field, styles.formInput]}
        />
        {MANUAL_FIELDS.map((f) => (
          <View key={f.key} style={styles.field}>
            <AppText style={styles.flex}>{f.label}</AppText>
            <TextInput
              value={values[f.key] ?? ''}
              onChangeText={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              style={[styles.formInput, styles.numberInput]}
            />
          </View>
        ))}
      </List>
      <PrimaryButton
        title="Weiter"
        disabled={!valid}
        onPress={() => onDone({ name: name.trim(), kcal: parse('kcal'), protein: parse('protein'), carbs: parse('carbs'), fat: parse('fat') })}
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { opacity: 0.5 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    backgroundColor: Colors.card,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
  },
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, minHeight: 50 },
  formInput: { color: Colors.text, fontSize: 17 },
  numberInput: { minWidth: 80, textAlign: 'right', fontWeight: 600 },
});
