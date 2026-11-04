import { requireAuth } from '../auth.js';
import { query, transaction } from '../db.js';

const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };

const templateBody = {
  type: 'object',
  required: ['name', 'exercises'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    exercises: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        required: ['exerciseId', 'sets', 'reps'],
        properties: {
          exerciseId: { type: 'integer' },
          sets: { type: 'integer', minimum: 1, maximum: 20 },
          reps: { type: 'integer', minimum: 1, maximum: 200 },
        },
      },
    },
  },
};

/** Exercises the user may use: built-in ones plus their own. */
const visibleExercise = 'SELECT id FROM exercises WHERE id = $1 AND (user_id IS NULL OR user_id = $2)';

async function assertExercises(db, ids, userId) {
  for (const id of new Set(ids)) {
    const r = await db.query(visibleExercise, [id, userId]);
    if (!r.rows[0]) {
      const err = new Error('Unbekannte Übung');
      err.statusCode = 400;
      throw err;
    }
  }
}

async function writeTemplateExercises(db, templateId, exercises) {
  await db.query('DELETE FROM template_exercises WHERE template_id = $1', [templateId]);
  for (const [i, e] of exercises.entries()) {
    await db.query(
      'INSERT INTO template_exercises (template_id, position, exercise_id, sets, reps) VALUES ($1, $2, $3, $4, $5)',
      [templateId, i, e.exerciseId, e.sets, e.reps],
    );
  }
}

