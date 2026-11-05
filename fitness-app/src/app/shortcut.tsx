import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { List, PrimaryButton, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api, API_URL, useApi } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { type HealthToday } from '@/lib/types';

const SHORTCUT_NAME = 'Fitness Sync';

const AUTOMATIONS = [
  'Kurzbefehle-App → Automation → „+“.',
  '„Tageszeit“ → 0:00 Uhr, täglich → „Sofort ausführen“ → Kurzbefehl „Fitness Sync“.',
  'Dasselbe für jede weitere Stunde, zu der du Daten willst (z. B. 7–23 Uhr).',
  '„App“ → Fitness → „Wird geöffnet“ → „Sofort ausführen“ → „Fitness Sync“.',
];

export default function ShortcutScreen() {
  const [busy, setBusy] = useState(false);
  const last = useApi<HealthToday | null>('/health/today').data;

  const install = () => Linking.openURL(`${API_URL}/shortcut/fitness-sync.shortcut`);

  // The app hands server address and a fresh shortcut-only token to the shortcut, which stores them.
  const connect = async () => {
    setBusy(true);
    try {
      const { token } = await api.post<{ token: string }>('/me/shortcut-token', {});
      const text = `setup|${API_URL}|${token}`;
      await Linking.openURL(`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Verbinden fehlgeschlagen', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Apple Health' }} />

      <AppText color={Colors.textSecondary} style={styles.intro}>
        Stündlich kommen Schritte, Aktivkalorien, Trainingsminuten, Strecke und Gewicht aus Health in die App. Um Mitternacht gehen
        Ernährung, Gewicht und Workouts des Tages nach Health.
      </AppText>

      <Section title="Letzter Abgleich">
        <List>
          {last ? (
            <>
              <Row
                title={`${(last.steps ?? 0).toLocaleString('de-DE')} Schritte · ${formatNumber(last.distanceKm ?? 0)} km`}
                subtitle={`${Math.round(last.activeKcal ?? 0)} kcal aktiv · ${Math.round(last.exerciseMin ?? 0)} min Training`}
                icon="figure.walk"
              />
              <Row
                title="Zuletzt aktualisiert"
                value={new Date(last.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              />
            </>
          ) : (
            <Row title="Heute noch kein Abgleich" icon="arrow.triangle.2.circlepath" />
          )}
        </List>
      </Section>

      <Section title="Einrichten" footer="„Verbinden“ öffnet kurz die Kurzbefehle-App und speichert dort deine Zugangsdaten. Beim ersten Lauf fragt iOS nach den Health-Zugriffen.">
        <PrimaryButton title="1. Kurzbefehl laden" onPress={install} />
        <PrimaryButton title="2. Verbinden" onPress={connect} loading={busy} />
      </Section>

      <Section title="3. Automationen (einmalig)" footer="Automationen kann keine App für dich anlegen, das lässt iOS nur in der Kurzbefehle-App zu.">
        <Card style={styles.steps}>
          {AUTOMATIONS.map((s, i) => (
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
  steps: { gap: Spacing.three },
  step: { flexDirection: 'row', gap: Spacing.three },
  stepNo: { width: 18 },
});
