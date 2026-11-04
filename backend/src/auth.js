import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { query } from './db.js';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 180;

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

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [sha256(token), userId],
  );
  return token;
}

export async function deleteSession(token) {
  await query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
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
    'SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > now()',
    [sha256(token)],
  );
  if (!rows[0]) return reply.code(401).send({ error: 'Sitzung abgelaufen' });
  request.userId = rows[0].user_id;
  request.token = token;
}
