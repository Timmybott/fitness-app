import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api, API_URL, invalidate, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { disableHealth, enableHealth, healthAvailable, useHealthEnabled } from '@/lib/health';
import { type Goals } from '@/lib/types';

const FIELDS: { key: keyof Goals; label: string; unit: string; color: string }[] = [
  { key: 'kcal', label: 'Kalorien', unit: 'kcal', color: Colors.kcal },
  { key: 'protein', label: 'Protein', unit: 'g', color: Colors.protein },
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g', color: Colors.carbs },
  { key: 'fat', label: 'Fett', unit: 'g', color: Colors.fat },
];

export default function ProfileScreen() {
  const { state, signOut } = useAuth();
  const goals = useApi<Goals>('/goals').data;
  const user = state.status === 'signedIn' ? state.user : null;

  const deleteAccount = () =>
    Alert.alert('Account löschen?', 'Alle deine Daten werden endgültig vom Server gelöscht.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Endgültig löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.del('/me');
            await signOut();
          } catch (e) {
            Alert.alert('Fehler', (e as Error).message);
          }
        },
      },
    ]);

  return (
    <Screen>
      {user && (
        <List>
          <Row title={user.name} subtitle={user.email} icon="person.fill" />
        </List>
      )}

      {/* Remount the form when saved goals change so the draft resets to them. */}
      {goals && <GoalsForm key={JSON.stringify(goals)} goals={goals} />}

      <HealthSection />

      <Section title="Account" footer={`Server: ${API_URL}`}>
        <List>
          <Row title="Abmelden" onPress={signOut} />
          <Row title="Account löschen" destructive onPress={deleteAccount} />
        </List>
      </Section>
    </Screen>
  );
}

function HealthSection() {
  const on = useHealthEnabled();
  const available = healthAvailable();

  const toggle = async (value: boolean) => {
    if (!value) return disableHealth();
    try {
      await enableHealth();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      const message = (e as Error).message;
      // Free Apple IDs can't sign apps with the HealthKit entitlement.
      if (message.toLowerCase().includes('entitlement')) {
        Alert.alert('Direkt nicht möglich', 'Die direkte Health-Verbindung braucht einen bezahlten Apple-Developer-Account. Nutze stattdessen den Kurzbefehl.', [
          { text: 'Später', style: 'cancel' },
          { text: 'Kurzbefehl einrichten', onPress: () => router.push('/shortcut') },
        ]);
      } else {
        Alert.alert('Apple Health', message);
      }
    }
  };

  return (
    <Section title="Apple Health" footer="Der Kurzbefehl überträgt Schritte, Aktivkalorien und Gewicht in die App und deine Mahlzeiten nach Health.">
      <List>
        <Row title="Kurzbefehl einrichten" icon="heart.fill" iconColor="#FF2D55" chevron onPress={() => router.push('/shortcut')} />
        {available && (
          <Row
            title="Direkt verbinden"
            subtitle="Nur mit Apple-Developer-Account"
            right={<Switch value={on} onValueChange={toggle} trackColor={{ true: Colors.accent }} />}
          />
        )}
      </List>
    </Section>
  );
}

function GoalsForm({ goals }: { goals: Goals }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(goals[f.key])])));

  const dirty = FIELDS.some((f) => draft[f.key] !== String(goals[f.key]));
  // Calories implied by the macro goals (4/4/9 kcal per gram), as a sanity check.
  const macroKcal = (parseFloat(draft.protein) || 0) * 4 + (parseFloat(draft.carbs) || 0) * 4 + (parseFloat(draft.fat) || 0) * 9;

  const save = async () => {
    const parsed = Object.fromEntries(FIELDS.map((f) => [f.key, Math.max(0, Math.round(parseFloat(draft[f.key]) || 0))])) as Goals;
    try {
      await api.put('/goals', parsed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  return (
    <Section title="Tagesziele" footer={`Deine Makros ergeben ${Math.round(macroKcal)} kcal.`}>
      {dirty && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button variant="done" onPress={save}>
            Sichern
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      )}
      <List>
        {FIELDS.map((f) => (
          <View key={f.key} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: f.color }]} />
            <AppText style={styles.flex}>{f.label}</AppText>
            <TextInput
              value={draft[f.key] ?? ''}
              onChangeText={(v) => setDraft((s) => ({ ...s, [f.key]: v }))}
              keyboardType="number-pad"
              selectTextOnFocus
              style={styles.input}
            />
            <AppText color={Colors.textSecondary} style={styles.unit}>
              {f.unit}
            </AppText>
          </View>
        ))}
      </List>
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, minHeight: 50 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  input: { minWidth: 70, textAlign: 'right', color: Colors.text, fontSize: 17, fontWeight: 600 },
  unit: { width: 34 },
});
