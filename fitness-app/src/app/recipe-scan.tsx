import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { type SFSymbol } from 'sf-symbols-typescript';

import { AppText } from '@/components/app-text';
import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState, PrimaryButton } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { bridge } from '@/lib/bridge';
import { pickPhoto, type PickedPhoto } from '@/lib/photo';
import { type PortionItem } from '@/lib/types';

type Question = { id: string; question: string; options: string[] };
type RecipeResult = { name: string; servings: number; questions: Question[]; ingredients: PortionItem[]; note: string | null };

/** Reads a recipe from a photo; asks back about alternatives (e.g. rice or pasta, 2 or 4 people). */
export default function RecipeScanScreen() {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [result, setResult] = useState<RecipeResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const read = async (picked: PickedPhoto, withAnswers?: Record<string, string>) => {
    setBusy(true);
    try {
      const r = await api.post<RecipeResult>('/ai/recipe-photo', { image: picked.base64, mimeType: 'image/jpeg', answers: withAnswers });
      if (r.questions.length === 0 && r.ingredients.length > 0) {
        // Final recipe: review and save it in the recipe editor.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        bridge.setRecipeDraft({ name: r.name, servings: r.servings, items: r.ingredients });
        router.replace('/recipe');
        return;
      }
      setResult(r);
      setAnswers({});
    } catch (e) {
      Alert.alert('Rezept konnte nicht gelesen werden', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = async (source: 'camera' | 'library') => {
    try {
      // Larger than food photos so small recipe text stays readable for the AI.
      const picked = await pickPhoto(source, 1600);
      if (!picked) return;
      setPhoto(picked);
      setResult(null);
      read(picked);
    } catch (e) {
      Alert.alert('Foto', (e as Error).message);
    }
  };

  const allAnswered = result != null && result.questions.every((q) => answers[q.id]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Rezept per Foto' }} />

      {!photo && (
        <>
          <View style={styles.choices}>
            <Choice icon="camera.fill" label="Foto aufnehmen" onPress={() => choose('camera')} />
            <Choice icon="photo.on.rectangle" label="Aus Mediathek" onPress={() => choose('library')} />
          </View>
          <AppText type="caption" color={Colors.textSecondary} style={styles.hint}>
            Fotografiere das Rezept mit Zutatenliste, z. B. aus einem Kochbuch oder als Screenshot. Die KI liest Zutaten und Mengen aus
            und schätzt die Nährwerte.
          </AppText>
        </>
      )}

      {photo && <Image source={{ uri: photo.uri }} style={styles.image} contentFit="cover" />}

      {busy && (
        <View style={styles.busy}>
          <ActivityIndicator color={Colors.accent} />
          <AppText color={Colors.textSecondary}>Lese das Rezept…</AppText>
        </View>
      )}

      {!busy && result && result.questions.length > 0 && (
        <>
          <AppText type="title">{result.name || 'Rezept'}</AppText>
          {result.questions.map((q) => (
            <Section key={q.id} title={q.question}>
              <View style={styles.chips}>
                {q.options.map((o) => (
                  <Chip key={o} label={o} active={answers[q.id] === o} onPress={() => setAnswers((a) => ({ ...a, [q.id]: o }))} />
                ))}
              </View>
            </Section>
          ))}
          <PrimaryButton
            title="Weiter"
            disabled={!allAnswered}
            onPress={() =>
              photo &&
              read(photo, Object.fromEntries(result.questions.map((q) => [q.question, answers[q.id]])))
            }
          />
        </>
      )}

      {!busy && result && result.questions.length === 0 && result.ingredients.length === 0 && (
        <Card>
          <EmptyState icon="doc.text.magnifyingglass" title="Kein Rezept erkannt" text={result.note ?? 'Versuch es mit einem schärferen Foto.'} />
        </Card>
      )}

      {photo && !busy && <PrimaryButton title="Anderes Foto" onPress={() => setPhoto(null)} />}
    </Screen>
  );
}

function Choice({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, pressed && styles.dim]}>
      <SymbolView name={icon} size={30} tintColor={Colors.accent} />
      <AppText type="headline">{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.5 },
  choices: { flexDirection: 'row', gap: Spacing.three },
  choice: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    backgroundColor: Colors.card,
    borderRadius: Radius.large,
    borderCurve: 'continuous',
  },
  hint: { marginHorizontal: Spacing.three, textAlign: 'center' },
  image: { width: '100%', aspectRatio: 3 / 4, borderRadius: Radius.large },
  busy: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
