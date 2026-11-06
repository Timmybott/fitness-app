import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ActivityOverview } from '@/components/activity-overview';
import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { EmptyState, ErrorNotice, List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { TemplateCard } from '@/components/template-card';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, invalidate, useApi } from '@/lib/api';
import { formatDateKey } from '@/lib/date';
import { formatDay, formatDuration, formatKg, formatNumber } from '@/lib/format';
import { deleteWorkoutFromHealth } from '@/lib/health';
import { type Cardio, type Template, type WorkoutSummary } from '@/lib/types';
import { beginWorkout } from '@/lib/start-workout';
import { durationMs, isRunning, useDraft, type Draft } from '@/lib/workout-draft';

export default function TrainingScreen() {
  const draft = useDraft();
  const templates = useApi<Template[]>('/templates');
  const workouts = useApi<WorkoutSummary[]>('/workouts?limit=10');
  const cardio = useApi<Cardio[]>('/cardio').data ?? [];

  const start = (t: Template | null) => beginWorkout(t);

  return (
    <Screen>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="figure.run" onPress={() => router.push('/cardio')} />
        <Stack.Toolbar.Menu icon="plus">
          <Stack.Toolbar.MenuAction icon="square.and.pencil" onPress={() => router.push('/template')}>
            Neue Vorlage
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="list.bullet.clipboard" onPress={() => router.push('/templates')}>
            Vorlage auswählen
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="play.fill" onPress={() => start(null)}>
            Freies Training starten
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="clock.arrow.circlepath" onPress={() => router.push('/workout-log')}>
            Nachträglich eintragen
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
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
                subtitle={`${formatDay(w.startedAt)} · ${formatDuration(Date.parse(w.finishedAt) - Date.parse(w.startedAt))} · ${w.setCount} Sätze${w.kcal ? ` · ${Math.round(w.kcal)} kcal` : ""}`}
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
                chevron
                onPress={() => router.push({ pathname: '/cardio', params: { id: c.id } })}
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
          {isRunning(draft) ? formatDuration(durationMs(draft, now)) : 'Pausiert'} · Tippen zum Fortsetzen
        </AppText>
      </View>
      <SymbolView name="chevron.right" size={14} weight="bold" tintColor={Colors.onAccent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
    backgroundColor: Colors.accent,
  },
});
