import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { ExercisePicker } from '@/components/exercise-picker';
import { List, Row } from '@/components/list';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatClock, formatKg } from '@/lib/format';
import {
  addExerciseToDraft,
  completedSets,
  discardDraft,
  finishWorkout,
  updateDraft,
  useDraft,
  type Draft,
  type DraftExercise,
  type DraftSet,
} from '@/lib/workout-draft';

/** Re-renders every second while mounted (for clocks). */
function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function WorkoutScreen() {
  const draft = useDraft();
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const now = useNow();

  // Leaving happens via finish/discard; if the draft disappears, close the screen.
  useEffect(() => {
    if (!draft && !saving) router.back();
  }, [draft, saving]);

  if (!draft) return null;

  const done = completedSets(draft);
  const volume = done.reduce((v, s) => v + s.weight * s.reps, 0);

  const discard = () =>
    Alert.alert('Workout verwerfen?', 'Alle Sätze dieses Workouts gehen verloren.', [
      { text: 'Weiter trainieren', style: 'cancel' },
      { text: 'Verwerfen', style: 'destructive', onPress: discardDraft },
    ]);

  const finish = () => {
    if (done.length === 0) {
      Alert.alert('Noch keine Sätze abgehakt', 'Hake erledigte Sätze mit ✓ ab, damit sie gespeichert werden.');
      return;
    }
    Alert.alert('Workout beenden?', `${done.length} Sätze · ${formatKg(volume)} Volumen`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Speichern',
        onPress: async () => {
          setSaving(true);
          try {
            await finishWorkout();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch (e) {
            setSaving(false);
            Alert.alert('Speichern fehlgeschlagen', `${(e as Error).message}\n\nDein Workout bleibt auf dem Handy gespeichert.`);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: draft.name }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" onPress={discard} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="prominent" tintColor={Colors.accent} onPress={finish} disabled={saving}>
          Fertig
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <ScrollView
        style={styles.flex}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={styles.content}>
        <View style={styles.stats}>
          <Stat label="Dauer" value={formatClock((now - Date.parse(draft.startedAt)) / 1000)} />
          <Stat label="Sätze" value={String(done.length)} />
          <Stat label="Volumen" value={formatKg(volume)} />
        </View>

        {draft.exercises.map((e, i) => (
          <ExerciseCard key={`${e.exerciseId}-${i}`} exercise={e} index={i} restSeconds={draft.restSeconds} />
        ))}

        <List>
          <Row title="Übung hinzufügen" icon="plus" onPress={() => setPicking(true)} />
        </List>
      </ScrollView>

      <RestTimer draft={draft} now={now} />

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(e) => {
          setPicking(false);
          addExerciseToDraft(e);
        }}
      />
    </View>
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

function updateExercise(index: number, fn: (e: DraftExercise) => DraftExercise) {
  updateDraft((d) => ({ ...d, exercises: d.exercises.map((e, i) => (i === index ? fn(e) : e)) }));
}

function ExerciseCard({ exercise, index, restSeconds }: { exercise: DraftExercise; index: number; restSeconds: number }) {
  const setField = (si: number, patch: Partial<DraftSet>) =>
    updateExercise(index, (e) => ({ ...e, sets: e.sets.map((s, i) => (i === si ? { ...s, ...patch } : s)) }));

  const toggleDone = (si: number) => {
    const wasDone = exercise.sets[si].done;
    setField(si, { done: !wasDone });
    if (!wasDone) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateDraft((d) => ({ ...d, restEndsAt: Date.now() + restSeconds * 1000 }));
    }
  };

  const menu = () =>
    Alert.alert(exercise.name, undefined, [
      {
        text: 'Letzten Satz entfernen',
        onPress: () => updateExercise(index, (e) => ({ ...e, sets: e.sets.slice(0, -1) })),
      },
      {
        text: 'Übung entfernen',
        style: 'destructive',
        onPress: () => updateDraft((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== index) })),
      },
      { text: 'Abbrechen', style: 'cancel' },
    ]);

  return (
    <Card style={styles.card}>
      <View style={styles.cardHeader}>
        <AppText type="headline" style={styles.flex}>
          {exercise.name}
        </AppText>
        <Pressable onPress={menu} hitSlop={10}>
          <SymbolView name="ellipsis" size={18} tintColor={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.setRow}>
        <AppText type="caption" color={Colors.textTertiary} style={styles.colSet}>
          SATZ
        </AppText>
        <AppText type="caption" color={Colors.textTertiary} style={styles.colLast}>
          ZULETZT
        </AppText>
        <AppText type="caption" color={Colors.textTertiary} style={styles.colInput}>
          KG
        </AppText>
        <AppText type="caption" color={Colors.textTertiary} style={styles.colInput}>
          WDH
        </AppText>
        <View style={styles.colCheck} />
      </View>

      {exercise.sets.map((s, si) => {
        const last = exercise.last[si];
        // Empty fields fall back to last time's values (see effectiveSet), so show those as placeholders.
        const hint = exercise.last[si] ?? exercise.last.at(-1);
        return (
          <View key={si} style={[styles.setRow, s.done && styles.setDone]}>
            <AppText type="headline" style={styles.colSet}>
              {si + 1}
            </AppText>
            <AppText type="caption" color={Colors.textSecondary} style={styles.colLast}>
              {last ? `${last.weight} × ${last.reps}` : '–'}
            </AppText>
            <SetInput value={s.weight} placeholder={hint ? String(hint.weight) : '0'} onChange={(v) => setField(si, { weight: v })} decimal />
            <SetInput value={s.reps} placeholder={hint ? String(hint.reps) : '0'} onChange={(v) => setField(si, { reps: v })} />
            <Pressable onPress={() => toggleDone(si)} hitSlop={6} style={[styles.check, s.done && styles.checkDone]}>
              <SymbolView name="checkmark" size={14} weight="bold" tintColor={s.done ? Colors.onAccent : Colors.textTertiary} />
            </Pressable>
          </View>
        );
      })}

      <Pressable
        onPress={() => updateExercise(index, (e) => ({ ...e, sets: [...e.sets, { weight: '', reps: '', done: false }] }))}
        style={({ pressed }) => [styles.addSet, pressed && styles.dim]}>
        <AppText type="caption" color={Colors.accent}>
          + Satz
        </AppText>
      </Pressable>
    </Card>
  );
}

function SetInput({ value, placeholder, onChange, decimal }: { value: string; placeholder: string; onChange: (v: string) => void; decimal?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={Colors.textTertiary}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      selectTextOnFocus
      style={[styles.colInput, styles.input]}
    />
  );
}

function RestTimer({ draft, now }: { draft: Draft; now: number }) {
  const insets = useSafeAreaInsets();
  const remaining = draft.restEndsAt ? Math.ceil((draft.restEndsAt - now) / 1000) : 0;
  const buzzed = useRef<number | null>(null);

  useEffect(() => {
    if (draft.restEndsAt && remaining <= 0 && buzzed.current !== draft.restEndsAt) {
      buzzed.current = draft.restEndsAt;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      updateDraft((d) => ({ ...d, restEndsAt: null }));
    }
  }, [draft.restEndsAt, remaining]);

  if (!draft.restEndsAt || remaining <= 0) return null;

  // Adjusting also changes the default rest for the next sets.
  const adjust = (delta: number) =>
    updateDraft((d) => ({
      ...d,
      restSeconds: Math.max(15, d.restSeconds + delta),
      restEndsAt: d.restEndsAt ? d.restEndsAt + delta * 1000 : null,
    }));

  return (
    <View style={[styles.rest, { bottom: insets.bottom + Spacing.three }]}>
      <TimerButton label="−15" onPress={() => adjust(-15)} />
      <View style={styles.restCenter}>
        <AppText type="caption" color={Colors.textSecondary}>
          Pause
        </AppText>
        <AppText type="title">{formatClock(remaining)}</AppText>
      </View>
      <TimerButton label="+15" onPress={() => adjust(15)} />
      <TimerButton label="Skip" onPress={() => updateDraft((d) => ({ ...d, restEndsAt: null }))} />
    </View>
  );
}

function TimerButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.timerButton, pressed && styles.dim]}>
      <AppText type="headline">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  dim: { opacity: 0.5 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 140 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.two },
  stat: { alignItems: 'center' },
  card: { gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 6, borderRadius: Radius.small },
  setDone: { backgroundColor: Colors.accentDim },
  colSet: { width: 36, textAlign: 'center' },
  colLast: { flex: 1 },
  colInput: { width: 64, textAlign: 'center' },
  colCheck: { width: 32 },
  input: {
    height: 34,
    borderRadius: Radius.small,
    backgroundColor: Colors.cardElevated,
    color: Colors.text,
    fontSize: 17,
    fontWeight: 600,
  },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: Colors.accent },
  addSet: { alignItems: 'center', paddingVertical: Spacing.two },
  rest: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.cardElevated,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  restCenter: { flex: 1, alignItems: 'center' },
  timerButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.card,
  },
});
