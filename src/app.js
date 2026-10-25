import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { HttpError, Reply, createRouter, readJson, sendJson } from './http.js';
import { clearCookie, createSession, currentUser, destroySession, sessionCookie } from './auth.js';
import * as svc from './services.js';
import { seed as seedDemo } from './seed.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Silakan masuk terlebih dahulu');
  return ctx.user;
}

function buildRoutes(db) {
  const r = createRouter();

  r.get('/api/meta', () => ({ sports: svc.SPORTS, levels: svc.LEVELS }));

  // Akun
  r.post('/api/auth/register', ({ body }) => {
    const userId = svc.register(db, body);
    return new Reply({ ok: true }, { status: 201, cookie: sessionCookie(createSession(db, userId)) });
  });
  r.post('/api/auth/login', ({ body }) => {
    const userId = svc.login(db, body);
    return new Reply({ ok: true }, { cookie: sessionCookie(createSession(db, userId)) });
  });
  r.post('/api/auth/logout', ({ req }) => {
    destroySession(db, req);
    return new Reply({ ok: true }, { cookie: clearCookie() });
  });
  r.get('/api/me', ({ user }) => ({ user }));
  r.patch('/api/me', (ctx) => {
    svc.updateProfile(db, requireUser(ctx).id, ctx.body);
    return { ok: true };
  });
  r.get('/api/my/events', (ctx) => svc.myEvents(db, requireUser(ctx).id));

  // Pemain & peringkat
  r.get('/api/users/:id', ({ params }) => svc.getUserProfile(db, params.id));
  r.get('/api/leaderboard', ({ query }) => ({ players: svc.leaderboard(db, query) }));

  // Sesi main bareng
  r.get('/api/events', ({ user, query }) => ({ events: svc.listEvents(db, user?.id, query) }));
  r.post('/api/events', (ctx) => new Reply({ id: svc.createEvent(db, requireUser(ctx).id, ctx.body) }, { status: 201 }));
  r.get('/api/events/:id', ({ user, params }) => svc.getEvent(db, params.id, user?.id));
  r.post('/api/events/:id/join', (ctx) => ({ status: svc.joinEvent(db, ctx.params.id, requireUser(ctx).id) }));
  r.post('/api/events/:id/leave', (ctx) => {
    svc.leaveEvent(db, ctx.params.id, requireUser(ctx).id);
    return { ok: true };
  });
  r.post('/api/events/:id/cancel', (ctx) => {
    svc.cancelEvent(db, ctx.params.id, requireUser(ctx).id);
    return { ok: true };
  });
  r.post(
    '/api/events/:id/matches',
    (ctx) => new Reply({ id: svc.recordMatch(db, ctx.params.id, requireUser(ctx).id, ctx.body) }, { status: 201 }),
  );

  // Klub
  r.get('/api/clubs', ({ user, query }) => ({ clubs: svc.listClubs(db, user?.id, query) }));
  r.post('/api/clubs', (ctx) => new Reply({ id: svc.createClub(db, requireUser(ctx).id, ctx.body) }, { status: 201 }));
  r.get('/api/clubs/:id', ({ user, params }) => svc.getClub(db, params.id, user?.id));
  r.post('/api/clubs/:id/join', (ctx) => {
    svc.joinClub(db, ctx.params.id, requireUser(ctx).id);
    return { ok: true };
  });
  r.post('/api/clubs/:id/leave', (ctx) => {
    svc.leaveClub(db, ctx.params.id, requireUser(ctx).id);
    return { ok: true };
  });

  return r;
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = normalize(join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch {
    // Aplikasi memakai hash routing, jadi path tak dikenal cukup diarahkan ke halaman utama.
    const index = await readFile(join(PUBLIC_DIR, 'index.html'));
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(index);
  }
}

export function createApp({ dbPath = ':memory:', seed = false } = {}) {
  const db = openDb(dbPath);
  if (seed) seedDemo(db);
  const router = buildRoutes(db);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Metode tidak diizinkan' });
      return serveStatic(req, res, url.pathname);
    }

    try {
      const route = router.match(req.method, url.pathname);
      if (!route) throw new HttpError(404, 'Endpoint tidak ditemukan');
      let body = {};
      if (req.method !== 'GET') {
        // Mewajibkan JSON mencegah CSRF lewat form HTML biasa.
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
          throw new HttpError(415, 'Content-Type harus application/json');
        }
        body = await readJson(req);
      }
      const ctx = { req, body, params: route.params, query: Object.fromEntries(url.searchParams), user: currentUser(db, req) };
      const result = await route.handler(ctx);
      const reply = result instanceof Reply ? result : new Reply(result ?? { ok: true });
      sendJson(res, reply.status, reply.data, reply.cookie ? { 'Set-Cookie': reply.cookie } : {});
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: 'Terjadi kesalahan pada server' });
      }
    }
  });

  return { server, db };
}
