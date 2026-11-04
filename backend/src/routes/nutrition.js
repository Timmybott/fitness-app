import { requireAuth } from '../auth.js';
import { query, transaction } from '../db.js';

const DEFAULT_GOALS = { kcal: 2500, protein: 160, carbs: 280, fat: 80 };
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

  app.get('/goals', async (req) => {
    const { rows } = await query('SELECT kcal, protein, carbs, fat FROM goals WHERE user_id = $1', [req.userId]);
    return rows[0] ?? DEFAULT_GOALS;
  });

  app.put(
    '/goals',
    {
      schema: {
        body: {
          type: 'object',
          required: ['kcal', 'protein', 'carbs', 'fat'],
          properties: { kcal: { type: 'integer', minimum: 0, maximum: 20000 }, protein: { type: 'integer', minimum: 0 }, carbs: { type: 'integer', minimum: 0 }, fat: { type: 'integer', minimum: 0 } },
        },
      },
    },
    async (req) => {
      const { kcal, protein, carbs, fat } = req.body;
      await query(
        `INSERT INTO goals (user_id, kcal, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET kcal = $2, protein = $3, carbs = $4, fat = $5`,
        [req.userId, kcal, protein, carbs, fat],
      );
      return req.body;
    },
  );

  // Daily calorie totals for the last N days (for stats).
  app.get('/nutrition/daily', async (req) => {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const { rows } = await query(
      `SELECT date, SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs, SUM(fat) AS fat
       FROM entries WHERE user_id = $1 AND date > CURRENT_DATE - $2::int
       GROUP BY date ORDER BY date`,
      [req.userId, days],
    );
    return rows;
  });
}
