import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { BarChart, LineChart } from '@/components/charts';
import { Chip } from '@/components/chip';
import { ErrorNotice } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { shiftDateKey, toDateKey } from '@/lib/date';
import { formatKg, formatNumber } from '@/lib/format';
import { latestHealthWeight, logWeightToHealth, useHealthEnabled } from '@/lib/health';
import { parseNum, type BodyWeight, type DailyNutrition, type Goals, type Template, type WorkoutSummary } from '@/lib/types';

export default function StatsScreen() {
  const weights = useApi<BodyWeight[]>('/weights?days=90');
  const healthOn = useHealthEnabled();

  // Take over newer weights from Health (e.g. a smart scale). Our own writes come back
  // with the same date and value, so this settles after one round.
  useEffect(() => {
    if (!healthOn || !weights.data) return;
    const last = weights.data.at(-1);
    latestHealthWeight()
      .then((w) => {
        if (!w) return;
        const date = toDateKey(w.date);
        const kg = Math.round(w.kg * 10) / 10;
        if (!last || date > last.date || (date === last.date && Math.abs(last.kg - kg) >= 0.1)) {
          return api.put('/weights', { date, kg }).then(invalidate);
        }
      })
      .catch(() => {});
  }, [healthOn, weights.data]);

  const logWeight = () =>
    Alert.prompt(
      'Gewicht heute',
      'In Kilogramm',
      async (value) => {
        const kg = parseNum(value);
        if (kg < 20) return;
        try {
          await api.put('/weights', { date: toDateKey(new Date()), kg });
          logWeightToHealth(toDateKey(new Date()), kg);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          invalidate();
        } catch (e) {
          Alert.alert('Fehler', (e as Error).message);
        }
      },
      'plain-text',
      weights.data?.at(-1) ? String(weights.data.at(-1)!.kg).replace('.', ',') : '',
      'decimal-pad',
    );

  return (
    <Screen>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="scalemass" onPress={logWeight} />
      </Stack.Toolbar>

      {weights.error && <ErrorNotice message={weights.error} onRetry={weights.reload} />}
      <WeightCard weights={weights.data ?? []} onLog={logWeight} />
      <CaloriesCard />
      <TrainingCard />
      <StrengthCard />
    </Screen>
  );
}

function WeightCard({ weights, onLog }: { weights: BodyWeight[]; onLog: () => void }) {
  const current = weights.at(-1);
  const monthAgo = shiftDateKey(toDateKey(new Date()), -30);
  const reference = weights.find((w) => w.date >= monthAgo) ?? weights[0];
  const delta = current && reference && reference !== current ? current.kg - reference.kg : null;

  return (
    <Section title="Körpergewicht">
      <Card style={styles.card}>
        {current ? (
          <>
            <View style={styles.headline}>
              <AppText type="number">{formatNumber(current.kg)}</AppText>
              <AppText color={Colors.textSecondary}>kg</AppText>
              <View style={styles.flex} />
              {delta != null && (
                <AppText type="headline" color={delta <= 0 ? Colors.accent : Colors.protein}>
                  {delta > 0 ? '+' : ''}
                  {formatNumber(delta)} kg
                </AppText>
              )}
            </View>
            {delta != null && (
              <AppText type="caption" color={Colors.textSecondary}>
                Veränderung seit {new Date(reference.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}
              </AppText>
            )}
            <LineChart values={weights.map((w) => w.kg)} color={Colors.accent} />
          </>
        ) : (
          <View style={styles.empty}>
            <AppText color={Colors.textSecondary}>Noch kein Gewicht eingetragen.</AppText>
            <Chip label="Gewicht eintragen" active onPress={onLog} />
          </View>
        )}
      </Card>
    </Section>
  );
}

function CaloriesCard() {
  const daily = useApi<DailyNutrition[]>('/nutrition/daily?days=7').data ?? [];
  const goals = useApi<Goals>('/goals').data;
  const today = toDateKey(new Date());

  const bars = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDateKey(today, i - 6);
    const [y, m, d] = date.split('-').map(Number);
    return {
      label: new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'narrow' }),
      value: daily.find((x) => x.date === date)?.kcal ?? 0,
    };
  });
  const tracked = daily.filter((d) => d.kcal > 0);
  const avg = tracked.length ? tracked.reduce((s, d) => s + d.kcal, 0) / tracked.length : 0;
  const avgProtein = tracked.length ? tracked.reduce((s, d) => s + d.protein, 0) / tracked.length : 0;

  return (
    <Section title="Kalorien · 7 Tage">
      <Card style={styles.card}>
        <View style={styles.pair}>
          <Figure value={tracked.length ? Math.round(avg).toLocaleString('de-DE') : '–'} label="Ø kcal pro Tag" />
          <Figure value={tracked.length ? `${Math.round(avgProtein)} g` : '–'} label="Ø Protein" />
          <Figure value={`${tracked.length}/7`} label="Tage getrackt" />
        </View>
        <BarChart bars={bars} goal={goals?.kcal} color={Colors.kcal} />
      </Card>
    </Section>
  );
}

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x.getTime();
}

