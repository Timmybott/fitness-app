import { DatePicker, Host } from '@expo/ui/swift-ui';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { SetTable, type SetRow } from '@/components/set-table';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { bridge } from '@/lib/bridge';
import { strengthKcal, useBody } from '@/lib/calories';
import { formatKg } from '@/lib/format';
import { logWorkoutToHealth } from '@/lib/health';
import { parseNum, type LastSets, type Template, type WorkoutDetail } from '@/lib/types';

type LogExercise = { exerciseId: number; name: string; sets: SetRow[] };

/** Allows a minute of slack for a session that ends right now. */
const inFuture = (d: Date) => d.getTime() > Date.now() + 60000;

const toText = (n: number) => (n ? String(n).replace('.', ',') : '');

/** Sets → numbers; rows without reps are ignored. */
function loggedSets(exercises: LogExercise[]) {
  return exercises.flatMap((e, position) =>
    e.sets
      .map((s) => ({ weight: parseNum(s.weight), reps: Math.round(parseNum(s.reps)) }))
      .filter((s) => s.reps > 0)
      .map((s, setIndex) => ({ exerciseId: e.exerciseId, name: e.name, position, setIndex, ...s })),
  );
}

/** Saved workout → form values (sets grouped by exercise position). */
function fromWorkout(w: WorkoutDetail): LogExercise[] {
  const positions = [...new Set(w.sets.map((s) => s.position))];
  return positions.map((pos) => {
    const sets = w.sets.filter((s) => s.position === pos);
    return { exerciseId: sets[0].exerciseId, name: sets[0].name, sets: sets.map((s) => ({ weight: toText(s.weight), reps: toText(s.reps) })) };
  });
}

/**
 * Enter a workout that is already done (start time, duration, exercises and sets),
 * or edit a saved one when opened with `id`.
 */
export default function WorkoutLogScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const workout = useApi<WorkoutDetail>(id ? `/workouts/${id}` : null).data;
  if (id && !workout) return null;
  return <WorkoutForm key={workout ? workout.id : 'new'} workout={workout} />;
}

