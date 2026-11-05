import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Chip } from '@/components/chip';
import { List } from '@/components/list';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate } from '@/lib/api';
import { toDateKey } from '@/lib/date';
import { logWorkoutToHealth } from '@/lib/health';
import { parseNum, type Cardio } from '@/lib/types';

const TYPES = ['Laufen', 'Radfahren', 'Gehen', 'Schwimmen', 'Rudern', 'Crosstrainer', 'Seilspringen', 'Sonstiges'];

export default function CardioScreen() {
  const [type, setType] = useState('Laufen');
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [kcal, setKcal] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = parseNum(minutes) > 0;

  const save = async () => {
    if (saving) return;
    if (!valid) return Alert.alert('Dauer fehlt', 'Trag ein, wie viele Minuten du trainiert hast.');
    setSaving(true);
    try {
      const c = await api.post<Cardio>('/cardio', {
        date: toDateKey(new Date()),
        type,
        minutes: parseNum(minutes),
        distanceKm: km ? parseNum(km) : null,
        kcal: kcal ? parseNum(kcal) : null,
      });
      // Logged right after the session, so it ended now.
      const end = new Date();
      logWorkoutToHealth({ syncId: `cardio-${c.id}`, type, start: new Date(end.getTime() - c.minutes * 60000), end, distanceKm: c.distanceKm, kcal: c.kcal });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <View style={styles.chips}>
        {TYPES.map((t) => (
          <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>

      <List>
        <Field label="Dauer" unit="min" value={minutes} onChange={setMinutes} autoFocus />
        <Field label="Distanz (optional)" unit="km" value={km} onChange={setKm} />
        <Field label="Kalorien (optional)" unit="kcal" value={kcal} onChange={setKcal} />
      </List>
    </ScrollView>
  );
}

function Field({ label, unit, value, onChange, autoFocus }: { label: string; unit: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={Colors.textTertiary}
        autoFocus={autoFocus}
        style={styles.input}
      />
      <AppText color={Colors.textSecondary} style={styles.unit}>
        {unit}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.three, gap: Spacing.four },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  field: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, minHeight: 50, gap: Spacing.two },
  label: { flex: 1 },
  input: { minWidth: 80, textAlign: 'right', color: Colors.text, fontSize: 17, fontWeight: 600 },
  unit: { width: 36 },
});
