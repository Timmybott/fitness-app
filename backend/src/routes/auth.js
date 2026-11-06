import { createSession, deleteSession, hashPassword, requireAuth, signOutOtherDevices, verifyPassword } from '../auth.js';
import { query } from '../db.js';

const credentials = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', maxLength: 200 },
    password: { type: 'string', minLength: 8, maxLength: 200 },
    name: { type: 'string', minLength: 1, maxLength: 80 },
  },
};

// Simple in-memory brute-force protection for login: max attempts per email per window.
const attempts = new Map();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(email) {
  const now = Date.now();
  const a = attempts.get(email);
  if (!a || now - a.first > WINDOW_MS) {
    attempts.set(email, { first: now, count: 1 });
    return false;
  }
  a.count += 1;
  return a.count > MAX_ATTEMPTS;
}

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

export default async function authRoutes(app) {
  app.post('/auth/register', { schema: { body: { ...credentials, required: ['email', 'password', 'name'] } } }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase();
    const exists = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (exists.rows[0]) return reply.code(409).send({ error: 'Diese E-Mail ist schon registriert' });

    const { rows } = await query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, req.body.name.trim(), await hashPassword(req.body.password)],
    );
    return { token: await createSession(rows[0].id), user: publicUser(rows[0]) };
  });

  app.post('/auth/login', { schema: { body: credentials } }, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase();
    if (tooManyAttempts(email)) {
      return reply.code(429).send({ error: 'Zu viele Versuche, bitte später erneut probieren' });
    }
    const { rows } = await query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await verifyPassword(req.body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'E-Mail oder Passwort falsch' });
    }
    attempts.delete(email);
    return { token: await createSession(user.id), user: publicUser(user) };
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (req) => {
    await deleteSession(req.token);
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const { rows } = await query('SELECT id, email, name FROM users WHERE id = $1', [req.userId]);
    return publicUser(rows[0]);
  });

  // Changes the password. Other signed-in devices are signed out; this one and the Health shortcut stay connected.
  app.post(
    '/auth/password',
    {
      preHandler: requireAuth,
      schema: {
        body: {
          type: 'object',
          required: ['current', 'next'],
          properties: { current: { type: 'string', maxLength: 200 }, next: { type: 'string', minLength: 8, maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const { rows } = await query('SELECT email, password_hash FROM users WHERE id = $1', [req.userId]);
      if (tooManyAttempts(`pw:${rows[0].email}`)) return reply.code(429).send({ error: 'Zu viele Versuche, bitte später erneut probieren' });
      if (!(await verifyPassword(req.body.current, rows[0].password_hash))) {
        return reply.code(401).send({ error: 'Das aktuelle Passwort stimmt nicht' });
      }
      await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.userId, await hashPassword(req.body.next)]);
      await signOutOtherDevices(req.userId, req.token);
      attempts.delete(`pw:${rows[0].email}`);
      return { ok: true };
    },
  );

  app.delete('/me', { preHandler: requireAuth }, async (req) => {
    await query('DELETE FROM users WHERE id = $1', [req.userId]);
    return { ok: true };
  });
}
