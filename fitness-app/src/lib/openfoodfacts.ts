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

export async function searchProducts(query: string, signal?: AbortSignal): Promise<Food[]> {
  const url = `${SEARCH_BASE}/search?page_size=25&langs=de&fields=${FIELDS}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: HEADERS, signal });
  if (!res.ok) return [];
  const json = (await res.json()) as { hits?: OffProduct[] };
  return (json.hits ?? []).map(toFood).filter((f): f is Food => f != null && f.kcal > 0);
}