function TrainingCard() {
  const workouts = useApi<WorkoutSummary[]>('/workouts?limit=100').data ?? [];
  const thisWeek = startOfWeek(new Date());
  const week = 7 * 24 * 3600 * 1000;

  const bars = Array.from({ length: 8 }, (_, i) => {
    const start = thisWeek - (7 - i) * week;
    const inWeek = workouts.filter((w) => {
      const t = Date.parse(w.startedAt);
      return t >= start && t < start + week;
    });
    return { label: i === 7 ? 'jetzt' : `KW${weekNumber(new Date(start))}`, value: inWeek.length };
  });
  const current = workouts.filter((w) => Date.parse(w.startedAt) >= thisWeek);

  return (
    <Section title="Training">
      <Card style={styles.card}>
        <View style={styles.pair}>
          <Figure value={String(current.length)} label="Workouts diese Woche" />
          <Figure value={formatKg(current.reduce((v, w) => v + w.volume, 0))} label="Volumen diese Woche" />
        </View>
        <BarChart bars={bars} color={Colors.carbs} height={80} />
      </Card>
    </Section>
  );
}

function weekNumber(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Estimated one-rep max over time for exercises from the user's templates. */
function StrengthCard() {
  const templates = useApi<Template[]>('/templates').data ?? [];
  const exercises = [...new Map(templates.flatMap((t) => t.exercises).map((e) => [e.exerciseId, e])).values()];
  const [selected, setSelected] = useState<number | null>(null);
  const exerciseId = selected ?? exercises[0]?.exerciseId ?? null;
  const progress = useApi<{ date: string; e1rm: number; maxWeight: number }[]>(exerciseId ? `/exercises/${exerciseId}/progress` : null).data ?? [];

  if (exercises.length === 0) return null;
  const best = progress.length ? Math.max(...progress.map((p) => p.e1rm)) : 0;

  return (
    <Section title="Kraft" footer="Geschätztes 1-Wiederholungs-Maximum (Epley) pro Workout.">
      <Card style={styles.card}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {exercises.map((e) => (
            <Chip key={e.exerciseId} label={e.name} active={e.exerciseId === exerciseId} onPress={() => setSelected(e.exerciseId)} />
          ))}
        </ScrollView>
        {progress.length > 0 ? (
          <>
            <View style={styles.pair}>
              <Figure value={`${formatNumber(progress.at(-1)!.e1rm, 0)} kg`} label="Aktuell (1RM)" />
              <Figure value={`${formatNumber(best, 0)} kg`} label="Bestwert" />
            </View>
            <LineChart values={progress.map((p) => p.e1rm)} color={Colors.protein} height={100} />
          </>
        ) : (
          <AppText color={Colors.textSecondary}>Noch keine Sätze für diese Übung.</AppText>
        )}
      </Card>
    </Section>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.figure}>
      <AppText type="title">{value}</AppText>
      <AppText type="caption" color={Colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: Spacing.three },
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
  pair: { flexDirection: 'row', gap: Spacing.three },
  figure: { flex: 1 },
  empty: { alignItems: 'flex-start', gap: Spacing.three },
  chips: { gap: Spacing.two },
});
