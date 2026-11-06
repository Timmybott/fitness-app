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
import { parseNum, type Template, type TemplateExercise } from '@/lib/types';

type EditExercise = { exerciseId: number; name: string; muscle: string; sets: SetRow[] };

const NEW_EXERCISE_SETS: SetRow[] = [
  { weight: '', reps: '10' },
  { weight: '', reps: '10' },
  { weight: '', reps: '10' },
];

/** Saved exercise → editable rows. Templates saved before per-set targets get sets × reps rows. */
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
  const existing = templates ? templates.find((t) => String(t.id) === id) : undefined;

  if (id && !existing) return null;
  // Keyed so the form initialises from the loaded template.
  return <TemplateForm key={existing ? existing.id : 'new'} template={existing} />;
}

function TemplateForm({ template }: { template?: Template }) {
  // Opted out of the React Compiler: it dropped optional chaining in initial state values here before
  // ("Cannot read property 'exercises' of undefined" for a new template). Initial values use plain conditionals.
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
    bridge.onExercisePicked((e) => setExercises((l) => [...l, { exerciseId: e.id, name: e.name, muscle: e.muscle, sets: NEW_EXERCISE_SETS }]));
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
        // sets/reps stay filled as a summary (shown on the template card).
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
          <Card key={`${e.exerciseId}-${i}`} style={styles.card}>
            <View style={styles.cardHeader}>
              <AppText type="headline" style={styles.flex}>
                {e.name}
              </AppText>
              <Pressable
                hitSlop={10}
                onPress={() =>
                  Alert.alert(e.name, undefined, [
                    { text: 'Nach oben', onPress: () => move(i, -1) },
                    { text: 'Nach unten', onPress: () => move(i, 1) },
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
              // A new set copies the previous one (e.g. 3 × 80 kg × 8).
              onAddSet={() => updateExercise(i, (x) => ({ ...x, sets: [...x.sets, x.sets.length ? x.sets[x.sets.length - 1] : { weight: '', reps: '10' }] }))}
            />
          </Card>
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
  card: { gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.one },
});
