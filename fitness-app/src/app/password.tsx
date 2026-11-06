import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { List } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

/** Change the account password. Other devices are signed out; this one and the Health shortcut stay connected. */
export default function PasswordScreen() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    if (!current) return Alert.alert('Aktuelles Passwort fehlt');
    if (next.length < 8) return Alert.alert('Zu kurz', 'Das neue Passwort braucht mindestens 8 Zeichen.');
    if (next !== repeat) return Alert.alert('Stimmt nicht überein', 'Die beiden neuen Passwörter sind unterschiedlich.');
    setSaving(true);
    try {
      await api.post('/auth/password', { current, next });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Passwort geändert', 'Andere Geräte wurden abgemeldet. Dieses iPhone und der Health-Kurzbefehl bleiben verbunden.');
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Ändern fehlgeschlagen', (e as Error).message);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Passwort ändern' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Abbrechen</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <Section footer="Mindestens 8 Zeichen. Danach werden andere Geräte abgemeldet.">
        <List>
          <Field label="Aktuell" value={current} onChange={setCurrent} autoFocus textContentType="password" />
          <Field label="Neu" value={next} onChange={setNext} textContentType="newPassword" />
          <Field label="Wiederholen" value={repeat} onChange={setRepeat} textContentType="newPassword" />
        </List>
      </Section>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  autoFocus,
  textContentType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  textContentType: 'password' | 'newPassword';
}) {
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        textContentType={textContentType}
        placeholder="••••••••"
        placeholderTextColor={Colors.textTertiary}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, minHeight: 50, gap: Spacing.two },
  label: { width: 110 },
  input: { flex: 1, color: Colors.text, fontSize: 17 },
});
