import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { EmptyState, List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { copyDay } from '@/lib/copy-entries';
import { formatDateKey, shiftDateKey, toDateKey } from '@/lib/date';
import { deleteEntryFromHealth } from '@/lib/health';
import { MEALS, sumMacros, type Entry, type Goals, type Meal } from '@/lib/types';

/** Sheet for one meal of a day: totals, share of the daily goal, all entries, and "+" to add more. */
export default function MealScreen() {
  const { date, meal } = useLocalSearchParams<{ date: string; meal: Meal }>();
  const info = MEALS.find((m) => m.key === meal) ?? MEALS[0];
  const entries = (useApi<Entry[]>(`/entries?date=${date}`).data ?? []).filter((e) => e.meal === meal);
  const goals = useApi<Goals>('/goals').data;
  const t = sumMacros(entries);

  const remove = (entry: Entry) => {
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

  const share = (value: number, goal?: number) => (goal ? `${Math.round((value / goal) * 100)} % vom Tagesziel` : '');

  return (
    <Screen>
      <Stack.Screen options={{ title: `${info.label} · ${formatDateKey(date)}` }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis">
          <Stack.Toolbar.MenuAction icon="arrow.uturn.backward" onPress={() => copyDay(shiftDateKey(date, -1), date, meal, meal)}>
            {`${info.label} vom Vortag übernehmen`}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="doc.on.doc" onPress={() => copyDay(date, toDateKey(new Date()), meal, meal)}>
            {`Nach heute kopieren`}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="arrow.right" onPress={() => copyDay(date, shiftDateKey(date, 1), meal, meal)}>
            {`Auf den nächsten Tag kopieren`}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Button icon="plus" onPress={() => router.push({ pathname: '/add-food', params: { date, meal } })} />
      </Stack.Toolbar>

      <Card style={styles.stats}>
        <View style={styles.kcal}>
          <AppText type="number" color={Colors.kcal}>
            {Math.round(t.kcal)}
          </AppText>
          <AppText color={Colors.textSecondary}>kcal · {share(t.kcal, goals?.kcal)}</AppText>
        </View>
        <View style={styles.macros}>
          <Macro label="Protein" value={t.protein} color={Colors.protein} sub={share(t.protein, goals?.protein)} />
          <Macro label="Kohlenh." value={t.carbs} color={Colors.carbs} sub={share(t.carbs, goals?.carbs)} />
          <Macro label="Fett" value={t.fat} color={Colors.fat} sub={share(t.fat, goals?.fat)} />
        </View>
      </Card>

      <Section title="Gegessen" footer={entries.length ? 'Tippen zum Bearbeiten, lange drücken zum Löschen.' : undefined}>
        {entries.length ? (
          <List>
            {entries.map((e) => (
              <Row
                key={e.id}
                title={e.name}
                subtitle={`${Math.round(e.grams)} g · P ${Math.round(e.protein)} · K ${Math.round(e.carbs)} · F ${Math.round(e.fat)}`}
                value={`${Math.round(e.kcal)} kcal`}
                chevron
                onPress={() => router.push({ pathname: '/entry', params: { id: e.id, date } })}
                onLongPress={() => remove(e)}
              />
            ))}
          </List>
        ) : (
          <Card>
            <EmptyState icon={info.icon} title="Noch nichts eingetragen" text="Tippe oben rechts auf +, um etwas hinzuzufügen." />
          </Card>
        )}
      </Section>
    </Screen>
  );
}

function Macro({ label, value, color, sub }: { label: string; value: number; color: string; sub: string }) {
  return (
    <View style={styles.macro}>
      <AppText type="title" color={color}>
        {Math.round(value)} g
      </AppText>
      <AppText type="caption">{label}</AppText>
      {sub ? (
        <AppText type="caption" color={Colors.textSecondary} style={styles.sub}>
          {sub.replace(' vom Tagesziel', '')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { gap: Spacing.three },
  kcal: { gap: Spacing.one },
  macros: { flexDirection: 'row', justifyContent: 'space-between' },
  macro: { flex: 1, alignItems: 'center' },
  sub: { fontSize: 11 },
});
