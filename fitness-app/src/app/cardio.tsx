import * as Haptics from 'expo-haptics';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Chip } from '@/components/chip';
import { List, Row } from '@/components/list';
import { Colors, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { cardioKcal, CARDIO_TYPES, useBody } from '@/lib/calories';
import { toDateKey } from '@/lib/date';
import { deleteWorkoutFromHealth, logWorkoutToHealth } from '@/lib/health';
import { parseNum, type Cardio } from '@/lib/types';

/** Log a cardio session, or edit one when opened with `id`. */
export default function CardioScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const list = useApi<Cardio[]>(id ? '/cardio' : null).data;
  const existing = list ? list.find((c) => String(c.id) === id) : undefined;
  if (id && !existing) return null;
  return <CardioForm key={existing ? existing.id : 'new'} cardio={existing} />;
}

const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
const toText = (n: number | null) => (n ? String(n).replace('.', ',') : '');

function CardioForm({ cardio }: { cardio?: Cardio }) {
  'use no memo';
  const body = useBody();
  const [type, setType] = useState<string>(cardio ? cardio.type : 'Laufen');
  const [minutes, setMinutes] = useState(cardio ? toText(cardio.minutes) : '');
  const [km, setKm] = useState(cardio ? toText(cardio.distanceKm) : '');
  const [kcal, setKcal] = useState(cardio ? toText(cardio.kcal ? Math.round(cardio.kcal) : null) : '');
  const [day, setDay] = useState(() => (cardio ? keyToDate(cardio.date.slice(0, 10)) : new Date()));
  const [saving, setSaving] = useState(false);

  // Shown as placeholder and used when no calories are entered.
  const estimate = Math.round(cardioKcal(type, parseNum(minutes), parseNum(km), body));

  const save = async () => {
    if (saving) return;
    if (parseNum(minutes) <= 0) return Alert.alert('Dauer fehlt', 'Trag ein, wie viele Minuten du trainiert hast.');
    setSaving(true);
    const payload = {
      date: toDateKey(day),
      type,
      minutes: parseNum(minutes),
      distanceKm: km ? parseNum(km) : null,
      kcal: kcal ? parseNum(kcal) : estimate,
    };
    try {
      if (cardio) {
        await api.put(`/cardio/${cardio.id}`, payload);
      } else {
        const c = await api.post<Cardio>('/cardio', payload);
        // Logged today right after the session, so it ended now; on another day it ends at noon.
        const end = toDateKey(day) === toDateKey(new Date()) ? new Date() : keyToDate(payload.date);
        logWorkoutToHealth({ syncId: `cardio-${c.id}`, type, start: new Date(end.getTime() - c.minutes * 60000), end, distanceKm: c.distanceKm, kcal: c.kcal });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  };

  const remove = () =>
    Alert.alert(cardio!.type, 'Eintrag löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await api.del(`/cardio/${cardio!.id}`);
          deleteWorkoutFromHealth(`cardio-${cardio!.id}`);
          invalidate();
          router.back();
        },
      },
    ]);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: cardio ? 'Cardio bearbeiten' : 'Cardio' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Abbrechen</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button variant="done" onPress={save}>
          Sichern
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <View style={styles.chips}>
        {CARDIO_TYPES.map((t) => (
          <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>

      <List>
        <Row
          title="Tag"
          right={
            <Host matchContents>
              <DatePicker selection={day} displayedComponents={['date']} onDateChange={setDay} />
            </Host>
          }
        />
        <Field label="Dauer" unit="min" value={minutes} onChange={setMinutes} autoFocus={!cardio} />
        <Field label="Distanz" unit="km" value={km} onChange={setKm} />
        <Field label="Kalorien" unit="kcal" value={kcal} onChange={setKcal} placeholder={estimate ? String(estimate) : '0'} />
      </List>
      <AppText type="caption" color={Colors.textSecondary} style={styles.hint}>
        Ohne Angabe schätzt die App die aktiven Kalorien aus Dauer, Distanz und deinem Gewicht ({Math.round(body.kg)} kg).
      </AppText>
      {cardio && (
        <List>
          <Row title="Eintrag löschen" destructive onPress={remove} />
        </List>
      )}
    </ScrollView>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  autoFocus,
  placeholder = '0',
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <AppText style={styles.label}>{label}</AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
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
  hint: { marginHorizontal: Spacing.three, marginTop: -Spacing.two },
});
