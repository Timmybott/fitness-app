import { createSession, requireAuth } from '../auth.js';
import { query, transaction } from '../db.js';

/** Today in the user's time zone (the container runs on UTC). */
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());

/**
 * Shortcuts sends numbers in whatever shape the action produced: 8432, "8432", "82,4" or "82,4 kg".
 * Returns null for missing/empty values.
 */
function lenientNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const lenient = { type: ['number', 'string', 'null'] };
const round1 = (n) => Math.round(n * 10) / 10;

export default async function healthRoutes(app) {
  app.addHook('preHandler', requireAuth);

  // New token for the shortcut; replaces the previous one.
  app.post('/me/shortcut-token', async (req) => {
    await query("DELETE FROM sessions WHERE user_id = $1 AND kind = 'shortcut'", [req.userId]);
    return { token: await createSession(req.userId, 'shortcut') };
  });

  /**
   * Called by the shortcut: stores today's activity (and weight), and answers with the nutrition
   * that hasn't been written to Apple Health yet. That part is marked as exported right away,
   * so running the shortcut repeatedly never logs the same calories twice.
   */
  app.post(
    '/health/sync',
    {
      config: { allowShortcut: true },
      schema: { body: { type: 'object', properties: { steps: lenient, activeKcal: lenient, weightKg: lenient } } },
    },
    async (req) => {
      const date = today();
      const steps = lenientNumber(req.body?.steps);
      const activeKcal = lenientNumber(req.body?.activeKcal);
      const weightKg = lenientNumber(req.body?.weightKg);

      return transaction(async (db) => {
        if (steps != null || activeKcal != null) {
          await db.query(
            `INSERT INTO health_daily (user_id, date, steps, active_kcal) VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, date) DO UPDATE SET
               steps = COALESCE(EXCLUDED.steps, health_daily.steps),
               active_kcal = COALESCE(EXCLUDED.active_kcal, health_daily.active_kcal),
               updated_at = now()`,
            [req.userId, date, steps != null ? Math.round(steps) : null, activeKcal],
          );
        }
        if (weightKg != null && weightKg >= 20 && weightKg <= 400) {
          await db.query(
            `INSERT INTO body_weights (user_id, date, kg) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, date) DO UPDATE SET kg = $3`,
            [req.userId, date, round1(weightKg)],
          );
        }

        const totals = (
          await db.query(
            `SELECT COALESCE(SUM(kcal), 0) AS kcal, COALESCE(SUM(protein), 0) AS protein,
                    COALESCE(SUM(carbs), 0) AS carbs, COALESCE(SUM(fat), 0) AS fat
             FROM entries WHERE user_id = $1 AND date = $2`,
            [req.userId, date],
          )
        ).rows[0];
        const sent = (
          await db.query('SELECT kcal, protein, carbs, fat FROM health_export WHERE user_id = $1 AND date = $2 FOR UPDATE', [req.userId, date])
        ).rows[0] ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };

        // Deleted entries can't be taken back out of Health, so negative differences are ignored.
        const delta = {};
        for (const k of ['kcal', 'protein', 'carbs', 'fat']) delta[k] = Math.max(0, Math.round(totals[k] - sent[k]));
        await db.query(
          `INSERT INTO health_export (user_id, date, kcal, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, date) DO UPDATE SET kcal = $3, protein = $4, carbs = $5, fat = $6`,
          [req.userId, date, sent.kcal + delta.kcal, sent.protein + delta.protein, sent.carbs + delta.carbs, sent.fat + delta.fat],
        );
        return delta;
      });
    },
  );

  app.get('/health/today', async (req) => {
    const { rows } = await query(
      'SELECT steps, active_kcal AS "activeKcal", updated_at AS "updatedAt" FROM health_daily WHERE user_id = $1 AND date = $2',
      [req.userId, today()],
    );
    return rows[0] ?? null;
  });
}
