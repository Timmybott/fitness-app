import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { List, Row } from '@/components/list';
import { Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { type Exercise } from '@/lib/types';

const MUSCLES = ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Core', 'Sonstiges'];

type Props = { visible: boolean; onClose: () => void; onPick: (e: Exercise) => void };

/** Native page sheet listing all exercises grouped by muscle, with search and "create own". */
export function ExercisePicker({ visible, onClose, onPick }: Props) {
  const exercises = useApi<Exercise[]>(visible ? '/exercises' : null).data ?? [];
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = exercises.filter((e) => e.name.toLowerCase().includes(q));
  const groups = MUSCLES.map((m) => ({ muscle: m, items: filtered.filter((e) => e.muscle === m) })).filter((g) => g.items.length);

  const pick = (e: Exercise) => {
    setQuery('');
    onPick(e);
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <AppText type="headline">Übung wählen</AppText>
          <Pressable onPress={onClose} hitSlop={10}>
            <AppText color={Colors.accent}>Fertig</AppText>
          </Pressable>
        </View>
        <View style={styles.search}>
          <SymbolView name="magnifyingglass" size={16} tintColor={Colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Suchen"
            placeholderTextColor={Colors.textTertiary}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    paddingTop: Spacing.four,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.three,
    height: 40,
    borderRadius: Radius.small,
    backgroundColor: Colors.card,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 17 },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
});
