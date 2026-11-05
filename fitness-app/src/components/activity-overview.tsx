import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { type SFSymbol } from 'sf-symbols-typescript';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { BarChart } from '@/components/charts';
import { Colors, Spacing } from '@/constants/theme';
import { useApi } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { type DailyStats, type HealthToday } from '@/lib/types';

const STEP_GOAL = 10000;

/** Today's activity imported from Apple Health, plus the last 7 days of steps. */
export function ActivityOverview() {
  const today = useApi<HealthToday | null>('/health/today').data;
  const days = useApi<DailyStats[]>('/nutrition/daily?days=7').data ?? [];
  const steps = today?.steps ?? 0;
  const weekSteps = days.reduce((s, d) => s + (d.steps ?? 0), 0);
  const withSteps = days.filter((d) => (d.steps ?? 0) > 0);

  if (!today && withSteps.length === 0) {
    return (
      <Pressable onPress={() => router.push('/shortcut')}>
        <Card style={styles.empty}>
          <SymbolView name="heart.text.square.fill" size={28} tintColor="#FF2D55" />
          <View style={styles.flex}>
            <AppText type="headline">Aktivität aus Apple Health</AppText>
            <AppText type="caption" color={Colors.textSecondary}>
              Richte den Kurzbefehl ein, um Schritte, Kalorien und Strecke hier zu sehen.
            </AppText>
          </View>
          <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={Colors.textTertiary} />
        </Card>
      </Pressable>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.hero}>
        <View style={styles.flex}>
          <AppText type="caption" color={Colors.textSecondary}>
            Schritte heute
          </AppText>
          <AppText type="number">{steps.toLocaleString('de-DE')}</AppText>
        </View>
        <AppText type="caption" color={Colors.textSecondary}>
          {Math.min(100, Math.round((steps / STEP_GOAL) * 100))} % von {STEP_GOAL.toLocaleString('de-DE')}
        </AppText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(1, steps / STEP_GOAL) * 100}%` }]} />
      </View>

      <View style={styles.tiles}>
        <Tile icon="flame.fill" color={Colors.protein} value={`${Math.round(today?.activeKcal ?? 0)}`} unit="kcal aktiv" />
        <Tile icon="figure.walk" color={Colors.carbs} value={formatNumber(today?.distanceKm ?? 0)} unit="km" />
        <Tile icon="figure.stairs" color={Colors.fat} value={`${today?.flights ?? 0}`} unit="Stockwerke" />
      </View>

      {days.length > 0 && (
        <>
          <View style={styles.weekHeader}>
            <AppText type="caption" color={Colors.textSecondary}>
              Letzte 7 Tage · {weekSteps.toLocaleString('de-DE')} Schritte
            </AppText>
            <AppText type="caption" color={Colors.textSecondary}>
              Ø {withSteps.length ? Math.round(weekSteps / withSteps.length).toLocaleString('de-DE') : 0}
            </AppText>
          </View>
          <BarChart
            bars={days.map((d) => {
              const [y, m, dd] = d.date.split('-').map(Number);
              return { label: new Date(y, m - 1, dd).toLocaleDateString('de-DE', { weekday: 'narrow' }), value: d.steps ?? 0 };
            })}
            color={Colors.accent}
            height={70}
          />
        </>
      )}
    </Card>
  );
}

function Tile({ icon, color, value, unit }: { icon: SFSymbol; color: string; value: string; unit: string }) {
  return (
    <View style={styles.tile}>
      <SymbolView name={icon} size={18} tintColor={color} />
      <AppText type="title">{value}</AppText>
      <AppText type="caption" color={Colors.textSecondary}>
        {unit}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: Spacing.three },
  empty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  hero: { flexDirection: 'row', alignItems: 'flex-end' },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.cardElevated, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: Colors.accent },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: Spacing.two, borderRadius: 12, backgroundColor: Colors.cardElevated },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between' },
});
