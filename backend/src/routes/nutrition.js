import { requireAuth } from '../auth.js';
import { query, transaction } from '../db.js';

const DEFAULT_GOALS = { kcal: 2500, protein: 160, carbs: 280, fat: 80, waterMl: 2500, addBurned: false };
// "Today" for the user (the server runs on UTC).
const LOCAL_TODAY = "(now() AT TIME ZONE 'Europe/Berlin')::date";
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const nonNeg = { type: 'number', minimum: 0, maximum: 100000 };

const foodSchema = {
  type: 'object',
  required: ['name', 'kcal', 'protein', 'carbs', 'fat'],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    brand: { type: ['string', 'null'], maxLength: 200 },
    barcode: { type: ['string', 'null'], maxLength: 50 },
    kcal: nonNeg,
    protein: nonNeg,
    carbs: nonNeg,
    fat: nonNeg,
    servingGrams: { type: ['number', 'null'], minimum: 0 },
  },
};

// German (Germany) search words → names used by the Swiss database.
const REFERENCE_ALIASES = {
  hähnchen: ['poulet'],
  hühnchen: ['poulet'],
  huhn: ['poulet'],
  chicken: ['poulet'],
  hähnchenbrust: ['poulet, brust'],
  hühnerbrust: ['poulet, brust'],
  pute: ['trute', 'truthahn', 'pute'],
  putenbrust: ['trute', 'truthahn', 'pute'],
  ei: ['hühnerei'],
  eier: ['hühnerei'],
  sahne: ['rahm'],
  schlagsahne: ['rahm'],
  paprika: ['peperoni', 'paprika'],
  zucchini: ['zucchetti'],
  feldsalat: ['nüsslisalat'],
  pfifferling: ['eierschwamm'],
  pfifferlinge: ['eierschwamm'],
  möhre: ['karotte'],
  möhren: ['karotte'],
  karotten: ['karotte'],
  eis: ['glace'],
  speiseeis: ['glace'],
  kartoffelpüree: ['kartoffelstock'],
  püree: ['stock'],
  hackfleisch: ['gehacktes', 'hackfleisch'],
  brötchen: ['brötli', 'weggli', 'semmel'],
  semmel: ['brötli', 'weggli', 'semmel'],
  croissant: ['gipfeli'],
  äpfel: ['apfel'],
  bananen: ['banane'],
  tomaten: ['tomate'],
  kartoffeln: ['kartoffel'],
  nudeln: ['teigwaren', 'nudeln'],
  pasta: ['teigwaren'],
  spaghetti: ['teigwaren', 'spaghetti'],
  marille: ['aprikose'],
};

const FOOD_COLUMNS = 'id, name, brand, barcode, kcal, protein, carbs, fat, serving_grams AS "servingGrams"';
const ENTRY_COLUMNS = 'id, date, meal, name, grams, kcal, protein, carbs, fat';

