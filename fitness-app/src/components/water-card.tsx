import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { IconButton } from '@/components/icon-button';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { parseNum, type WaterDay } from '@/lib/types';

export const WATER_COLOR = '#4FC3F7';
const GLASS_ML = 250;

/** Water intake for a day: progress to the goal, one-tap glasses, undo, and "+" for other drinks. */
export function WaterCard({ date, goalMl }: { date: string; goalMl: number }) {
  const water = useApi<WaterDay>(`/water?date=${date}`).data;
  const total = water?.totalMl ?? 0;
  const progress = goalMl > 0 ? Math.min(1, total / goalMl) : 0;
  const glasses = Math.max(1, Math.round(goalMl / GLASS_ML));
  const filled = Math.floor(total / GLASS_ML);

  const add = async (ml: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await api.post('/water', { date, ml, name: 'Wasser' });
      invalidate();
    } catch (e) {
      Alert.alert('Fehler', (e as Error).message);
    }
  };

  const undo = async () => {
    const last = water?.entries.at(-1);
    if (!last) return;
    Haptics.selectionAsync();
    await api.del(`/water/${last.id}`).catch(() => {});
    invalidate();
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <SymbolView name="drop.fill" size={18} tintColor={WATER_COLOR} />
        <AppText type="headline" style={styles.flex}>
          Wasser
        </AppText>
        <AppText type="caption" color={Colors.textSecondary}>
          {formatNumber(total / 1000)} / {formatNumber(goalMl / 1000)} l
        </AppText>
        <IconButton
          icon="plus"
          filled
          onPress={() =>
            Alert.prompt(
              'Wasser hinzufügen',
              'Menge in ml',
              (value) => {
                const ml = Math.round(parseNum(value));
                if (ml > 0) add(Math.min(ml, 5000));
              },
              'plain-text',
              '',
              'number-pad',
            )
          }
        />
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>

      {/* One tap on a glass = one glass of water. */}
      <View style={styles.glasses}>
        {Array.from({ length: Math.min(glasses, 12) }, (_, i) => (
          <Pressable key={i} onPress={() => add(GLASS_ML)} hitSlop={4}>
            <SymbolView name={i < filled ? 'waterbottle.fill' : 'waterbottle'} size={22} tintColor={i < filled ? WATER_COLOR : Colors.textTertiary} />
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <QuickButton label="+250 ml" onPress={() => add(250)} />
        <QuickButton label="+500 ml" onPress={() => add(500)} />
        <QuickButton label="Rückgängig" onPress={undo} disabled={!water?.entries.length} />
      </View>
    </Card>
  );
}

function QuickButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.quick, (pressed || disabled) && styles.dim]}>
      <AppText type="caption">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { opacity: 0.4 },
  card: { gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.cardElevated, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: WATER_COLOR },
  glasses: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  quick: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    backgroundColor: Colors.cardElevated,
  },
});
