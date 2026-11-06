import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { query } from './db.js';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = { app: 180, shortcut: 3650 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [, saltHex, keyHex] = stored.split('$');
  const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64);
  return timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** `kind: 'shortcut'` creates a long-lived token that only routes with `config.allowShortcut` accept. */
export async function createSession(userId, kind = 'app') {
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO sessions (token_hash, user_id, kind, expires_at) VALUES ($1, $2, $3, now() + interval '${SESSION_DAYS[kind]} days')`,
    [sha256(token), userId, kind],
  );
  return token;
}

export async function deleteSession(token) {
  await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
}

/** After a password change: ends the user's other app sessions, keeps `token` and the Health shortcut. */
export async function signOutOtherDevices(userId, token) {
  await query("DELETE FROM sessions WHERE user_id = $1 AND kind = 'app' AND token_hash <> $2", [userId, sha256(token)]);
}

function bearer(request) {
  const header = request.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/** Fastify preHandler: rejects unauthenticated requests and sets `request.userId`. */
export async function requireAuth(request, reply) {
  const token = bearer(request);
  if (!token) return reply.code(401).send({ error: 'Nicht angemeldet' });
  const { rows } = await query(
    'SELECT user_id, kind FROM sessions WHERE token_hash = $1 AND expires_at > now()',
    [sha256(token)],
  );
  if (!rows[0]) return reply.code(401).send({ error: 'Sitzung abgelaufen' });
  if (rows[0].kind === 'shortcut' && !request.routeOptions.config?.allowShortcut) {
    return reply.code(403).send({ error: 'Dieser Token ist nur für den Kurzbefehl gültig' });
  }
  request.userId = rows[0].user_id;
  request.token = token;
}
