import Constants, { ExecutionEnvironment } from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type * as HealthKit from '@kingstinct/react-native-healthkit';

import { type Entry } from '@/lib/types';

/**
 * Apple Health sync. HealthKit only exists in a real app build: the library creates its native
 * modules on import, so it is required lazily and never loaded in Expo Go (where it would crash).
 *
 * Written samples carry a sync identifier so they can be found and deleted again when the
 * entry is deleted in the app.
 */
let hk: typeof HealthKit | null | undefined;

function lib() {
  if (hk !== undefined) return hk;
  hk = null;
  if (Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
    try {
      // Lazy on purpose: a static import would crash Expo Go at startup.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      hk = require('@kingstinct/react-native-healthkit');
    } catch {
      hk = null;
    }
  }
  return hk;
}

const NUTRITION = [
  ['HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal', 'kcal'],
  ['HKQuantityTypeIdentifierDietaryProtein', 'g', 'protein'],
  ['HKQuantityTypeIdentifierDietaryCarbohydrates', 'g', 'carbs'],
  ['HKQuantityTypeIdentifierDietaryFatTotal', 'g', 'fat'],
] as const;

const PERMISSIONS = {
  toShare: [...NUTRITION.map(([id]) => id), 'HKQuantityTypeIdentifierBodyMass', 'HKWorkoutTypeIdentifier'],
  toRead: ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKQuantityTypeIdentifierBodyMass'],
} as const;

// HealthKit workout activity types (HKWorkoutActivityType raw values).
const ACTIVITY: Record<string, number> = {
  Krafttraining: 50,
  Laufen: 37,
  Radfahren: 13,
  Gehen: 52,
  Schwimmen: 46,
  Rudern: 35,
  Crosstrainer: 16,
  Seilspringen: 64,
};
const OTHER_ACTIVITY = 3000;

// Enabled flag (per device) with a tiny subscription so the UI updates when it changes.
const ENABLED_KEY = 'health-enabled';
const listeners = new Set<() => void>();
let enabled = Storage.getItemSync(ENABLED_KEY) === '1';

function setEnabled(v: boolean) {
  enabled = v;
  Storage.setItemSync(ENABLED_KEY, v ? '1' : '0');
  listeners.forEach((l) => l());
}

export function healthAvailable() {
  try {
    return lib()?.isHealthDataAvailable() ?? false;
  } catch {
    return false;
  }
}

/** The library only works once authorization was requested in this app session. */
function active() {
  return enabled && healthAvailable() ? lib() : null;
}

export function useHealthEnabled() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => enabled && healthAvailable(),
  );
}

export async function enableHealth() {
  const h = lib();
  if (!h) throw new Error('Apple Health ist nur in der installierten App verfügbar, nicht in Expo Go.');
  await h.requestAuthorization(PERMISSIONS);
  setEnabled(true);
}

export function disableHealth() {
  setEnabled(false);
}

// Re-request on start: HealthKit queries crash if authorization wasn't requested in this session.
// iOS only shows the permission sheet once; later calls return immediately.
let authorized: Promise<unknown> | null = null;
function ready() {
  const h = active();
  if (!h) return null;
  authorized ??= h.requestAuthorization(PERMISSIONS).catch(() => {});
  return authorized.then(() => h);
}

/** Runs a Health write in the background; Health problems must never break the app flow. */
function background(task: (h: typeof HealthKit) => Promise<unknown>) {
  const r = ready();
  if (!r) return;
  r.then(task).catch((e) => console.warn('Apple Health:', e));
}

/** Logged-food time: now for today, otherwise midday of that day. */
function entryDate(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const now = new Date();
  const sameDay = now.getFullYear() === y && now.getMonth() === m - 1 && now.getDate() === d;
  return sameDay ? now : new Date(y, m - 1, d, 12);
}

const syncMeta = (id: string) => ({ HKMetadataKeySyncIdentifier: id, HKMetadataKeySyncVersion: 1 });

export function logEntryToHealth(entry: Entry) {
  background(async (h) => {
    const at = entryDate(entry.date);
    for (const [id, unit, key] of NUTRITION) {
      if (entry[key] <= 0) continue;
      await h.saveQuantitySample(id, unit, entry[key], at, at, { ...syncMeta(`entry-${entry.id}`), HKFoodType: entry.name });
    }
  });
}

function deleteBySyncId(h: typeof HealthKit, types: readonly HealthKit.SampleTypeIdentifierWriteable[], syncId: string) {
  const filter = { metadata: { withMetadataKey: 'HKMetadataKeySyncIdentifier', value: syncId } };
  return Promise.all(types.map((t) => h.deleteObjects(t, filter)));
}

export function deleteEntryFromHealth(entryId: number) {
  background((h) => deleteBySyncId(h, NUTRITION.map(([id]) => id), `entry-${entryId}`));
}

export function logWeightToHealth(dateKey: string, kg: number) {
  background((h) => {
    const at = entryDate(dateKey);
    return h.saveQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg', kg, at, at, syncMeta(`weight-${dateKey}`));
  });
}

export function logWorkoutToHealth(w: { syncId: string; type: string; start: Date; end: Date; distanceKm?: number | null; kcal?: number | null }) {
  background((h) =>
    h.saveWorkoutSample(
      (ACTIVITY[w.type] ?? OTHER_ACTIVITY) as HealthKit.WorkoutActivityType,
      [],
      w.start,
      w.end,
      { distance: w.distanceKm ? w.distanceKm * 1000 : undefined, energyBurned: w.kcal ?? undefined },
      syncMeta(w.syncId),
    ),
  );
}

export function deleteWorkoutFromHealth(syncId: string) {
  background((h) => deleteBySyncId(h, ['HKWorkoutTypeIdentifier'], syncId));
}

export type Activity = { steps: number | null; activeKcal: number | null };

/** Today's steps and active calories from Health (Apple Watch / iPhone), refreshed every minute. */
export function useTodayActivity(): Activity | null {
  const on = useHealthEnabled();
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    const load = async () => {
      const h = await ready();
      if (!h) return;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const filter = { date: { startDate: start, endDate: new Date() } };
      const [steps, energy] = await Promise.all([
        h.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], { filter, unit: 'count' }),
        h.queryStatisticsForQuantity('HKQuantityTypeIdentifierActiveEnergyBurned', ['cumulativeSum'], { filter, unit: 'kcal' }),
      ]);
      if (alive) setActivity({ steps: steps.sumQuantity?.quantity ?? 0, activeKcal: energy.sumQuantity?.quantity ?? 0 });
    };
    load().catch((e) => console.warn('Apple Health:', e));
    const t = setInterval(() => load().catch(() => {}), 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [on]);

  return on ? activity : null;
}

/** Most recent body weight in Health (e.g. from a smart scale), if any. */
export async function latestHealthWeight(): Promise<{ date: Date; kg: number } | null> {
  const h = await ready();
  if (!h) return null;
  const s = await h.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg');
  return s ? { date: new Date(s.startDate), kg: s.quantity } : null;
}
