import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { List, PrimaryButton, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { api, API_URL, useApi } from '@/lib/api';
import { type Activity } from '@/lib/health';

const STEPS = [
  'Kurzbefehle-App → „+“ → neuer Kurzbefehl, Name: Fitness Sync.',
  '„Health-Samples suchen“: Typ Schritte, Startdatum ist heute. Dann „Statistik berechnen“ → Summe.',
  'Dasselbe für Typ Aktive Energie (wieder Summe).',
  '„Health-Samples suchen“: Typ Gewicht, sortiert nach Startdatum, neueste zuerst, Limit 1.',
  '„Inhalte von URL abrufen“: URL von unten, Methode POST, Header „Authorization“ mit „Bearer “ + Token, Haupttext JSON mit steps, activeKcal und weightKg aus den drei Ergebnissen.',
  'Für kcal, protein, carbs und fat aus der Antwort: „Wörterbuchwert abrufen“, dann „Wenn größer als 0“ → „Health-Sample protokollieren“ (Nahrungsenergie, Protein, Kohlenhydrate, Fett gesamt).',
  'Automationen: „App“ → Fitness wird geöffnet → Fitness Sync, „Sofort ausführen“. Zusätzlich „Tageszeit“ für feste Uhrzeiten.',
];

export default function ShortcutScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useApi<Activity & { updatedAt: string } | null>('/health/today').data;
  const syncUrl = `${API_URL}/health/sync`;

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ token: string }>('/me/shortcut-token', {});
      setToken(r.token);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Fehler', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Health-Kurzbefehl' }} />

      <AppText color={Colors.textSecondary} style={styles.intro}>
        Ein Kurzbefehl liest Schritte, Aktivkalorien und Gewicht aus Apple Health und schickt sie an deinen Server. Deine Mahlzeiten
        trägt er nach Health ein, jeweils nur das Neue seit dem letzten Lauf.
      </AppText>

      <Section title="Letzter Sync">
        <List>
          <Row
            title={last ? `${(last.steps ?? 0).toLocaleString('de-DE')} Schritte · ${Math.round(last.activeKcal ?? 0)} kcal` : 'Heute noch nicht'}
            subtitle={last ? `um ${new Date(last.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : undefined}
            icon="arrow.triangle.2.circlepath"
          />
        </List>
      </Section>

      <Section title="1. Token" footer="Der Token darf nur den Health-Sync aufrufen. Ein neuer Token macht den alten ungültig.">
        {token ? (
          <Card style={styles.tokenCard}>
            <Text selectable style={styles.token}>
              {token}
            </Text>
            <PrimaryButton title="Token kopieren / teilen" onPress={() => Share.share({ message: token })} />
          </Card>
        ) : (
          <PrimaryButton title="Token erstellen" onPress={create} loading={busy} />
        )}
      </Section>

      <Section title="2. URL">
        <Card style={styles.tokenCard}>
          <Text selectable style={styles.token}>
            {syncUrl}
          </Text>
          <PrimaryButton title="URL kopieren / teilen" onPress={() => Share.share({ message: syncUrl })} />
        </Card>
      </Section>

      <Section title="3. Kurzbefehl bauen">
        <Card style={styles.steps}>
          {STEPS.map((s, i) => (
            <View key={i} style={styles.step}>
              <AppText type="headline" color={Colors.accent} style={styles.stepNo}>
                {i + 1}
              </AppText>
              <AppText style={styles.flex}>{s}</AppText>
            </View>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { marginHorizontal: Spacing.two },
  tokenCard: { gap: Spacing.three },
  token: {
    color: Colors.text,
    fontFamily: Fonts.mono,
    fontSize: 14,
    backgroundColor: Colors.cardElevated,
    padding: Spacing.three,
    borderRadius: Radius.small,
  },
  steps: { gap: Spacing.three },
  step: { flexDirection: 'row', gap: Spacing.three },
  stepNo: { width: 18 },
});
