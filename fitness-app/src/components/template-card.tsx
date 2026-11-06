import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Colors, Spacing } from '@/constants/theme';
import { type Template } from '@/lib/types';

/** A template: tap (or ▶) to start, ⋯ or long press to edit. */
export function TemplateCard({ template, onStart }: { template: Template; onStart: () => void }) {
  const names = template.exercises.map((e) => e.name);
  const sets = template.exercises.reduce((n, e) => n + e.sets, 0);

  return (
    <Pressable onPress={onStart} onLongPress={() => router.push({ pathname: '/template', params: { id: template.id } })}>
      {({ pressed }) => (
        <Card style={[styles.template, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <AppText type="headline">{template.name}</AppText>
            <AppText type="caption" color={Colors.textSecondary} numberOfLines={2}>
              {names.length ? names.join(' · ') : 'Keine Übungen'}
            </AppText>
            <AppText type="caption" color={Colors.textTertiary}>
              {template.exercises.length} Übungen · {sets} Sätze
            </AppText>
          </View>
          <Pressable hitSlop={10} onPress={() => router.push({ pathname: '/template', params: { id: template.id } })}>
            <SymbolView name="ellipsis.circle" size={24} tintColor={Colors.textSecondary} />
          </Pressable>
          <View style={styles.play}>
            <SymbolView name="play.fill" size={16} tintColor={Colors.onAccent} />
          </View>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  template: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
