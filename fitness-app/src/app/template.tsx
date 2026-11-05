import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { bridge } from '@/lib/bridge';
import { parseNum, type Template, type TemplateExercise } from '@/lib/types';

/** A set row as typed in the editor (strings, like the workout table). */
type EditSet = { weight: string; reps: string };
type EditExercise = { exerciseId: number; name: string; muscle: string; sets: EditSet[] };

/** Template exercise → editable rows; old templates without per-set targets get sets × reps rows. */
function toEdit(e: TemplateExercise): EditExercise {
  const targets = e.targets && e.targets.length > 0 ? e.targets : Array.from({ length: e.sets }, () => ({ weight: 0, reps: e.reps }));
  return {
    exerciseId: e.exerciseId,
    name: e.name,
    muscle: e.muscle,
    sets: targets.map((t) => ({ weight: t.weight ? String(t.weight).replace('.', ',') : '', reps: t.reps ? String(t.reps) : '' })),
  };
}

export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const templates = useApi<Template[]>(id ? '/templates' : null).data;
  const existing = templates?.find((t) => String(t.id) === id);

  if (id && !existing) return null;
  // Keyed so the form initialises from the loaded template.
  return <TemplateForm key={existing ? existing.id : 'new'} template={existing} />;
}

function TemplateForm({ template }: { template?: Template }) {
  // Opted out of the React Compiler: it dropped the optional chaining in initial state values
  // ("Cannot read property 'exercises' of undefined" for a new template).
  'use no memo';
  const [name, setName] = useState(template ? template.name : '');
  const [exercises, setExercises] = useState<EditExercise[]>(template ? template.exercises.map(toEdit) : []);
  const [saving, setSaving] = useState(false);

  const updateExercise = (i: number, fn: (e: EditExercise) => EditExercise) =>
    setExercises((list) => list.map((e, j) => (j === i ? fn(e) : e)));

  const move = (i: number, dir: -1 | 1) =>
    setExercises((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addExercise = () => {
    bridge.onExercisePicked((e) =>
      setExercises((l) => [...l, { exerciseId: e.id, name: e.name, muscle: e.muscle, sets: Array.from({ length: 3 }, () => ({ weight: '', reps: '10' })) }]),
    );
    router.push('/exercise-picker');
  };

  const save = async () => {
    if (saving) return;
    if (!name.trim()) return Alert.alert('Name fehlt', 'Gib der Vorlage einen Namen, z. B. Push.');
    if (exercises.length === 0) return Alert.alert('Keine Übungen', 'Füge mindestens eine Übung hinzu.');
    if (exercises.some((e) => e.sets.length === 0)) return Alert.alert('Sätze fehlen', 'Jede Übung braucht mindestens einen Satz.');
    setSaving(true);
    const body = {
      name: name.trim(),
      exercises: exercises.map((e) => {
        const targets = e.sets.map((s) => ({ weight: parseNum(s.weight), reps: Math.round(parseNum(s.reps)) }));
        return { exerciseId: e.exerciseId, sets: targets.length, reps: Math.max(1, targets[0].reps || 10), targets };
      }),
    };
    try {
      if (template) await api.put(`/templates/${template.id}`, body);
      else await api.post('/templates', body);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  const remove = () =>
    Alert.alert(`„${template!.name}“ löschen?`, 'Bisherige Workouts bleiben erhalten.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await api.del(`/templates/${template!.id}`);
          invalidate();
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: template ? 'Vorlage bearbeiten' : 'Neue Vorlage' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Abbrechen</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name, z. B. Push"
        placeholderTextColor={Colors.textTertiary}
        autoFocus={!template}
        style={styles.nameInput}
      />

      <Section title="Übungen" footer="Kilo und Wiederholungen werden beim Start der Vorlage direkt eingetragen. Im Workout kannst du alles anpassen.">
        {exercises.map((e, i) => (
          <ExerciseEditor
            key={`${e.exerciseId}-${i}`}
            exercise={e}
            onChange={(fn) => updateExercise(i, fn)}
            onMove={(dir) => move(i, dir)}
            onRemove={() => setExercises((l) => l.filter((_, j) => j !== i))}
          />
        ))}
        <List>
          <Row title="Übung hinzufügen" icon="plus" onPress={addExercise} />
        </List>
      </Section>

      {template && (
        <List>
          <Row title="Vorlage löschen" destructive onPress={remove} />
        </List>
      )}
    </Screen>
  );
}

/** Same table as in the workout: Satz | kg | Wdh, plus remove-row and "+ Satz". */
function ExerciseEditor({
  exercise,
  onChange,
  onMove,
  onRemove,
}: {
  exercise: EditExercise;
  onChange: (fn: (e: EditExercise) => EditExercise) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const setField = (si: number, patch: Partial<EditSet>) =>
    onChange((e) => ({ ...e, sets: e.sets.map((s, i) => (i === si ? { ...s, ...patch } : s)) }));

  // A new set copies the previous one, which is what you usually want (e.g. 3 × 80 kg × 8).
  const addSet = () => onChange((e) => ({ ...e, sets: [...e.sets, e.sets.at(-1) ?? { weight: '', reps: '10' }] }));

  const menu = () =>
    Alert.alert(exercise.name, undefined, [
      { text: 'Nach oben', onPress: () => onMove(-1) },
      { text: 'Nach unten', onPress: () => onMove(1) },
      { text: 'Übung entfernen', style: 'destructive', onPress: onRemove },
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
        <View style={styles.flex} />
        <AppText type="caption" color={Colors.textTertiary} style={styles.colInput}>
          KG
        </AppText>
        <AppText type="caption" color={Colors.textTertiary} style={styles.colInput}>
          WDH
        </AppText>
        <View style={styles.colAction} />
      </View>

      {exercise.sets.map((s, si) => (
        <View key={si} style={styles.setRow}>
          <AppText type="headline" style={styles.colSet}>
            {si + 1}
          </AppText>
          <View style={styles.flex} />
          <TextInput
            value={s.weight}
            onChangeText={(v) => setField(si, { weight: v })}
            placeholder="–"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="decimal-pad"
            selectTextOnFocus
            style={[styles.colInput, styles.input]}
          />
          <TextInput
            value={s.reps}
            onChangeText={(v) => setField(si, { reps: v })}
            placeholder="0"
            placeholderTextColor={Colors.textTertiary}
            keyboardType="number-pad"
            selectTextOnFocus
            style={[styles.colInput, styles.input]}
          />
          <Pressable
            onPress={() => onChange((e) => ({ ...e, sets: e.sets.filter((_, i) => i !== si) }))}
            hitSlop={6}
            style={styles.colAction}>
            <SymbolView name="minus.circle.fill" size={20} tintColor={Colors.danger} />
          </Pressable>
        </View>
      ))}

      <Pressable onPress={addSet} style={({ pressed }) => [styles.addSet, pressed && styles.dim]}>
        <AppText type="caption" color={Colors.accent}>
          + Satz
        </AppText>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { opacity: 0.5 },
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
  card: { gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 6 },
  colSet: { width: 36, textAlign: 'center' },
  colInput: { width: 64, textAlign: 'center' },
  colAction: { width: 32, alignItems: 'center' },
  input: {
    height: 34,
    borderRadius: Radius.small,
    backgroundColor: Colors.cardElevated,
    color: Colors.text,
    fontSize: 17,
    fontWeight: 600,
  },
  addSet: { alignItems: 'center', paddingVertical: Spacing.two },
});
