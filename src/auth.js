import { parseCookies } from './http.js';

const COOKIE = 'sid';
const SESSION_DAYS = 30;

function randomToken() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createSession(db, userId) {
  const token = randomToken();
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    new Date().toISOString(),
  );
  return token;
}

export function destroySession(db, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function currentUser(db, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const cutoff = new Date(Date.now() - SESSION_DAYS * 864e5).toISOString();
  return (
    db
      .prepare(
        `SELECT u.id, u.name, u.email, u.city, u.bio
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.created_at > ?`,
      )
      .get(token, cutoff) ?? null
  );
}

export function sessionCookie(token) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
