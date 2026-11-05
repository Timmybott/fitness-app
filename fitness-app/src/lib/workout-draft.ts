import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { api, invalidate } from '@/lib/api';
import { strengthKcal } from '@/lib/calories';
import { logWorkoutToHealth } from '@/lib/health';
import { parseNum, type LastSets, type Template } from '@/lib/types';

/**
 * The running workout lives on the device (persisted, so it survives closing the app)
 * and is uploaded to the server in one piece when finished.
 */
export type DraftSet = { weight: string; reps: string; done: boolean };
export type DraftExercise = {
  exerciseId: number;
  name: string;
  sets: DraftSet[];
  /** Sets from the last time this exercise was done, shown as hints. */
  last: { weight: number; reps: number }[];
};
export type Draft = {
  name: string;
  templateId: number | null;
  startedAt: string;
  exercises: DraftExercise[];
  restSeconds: number;
  restEndsAt: number | null;
  /** Stopwatch: time counted while paused/resumed; runningSince is set while the clock runs. */
  elapsedMs?: number;
  runningSince?: number | null;
};

/** Training time so far. Drafts saved before the pausable clock existed count from their start. */
export function durationMs(d: Draft, now = Date.now()) {
  if (d.elapsedMs === undefined) return now - Date.parse(d.startedAt);
  return d.elapsedMs + (d.runningSince ? now - d.runningSince : 0);
}

export function isRunning(d: Draft) {
  return d.elapsedMs === undefined || d.runningSince != null;
}

export function toggleTimer() {
  updateDraft((d) => {
    const now = Date.now();
    if (isRunning(d)) return { ...d, elapsedMs: durationMs(d, now), runningSince: null };
    return { ...d, elapsedMs: d.elapsedMs ?? 0, runningSince: now };
  });
}

const KEY = 'workout-draft';
const listeners = new Set<() => void>();
let draft: Draft | null = load();

function load(): Draft | null {
  try {
    const raw = Storage.getItemSync(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function set(next: Draft | null) {
  draft = next;
  if (next) Storage.setItemSync(KEY, JSON.stringify(next));
  else Storage.removeItemSync(KEY);
  listeners.forEach((l) => l());
}

export function useDraft() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => draft,
  );
}

export function updateDraft(fn: (d: Draft) => Draft) {
  if (draft) set(fn(draft));
}

export function discardDraft() {
  set(null);
}

async function fetchLast(ids: number[]): Promise<LastSets> {
  if (ids.length === 0) return {};
  return api.get<LastSets>(`/exercises/last?ids=${ids.join(',')}`).catch(() => ({}));
}

export async function startWorkout(template: Template | null) {
  const exercises = template?.exercises ?? [];
  const last = await fetchLast(exercises.map((e) => e.exerciseId));
  set({
    name: template?.name ?? 'Freies Training',
    templateId: template?.id ?? null,
    startedAt: new Date().toISOString(),
    restSeconds: 90,
    restEndsAt: null,
    // The clock starts paused; it is started (and paused) from the workout screen.
    elapsedMs: 0,
    runningSince: null,
    exercises: exercises.map((e) => ({
      exerciseId: e.exerciseId,
      name: e.name,
      last: last[e.exerciseId] ?? [],
      // Planned kg/reps from the template are filled in; without them, last time's values show as hints.
      sets:
        e.targets && e.targets.length > 0
          ? e.targets.map((t) => ({ weight: t.weight ? String(t.weight).replace('.', ',') : '', reps: t.reps ? String(t.reps) : '', done: false }))
          : Array.from({ length: e.sets }, () => ({ weight: '', reps: '', done: false })),
    })),
  });
}

export async function addExerciseToDraft(exercise: { id: number; name: string }) {
  const last = (await fetchLast([exercise.id]))[exercise.id] ?? [];
  updateDraft((d) => ({
    ...d,
    exercises: [
      ...d.exercises,
      {
        exerciseId: exercise.id,
        name: exercise.name,
        last,
        sets: Array.from({ length: Math.max(3, last.length) }, () => ({ weight: '', reps: '', done: false })),
      },
    ],
  }));
}

/** Value used for a set: what the user typed, else last time's value for that set. */
export function effectiveSet(e: DraftExercise, i: number) {
  const s = e.sets[i];
  const hint = e.last[i] ?? e.last[e.last.length - 1];
  return {
    weight: s.weight !== '' ? parseNum(s.weight) : (hint?.weight ?? 0),
    reps: s.reps !== '' ? Math.round(parseNum(s.reps)) : (hint?.reps ?? 0),
  };
}

export function completedSets(d: Draft) {
  return d.exercises.flatMap((e, position) =>
    e.sets
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.done)
      .map(({ i }, setIndex) => ({ exerciseId: e.exerciseId, position, setIndex, ...effectiveSet(e, i) })),
  );
}

/** Estimated calories of the completed sets (see lib/calories). */
export function draftKcal(d: Draft, bodyKg: number) {
  const sets = d.exercises.flatMap((e) => e.sets.map((s, i) => ({ s, i, e })).filter(({ s }) => s.done).map(({ e, i }) => ({ name: e.name, ...effectiveSet(e, i) })));
  return strengthKcal(sets, bodyKg);
}

export async function finishWorkout(bodyKg: number) {
  if (!draft) return;
  const finishedAt = new Date();
  // The workout spans the time the clock actually ran (at least a minute).
  const startedAt = new Date(finishedAt.getTime() - Math.max(60000, durationMs(draft, finishedAt.getTime())));
  const kcal = Math.round(draftKcal(draft, bodyKg));
  const { id } = await api.post<{ id: number }>('/workouts', {
    name: draft.name,
    templateId: draft.templateId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    kcal,
    sets: completedSets(draft),
  });
  logWorkoutToHealth({ syncId: `workout-${id}`, type: 'Krafttraining', start: startedAt, end: finishedAt, kcal });
  set(null);
  invalidate();
}
