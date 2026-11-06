import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { PrimaryButton } from '@/components/list';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate } from '@/lib/api';
import { isPlainWater } from '@/lib/bridge';
import { logEntryToHealth } from '@/lib/health';
import { MEALS, parseNum, scaleMacros, type Entry, type Food, type Meal } from '@/lib/types';

type Props = {
  food: Food;
  date: string;
  initialMeal: Meal;
  onSaved: () => void;
  /** false for recipes, which shouldn't be added to the "recent foods" list. */
  saveFood?: boolean;
  /** Drinks are measured in ml (1 ml = 1 g); plain water goes to the water tracker instead of the diary. */
  drink?: boolean;
};

/** Pick amount and meal for a food, preview its macros, and log it. */
export function AmountForm({ food, date, initialMeal, onSaved, saveFood = true, drink = false }: Props) {
  const water = isPlainWater(food);
  const unit = drink || water || food.unit === 'ml' ? 'ml' : 'g';
  const [grams, setGrams] = useState(String(food.servingGrams ?? 100));
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [saving, setSaving] = useState(false);

  const amount = parseNum(grams);
  const m = scaleMacros(food, amount);

  const save = async () => {
    setSaving(true);
    try {
      if (water) {
        await api.post('/water', { date, ml: Math.round(amount), name: food.name });
      } else {
        const entry = await api.post<Entry>('/entries', { food, grams: amount, date, meal, saveFood });
        logEntryToHealth(entry);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      onSaved();
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View>
        <AppText type="title">{food.name}</AppText>
        {food.brand && <AppText color={Colors.textSecondary}>{food.brand}</AppText>}
      </View>

      <Card style={styles.amountCard}>
        <AppText type="headline" style={styles.flex}>
          Menge
        </AppText>
        <TextInput value={grams} onChangeText={setGrams} keyboardType="decimal-pad" selectTextOnFocus style={styles.input} />
        <AppText color={Colors.textSecondary}>{unit}</AppText>
      </Card>

      <View style={styles.chips}>
        {food.servingGrams ? (
          <Chip label={`1 Portion (${food.servingGrams} ${unit})`} onPress={() => setGrams(String(food.servingGrams))} />
        ) : null}
        {unit === 'ml' ? (
          [250, 330, 500, 1000].map((ml) => <Chip key={ml} label={`${ml} ml`} onPress={() => setGrams(String(ml))} />)
        ) : (
          <Chip label="100 g" onPress={() => setGrams('100')} />
        )}
      </View>

      {water ? (
        <AppText color={Colors.textSecondary}>Wasser wird direkt zu deinem Wasserstand hinzugefügt.</AppText>
      ) : (
        <>
          <Card style={styles.macros}>
            <MacroValue label="kcal" value={m.kcal} color={Colors.kcal} />
            <MacroValue label="Protein" value={m.protein} color={Colors.protein} unit="g" />
            <MacroValue label="Kohlenh." value={m.carbs} color={Colors.carbs} unit="g" />
            <MacroValue label="Fett" value={m.fat} color={Colors.fat} unit="g" />
          </Card>

          <View style={styles.chips}>
            {MEALS.map((x) => (
              <Chip key={x.key} label={x.label} active={meal === x.key} onPress={() => setMeal(x.key)} />
            ))}
          </View>
        </>
      )}

      <PrimaryButton title="Hinzufügen" onPress={save} disabled={amount <= 0} loading={saving} />
    </View>
  );
}

function MacroValue({ label, value, color, unit = '' }: { label: string; value: number; color: string; unit?: string }) {
  return (
    <View style={styles.macroValue}>
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
  container: { gap: Spacing.three },
  amountCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { minWidth: 90, textAlign: 'right', color: Colors.text, fontSize: 28, fontWeight: 700 },
  macros: { flexDirection: 'row', justifyContent: 'space-between' },
  macroValue: { alignItems: 'center', flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
