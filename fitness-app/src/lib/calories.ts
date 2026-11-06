import { useApi } from '@/lib/api';
import { type BodyProfile, type BodyWeight } from '@/lib/types';

/**
 * Calorie estimates as ACTIVE energy (like Apple Health's "Aktive Energie"): what the training burns
 * on top of the resting metabolism. That is the number that may be added to the daily calorie goal
 * without counting the resting metabolism twice.
 *
 * Gross energy uses MET values from the Compendium of Physical Activities (1 MET ≈ 1 kcal per kg and
 * hour); the resting share is then subtracted. Resting energy comes from Mifflin-St Jeor when the
 * body height is known (age 30 and a male/female average until age and sex are in the profile),
 * else from the 1 kcal/kg/h convention.
 *
 * Cardio: MET by type and speed; running from distance (~1 kcal per kg and km) when one is given.
 *
 * Strength training, from the logged sets and the workout duration:
 *   - lifting: MET 6 (vigorous resistance training) during time under tension (~3.5 s per rep)
 *   - mechanical work: lifted mass × g × range of motion × reps at ~25 % muscular efficiency
 *     (lifted mass = weight + the share of body weight moved in that exercise)
 *   - between sets: MET 2 (elevated heart rate). The rest time is the workout duration minus the time
 *     under tension, but at most 4 min per set (longer breaks count as standing around, MET 1.3).
 *     Without a duration, 90 s per set is assumed.
 * A one-hour, 15-set session for an 80 kg person comes out around 150–200 active kcal.
 */

export type Body = { kg: number; heightCm?: number | null };

const DEFAULT_BODY_KG = 75;

/** Latest body weight (falls back to 75 kg) and the height from the profile. */
export function useBody(): Body {
  const weights = useApi<BodyWeight[]>('/weights?days=365').data;
  const profile = useApi<BodyProfile>('/body').data;
  const last = weights ? weights.at(-1) : undefined;
  return { kg: last ? last.kg : DEFAULT_BODY_KG, heightCm: profile ? profile.heightCm : null };
}

/** Resting energy in kcal per hour. */
export function restingKcalPerHour(body: Body) {
  if (body.heightCm && body.heightCm > 100) {
    // Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + s (s = +5 male, −161 female; average −78), age 30.
    return Math.max(30, (10 * body.kg + 6.25 * body.heightCm - 5 * 30 - 78) / 24);
  }
  return body.kg;
}

/** Active kcal of `hours` at a given (gross) MET. */
function activeKcal(met: number, hours: number, body: Body) {
  return Math.max(0, met * body.kg * hours - restingKcalPerHour(body) * hours);
}

export const CARDIO_TYPES = ['Laufen', 'Fahrrad', 'Stairmaster', 'Crosstrainer'] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

export function cardioKcal(type: string, minutes: number, km: number, body: Body) {
  const hours = minutes / 60;
  if (hours <= 0) return 0;
  const speed = km > 0 ? km / hours : 0;
  switch (type) {
    case 'Laufen': {
      if (km <= 0) return activeKcal(9.8, hours, body);
      return Math.max(0, body.kg * km - restingKcalPerHour(body) * hours);
    }
    case 'Fahrrad': {
      const met = speed === 0 ? 7 : speed < 16 ? 4 : speed < 19 ? 6.8 : speed < 22 ? 8 : speed < 25 ? 10 : 12;
      return activeKcal(met, hours, body);
    }
    case 'Stairmaster':
      return activeKcal(9, hours, body);
    case 'Crosstrainer':
      return activeKcal(5, hours, body);
    default:
      return activeKcal(6, hours, body);
  }
}

const G = 9.81;
const EFFICIENCY = 0.25;
const SECONDS_PER_REP = 3.5;
const DEFAULT_REST_SECONDS = 90;
const MAX_REST_SECONDS = 240;

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

type LoggedSet = { name: string; weight: number; reps: number };

/** Time under tension (s); planks etc. are logged as seconds in the reps field. */
function tensionSeconds(s: LoggedSet) {
  return /plank|sekunden/i.test(s.name) ? s.reps : s.reps * SECONDS_PER_REP;
}

/** Gross kcal of lifting one set (without the rest after it). */
function liftKcal(s: LoggedSet, body: Body) {
  if (s.reps <= 0) return 0;
  const seconds = tensionSeconds(s);
  if (/plank|sekunden/i.test(s.name)) return (4 * body.kg * seconds) / 3600;
  const p = profile(s.name);
  const mass = s.weight + p.body * body.kg;
  const work = (mass * G * p.rom * s.reps) / (4184 * EFFICIENCY);
  return (6 * body.kg * seconds) / 3600 + work;
}

/**
 * Active kcal of a strength workout. `durationMs` is the training time (live clock or entered
 * afterwards); without it a 90 s rest per set is assumed.
 */
export function strengthKcal(sets: LoggedSet[], body: Body, durationMs?: number) {
  const done = sets.filter((s) => s.reps > 0);
  if (done.length === 0) return 0;
  const tension = done.reduce((t, s) => t + tensionSeconds(s), 0);
  const total = durationMs && durationMs > 0 ? Math.max(durationMs / 1000, tension) : tension + done.length * DEFAULT_REST_SECONDS;
  const rest = total - tension;
  const activeRest = Math.min(rest, done.length * MAX_REST_SECONDS);
  const gross =
    done.reduce((k, s) => k + liftKcal(s, body), 0) +
    (2 * body.kg * activeRest) / 3600 +
    (1.3 * body.kg * (rest - activeRest)) / 3600;
  return Math.max(0, gross - (restingKcalPerHour(body) * total) / 3600);
}
