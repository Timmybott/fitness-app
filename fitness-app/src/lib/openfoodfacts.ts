import { type Food } from '@/lib/types';

const BASE = 'https://world.openfoodfacts.org';
const SEARCH_BASE = 'https://search.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_de,brands,nutriments,serving_quantity';
// OpenFoodFacts asks API clients to identify themselves.
const HEADERS = { 'User-Agent': 'FitnessApp/1.0 (iOS)' };

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  /** A comma-separated string from the product API, an array from the search API. */
  brands?: string | string[];
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

function num(value: unknown) {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function toFood(p: OffProduct): Food | null {
  const name = p.product_name_de || p.product_name;
  const n = p.nutriments;
  if (!name || !n) return null;

  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n['energy_100g']) kcal = num(n['energy_100g']) / 4.184; // kJ -> kcal

  return {
    name: name.trim(),
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(',')[0])?.trim() || null,
    barcode: p.code || null,
    kcal,
    protein: num(n['proteins_100g']),
    carbs: num(n['carbohydrates_100g']),
    fat: num(n['fat_100g']),
    servingGrams: num(p.serving_quantity) || null,
  };
}

export async function fetchProductByBarcode(barcode: string): Promise<Food | null> {
  const res = await fetch(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
    headers: HEADERS,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { status?: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) return null;
  return toFood({ ...json.product, code: json.product.code ?? barcode });
}

type Hit = OffProduct & { unique_scans_n?: number };

async function searchHits(q: string, signal?: AbortSignal): Promise<Hit[]> {
  const url = `${SEARCH_BASE}/search?page_size=50&langs=de&fields=${FIELDS},unique_scans_n&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: HEADERS, signal });
  if (!res.ok) return [];
  return ((await res.json()) as { hits?: Hit[] }).hits ?? [];
}

/** Lowercase, ß → ss, without spaces and punctuation, so "Kinder Riegel" matches "kinderriegel". */
const compact = (s: string) => s.toLowerCase().replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Drops entries whose values cannot be right: no nutrition data, more than 100 g of macros per 100 g,
 * or calories that don't fit the macros (4 kcal/g protein and carbs, 9 kcal/g fat; generous margin
 * for alcohol, fibre and sugar alcohols). Near-zero foods are only kept when the name says so.
 */
function plausible(f: Food, n: OffProduct['nutriments']) {
  if (!n || n['proteins_100g'] === undefined || n['carbohydrates_100g'] === undefined || n['fat_100g'] === undefined) return false;
  if (f.kcal > 900 || f.protein + f.carbs + f.fat > 101) return false;
  const fromMacros = 4 * f.protein + 4 * f.carbs + 9 * f.fat;
  if (fromMacros > 10 && Math.abs(fromMacros - f.kcal) > Math.max(25, f.kcal * 0.3) && f.kcal < fromMacros) return false;
  // More kcal than the macros explain is fine up to alcohol (7 kcal/g, e.g. beer, liqueur).
  if (f.kcal > fromMacros + Math.max(40, fromMacros * 0.6)) return false;
  if (f.kcal < 5 && !/zero|light|null|0\s?%|wasser|water|tee|tea|kaffee|coffee|espresso|diät|diet|essig|gewürz|süßstoff|sweet/i.test(f.name)) return false;
  return true;
}

// Letters a German product name would not contain (Spanish, French, Portuguese ... names).
const FOREIGN = /[ñáàâãéèêíìîóòôõúùûçøåœ]/i;

/**
 * OpenFoodFacts search, cleaned up: products sold in Germany first, implausible entries removed,
 * duplicates (same name and brand) merged. Products containing every search word come first, then
 * a mix of OFF's relevance order and how often a product was scanned (a proxy for popularity).
 */
export async function searchProducts(query: string, signal?: AbortSignal): Promise<Food[]> {
  let hits = await searchHits(`${query} countries_tags:"en:germany"`, signal);
  if (hits.length < 10) hits = [...hits, ...(await searchHits(query, signal))];

  const words = query.split(/\s+/).map(compact).filter(Boolean);
  const seen = new Set<string>();
  const ranked: { food: Food; score: number }[] = [];
  hits.forEach((p, index) => {
    const food = toFood(p);
    if (!food || !plausible(food, p.nutriments)) return;
    const key = compact(`${food.name}|${food.brand ?? ''}`);
    if (seen.has(key) || (food.barcode && seen.has(food.barcode))) return;
    seen.add(key);
    if (food.barcode) seen.add(food.barcode);

    const text = compact(`${food.name} ${food.brand ?? ''}`);
    const missing = words.filter((w) => !text.includes(w)).length;
    const scans = p.unique_scans_n ?? 0;
    const score =
      missing * 100 + // every search word should appear
      (FOREIGN.test(food.name) && !p.product_name_de ? 30 : 0) +
      index - // OFF relevance
      Math.log2(1 + scans) * 4; // popularity
    ranked.push({ food, score });
  });
  return ranked
    .sort((a, b) => a.score - b.score)
    .slice(0, 20)
    .map((r) => r.food);
}
