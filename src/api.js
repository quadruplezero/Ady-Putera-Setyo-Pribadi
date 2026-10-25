import { HttpError, Reply, createRouter } from './http.js';
import { clearCookie, createSession, currentUser, destroySession, sessionCookie } from './auth.js';
import * as svc from './services.js';

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

// Penangan API yang tidak bergantung pada node:http, sehingga bisa dipakai
// oleh server maupun versi demo yang berjalan sepenuhnya di browser.
export function createApiHandler(db) {
  const router = buildRoutes(db);
  return async function handle({ method, url, headers, readBody }) {
    try {
      const route = router.match(method, url.pathname);
      if (!route) throw new HttpError(404, 'Endpoint tidak ditemukan');
      let body = {};
      if (method !== 'GET') {
        // Mewajibkan JSON mencegah CSRF lewat form HTML biasa.
        if (!String(headers['content-type'] ?? '').startsWith('application/json')) {
          throw new HttpError(415, 'Content-Type harus application/json');
        }
        body = await readBody();
      }
      const req = { headers };
      const ctx = { req, body, params: route.params, query: Object.fromEntries(url.searchParams), user: currentUser(db, req) };
      const result = await route.handler(ctx);
      return result instanceof Reply ? result : new Reply(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return new Reply({ error: err.message }, { status: err.status });
      console.error(err);
      return new Reply({ error: 'Terjadi kesalahan pada server' }, { status: 500 });
    }
  };
}
