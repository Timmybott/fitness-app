import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ErrorNotice, List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDay, formatDuration, formatKg } from '@/lib/format';
import { deleteWorkoutFromHealth } from '@/lib/health';
import { type WorkoutDetail } from '@/lib/types';

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: w, error, reload } = useApi<WorkoutDetail>(`/workouts/${id}`);

  const groups = w
    ? [...new Set(w.sets.map((s) => s.position))].map((pos) => {
        const sets = w.sets.filter((s) => s.position === pos);
        return { pos, name: sets[0].name, sets };
      })
    : [];
  const volume = w?.sets.reduce((v, s) => v + s.weight * s.reps, 0) ?? 0;

  const remove = () =>
    Alert.alert('Workout löschen?', 'Das kann nicht rückgängig gemacht werden.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await api.del(`/workouts/${id}`);
          deleteWorkoutFromHealth(`workout-${id}`);
          invalidate();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: w?.name ?? 'Workout' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.push({ pathname: '/workout-log', params: { id } })}>Bearbeiten</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={() => router.back()}>
          Fertig
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {error && <ErrorNotice message={error} onRetry={reload} />}
      {w && (
        <>
          <View style={styles.stats}>
            <Stat label={formatDay(w.startedAt)} value={formatDuration(Date.parse(w.finishedAt) - Date.parse(w.startedAt))} />
            <Stat label="Sätze" value={String(w.sets.length)} />
            <Stat label="Volumen" value={formatKg(volume)} />
            {w.kcal ? <Stat label="kcal (geschätzt)" value={String(Math.round(w.kcal))} /> : null}
          </View>

          {groups.map((g) => (
            <Section key={g.pos} title={g.name}>
              <List>
                {g.sets.map((s) => (
                  <Row key={s.setIndex} title={`Satz ${s.setIndex + 1}`} value={`${s.weight} kg × ${s.reps}`} />
                ))}
              </List>
            </Section>
          ))}

          <List>
            <Row title="Workout löschen" destructive onPress={remove} />
          </List>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText type="headline">{value}</AppText>
      <AppText type="caption" color={Colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.two },
  stat: { alignItems: 'center' },
});
