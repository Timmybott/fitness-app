import { requireAuth } from '../auth.js';
import { query } from '../db.js';

const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

export default async function bodyRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/weights', async (req) => {
    const days = Math.min(3650, Math.max(1, parseInt(req.query.days, 10) || 90));
    const { rows } = await query(
      'SELECT date, kg FROM body_weights WHERE user_id = $1 AND date > CURRENT_DATE - $2::int ORDER BY date',
      [req.userId, days],
    );
    return rows;
  });

  app.put(
    '/weights',
    { schema: { body: { type: 'object', required: ['date', 'kg'], properties: { date, kg: { type: 'number', minimum: 20, maximum: 400 } } } } },
    async (req) => {
      await query(
        `INSERT INTO body_weights (user_id, date, kg) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, date) DO UPDATE SET kg = $3, source = 'app'`,
        [req.userId, req.body.date, req.body.kg],
      );
      return req.body;
    },
  );

  app.delete('/weights/:date', async (req) => {
    await query('DELETE FROM body_weights WHERE user_id = $1 AND date = $2', [req.userId, req.params.date]);
    return { ok: true };
  });

  // Body data used for calorie estimates (weight itself comes from /weights).
  app.get('/body', async (req) => {
    const { rows } = await query('SELECT height_cm::float AS "heightCm" FROM users WHERE id = $1', [req.userId]);
    return { heightCm: rows[0]?.heightCm ?? null };
  });

  app.put(
    '/body',
    { schema: { body: { type: 'object', required: ['heightCm'], properties: { heightCm: { type: ['number', 'null'], minimum: 100, maximum: 250 } } } } },
    async (req) => {
      await query('UPDATE users SET height_cm = $2 WHERE id = $1', [req.userId, req.body.heightCm]);
      return { heightCm: req.body.heightCm };
    },
  );
}