function WorkoutForm({ workout }: { workout?: WorkoutDetail }) {
  // Opted out of the React Compiler like the other forms (it miscompiled initial state before).
  'use no memo';
  const body = useBody();
  const templates = useApi<Template[]>('/templates').data;
  const [name, setName] = useState(workout ? workout.name : 'Training');
  const [start, setStart] = useState(() => {
    if (workout) return new Date(workout.startedAt);
    // Default: an hour-long session that ended at the last full quarter hour.
    const d = new Date(Date.now() - 60 * 60000);
    d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0);
    return d;
  });
  const [openedAt] = useState(() => new Date());
  const [minutes, setMinutes] = useState(
    workout ? String(Math.max(1, Math.round((Date.parse(workout.finishedAt) - Date.parse(workout.startedAt)) / 60000))) : '60',
  );
  const [exercises, setExercises] = useState<LogExercise[]>(workout ? fromWorkout(workout) : []);
  const [saving, setSaving] = useState(false);

  const durationMs = parseNum(minutes) * 60000;
  const sets = loggedSets(exercises);
  const volume = sets.reduce((v, s) => v + s.weight * s.reps, 0);
  const kcal = Math.round(strengthKcal(sets, body, durationMs));

  const updateExercise = (i: number, fn: (e: LogExercise) => LogExercise) => setExercises((list) => list.map((e, j) => (j === i ? fn(e) : e)));

  /** Adds exercises, prefilled with what was done last time (else 3 empty sets). */
  const addExercises = async (list: { id: number; name: string; targets?: { weight: number; reps: number }[] }[]) => {
    const last = list.length ? await api.get<LastSets>(`/exercises/last?ids=${list.map((e) => e.id).join(',')}`).catch(() => ({}) as LastSets) : {};
    setExercises((current) => [
      ...current,
      ...list.map((e) => {
        const planned = e.targets && e.targets.length > 0 ? e.targets : last[e.id];
        return {
          exerciseId: e.id,
          name: e.name,
          sets: planned && planned.length > 0 ? planned.map((t) => ({ weight: toText(t.weight), reps: toText(t.reps) })) : [{ weight: '', reps: '' }, { weight: '', reps: '' }, { weight: '', reps: '' }],
        };
      }),
    ]);
  };

  const pickExercise = () => {
    bridge.onExercisePicked((e) => addExercises([{ id: e.id, name: e.name }]));
    router.push('/exercise-picker');
  };

  const useTemplate = () => {
    if (!templates || templates.length === 0) return;
    Alert.alert('Vorlage übernehmen', 'Übungen und geplante Sätze werden eingetragen.', [
      ...templates.slice(0, 10).map((t) => ({
        text: t.name,
        onPress: () => {
          setName(t.name);
          addExercises(t.exercises.map((e) => ({ id: e.exerciseId, name: e.name, targets: e.targets && e.targets.length > 0 ? e.targets : Array.from({ length: e.sets }, () => ({ weight: 0, reps: e.reps })) })));
        },
      })),
      { text: 'Abbrechen', style: 'cancel' as const },
    ]);
  };

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return Alert.alert('Name fehlt', 'Gib dem Training einen Namen.');
    if (durationMs <= 0) return Alert.alert('Dauer fehlt', 'Trag ein, wie lange du trainiert hast.');
    if (sets.length === 0) return Alert.alert('Keine Sätze', 'Trag bei mindestens einem Satz die Wiederholungen ein.');
    const finishedAt = new Date(start.getTime() + durationMs);
    if (inFuture(finishedAt)) return Alert.alert('Liegt in der Zukunft', 'Das Training muss schon vorbei sein. Passe Beginn oder Dauer an.');
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        startedAt: start.toISOString(),
        finishedAt: finishedAt.toISOString(),
        kcal,
        sets: sets.map(({ name: _name, ...s }) => s),
      };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (workout) {
        await api.put(`/workouts/${workout.id}`, payload);
        invalidate();
        router.back();
        return;
      }
      const { id } = await api.post<{ id: number }>('/workouts', { ...payload, templateId: null });
      logWorkoutToHealth({ syncId: `workout-${id}`, type: 'Krafttraining', start, end: finishedAt, kcal });
      invalidate();
      router.replace({ pathname: '/workout-detail', params: { id } });
    } catch (e) {
      setSaving(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: workout ? 'Workout bearbeiten' : 'Nachträglich eintragen' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Abbrechen</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <TextInput value={name} onChangeText={setName} placeholder="Name, z. B. Push" placeholderTextColor={Colors.textTertiary} style={styles.nameInput} selectTextOnFocus />

      <List>
        <Row
          title="Beginn"
          icon="calendar"
          right={
            <Host matchContents>
              <DatePicker selection={start} displayedComponents={['date', 'hourAndMinute']} range={{ end: workout && new Date(workout.startedAt) > openedAt ? new Date(workout.startedAt) : openedAt }} onDateChange={setStart} />
            </Host>
          }
        />
        <Row
          title="Dauer"
          icon="timer"
          right={
            <View style={styles.inline}>
              <TextInput value={minutes} onChangeText={setMinutes} keyboardType="number-pad" selectTextOnFocus style={styles.minutes} />
              <AppText color={Colors.textSecondary}>min</AppText>
            </View>
          }
        />
      </List>

      <View style={styles.stats}>
        <Stat label="Sätze" value={String(sets.length)} />
        <Stat label="Volumen" value={formatKg(volume)} />
        <Stat label="kcal" value={String(kcal)} />
      </View>

      <Section title="Übungen" footer="Sätze mit Wiederholungen zählen als erledigt. Die Kalorien werden aus Sätzen, Gewicht, Dauer und deinem Körpergewicht berechnet.">
        {exercises.map((e, i) => (
          <Card key={`${e.exerciseId}-${i}`} style={styles.card}>
            <View style={styles.cardHeader}>
              <AppText type="headline" style={styles.flex}>
                {e.name}
              </AppText>
              <Pressable
                hitSlop={10}
                onPress={() =>
                  Alert.alert(e.name, undefined, [
                    { text: 'Übung entfernen', style: 'destructive', onPress: () => setExercises((l) => l.filter((_, j) => j !== i)) },
                    { text: 'Abbrechen', style: 'cancel' },
                  ])
                }>
                <SymbolView name="ellipsis" size={18} tintColor={Colors.textSecondary} />
              </Pressable>
            </View>
            <SetTable
              mode="plan"
              sets={e.sets}
              onChange={(si, patch) => updateExercise(i, (x) => ({ ...x, sets: x.sets.map((s, k) => (k === si ? { ...s, ...patch } : s)) }))}
              onRemoveSet={(si) => updateExercise(i, (x) => ({ ...x, sets: x.sets.filter((_, k) => k !== si) }))}
              onAddSet={() => updateExercise(i, (x) => ({ ...x, sets: [...x.sets, x.sets.length ? x.sets[x.sets.length - 1] : { weight: '', reps: '' }] }))}
            />
          </Card>
        ))}
        <List>
          <Row title="Übung hinzufügen" icon="plus" onPress={pickExercise} />
          {templates && templates.length > 0 ? <Row title="Aus Vorlage übernehmen" icon="list.bullet.clipboard" onPress={useTemplate} /> : null}
        </List>
      </Section>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText type="title">{value}</AppText>
      <AppText type="caption" color={Colors.textSecondary}>
        {label}
      </AppText>
    </View>
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
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  minutes: { color: Colors.text, fontSize: 17, minWidth: 44, textAlign: 'right' },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.one },
  stat: { alignItems: 'center' },
  card: { gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one },
});
