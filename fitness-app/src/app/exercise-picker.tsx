import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { bridge } from '@/lib/bridge';
import { type Exercise } from '@/lib/types';

const MUSCLES = ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Core', 'Sonstiges'];

/** Exercise list grouped by muscle, with search and "create own". Returns the pick via `bridge`. */
export default function ExercisePickerScreen() {
  const exercises = useApi<Exercise[]>('/exercises').data ?? [];
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(q));
  const groups = MUSCLES.map((m) => ({ muscle: m, items: filtered.filter((e) => e.muscle === m) })).filter((g) => g.items.length);

  const pick = (e: Exercise) => {
    bridge.pickExercise(e);
    router.back();
  };

  const create = () => {
    const name = query.trim();
    Alert.alert(`„${name}“ anlegen`, 'Welche Muskelgruppe?', [
      ...MUSCLES.map((muscle) => ({
        text: muscle,
        onPress: async () => {
          try {
            const created = await api.post<Exercise>('/exercises', { name, muscle });
            invalidate();
            pick(created);
          } catch (err) {
            Alert.alert('Fehler', (err as Error).message);
          }
        },
      })),
      { text: 'Abbrechen', style: 'cancel' as const },
    ]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Übung wählen' }} />
      <View style={styles.search}>
        <SymbolView name="magnifyingglass" size={16} tintColor={Colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Suchen"
          placeholderTextColor={Colors.textTertiary}
          style={styles.searchInput}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {q.length > 0 && !exercises.some((e) => e.name.toLowerCase() === q) && (
        <List>
          <Row title={`„${query.trim()}“ als eigene Übung anlegen`} icon="plus" onPress={create} />
        </List>
      )}
      {groups.map((g) => (
        <Section key={g.muscle} title={g.muscle}>
          <List>
            {g.items.map((e) => (
              <Row key={e.id} title={e.name} subtitle={e.custom ? 'Eigene Übung' : undefined} onPress={() => pick(e)} />
            ))}
          </List>
        </Section>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 40,
    borderRadius: Radius.small,
    backgroundColor: Colors.card,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 17 },
});
