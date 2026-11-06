import { DatePicker, Host } from '@expo/ui/swift-ui';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState, List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { loadReminders, remindersAvailable, saveReminders, type ReminderSettings, type Time } from '@/lib/reminders';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const toDate = (t: Time) => {
  const d = new Date();
  d.setHours(t.hour, t.minute, 0, 0);
  return d;
};
const toTime = (d: Date): Time => ({ hour: d.getHours(), minute: d.getMinutes() });

/** Settings for local reminders on this iPhone. */
export default function RemindersScreen() {
  'use no memo';
  const [settings, setSettings] = useState<ReminderSettings>(loadReminders);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    remindersAvailable().then(setAvailable);
  }, []);

  const save = async () => {
    const ok = await saveReminders(settings);
    if (!ok) {
      Alert.alert('Mitteilungen sind aus', 'Erlaube Mitteilungen für die Fitness-App in den iPhone-Einstellungen, damit Erinnerungen ankommen.', [
        { text: 'Später', style: 'cancel' },
        { text: 'Einstellungen', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const set = <K extends keyof ReminderSettings>(key: K, patch: Partial<ReminderSettings[K]>) =>
    setSettings((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const timePicker = (time: Time, onChange: (t: Time) => void) => (
    <Host matchContents>
      <DatePicker selection={toDate(time)} displayedComponents={['hourAndMinute']} onDateChange={(d) => onChange(toTime(d))} />
    </Host>
  );
  const toggle = (value: boolean, onChange: (v: boolean) => void) => <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.accent }} />;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Erinnerungen' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Abbrechen</Stack.Toolbar.Button>
      </Stack.Toolbar>
      {available ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button variant="done" onPress={save}>
            Sichern
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}

      {available === false && (
        <Card>
          <EmptyState
            icon="bell.slash"
            title="Neue App-Version nötig"
            text="Erinnerungen brauchen die neue App-Version 1.1. Installiere die neue Fitness.ipa einmal mit Sideloadly, danach funktionieren sie."
          />
        </Card>
      )}

      {available && (
        <>
          <Section title="Wasser" footer="Zur vollen Stunde im gewählten Zeitraum.">
            <List>
              <Row title="Ans Trinken erinnern" icon="drop.fill" iconColor="#32ADE6" right={toggle(settings.water.on, (on) => set('water', { on }))} />
              {settings.water.on && (
                <View style={styles.chipsRow}>
                  {[1, 2, 3].map((h) => (
                    <Chip key={h} label={`alle ${h} h`} active={settings.water.everyHours === h} onPress={() => set('water', { everyHours: h })} />
                  ))}
                  {[
                    [8, 20],
                    [10, 20],
                    [9, 22],
                  ].map(([from, to]) => (
                    <Chip
                      key={`${from}-${to}`}
                      label={`${from}–${to} Uhr`}
                      active={settings.water.from === from && settings.water.to === to}
                      onPress={() => set('water', { from, to })}
                    />
                  ))}
                </View>
              )}
            </List>
          </Section>

          <Section title="Mahlzeiten">
            <List>
              <Row title="Ans Eintragen erinnern" icon="fork.knife" right={toggle(settings.meals.on, (on) => set('meals', { on }))} />
              {settings.meals.on && (
                <>
                  <Row title="Frühstück" right={timePicker(settings.meals.breakfast, (breakfast) => set('meals', { breakfast }))} />
                  <Row title="Mittagessen" right={timePicker(settings.meals.lunch, (lunch) => set('meals', { lunch }))} />
                  <Row title="Abendessen" right={timePicker(settings.meals.dinner, (dinner) => set('meals', { dinner }))} />
                </>
              )}
            </List>
          </Section>

          <Section title="Training">
            <List>
              <Row title="An Trainingstage erinnern" icon="dumbbell.fill" iconColor="#FF9500" right={toggle(settings.training.on, (on) => set('training', { on }))} />
              {settings.training.on && (
                <>
                  <View style={styles.chipsRow}>
                    {WEEKDAYS.map((label, i) => {
                      const day = i + 1;
                      const active = settings.training.days.includes(day);
                      return (
                        <Chip
                          key={label}
                          label={label}
                          active={active}
                          onPress={() =>
                            set('training', { days: active ? settings.training.days.filter((d) => d !== day) : [...settings.training.days, day].sort() })
                          }
                        />
                      );
                    })}
                  </View>
                  <Row title="Uhrzeit" right={timePicker(settings.training.time, (time) => set('training', { time }))} />
                </>
              )}
            </List>
          </Section>

          <Section title="Gewicht" footer="Erinnerungen kommen nur auf diesem iPhone an und funktionieren auch ohne Verbindung zum Server.">
            <List>
              <Row title="Ans Wiegen erinnern" icon="scalemass.fill" iconColor="#AF52DE" right={toggle(settings.weigh.on, (on) => set('weigh', { on }))} />
              {settings.weigh.on && <Row title="Uhrzeit" right={timePicker(settings.weigh.time, (time) => set('weigh', { time }))} />}
            </List>
          </Section>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, padding: Spacing.three },
});
