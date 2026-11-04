import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { ExercisePicker } from '@/components/exercise-picker';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { type Template, type TemplateExercise } from '@/lib/types';

export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const templates = useApi<Template[]>(id ? '/templates' : null).data;
  const existing = templates?.find((t) => String(t.id) === id);

  if (id && !existing) return null;
  // Keyed so the form initialises from the loaded template.
  return <TemplateForm key={existing?.id ?? 'new'} template={existing} />;
}

function TemplateForm({ template }: { template?: Template }) {
  const [name, setName] = useState(template?.name ?? '');
  const [exercises, setExercises] = useState<TemplateExercise[]>(template?.exercises ?? []);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<TemplateExercise>) =>
    setExercises((list) => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const move = (i: number, dir: -1 | 1) =>
    setExercises((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    const body = { name: name.trim(), exercises: exercises.map(({ exerciseId, sets, reps }) => ({ exerciseId, sets, reps })) };
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
        <Stack.Toolbar.Button variant="done" onPress={save} disabled={!name.trim() || exercises.length === 0 || saving}>
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

      <Section title="Übungen" footer="Sätze × Wiederholungen sind Vorgaben, im Workout kannst du alles anpassen.">
        {exercises.length > 0 && (
          <List>
            {exercises.map((e, i) => (
              <View key={`${e.exerciseId}-${i}`} style={styles.exerciseRow}>
                <View style={styles.flex}>
                  <AppText numberOfLines={1}>{e.name}</AppText>
                  <View style={styles.steppers}>
                    <Stepper value={e.sets} unit="Sätze" onChange={(v) => update(i, { sets: v })} max={20} />
                    <Stepper value={e.reps} unit="Wdh" onChange={(v) => update(i, { reps: v })} max={100} />
                  </View>
                </View>
                <View style={styles.rowActions}>
                  <IconTap icon="chevron.up" onPress={() => move(i, -1)} />
                  <IconTap icon="chevron.down" onPress={() => move(i, 1)} />
                  <IconTap icon="minus.circle.fill" color={Colors.danger} onPress={() => setExercises((l) => l.filter((_, j) => j !== i))} />
                </View>
              </View>
            ))}
          </List>
        )}
        <List>
          <Row title="Übung hinzufügen" icon="plus" onPress={() => setPicking(true)} />
        </List>
      </Section>

      {template && (
        <List>
          <Row title="Vorlage löschen" destructive onPress={remove} />
        </List>
      )}

      <ExercisePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(e) => {
          setPicking(false);
          setExercises((l) => [...l, { exerciseId: e.id, name: e.name, muscle: e.muscle, sets: 3, reps: 10 }]);
        }}
      />
    </Screen>
  );
}

function Stepper({ value, unit, onChange, max }: { value: number; unit: string; onChange: (v: number) => void; max: number }) {
  const step = (d: number) => {
    Haptics.selectionAsync();
    onChange(Math.min(max, Math.max(1, value + d)));
  };
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => step(-1)} hitSlop={6} style={styles.stepButton}>
        <AppText type="headline">−</AppText>
      </Pressable>
      <AppText type="caption" style={styles.stepValue}>
        {value} {unit}
      </AppText>
      <Pressable onPress={() => step(1)} hitSlop={6} style={styles.stepButton}>
        <AppText type="headline">+</AppText>
      </Pressable>
    </View>
  );
}

function IconTap({ icon, onPress, color = Colors.textSecondary }: { icon: 'chevron.up' | 'chevron.down' | 'minus.circle.fill'; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <SymbolView name={icon} size={18} tintColor={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: Spacing.two },
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
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  steppers: { flexDirection: 'row', gap: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardElevated, borderRadius: Radius.small },
  stepButton: { paddingHorizontal: 10, paddingVertical: 2 },
  stepValue: { minWidth: 58, textAlign: 'center' },
  rowActions: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
});
