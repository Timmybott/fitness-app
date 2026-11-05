import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSession, requireAuth } from '../auth.js';
import { query, transaction } from '../db.js';

const TZ = 'Europe/Berlin';
const EXPORT_DAYS = 7;
const SHORTCUT_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'static', 'fitness-sync.shortcut');

/** Today in the user's time zone (the container runs on UTC). */
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());

/** ISO timestamp for 23:59 local time on a day, e.g. 2026-11-04T23:59:00+01:00 (Shortcuts parses ISO reliably). */
function endOfDayIso(date) {
  const noon = new Date(`${date}T12:00:00Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(noon)
    .find((p) => p.type === 'timeZoneName')
    .value.replace('GMT', '');
  return `${date}T23:59:00${offset || '+00:00'}`;
}

/**
 * Shortcuts sends numbers in whatever shape the action produced: 8432, "8432", "8.432", "82,4" or "82,4 kg".
 * Returns null for missing/empty values.
 */
export function lenientNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** "Find Health Samples" grouped by day arrives as one value per line, e.g. "5185\n0": sum them. */
function lenientSum(v) {
  if (typeof v !== 'string') return lenientNumber(v);
  const nums = v.split(/\r?\n/).map(lenientNumber).filter((n) => n != null);
  return nums.length ? nums.reduce((a, n) => a + n, 0) : null;
}

/** For averages like weight: the first non-zero line. */
function lenientFirst(v) {
  if (typeof v !== 'string') return lenientNumber(v);
  return v.split(/\r?\n/).map(lenientNumber).find((n) => n != null && n !== 0) ?? null;
}

const lenient = { type: ['number', 'string', 'null'] };
const round1 = (n) => Math.round(n * 10) / 10;

// Sample keys the shortcut maps to its "Log Health Sample" actions.
const NUTRITION_KEYS = ['kcal', 'protein', 'carbs', 'fat'];

// Shortcuts' (English) workout type names for "Log Workout".
const WORKOUT_TYPES = {
  Krafttraining: 'Traditional Strength Training',
  Laufen: 'Running',
  Radfahren: 'Cycling',
  Gehen: 'Walking',
  Schwimmen: 'Swimming',
  Rudern: 'Rowing',
  Crosstrainer: 'Elliptical',
  Seilspringen: 'Jump Rope',
};

export default async function healthRoutes(app) {
  // The signed shortcut is the same for everyone (no secrets inside), so it is public.
  app.get('/shortcut/fitness-sync.shortcut', async (req, reply) => {
    if (!existsSync(SHORTCUT_FILE)) return reply.code(404).send({ error: 'Kurzbefehl noch nicht verfügbar' });
    return reply
      .header('content-type', 'application/x-apple-shortcut')
      .header('content-disposition', 'attachment; filename="Fitness Sync.shortcut"')
      .send(readFileSync(SHORTCUT_FILE));
  });

  app.register(async (authed) => {
    authed.addHook('preHandler', requireAuth);

    // New token for the shortcut; replaces the previous one.
    authed.post('/me/shortcut-token', async (req) => {
      await query("DELETE FROM sessions WHERE user_id = $1 AND kind = 'shortcut'", [req.userId]);
      return { token: await createSession(req.userId, 'shortcut') };
    });

    /** Hourly import from Apple Health: today's activity and the latest weight. */
    authed.post(
      '/health/sync',
      {
        config: { allowShortcut: true },
        schema: {
          body: {
            type: 'object',
            properties: { steps: lenient, activeKcal: lenient, exerciseMin: lenient, distanceKm: lenient, flights: lenient, weightKg: lenient },
          },
        },
      },
      async (req) => {
        const date = today();
        const b = req.body ?? {};
        const v = {
          steps: lenientSum(b.steps),
          activeKcal: lenientSum(b.activeKcal),
          exerciseMin: lenientSum(b.exerciseMin),
          distanceKm: lenientSum(b.distanceKm),
          flights: lenientSum(b.flights),
        };
        const weightKg = lenientFirst(b.weightKg);

        await query(
          `INSERT INTO health_daily (user_id, date, steps, active_kcal, exercise_min, distance_km, flights)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (user_id, date) DO UPDATE SET
             steps = COALESCE(EXCLUDED.steps, health_daily.steps),
             active_kcal = COALESCE(EXCLUDED.active_kcal, health_daily.active_kcal),
             exercise_min = COALESCE(EXCLUDED.exercise_min, health_daily.exercise_min),
             distance_km = COALESCE(EXCLUDED.distance_km, health_daily.distance_km),
             flights = COALESCE(EXCLUDED.flights, health_daily.flights),
             updated_at = now()`,
          [req.userId, date, v.steps != null ? Math.round(v.steps) : null, v.activeKcal, v.exerciseMin, v.distanceKm, v.flights != null ? Math.round(v.flights) : null],
        );
        // A weight entered in the app today wins over the one read from Health.
        if (weightKg != null && weightKg >= 20 && weightKg <= 400) {
          await query(
            `INSERT INTO body_weights (user_id, date, kg, source) VALUES ($1, $2, $3, 'health')
             ON CONFLICT (user_id, date) DO UPDATE SET kg = EXCLUDED.kg WHERE body_weights.source = 'health'`,
            [req.userId, date, round1(weightKg)],
          );
        }
        return { ok: true };
      },
    );

    /**
     * Export to Apple Health for finished days (run at/after midnight): nutrition totals, the weight
     * entered in the app, and workouts. Nothing is marked as exported until the shortcut posts `ack`
     * back, so a failed run is simply repeated by the next one.
     */
    authed.get('/health/export', { config: { allowShortcut: true } }, async (req) => {
      const t = today();
      const days = (
        await query(
          `SELECT d::date::text AS date FROM generate_series($2::date - $3::int, $2::date - 1, interval '1 day') d
           WHERE NOT EXISTS (SELECT 1 FROM health_export e WHERE e.user_id = $1 AND e.date = d::date)
           ORDER BY d`,
          [req.userId, t, EXPORT_DAYS],
        )
      ).rows.map((r) => r.date);

      const samples = [];
      for (const date of days) {
        const at = endOfDayIso(date);
        const n = (
          await query(
            `SELECT COALESCE(SUM(kcal), 0) AS kcal, COALESCE(SUM(protein), 0) AS protein,
                    COALESCE(SUM(carbs), 0) AS carbs, COALESCE(SUM(fat), 0) AS fat
             FROM entries WHERE user_id = $1 AND date = $2`,
            [req.userId, date],
          )
        ).rows[0];
        for (const key of NUTRITION_KEYS) {
          if (n[key] > 0) samples.push({ key, value: Math.round(n[key]), date: at });
        }
        const w = (await query("SELECT kg FROM body_weights WHERE user_id = $1 AND date = $2 AND source = 'app'", [req.userId, date])).rows[0];
        if (w) samples.push({ key: 'weight', value: w.kg, date: at });
      }

      const strength = (
        await query(
          `SELECT id, started_at AS start, finished_at AS end FROM workouts
           WHERE user_id = $1 AND health_exported_at IS NULL AND finished_at > now() - make_interval(days => $2)
           ORDER BY started_at`,
          [req.userId, EXPORT_DAYS],
        )
      ).rows;
      const cardio = (
        await query(
          `SELECT id, type, minutes, distance_km AS "distanceKm", kcal, created_at AS end FROM cardio_sessions
           WHERE user_id = $1 AND health_exported_at IS NULL AND created_at > now() - make_interval(days => $2)
           ORDER BY created_at`,
          [req.userId, EXPORT_DAYS],
        )
      ).rows;

      const workouts = [
        ...strength.map((w) => ({
          type: 'Krafttraining',
          hkType: WORKOUT_TYPES.Krafttraining,
          start: w.start.toISOString(),
          end: w.end.toISOString(),
          minutes: Math.max(1, Math.round((w.end - w.start) / 60000)),
          kcal: 0,
          km: 0,
        })),
        ...cardio.map((c) => ({
          type: c.type,
          hkType: WORKOUT_TYPES[c.type] ?? 'Other',
          start: new Date(c.end.getTime() - c.minutes * 60000).toISOString(),
          end: c.end.toISOString(),
          minutes: Math.round(c.minutes),
          kcal: c.kcal ? Math.round(c.kcal) : 0,
          km: c.distanceKm ?? 0,
        })),
      ];

      const ack = Buffer.from(JSON.stringify({ days, workouts: strength.map((w) => w.id), cardio: cardio.map((c) => c.id) })).toString('base64url');
      return { samples, workouts, ack, count: samples.length + workouts.length };
    });

    authed.post(
      '/health/export/ack',
      { config: { allowShortcut: true }, schema: { body: { type: 'object', required: ['ack'], properties: { ack: { type: 'string', maxLength: 20000 } } } } },
      async (req, reply) => {
        let a;
        try {
          a = JSON.parse(Buffer.from(req.body.ack, 'base64url').toString());
        } catch {
          return reply.code(400).send({ error: 'Ungültige Bestätigung' });
        }
        const ints = (x) => (Array.isArray(x) ? x.filter(Number.isInteger) : []);
        const dates = (Array.isArray(a.days) ? a.days : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
        await transaction(async (db) => {
          for (const d of dates) {
            await db.query('INSERT INTO health_export (user_id, date) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, d]);
          }
          await db.query('UPDATE workouts SET health_exported_at = now() WHERE user_id = $1 AND id = ANY($2::int[])', [req.userId, ints(a.workouts)]);
          await db.query('UPDATE cardio_sessions SET health_exported_at = now() WHERE user_id = $1 AND id = ANY($2::int[])', [req.userId, ints(a.cardio)]);
        });
        return { ok: true };
      },
    );

    authed.get('/health/today', async (req) => {
      const { rows } = await query(
        `SELECT steps, active_kcal AS "activeKcal", exercise_min AS "exerciseMin", distance_km AS "distanceKm",
                flights, updated_at AS "updatedAt"
         FROM health_daily WHERE user_id = $1 AND date = $2`,
        [req.userId, today()],
      );
      return rows[0] ?? null;
    });
  });
}
