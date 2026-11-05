import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { FoodSearch } from '@/components/food-search';
import { List, PrimaryButton, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { bridge } from '@/lib/bridge';
import { parseNum, scaleMacros, type Food } from '@/lib/types';

const FIELDS = [
  { key: 'grams', label: 'Menge (g)' },
  { key: 'kcal', label: 'Kalorien (kcal)' },
  { key: 'protein', label: 'Protein (g)' },
  { key: 'carbs', label: 'Kohlenhydrate (g)' },
  { key: 'fat', label: 'Fett (g)' },
] as const;

/** Picks a recipe ingredient (from search or typed in) and returns it via `bridge`. */
export default function FoodPickerScreen() {
  const [manual, setManual] = useState(false);

  const pickFood = (food: Food) =>
    Alert.prompt(
      food.name,
      'Menge in Gramm',
      (value) => {
        const grams = parseNum(value);
        if (grams <= 0) return;
        bridge.pickIngredient({ name: food.name, grams, ...scaleMacros(food, grams) });
        router.back();
      },
      'plain-text',
      String(food.servingGrams ?? 100),
      'number-pad',
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Zutat hinzufügen' }} />
      {manual ? (
        <ManualIngredient />
      ) : (
        <FoodSearch onSelect={pickFood}>
          {(q) =>
            !q && (
              <List>
                <Row title="Zutat selbst eingeben" icon="square.and.pencil" onPress={() => setManual(true)} />
              </List>
            )
          }
        </FoodSearch>
      )}
    </Screen>
  );
}

/** Ingredient with values for the amount used (as printed in a recipe), not per 100 g. */
function ManualIngredient() {
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const v = (k: string) => parseNum(values[k]);

  const add = () => {
    if (!name.trim() || v('grams') <= 0) return Alert.alert('Angaben fehlen', 'Name und Menge sind nötig.');
    bridge.pickIngredient({ name: name.trim(), grams: v('grams'), kcal: v('kcal'), protein: v('protein'), carbs: v('carbs'), fat: v('fat') });
    router.back();
  };

  return (
    <Section title="Zutat" footer="Nährwerte für die ganze Menge, nicht pro 100 g.">
      <List>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Name, z. B. Olivenöl"
          placeholderTextColor={Colors.textTertiary}
          autoFocus
          style={[styles.field, styles.input]}
        />
        {FIELDS.map((f) => (
          <View key={f.key} style={styles.field}>
            <AppText style={styles.flex}>{f.label}</AppText>
            <TextInput
              value={values[f.key] ?? ''}
              onChangeText={(t) => setValues((s) => ({ ...s, [f.key]: t }))}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={Colors.textTertiary}
              style={[styles.input, styles.number]}
            />
          </View>
        ))}
      </List>
      <PrimaryButton title="Hinzufügen" onPress={add} />
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, minHeight: 50 },
  input: { color: Colors.text, fontSize: 17 },
  number: { minWidth: 80, textAlign: 'right', fontWeight: 600 },
});
