import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ActivityOverview } from '@/components/activity-overview';
import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { EmptyState, ErrorNotice, List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDateKey } from '@/lib/date';
import { formatDay, formatDuration, formatKg, formatNumber } from '@/lib/format';
import { deleteWorkoutFromHealth } from '@/lib/health';
import { type Cardio, type Template, type WorkoutSummary } from '@/lib/types';
import { startWorkout, useDraft, type Draft } from '@/lib/workout-draft';

export default function TrainingScreen() {
  const draft = useDraft();
  const templates = useApi<Template[]>('/templates');
  const workouts = useApi<WorkoutSummary[]>('/workouts?limit=10');
  const cardio = useApi<Cardio[]>('/cardio').data ?? [];

  const start = async (t: Template | null) => {
    if (draft) {
      Alert.alert('Es läuft schon ein Workout', 'Erst beenden oder verwerfen.', [
        { text: 'Zum Workout', onPress: () => router.push('/workout') },
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }
    await startWorkout(t);
    router.push('/workout');
  };

  return (
    <Screen>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="figure.run" onPress={() => router.push('/cardio')} />
        <Stack.Toolbar.Button icon="plus" onPress={() => router.push('/template')} />
      </Stack.Toolbar>

      {draft && <ActiveWorkoutBanner draft={draft} />}
      <ActivityOverview />
      {templates.error && <ErrorNotice message={templates.error} onRetry={templates.reload} />}

      <Section title="Vorlagen">
        {templates.data?.length === 0 && (
          <Card>
            <EmptyState icon="list.bullet.clipboard" title="Noch keine Vorlage" text="Leg z. B. Push, Pull und Legs an, dann startest du dein Training mit einem Tipp." />
          </Card>
        )}
        {templates.data?.map((t) => <TemplateCard key={t.id} template={t} onStart={() => start(t)} />)}
        <List>
          <Row title="Freies Training starten" icon="play.fill" onPress={() => start(null)} />
        </List>
      </Section>

      {(workouts.data?.length ?? 0) > 0 && (
        <Section title="Letzte Workouts">
          <List>
            {workouts.data!.map((w) => (
              <Row
                key={w.id}
                title={w.name}
                subtitle={`${formatDay(w.startedAt)} · ${formatDuration(Date.parse(w.finishedAt) - Date.parse(w.startedAt))} · ${w.setCount} Sätze`}
                value={formatKg(w.volume)}
                chevron
                onPress={() => router.push({ pathname: '/workout-detail', params: { id: w.id } })}
              />
            ))}
          </List>
        </Section>
      )}

      {cardio.length > 0 && (
        <Section title="Cardio">
          <List>
            {cardio.slice(0, 5).map((c) => (
              <Row
                key={c.id}
                title={c.type}
                subtitle={formatDateKey(c.date)}
                value={[`${formatNumber(c.minutes, 0)} min`, c.distanceKm ? `${formatNumber(c.distanceKm)} km` : null].filter(Boolean).join(' · ')}
                onLongPress={() =>
                  Alert.alert(c.type, 'Eintrag löschen?', [
                    { text: 'Abbrechen', style: 'cancel' },
                    {
                      text: 'Löschen',
                      style: 'destructive',
                      onPress: () =>
                        api.del(`/cardio/${c.id}`).then(() => {
                          deleteWorkoutFromHealth(`cardio-${c.id}`);
                          invalidate();
                        }),
                    },
                  ])
                }
              />
            ))}
          </List>
        </Section>
      )}
    </Screen>
  );
}

function ActiveWorkoutBanner({ draft }: { draft: Draft }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <Pressable onPress={() => router.push('/workout')} style={styles.banner}>
      <SymbolView name="timer" size={22} tintColor={Colors.onAccent} />
      <View style={styles.flex}>
        <AppText type="headline" color={Colors.onAccent}>
          {draft.name} läuft
        </AppText>
        <AppText type="caption" color={Colors.onAccent}>
          seit {formatDuration(now - Date.parse(draft.startedAt))} · Tippen zum Fortsetzen
        </AppText>
      </View>
      <SymbolView name="chevron.right" size={14} weight="bold" tintColor={Colors.onAccent} />
    </Pressable>
  );
}

function TemplateCard({ template, onStart }: { template: Template; onStart: () => void }) {
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.accent,
  },
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
