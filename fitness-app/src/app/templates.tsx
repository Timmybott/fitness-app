import { router, Stack } from 'expo-router';

import { Card } from '@/components/card';
import { EmptyState, ErrorNotice, List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { TemplateCard } from '@/components/template-card';
import { useApi } from '@/lib/api';
import { beginWorkout } from '@/lib/start-workout';
import { type Template } from '@/lib/types';

/** Sheet with all templates: tap to start, ⋯ to edit. */
export default function TemplatesSheet() {
  const templates = useApi<Template[]>('/templates');

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Vorlage auswählen' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="plus" onPress={() => router.push('/template')} />
      </Stack.Toolbar>

      {templates.error && <ErrorNotice message={templates.error} onRetry={templates.reload} />}
      {templates.data?.length === 0 && (
        <Card>
          <EmptyState icon="list.bullet.clipboard" title="Noch keine Vorlage" text="Leg mit + deine erste Vorlage an, z. B. Push, Pull oder Legs." />
        </Card>
      )}

      {(templates.data?.length ?? 0) > 0 && (
        <Section footer="Tippen startet das Training, ⋯ bearbeitet die Vorlage.">
          {templates.data!.map((t) => (
            <TemplateCard key={t.id} template={t} onStart={() => beginWorkout(t, true)} />
          ))}
        </Section>
      )}

      <List>
        <Row title="Freies Training starten" icon="play.fill" onPress={() => beginWorkout(null, true)} />
      </List>
    </Screen>
  );
}