export default async function nutritionRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/entries', { schema: { querystring: { type: 'object', required: ['date'], properties: { date } } } }, async (req) => {
    const { rows } = await query(
      `SELECT ${ENTRY_COLUMNS} FROM entries WHERE user_id = $1 AND date = $2 ORDER BY created_at`,
      [req.userId, req.query.date],
    );
    return rows;
  });

  // Logs a food. Saves the food to the user's list first (matched by id or barcode).
  app.post(
    '/entries',
    {
      schema: {
        body: {
          type: 'object',
          required: ['food', 'grams', 'date', 'meal'],
          properties: {
            food: foodSchema,
            grams: { type: 'number', exclusiveMinimum: 0, maximum: 10000 },
            date,
            meal: { enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
            // false for one-off items (AI estimates, recipes) that shouldn't appear in "recent foods".
            saveFood: { type: 'boolean', default: true },
          },
        },
      },
    },
    async (req) => {
      const { food, grams, meal } = req.body;
      return transaction(async (db) => {
        let foodId = null;
        if (req.body.saveFood) {
          if (food.id) {
            const r = await db.query('UPDATE foods SET last_used_at = now() WHERE id = $1 AND user_id = $2 RETURNING id', [food.id, req.userId]);
            foodId = r.rows[0]?.id ?? null;
          }
          if (foodId == null) {
            const r = await db.query(
              `INSERT INTO foods (user_id, name, brand, barcode, kcal, protein, carbs, fat, serving_grams)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (user_id, barcode) DO UPDATE SET last_used_at = now()
               RETURNING id`,
              [req.userId, food.name, food.brand ?? null, food.barcode || null, food.kcal, food.protein, food.carbs, food.fat, food.servingGrams ?? null],
            );
            foodId = r.rows[0].id;
          }
        }
        const f = grams / 100;
        const r = await db.query(
          `INSERT INTO entries (user_id, date, meal, food_id, name, grams, kcal, protein, carbs, fat)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${ENTRY_COLUMNS}`,
          [req.userId, req.body.date, meal, foodId, food.name, grams, food.kcal * f, food.protein * f, food.carbs * f, food.fat * f],
        );
        return r.rows[0];
      });
    },
  );

  app.delete('/entries/:id', async (req) => {
    await query('DELETE FROM entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    return { ok: true };
  });

  app.get('/foods/recent', async (req) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const { rows } = await query(
      `SELECT ${FOOD_COLUMNS} FROM foods WHERE user_id = $1 AND name ILIKE $2 ORDER BY last_used_at DESC LIMIT 30`,
      [req.userId, `%${q}%`],
    );
    return rows;
  });

  // Generic foods from the Swiss Food Composition Database (migration 008), shown as "Empfohlen" above
  // OpenFoodFacts. Every search word must appear in the name or synonyms; ranked so "Apfel" gives
  // "Apfel, roh" before "Apfelstrudel" and "Bratapfel". The barcode "blv:<id>" keeps a logged food
  // from being saved to the user's list twice.
  app.get('/foods/reference', async (req) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase().replace(/ß/g, 'ss').slice(0, 100) : '';
    // Letters, digits and hyphens only, so the words are safe inside the regexes below.
    const words = q.split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length >= 2).slice(0, 5);
    if (words.length === 0) return [];
    // One regex alternation per word: German words also find the Swiss names ("Hähnchen" → "Poulet").
    const patterns = words.map((w) => `(${(REFERENCE_ALIASES[w] ?? [w]).join('|')})`);
    const { rows } = await query(
      `SELECT 'blv:' || id AS barcode, name, NULL AS brand, unit, kcal::float, protein::float, carbs::float, fat::float
       FROM reference_foods r
       WHERE (SELECT bool_and(lower(r.name || ' ' || coalesce(r.synonyms, '')) ~ p) FROM unnest($1::text[]) p)
       ORDER BY
         CASE
           WHEN lower(name) = $2 THEN 0
           WHEN lower(name) ~ ('^' || $3 || '($|[ ,(])') THEN 1
           WHEN lower(name) ~ ('^' || $3) THEN 2
           WHEN lower(name) ~ ('(^|[ ,(-])' || $3) THEN 3
           WHEN lower(name) ~ $3 THEN 4
           ELSE 5
         END,
         (lower(name) LIKE '%roh%') DESC,
         length(name)
       LIMIT 8`,
      [patterns, q, patterns[0]],
    );
    return rows;
  });

  app.get('/goals', async (req) => {
    const { rows } = await query(
      'SELECT kcal, protein, carbs, fat, water_ml AS "waterMl", add_burned AS "addBurned" FROM goals WHERE user_id = $1',
      [req.userId],
    );
    return rows[0] ?? DEFAULT_GOALS;
  });

  app.put(
    '/goals',
    {
      schema: {
        body: {
          type: 'object',
          required: ['kcal', 'protein', 'carbs', 'fat'],
          properties: {
            kcal: { type: 'integer', minimum: 0, maximum: 20000 },
            protein: { type: 'integer', minimum: 0 },
            carbs: { type: 'integer', minimum: 0 },
            fat: { type: 'integer', minimum: 0 },
            waterMl: { type: 'integer', minimum: 0, maximum: 20000, default: DEFAULT_GOALS.waterMl },
            addBurned: { type: 'boolean', default: false },
          },
        },
      },
    },
    async (req) => {
      const { kcal, protein, carbs, fat, waterMl, addBurned } = req.body;
      await query(
        `INSERT INTO goals (user_id, kcal, protein, carbs, fat, water_ml, add_burned) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id) DO UPDATE SET kcal = $2, protein = $3, carbs = $4, fat = $5, water_ml = $6, add_burned = $7`,
        [req.userId, kcal, protein, carbs, fat, waterMl, addBurned],
      );
      return req.body;
    },
  );

  // Every day of the last N days with nutrition, water and activity totals (for stats).
  app.get('/nutrition/daily', async (req) => {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const { rows } = await query(
      `WITH d AS (
         SELECT generate_series(${LOCAL_TODAY} - ($2::int - 1), ${LOCAL_TODAY}, interval '1 day')::date AS date
       )
       SELECT d.date::text AS date,
         COALESCE(e.kcal, 0) AS kcal, COALESCE(e.protein, 0) AS protein, COALESCE(e.carbs, 0) AS carbs, COALESCE(e.fat, 0) AS fat,
         COALESCE(e.n, 0)::int AS "entryCount", COALESCE(w.ml, 0)::int AS "waterMl",
         h.steps, h.active_kcal AS "activeKcal", h.distance_km AS "distanceKm", h.flights
       FROM d
       LEFT JOIN (SELECT date, SUM(kcal) kcal, SUM(protein) protein, SUM(carbs) carbs, SUM(fat) fat, COUNT(*) n
                  FROM entries WHERE user_id = $1 GROUP BY date) e ON e.date = d.date
       LEFT JOIN (SELECT date, SUM(ml) ml FROM water_entries WHERE user_id = $1 GROUP BY date) w ON w.date = d.date
       LEFT JOIN health_daily h ON h.user_id = $1 AND h.date = d.date
       ORDER BY d.date`,
      [req.userId, days],
    );
    return rows;
  });

  app.get('/water', { schema: { querystring: { type: 'object', required: ['date'], properties: { date } } } }, async (req) => {
    const { rows } = await query(
      'SELECT id, ml, name, created_at AS "createdAt" FROM water_entries WHERE user_id = $1 AND date = $2 ORDER BY created_at',
      [req.userId, req.query.date],
    );
    return { totalMl: rows.reduce((t, r) => t + r.ml, 0), entries: rows };
  });

  app.post(
    '/water',
    {
      schema: {
        body: {
          type: 'object',
          required: ['date', 'ml'],
          properties: { date, ml: { type: 'integer', minimum: 1, maximum: 5000 }, name: { type: ['string', 'null'], maxLength: 100 } },
        },
      },
    },
    async (req) => {
      const { rows } = await query(
        'INSERT INTO water_entries (user_id, date, ml, name) VALUES ($1, $2, $3, $4) RETURNING id, ml, name',
        [req.userId, req.body.date, req.body.ml, req.body.name ?? null],
      );
      return rows[0];
    },
  );

  app.delete('/water/:id', async (req) => {
    await query('DELETE FROM water_entries WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    return { ok: true };
  });
}