export default async function trainingRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/exercises', async (req) => {
    const { rows } = await query(
      'SELECT id, name, muscle, user_id IS NOT NULL AS custom FROM exercises WHERE user_id IS NULL OR user_id = $1 ORDER BY muscle, name',
      [req.userId],
    );
    return rows;
  });

  app.post(
    '/exercises',
    { schema: { body: { type: 'object', required: ['name', 'muscle'], properties: { name: { type: 'string', minLength: 1, maxLength: 80 }, muscle: { type: 'string', minLength: 1, maxLength: 40 } } } } },
    async (req) => {
      const { rows } = await query(
        'INSERT INTO exercises (user_id, name, muscle) VALUES ($1, $2, $3) RETURNING id, name, muscle, true AS custom',
        [req.userId, req.body.name.trim(), req.body.muscle],
      );
      return rows[0];
    },
  );

  app.get('/templates', async (req) => {
    const { rows } = await query(
      `SELECT t.id, t.name,
         COALESCE(json_agg(json_build_object('exerciseId', te.exercise_id, 'name', e.name, 'muscle', e.muscle, 'sets', te.sets, 'reps', te.reps)
           ORDER BY te.position) FILTER (WHERE te.exercise_id IS NOT NULL), '[]') AS exercises
       FROM templates t
       LEFT JOIN template_exercises te ON te.template_id = t.id
       LEFT JOIN exercises e ON e.id = te.exercise_id
       WHERE t.user_id = $1
       GROUP BY t.id ORDER BY t.created_at`,
      [req.userId],
    );
    return rows;
  });

  app.post('/templates', { schema: { body: templateBody } }, async (req) =>
    transaction(async (db) => {
      await assertExercises(db, req.body.exercises.map((e) => e.exerciseId), req.userId);
      const { rows } = await db.query('INSERT INTO templates (user_id, name) VALUES ($1, $2) RETURNING id', [req.userId, req.body.name.trim()]);
      await writeTemplateExercises(db, rows[0].id, req.body.exercises);
      return { id: rows[0].id };
    }),
  );

  app.put('/templates/:id', { schema: { body: templateBody } }, async (req, reply) =>
    transaction(async (db) => {
      const own = await db.query('UPDATE templates SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id', [req.body.name.trim(), req.params.id, req.userId]);
      if (!own.rows[0]) return reply.code(404).send({ error: 'Vorlage nicht gefunden' });
      await assertExercises(db, req.body.exercises.map((e) => e.exerciseId), req.userId);
      await writeTemplateExercises(db, own.rows[0].id, req.body.exercises);
      return { id: own.rows[0].id };
    }),
  );

  app.delete('/templates/:id', async (req) => {
    await query('DELETE FROM templates WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    return { ok: true };
  });

  // A finished workout is uploaded in one piece; the live session lives on the device.
  app.post(
    '/workouts',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'startedAt', 'finishedAt', 'sets'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            templateId: { type: ['integer', 'null'] },
            startedAt: { type: 'string', format: 'date-time' },
            finishedAt: { type: 'string', format: 'date-time' },
            sets: {
              type: 'array',
              maxItems: 300,
              items: {
                type: 'object',
                required: ['exerciseId', 'position', 'setIndex', 'weight', 'reps'],
                properties: {
                  exerciseId: { type: 'integer' },
                  position: { type: 'integer', minimum: 0 },
                  setIndex: { type: 'integer', minimum: 0 },
                  weight: { type: 'number', minimum: 0, maximum: 1000 },
                  reps: { type: 'integer', minimum: 0, maximum: 1000 },
                },
              },
            },
          },
        },
      },
    },
    async (req) =>
      transaction(async (db) => {
        const b = req.body;
        await assertExercises(db, b.sets.map((s) => s.exerciseId), req.userId);
        let templateId = null;
        if (b.templateId) {
          const t = await db.query('SELECT id FROM templates WHERE id = $1 AND user_id = $2', [b.templateId, req.userId]);
          templateId = t.rows[0]?.id ?? null;
        }
        const { rows } = await db.query(
          'INSERT INTO workouts (user_id, template_id, name, started_at, finished_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [req.userId, templateId, b.name, b.startedAt, b.finishedAt],
        );
        for (const s of b.sets) {
          await db.query(
            'INSERT INTO workout_sets (workout_id, exercise_id, position, set_index, weight, reps) VALUES ($1, $2, $3, $4, $5, $6)',
            [rows[0].id, s.exerciseId, s.position, s.setIndex, s.weight, s.reps],
          );
        }
        return { id: rows[0].id };
      }),
  );

  app.get('/workouts', async (req) => {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const { rows } = await query(
      `SELECT w.id, w.name, w.started_at AS "startedAt", w.finished_at AS "finishedAt",
         COUNT(s.id)::int AS "setCount", COALESCE(SUM(s.weight * s.reps), 0) AS volume
       FROM workouts w LEFT JOIN workout_sets s ON s.workout_id = w.id
       WHERE w.user_id = $1 GROUP BY w.id ORDER BY w.started_at DESC LIMIT $2`,
      [req.userId, limit],
    );
    return rows;
  });

  app.get('/workouts/:id', async (req, reply) => {
    const w = await query(
      'SELECT id, name, started_at AS "startedAt", finished_at AS "finishedAt" FROM workouts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId],
    );
    if (!w.rows[0]) return reply.code(404).send({ error: 'Workout nicht gefunden' });
    const sets = await query(
      `SELECT s.exercise_id AS "exerciseId", e.name, s.position, s.set_index AS "setIndex", s.weight, s.reps
       FROM workout_sets s JOIN exercises e ON e.id = s.exercise_id
       WHERE s.workout_id = $1 ORDER BY s.position, s.set_index`,
      [w.rows[0].id],
    );
    return { ...w.rows[0], sets: sets.rows };
  });

  app.delete('/workouts/:id', async (req) => {
    await query('DELETE FROM workouts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    return { ok: true };
  });

  // Sets from the most recent workout containing each exercise ("last time: 80 kg x 8").
  app.get('/exercises/last', async (req) => {
    const ids = String(req.query.ids ?? '')
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter(Number.isInteger);
    if (ids.length === 0) return {};
    const { rows } = await query(
      `SELECT DISTINCT ON (s.exercise_id, s.set_index) s.exercise_id AS "exerciseId", s.set_index AS "setIndex", s.weight, s.reps
       FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
       WHERE w.user_id = $1 AND s.exercise_id = ANY($2::int[])
         AND w.id = (SELECT w2.id FROM workouts w2 JOIN workout_sets s2 ON s2.workout_id = w2.id
                     WHERE w2.user_id = $1 AND s2.exercise_id = s.exercise_id ORDER BY w2.started_at DESC LIMIT 1)
       ORDER BY s.exercise_id, s.set_index`,
      [req.userId, ids],
    );
    const result = {};
    for (const r of rows) (result[r.exerciseId] ??= []).push({ weight: r.weight, reps: r.reps });
    return result;
  });

  // Best estimated 1RM (Epley) per workout for one exercise, for progress charts.
  app.get('/exercises/:id/progress', async (req) => {
    const { rows } = await query(
      `SELECT w.started_at::date AS date, MAX(s.weight * (1 + s.reps / 30.0)) AS e1rm, MAX(s.weight) AS "maxWeight"
       FROM workout_sets s JOIN workouts w ON w.id = s.workout_id
       WHERE w.user_id = $1 AND s.exercise_id = $2 AND s.reps > 0
       GROUP BY w.id, w.started_at ORDER BY w.started_at`,
      [req.userId, req.params.id],
    );
    return rows;
  });

  app.get('/cardio', async (req) => {
    const { rows } = await query(
      `SELECT id, date, type, minutes, distance_km AS "distanceKm", kcal FROM cardio_sessions
       WHERE user_id = $1 ORDER BY date DESC, created_at DESC LIMIT 50`,
      [req.userId],
    );
    return rows;
  });

  app.post(
    '/cardio',
    {
      schema: {
        body: {
          type: 'object',
          required: ['date', 'type', 'minutes'],
          properties: {
            date,
            type: { type: 'string', minLength: 1, maxLength: 40 },
            minutes: { type: 'number', exclusiveMinimum: 0, maximum: 1440 },
            distanceKm: { type: ['number', 'null'], minimum: 0, maximum: 1000 },
            kcal: { type: ['number', 'null'], minimum: 0, maximum: 20000 },
          },
        },
      },
    },
    async (req) => {
      const b = req.body;
      const { rows } = await query(
        `INSERT INTO cardio_sessions (user_id, date, type, minutes, distance_km, kcal) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, date, type, minutes, distance_km AS "distanceKm", kcal`,
        [req.userId, b.date, b.type, b.minutes, b.distanceKm ?? null, b.kcal ?? null],
      );
      return rows[0];
    },
  );

  app.delete('/cardio/:id', async (req) => {
    await query('DELETE FROM cardio_sessions WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
    return { ok: true };
  });
}
