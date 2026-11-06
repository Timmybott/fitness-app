import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { WATER_COLOR } from '@/components/water-card';
import { Colors, Spacing } from '@/constants/theme';
import { api, API_URL, invalidate, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBody } from '@/lib/calories';
import { formatNumber } from '@/lib/format';
import { parseNum, type Goals, type HealthToday } from '@/lib/types';

type NumberGoal = Exclude<keyof Goals, 'addBurned'>;

const FIELDS: { key: NumberGoal; label: string; unit: string; color: string }[] = [
  { key: 'kcal', label: 'Kalorien', unit: 'kcal', color: Colors.kcal },
  { key: 'protein', label: 'Protein', unit: 'g', color: Colors.protein },
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g', color: Colors.carbs },
  { key: 'fat', label: 'Fett', unit: 'g', color: Colors.fat },
  { key: 'waterMl', label: 'Wasser', unit: 'ml', color: WATER_COLOR },
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

      <BodySection />

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

function BodySection() {
  const body = useBody();
  const hasWeight = (useApi<unknown[]>('/weights?days=365').data ?? []).length > 0;

  const editHeight = () =>
    Alert.prompt(
      'Körpergröße',
      'In Zentimetern, z. B. 180',
      async (text) => {
        const cm = Math.round(parseNum(text));
        if (!text.trim()) return;
        if (cm < 100 || cm > 250) return Alert.alert('Ungültige Größe', 'Bitte zwischen 100 und 250 cm eingeben.');
        try {
          await api.put('/body', { heightCm: cm });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          invalidate();
        } catch (e) {
          Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
        }
      },
      'plain-text',
      body.heightCm ? String(body.heightCm) : '',
      'number-pad',
    );

  return (
    <Section title="Körper" footer="Größe und Gewicht fließen in die Kalorienberechnung aller Trainings ein (Grundumsatz nach Mifflin-St Jeor). Das Gewicht kommt aus deinen Einträgen in Statistik bzw. Apple Health.">
      <List>
        <Row title="Größe" icon="ruler" value={body.heightCm ? `${body.heightCm} cm` : 'Nicht angegeben'} chevron onPress={editHeight} />
        <Row title="Gewicht" icon="scalemass.fill" value={hasWeight ? `${formatNumber(body.kg)} kg` : 'Noch kein Eintrag'} />
      </List>
    </Section>
  );
}

function HealthSection() {
  const last = useApi<HealthToday | null>('/health/today').data;
  return (
    <Section title="Apple Health">
      <List>
        <Row
          title="Apple Health"
          subtitle={last ? `Abgleich um ${new Date(last.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : 'Kurzbefehl einrichten'}
          icon="heart.fill"
          iconColor="#FF2D55"
          chevron
          onPress={() => router.push('/shortcut')}
        />
      </List>
    </Section>
  );
}

function GoalsForm({ goals }: { goals: Goals }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(goals[f.key])])));
  const [addBurned, setAddBurned] = useState(goals.addBurned);

  const dirty = addBurned !== goals.addBurned || FIELDS.some((f) => draft[f.key] !== String(goals[f.key]));
  // Calories implied by the macro goals (4/4/9 kcal per gram), as a sanity check.
  const macroKcal = (parseFloat(draft.protein) || 0) * 4 + (parseFloat(draft.carbs) || 0) * 4 + (parseFloat(draft.fat) || 0) * 9;

  const save = async () => {
    const parsed = {
      ...(Object.fromEntries(FIELDS.map((f) => [f.key, Math.max(0, Math.round(parseFloat(draft[f.key]) || 0))])) as Record<NumberGoal, number>),
      addBurned,
    };
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
      <List>
        <Row
          title="Verbrannte Kalorien hinzurechnen"
          subtitle="Aktivkalorien aus Health erhöhen dein Tagesbudget"
          right={<Switch value={addBurned} onValueChange={setAddBurned} trackColor={{ true: Colors.accent }} />}
        />
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
