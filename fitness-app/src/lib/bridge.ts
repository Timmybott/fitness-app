import { type PickedPhoto } from '@/lib/photo';
import { type Exercise, type Food, type PortionItem } from '@/lib/types';

/**
 * Hand-over between screens for things that don't fit in route params (photos) or that a picker
 * screen returns to the screen that opened it. Pickers are their own routes because React Native
 * <Modal>s inside a modal screen crashed the app.
 */
let pendingPhoto: PickedPhoto | null = null;
let onExercise: ((e: Exercise) => void) | null = null;
let onIngredient: ((item: PortionItem) => void) | null = null;
let recipeDraft: { name: string; servings: number; items: PortionItem[] } | null = null;

export const bridge = {
  setPhoto(p: PickedPhoto) {
    pendingPhoto = p;
  },
  takePhoto() {
    const p = pendingPhoto;
    pendingPhoto = null;
    return p;
  },

  onExercisePicked(fn: (e: Exercise) => void) {
    onExercise = fn;
  },
  pickExercise(e: Exercise) {
    onExercise?.(e);
  },

  onIngredientPicked(fn: (item: PortionItem) => void) {
    onIngredient = fn;
  },
  pickIngredient(item: PortionItem) {
    onIngredient?.(item);
  },

  setRecipeDraft(d: typeof recipeDraft) {
    recipeDraft = d;
  },
  takeRecipeDraft() {
    const d = recipeDraft;
    recipeDraft = null;
    return d;
  },
};

/** Plain water (scanned, photographed or typed) goes to the water tracker instead of the food diary. */
export function isPlainWater(food: Pick<Food, 'name' | 'kcal'>) {
  return food.kcal <= 1 && /wasser|water|mineral|sprudel|selters/i.test(food.name);
}
