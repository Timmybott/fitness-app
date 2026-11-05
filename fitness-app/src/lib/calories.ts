import { useApi } from '@/lib/api';
import { type BodyWeight } from '@/lib/types';

/**
 * Calorie estimates (gross kcal, like fitness trackers show for workouts).
 *
 * Cardio uses MET values from the Compendium of Physical Activities: kcal = MET × body kg × hours.
 * Running uses the well-established ~1 kcal per kg per km when a distance is given.
 *
 * Strength training per completed set:
 *   - active part: MET 6 (vigorous resistance training) × kg × time under tension (≈ 4 s per rep)
 *   - mechanical work: lifted mass × g × range of motion × reps, at ~25 % muscular efficiency
 *     (lifted mass = weight + the share of body weight moved in that exercise)
 *   - rest between sets: MET 2 × kg × ~90 s
 * A typical 15-set session for an 80 kg person lands around 150–250 kcal, in line with measured values.
 */

const DEFAULT_BODY_KG = 75;

/** Latest body weight from the app (falls back to 75 kg). */
export function useBodyWeight() {
  const weights = useApi<BodyWeight[]>('/weights?days=365').data;
  return weights?.at(-1)?.kg ?? DEFAULT_BODY_KG;
}

export const CARDIO_TYPES = ['Laufen', 'Fahrrad', 'Stairmaster', 'Crosstrainer'] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

export function cardioKcal(type: string, minutes: number, km: number, bodyKg: number) {
  const hours = minutes / 60;
  if (hours <= 0) return 0;
  const speed = km > 0 ? km / hours : 0;
  switch (type) {
    case 'Laufen':
      return km > 0 ? bodyKg * km * 1.0 : 9.8 * bodyKg * hours;
    case 'Fahrrad': {
      const met = speed === 0 ? 7 : speed < 16 ? 4 : speed < 19 ? 6.8 : speed < 22 ? 8 : speed < 25 ? 10 : 12;
      return met * bodyKg * hours;
    }
    case 'Stairmaster':
      return 9 * bodyKg * hours;
    case 'Crosstrainer':
      return 5 * bodyKg * hours;
    default:
      return 6 * bodyKg * hours;
  }
}

const G = 9.81;
const EFFICIENCY = 0.25;
const SECONDS_PER_REP = 4;
const REST_SECONDS = 90;

/** Range of motion (m) and share of body weight moved, by exercise name. */
const EXERCISE_PROFILES: [RegExp, { rom: number; body: number }][] = [
  [/klimmz|pull.?up|chin/i, { rom: 0.5, body: 1 }],
  [/dip/i, { rom: 0.4, body: 1 }],
  [/liegest|push.?up/i, { rom: 0.35, body: 0.65 }],
  [/kniebeuge|squat/i, { rom: 0.6, body: 0.8 }],
  [/ausfallschritt|lunge/i, { rom: 0.45, body: 0.8 }],
  [/kreuzheben|deadlift/i, { rom: 0.55, body: 0.4 }],
  [/beinpresse|leg press/i, { rom: 0.5, body: 0 }],
  [/hip thrust|glute/i, { rom: 0.3, body: 0.3 }],
  [/wadenheben|calf/i, { rom: 0.1, body: 0.9 }],
  [/crunch|sit.?up/i, { rom: 0.25, body: 0.3 }],
  [/beinheben|leg raise/i, { rom: 0.5, body: 0.35 }],
  [/bankdr|bench|brust|butterfly|fly/i, { rom: 0.4, body: 0 }],
  [/schulter|overhead|press|seitheben/i, { rom: 0.5, body: 0 }],
  [/rudern|row|latzug|pulldown|face pull/i, { rom: 0.45, body: 0 }],
  [/curl|trizeps|french/i, { rom: 0.35, body: 0 }],
  [/beinstrecker|beinbeuger|extension/i, { rom: 0.4, body: 0 }],
];

function profile(exerciseName: string) {
  return EXERCISE_PROFILES.find(([re]) => re.test(exerciseName))?.[1] ?? { rom: 0.4, body: 0 };
}

export function strengthSetKcal(exerciseName: string, weightKg: number, reps: number, bodyKg: number) {
  if (reps <= 0) return 0;
  // Planks etc. are logged as seconds in the reps field.
  if (/plank|sekunden/i.test(exerciseName)) return (4 * bodyKg * reps) / 3600 + (2 * bodyKg * REST_SECONDS) / 3600;
  const p = profile(exerciseName);
  const active = (6 * bodyKg * (reps * SECONDS_PER_REP)) / 3600;
  const mass = weightKg + p.body * bodyKg;
  const work = (mass * G * p.rom * reps) / (4184 * EFFICIENCY);
  const rest = (2 * bodyKg * REST_SECONDS) / 3600;
  return active + work + rest;
}

export function strengthKcal(sets: { name: string; weight: number; reps: number }[], bodyKg: number) {
  return sets.reduce((sum, s) => sum + strengthSetKcal(s.name, s.weight, s.reps, bodyKg), 0);
}
