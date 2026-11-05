import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Share, StyleSheet, View } from 'react-native';

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
  '„App“ → Fitness → „Wird geöffnet“ → „Sofort ausführen“ → „Fitness Sync“. Damit sind Schritte & Co. beim Öffnen aktuell.',
  '„Tageszeit“ → 0:00 Uhr, täglich → „Sofort ausführen“ → „Fitness Sync“. Damit gehen Gewicht, Ernährung und Workouts des Tages nach Health.',
  'Optional: weitere Uhrzeiten, falls die Zahlen auch ohne Öffnen der App aktuell sein sollen.',
];

export default function ShortcutScreen() {
  const [busy, setBusy] = useState(false);
  const last = useApi<HealthToday | null>('/health/today').data;

  // Shortcuts' import-shortcut URL rejects plain-http addresses and Safari only saves the file to Files,
  // so the app downloads it and offers it in the share sheet, where "Shortcuts" imports it directly.
  const install = async () => {
    try {
      const file = await File.downloadFileAsync(`${API_URL}/shortcut/fitness-sync.shortcut`, new File(Paths.cache, `${SHORTCUT_NAME}.shortcut`), {
        idempotent: true,
      });
      await Share.share({ url: file.uri });
    } catch (e) {
      Alert.alert('Laden fehlgeschlagen', (e as Error).message);
    }
  };

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
        Beim Öffnen der App kommen Schritte, Aktivkalorien, Trainingsminuten, Strecke und Gewicht aus Health. Um Mitternacht gehen
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

      <Section
        title="Einrichten"
        footer="Bei „Kurzbefehl laden“ im Teilen-Menü „Kurzbefehle“ wählen. „Verbinden“ öffnet danach kurz die Kurzbefehle-App und speichert dort deine Zugangsdaten.">
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
