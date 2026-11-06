import { type SFSymbol } from 'sf-symbols-typescript';

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEALS: { key: Meal; label: string; icon: SFSymbol }[] = [
  { key: 'breakfast', label: 'Frühstück', icon: 'sunrise.fill' },
  { key: 'lunch', label: 'Mittagessen', icon: 'sun.max.fill' },
  { key: 'dinner', label: 'Abendessen', icon: 'moon.stars.fill' },
  { key: 'snack', label: 'Snacks', icon: 'carrot.fill' },
];

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/** Nutrition values per 100 g. */
export type Food = Macros & {
  id?: number;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  servingGrams?: number | null;
};

/** A logged food. Values are for the logged amount, not per 100 g. */
export type Entry = Macros & { id: number; date: string; meal: Meal; name: string; grams: number };

export type Goals = Macros & { waterMl: number; addBurned: boolean };

export type DailyStats = Macros & {
  date: string;
  entryCount: number;
  waterMl: number;
  steps: number | null;
  activeKcal: number | null;
  distanceKm: number | null;
  flights: number | null;
};

export type WaterDay = { totalMl: number; entries: { id: number; ml: number; name: string | null }[] };

export type User = { id: number; email: string; name: string };

export type Exercise = { id: number; name: string; muscle: string; custom: boolean };

export type SetTarget = { weight: number; reps: number };

/** `targets` holds planned kg/reps per set; templates saved before that only have sets × reps. */
export type TemplateExercise = { exerciseId: number; name: string; muscle: string; sets: number; reps: number; targets?: SetTarget[] };

export type Template = { id: number; name: string; exercises: TemplateExercise[] };

export type WorkoutSummary = {
  id: number;
  name: string;
  startedAt: string;
  finishedAt: string;
  setCount: number;
  volume: number;
  kcal: number | null;
};

export type WorkoutDetail = Omit<WorkoutSummary, 'setCount' | 'volume'> & {
  sets: { exerciseId: number; name: string; position: number; setIndex: number; weight: number; reps: number }[];
};

export type LastSets = Record<number, { weight: number; reps: number }[]>;

export type Cardio = { id: number; date: string; type: string; minutes: number; distanceKm: number | null; kcal: number | null };

export type BodyWeight = { date: string; kg: number };

export type DailyNutrition = Macros & { date: string };

export function scaleMacros(per100: Macros, grams: number): Macros {
  const f = grams / 100;
  return { kcal: per100.kcal * f, protein: per100.protein * f, carbs: per100.carbs * f, fat: per100.fat * f };
}

export function sumMacros(items: Macros[]): Macros {
  return items.reduce(
    (acc, m) => ({ kcal: acc.kcal + m.kcal, protein: acc.protein + m.protein, carbs: acc.carbs + m.carbs, fat: acc.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Parses user input like "82,5" into a number (0 when empty/invalid). */
export function parseNum(s: string | undefined) {
  return parseFloat((s ?? '').replace(',', '.')) || 0;
}

/** An ingredient or AI-recognised item; macro values are for `grams`, not per 100 g. */
export type PortionItem = Macros & { name: string; grams: number };

export type Recipe = { id: number; name: string; servings: number; items: PortionItem[] };

/** Per-100 g food for a portion (used to log AI items and recipes through the normal entry flow). */
export function portionToFood(item: PortionItem, servingGrams?: number): Food {
  const f = item.grams > 0 ? 100 / item.grams : 0;
  return {
    name: item.name,
    kcal: item.kcal * f,
    protein: item.protein * f,
    carbs: item.carbs * f,
    fat: item.fat * f,
    servingGrams: servingGrams ?? item.grams,
  };
}

export function recipeToFood(r: Recipe): Food {
  const total = { name: r.name, grams: r.items.reduce((g, i) => g + i.grams, 0), ...sumMacros(r.items) };
  return portionToFood(total, Math.round(total.grams / r.servings));
}

/** Today's activity as last imported from Apple Health by the sync shortcut. */
export type HealthToday = {
  steps: number | null;
  activeKcal: number | null;
  exerciseMin: number | null;
  distanceKm: number | null;
  flights: number | null;
  updatedAt: string;
};
