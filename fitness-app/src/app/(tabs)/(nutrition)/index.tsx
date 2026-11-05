import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { ErrorNotice } from '@/components/list';
import { ProgressRing } from '@/components/progress-ring';
import { Screen } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDateKey, shiftDateKey, toDateKey } from '@/lib/date';
import { deleteEntryFromHealth, useTodayActivity, type Activity } from '@/lib/health';
import { MEALS, sumMacros, type Entry, type Goals, type Macros, type Meal } from '@/lib/types';

export default function NutritionScreen() {
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const entriesQuery = useApi<Entry[]>(`/entries?date=${date}`);
  const goals = useApi<Goals>('/goals').data;
  const entries = entriesQuery.data ?? [];
  const isToday = date === toDateKey(new Date());

  return (
    <Screen>
      <Stack.Screen options={{ title: formatDateKey(date) }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="chevron.left" onPress={() => setDate(shiftDateKey(date, -1))} />
        <Stack.Toolbar.Button icon="chevron.right" onPress={() => setDate(shiftDateKey(date, 1))} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="calendar" hidden={isToday} onPress={() => setDate(toDateKey(new Date()))} />
        <Stack.Toolbar.Button
          icon="barcode.viewfinder"
          onPress={() => router.push({ pathname: '/scan', params: { date, meal: guessMeal() } })}
        />
      </Stack.Toolbar>

      {entriesQuery.error && <ErrorNotice message={entriesQuery.error} onRetry={entriesQuery.reload} />}
      {goals && <SummaryCard totals={sumMacros(entries)} goals={goals} showActivity={isToday} />}
      {MEALS.map((meal) => (
        <MealSection key={meal.key} meal={meal} date={date} entries={entries.filter((e) => e.meal === meal.key)} />
      ))}
    </Screen>
  );
}

/** Pre-selects the meal for quick-add actions based on the time of day. */
function guessMeal(): Meal {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

function SummaryCard({ totals, goals, showActivity }: { totals: Macros; goals: Goals; showActivity: boolean }) {
  // Direct HealthKit when available, otherwise what the Shortcuts sync reported to the server.
  const native = useTodayActivity();
  const synced = useApi<Activity | null>(showActivity && !native ? '/health/today' : null).data;
  const activity = native ?? synced;
  const remaining = Math.round(goals.kcal - totals.kcal);
  const over = remaining < 0;

  return (
    <Card style={styles.summary}>
      <ProgressRing
        size={140}
        stroke={13}
        progress={totals.kcal / goals.kcal}
        color={over ? Colors.danger : Colors.kcal}
        trackColor={Colors.cardElevated}>
        <AppText type="number">{Math.abs(remaining)}</AppText>
        <AppText type="caption" color={Colors.textSecondary}>
          {over ? 'kcal zu viel' : 'kcal übrig'}
        </AppText>
      </ProgressRing>

      <View style={styles.summaryRight}>
        <AppText type="caption" color={Colors.textSecondary}>
          {Math.round(totals.kcal)} von {goals.kcal} kcal
        </AppText>
        <MacroBar label="Protein" value={totals.protein} goal={goals.protein} color={Colors.protein} />
        <MacroBar label="Kohlenhydrate" value={totals.carbs} goal={goals.carbs} color={Colors.carbs} />
        <MacroBar label="Fett" value={totals.fat} goal={goals.fat} color={Colors.fat} />
        {showActivity && activity && (
          <View style={styles.activity}>
            <SymbolView name="flame.fill" size={13} tintColor={Colors.protein} />
            <AppText type="caption" color={Colors.textSecondary}>
              {Math.round(activity.activeKcal ?? 0)} kcal aktiv · {(activity.steps ?? 0).toLocaleString('de-DE')} Schritte
            </AppText>
          </View>
        )}
      </View>
    </Card>
  );
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(1, goal > 0 ? value / goal : 0);
  return (
    <View style={styles.macro}>
      <View style={styles.macroLabels}>
        <AppText type="caption">{label}</AppText>
        <AppText type="caption" color={Colors.textSecondary}>
          {Math.round(value)}/{goal} g
        </AppText>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function MealSection({ meal, date, entries }: { meal: (typeof MEALS)[number]; date: string; entries: Entry[] }) {
  const kcal = Math.round(sumMacros(entries).kcal);

  const confirmDelete = (entry: Entry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(entry.name, 'Eintrag löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: () =>
          api
            .del(`/entries/${entry.id}`)
            .then(() => {
              deleteEntryFromHealth(entry.id);
              invalidate();
            })
            .catch((e: Error) => Alert.alert('Fehler', e.message)),
      },
    ]);
  };

  return (
    <Card style={styles.meal}>
      <View style={styles.mealHeader}>
        <SymbolView name={meal.icon} size={18} tintColor={Colors.accent} />
        <AppText type="headline" style={styles.flex}>
          {meal.label}
        </AppText>
        {kcal > 0 && (
          <AppText type="caption" color={Colors.textSecondary}>
            {kcal} kcal
          </AppText>
        )}
        <IconButton icon="plus" filled onPress={() => router.push({ pathname: '/add-food', params: { date, meal: meal.key } })} />
      </View>

      {entries.map((e) => (
        <Pressable key={e.id} onLongPress={() => confirmDelete(e)} style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <AppText numberOfLines={1}>{e.name}</AppText>
            <AppText type="caption" color={Colors.textSecondary}>
              {Math.round(e.grams)} g · P {Math.round(e.protein)} · K {Math.round(e.carbs)} · F {Math.round(e.fat)}
            </AppText>
          </View>
          <AppText type="headline">{Math.round(e.kcal)}</AppText>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  summaryRight: { flex: 1, gap: Spacing.two },
  macro: { gap: Spacing.one },
  activity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.one },
  macroLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.cardElevated, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  meal: { gap: Spacing.two },
  mealHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.separator,
  },
});
