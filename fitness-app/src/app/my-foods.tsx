import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/card';
import { Chip } from '@/components/chip';
import { EmptyState, List, Row } from '@/components/list';
import { Screen, Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useApi } from '@/lib/api';
import { FAVORITE_COLOR, foodActions } from '@/lib/food-actions';
import { type Food, type Recipe } from '@/lib/types';

/** The user's own foods (edit, favourite, delete) and recipes. */
export default function MyFoodsScreen() {
  const [tab, setTab] = useState<'foods' | 'recipes'>('foods');
  const [query, setQuery] = useState('');
  const q = query.trim();
  const foods = useApi<Food[]>(`/foods/recent?all=1&q=${encodeURIComponent(q)}`).data ?? [];
  const recipes = (useApi<Recipe[]>('/recipes').data ?? []).filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Lebensmittel & Rezepte' }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>Fertig</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="plus" onPress={() => router.push(tab === 'recipes' ? '/recipe' : '/food-edit')} />
      </Stack.Toolbar>

      <View style={styles.chips}>
        <Chip label="Lebensmittel" active={tab === 'foods'} onPress={() => setTab('foods')} />
        <Chip label="Rezepte" active={tab === 'recipes'} onPress={() => setTab('recipes')} />
      </View>

      <View style={styles.searchBar}>
        <SymbolView name="magnifyingglass" size={16} tintColor={Colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Suchen"
          placeholderTextColor={Colors.textTertiary}
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={styles.searchInput}
        />
      </View>

      {tab === 'foods' ? (
        foods.length > 0 ? (
          <Section footer="Tippen zum Bearbeiten, lange drücken für Favorit oder Löschen. Favoriten stehen in der Suche ganz oben.">
            <List>
              {foods.map((f) => (
                <Row
                  key={f.id}
                  title={f.name}
                  subtitle={[f.brand, `${Math.round(f.kcal)} kcal · P ${Math.round(f.protein)} · K ${Math.round(f.carbs)} · F ${Math.round(f.fat)} pro 100 g`].filter(Boolean).join(' · ')}
                  icon={f.favorite ? 'star.fill' : 'fork.knife'}
                  iconColor={f.favorite ? FAVORITE_COLOR : Colors.cardElevated}
                  chevron
                  onPress={() => router.push({ pathname: '/food-edit', params: { id: f.id } })}
                  onLongPress={() => foodActions(f)}
                />
              ))}
            </List>
          </Section>
        ) : (
          <Card>
            <EmptyState icon="fork.knife" title="Noch keine eigenen Lebensmittel" text="Alles, was du einträgst, landet hier. Mit + legst du ein Lebensmittel direkt an." />
          </Card>
        )
      ) : recipes.length > 0 ? (
        <Section footer="Tippen zum Bearbeiten.">
          <List>
            {recipes.map((r) => (
              <Row
                key={r.id}
                title={r.name}
                subtitle={`${r.items.length} Zutaten · ${r.servings} ${r.servings === 1 ? 'Portion' : 'Portionen'}`}
                icon="book.closed.fill"
                chevron
                onPress={() => router.push({ pathname: '/recipe', params: { id: r.id } })}
              />
            ))}
          </List>
        </Section>
      ) : (
        <Card>
          <EmptyState icon="book.closed" title="Noch keine Rezepte" text="Leg mit + ein Rezept an oder lass eins per Foto erkennen." />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.two },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.card,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    height: 44,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 17 },
});
