import { requireAuth } from '../auth.js';
import { query, transaction } from '../db.js';

const nonNeg = { type: 'number', minimum: 0, maximum: 100000 };

const recipeBody = {
  type: 'object',
  required: ['name', 'servings', 'items'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    servings: { type: 'integer', minimum: 1, maximum: 50 },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 50,
      items: {
        type: 'object',
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          grams: { type: 'number', exclusiveMinimum: 0, maximum: 20000 },
          kcal: nonNeg,
          protein: nonNeg,
          carbs: nonNeg,
          fat: nonNeg,
        },
      },
    },
  },
};

async function writeItems(db, recipeId, items) {
  await db.query('DELETE FROM recipe_items WHERE recipe_id = $1', [recipeId]);
  for (const [i, it] of items.entries()) {
    await db.query(
      'INSERT INTO recipe_items (recipe_id, position, name, grams, kcal, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [recipeId, i, it.name, it.grams, it.kcal, it.protein, it.carbs, it.fat],
    );
  }
}

export default async function recipeRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/recipes', async (req) => {
    const { rows } = await query(
      `SELECT r.id, r.name, r.servings,
         COALESCE(json_agg(json_build_object('name', i.name, 'grams', i.grams, 'kcal', i.kcal, 'protein', i.protein, 'carbs', i.carbs, 'fat', i.fat)
           ORDER BY i.position) FILTER (WHERE i.name IS NOT NULL), '[]') AS items
       FROM recipes r LEFT JOIN recipe_items i ON i.recipe_id = r.id
       WHERE r.user_id = $1 GROUP BY r.id ORDER BY r.last_used_at DESC`,
      [req.userId],
    );
    return rows;
  });

  app.post('/recipes', { schema: { body: recipeBody } }, async (req) =>
    transaction(async (db) => {
      const { rows } = await db.query('INSERT INTO recipes (user_id, name, servings) VALUES ($1, $2, $3) RETURNING id', [
        req.userId,
        req.body.name.trim(),
        req.body.servings,
      ]);
      await writeItems(db, rows[0].id, req.body.items);
      return { id: rows[0].id };
    }),
  );

  app.put('/recipes/:id', { schema: { body: recipeBody } }, async (req, reply) =>
    transaction(async (db) => {
      const { rows } = await db.query('UPDATE recipes SET name = $1, servings = $2 WHERE id = $3 AND user_id = $4 RETURNING id', [
        req.body.name.trim(),
        req.body.servings,
        req.params.id,
        req.userId,
      ]);
      if (!rows[0]) return reply.code(404).send({ error: 'Rezept nicht gefunden' });
      await writeItems(db, rows[0].id, req.body.items);
      return { id: rows[0].id };
    }),
  );

  app.post('/recipes/:id/used', async (req) => {
    await query('UPDATE recipes SET last_used_at = now() WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    return { ok: true };
  });

  app.delete('/recipes/:id', async (req) => {
    await query('DELETE FROM recipes WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    return { ok: true };
  });
}
