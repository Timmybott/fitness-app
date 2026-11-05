import Fastify from 'fastify';

import { migrate, query } from './db.js';
import aiRoutes from './routes/ai.js';
import authRoutes from './routes/auth.js';
import bodyRoutes from './routes/body.js';
import healthRoutes from './routes/health.js';
import nutritionRoutes from './routes/nutrition.js';
import recipeRoutes from './routes/recipes.js';
import trainingRoutes from './routes/training.js';

const app = Fastify({
  logger: { level: 'info' },
  bodyLimit: 8 * 1024 * 1024, // room for photo uploads (AI analysis)
  ajv: { customOptions: { removeAdditional: true, coerceTypes: true, allowUnionTypes: true } },
});

// Fastify's default error responses expose internals; send short German messages instead.
app.setErrorHandler((err, req, reply) => {
  if (err.validation) return reply.code(400).send({ error: 'Ungültige Eingabe', details: err.message });
  if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
  req.log.error(err);
  return reply.code(500).send({ error: 'Serverfehler' });
});

// The app reports uncaught JS errors here so crashes on the phone show up in the server log.
app.post(
  '/client-error',
  {
    schema: {
      body: {
        type: 'object',
        properties: { message: { type: 'string', maxLength: 2000 }, stack: { type: 'string', maxLength: 8000 }, fatal: { type: 'boolean' } },
      },
    },
  },
  async (req) => {
    req.log.error({ clientError: req.body }, 'client error');
    return { ok: true };
  },
);

app.get('/health', async () => {
  await query('SELECT 1');
  return { ok: true };
});

await app.register(authRoutes);
await app.register(nutritionRoutes);
await app.register(bodyRoutes);
await app.register(trainingRoutes);
await app.register(recipeRoutes);
await app.register(aiRoutes);
await app.register(healthRoutes);

await migrate(app.log);
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
