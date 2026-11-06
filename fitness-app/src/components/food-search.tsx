import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { List, Row } from '@/components/list';
import { Section } from '@/components/screen';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useApi } from '@/lib/api';
import { searchProducts } from '@/lib/openfoodfacts';
import { type Food } from '@/lib/types';

type Props = {
  onSelect: (f: Food) => void;
  /** Rendered between the search bar and the results (e.g. quick actions). Receives the current query. */
  children?: (query: string) => ReactNode;
  autoFocus?: boolean;
};

/** Search bar over the user's own foods plus a debounced OpenFoodFacts search. */
export function FoodSearch({ onSelect, children, autoFocus = true }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const q = query.trim();
  const recent = useApi<Food[]>(`/foods/recent?q=${encodeURIComponent(q)}`).data ?? [];
  // Checked generic foods (Swiss database); those already in the user's list are shown there only.
  const reference = (useApi<Food[]>(q.length >= 2 ? `/foods/reference?q=${encodeURIComponent(q)}` : null).data ?? []).filter(
    (f) => !recent.some((r) => r.barcode === f.barcode),
  );

  useEffect(() => {
    if (q.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchProducts(q, controller.signal)
        .then(setResults)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <SymbolView name="magnifyingglass" size={16} tintColor={Colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Lebensmittel suchen"
          placeholderTextColor={Colors.textTertiary}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={styles.searchInput}
        />
        {loading && <ActivityIndicator color={Colors.textSecondary} />}
      </View>

      {children?.(q)}

      {recent.length > 0 && <FoodList title={q ? 'Meine Lebensmittel' : 'Zuletzt verwendet'} foods={recent} onSelect={onSelect} />}
      {q.length >= 2 && reference.length > 0 && (
        <FoodList title="Empfohlen" footer="Geprüfte Werte · Quelle: Schweizer Nährwertdatenbank (BLV)" foods={reference} onSelect={onSelect} />
      )}
      {q.length >= 3 && results.length > 0 && <FoodList title="OpenFoodFacts" foods={results} onSelect={onSelect} />}
    </View>
  );
}

function FoodList({ title, footer, foods, onSelect }: { title: string; footer?: string; foods: Food[]; onSelect: (f: Food) => void }) {
  return (
    <Section title={title} footer={footer}>
      <List>
        {foods.map((f, i) => (
          <Row
            key={`${f.id ?? f.barcode ?? f.name}-${i}`}
            title={f.name}
            subtitle={[f.brand, `P ${Math.round(f.protein)} · K ${Math.round(f.carbs)} · F ${Math.round(f.fat)} pro 100 ${f.unit ?? 'g'}`].filter(Boolean).join(' · ')}
            value={`${Math.round(f.kcal)} kcal`}
            onPress={() => onSelect(f)}
          />
        ))}
      </List>
    </Section>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.four },
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
