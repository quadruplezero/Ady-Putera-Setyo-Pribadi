import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { expectedScore, matchDeltas } from '../src/rating.js';

let server;
let base;

before(async () => {
  ({ server } = createApp({ dbPath: ':memory:' }));
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  return { status: res.status, data: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

let n = 0;
async function newUser(name = 'Pemain') {
  n += 1;
  const res = await call('/auth/register', {
    method: 'POST',
    body: { name: `${name} ${n}`, email: `user${n}@test.id`, password: 'rahasia123', city: 'Jakarta' },
  });
  assert.equal(res.status, 201);
  const me = await call('/me', { cookie: res.cookie });
  return { cookie: res.cookie, id: me.data.user.id };
}

const tomorrow = () => new Date(Date.now() + 864e5).toISOString();

async function newEvent(host, overrides = {}) {
  const res = await call('/events', {
    method: 'POST',
    cookie: host.cookie,
    body: {
      title: 'Mabar Badminton',
      sport: 'badminton',
      venue: 'GOR Test',
      city: 'Jakarta',
      starts_at: tomorrow(),
      duration_min: 120,
      capacity: 4,
      fee: 30000,
      level: 'semua',
      ...overrides,
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.id;
}

describe('rating Elo', () => {
  test('pemain setara mendapat ±16 poin', () => {
    assert.equal(expectedScore(1000, 1000), 0.5);
    assert.deepEqual(matchDeltas([1000], [1000], 21, 15), { deltaA: 16, deltaB: -16 });
  });

  test('underdog yang menang mendapat poin lebih banyak', () => {
    const upset = matchDeltas([900, 900], [1100, 1100], 21, 19);
    const expected = matchDeltas([1100, 1100], [900, 900], 21, 19);
    assert.ok(upset.deltaA > expected.deltaA);
  });
});

describe('akun', () => {
  test('daftar, masuk, dan keluar', async () => {
    const u = await newUser();
    const login = await call('/auth/login', { method: 'POST', body: { email: `user${n}@test.id`, password: 'rahasia123' } });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    await call('/auth/logout', { method: 'POST', cookie: u.cookie });
    assert.equal((await call('/me', { cookie: u.cookie })).data.user, null);
  });

  test('kata sandi salah ditolak', async () => {
    await newUser();
    const res = await call('/auth/login', { method: 'POST', body: { email: `user${n}@test.id`, password: 'salah-salah' } });
    assert.equal(res.status, 401);
  });

  test('email ganda ditolak', async () => {
    await newUser();
    const res = await call('/auth/register', {
      method: 'POST',
      body: { name: 'X', email: `user${n}@test.id`, password: 'rahasia123' },
    });
    assert.equal(res.status, 409);
  });

  test('endpoint yang butuh login mengembalikan 401', async () => {
    const res = await call('/events', { method: 'POST', body: {} });
    assert.equal(res.status, 401);
  });

  test('POST tanpa JSON ditolak (perlindungan CSRF)', async () => {
    const res = await fetch(`${base}/api/auth/logout`, { method: 'POST', body: 'x=1' });
    assert.equal(res.status, 415);
  });
});

describe('sesi main bareng', () => {
  test('kuota penuh → daftar tunggu, lalu naik otomatis saat ada yang batal', async () => {
    const host = await newUser('Host');
    const eventId = await newEvent(host, { capacity: 2 });
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();

    assert.equal((await call(`/events/${eventId}/join`, { method: 'POST', cookie: a.cookie })).data.status, 'going');
    assert.equal((await call(`/events/${eventId}/join`, { method: 'POST', cookie: b.cookie })).data.status, 'waitlist');
    assert.equal((await call(`/events/${eventId}/join`, { method: 'POST', cookie: c.cookie })).data.status, 'waitlist');

    await call(`/events/${eventId}/leave`, { method: 'POST', cookie: a.cookie });
    const detail = (await call(`/events/${eventId}`)).data;
    assert.deepEqual(detail.participants.map((p) => p.id), [host.id, b.id]);
    assert.deepEqual(detail.waitlist.map((p) => p.id), [c.id]);
  });

  test('bergabung dua kali tidak menggandakan peserta', async () => {
    const host = await newUser();
    const eventId = await newEvent(host);
    const a = await newUser();
    await call(`/events/${eventId}/join`, { method: 'POST', cookie: a.cookie });
    await call(`/events/${eventId}/join`, { method: 'POST', cookie: a.cookie });
    assert.equal((await call(`/events/${eventId}`)).data.participants.length, 2);
  });

  test('waktu di masa lalu ditolak', async () => {
    const host = await newUser();
    const res = await call('/events', {
      method: 'POST',
      cookie: host.cookie,
      body: { title: 'Lama', sport: 'padel', venue: 'X', city: 'Y', starts_at: '2020-01-01T10:00:00Z', duration_min: 60, capacity: 4 },
    });
    assert.equal(res.status, 400);
  });

  test('hanya host yang bisa membatalkan; sesi batal tidak bisa diikuti', async () => {
    const host = await newUser();
    const other = await newUser();
    const eventId = await newEvent(host);
    assert.equal((await call(`/events/${eventId}/cancel`, { method: 'POST', cookie: other.cookie })).status, 403);
    assert.equal((await call(`/events/${eventId}/cancel`, { method: 'POST', cookie: host.cookie })).status, 200);
    assert.equal((await call(`/events/${eventId}/join`, { method: 'POST', cookie: other.cookie })).status, 400);
    const { events } = (await call('/events')).data;
    assert.ok(!events.some((e) => e.id === eventId), 'sesi batal tidak tampil di Jelajah');
  });

  test('sesi klub hanya bisa dibuat oleh anggota klub', async () => {
    const owner = await newUser();
    const outsider = await newUser();
    const club = await call('/clubs', {
      method: 'POST',
      cookie: owner.cookie,
      body: { name: 'Klub Uji', sport: 'badminton', city: 'Jakarta' },
    });
    const res = await call('/events', {
      method: 'POST',
      cookie: outsider.cookie,
      body: { title: 'Sesi klub', sport: 'badminton', venue: 'X', city: 'Y', starts_at: tomorrow(), duration_min: 60, capacity: 4, club_id: club.data.id },
    });
    assert.equal(res.status, 403);
  });
});

describe('pertandingan & peringkat', () => {
  test('mencatat skor ganda memperbarui rating dan papan peringkat', async () => {
    const host = await newUser();
    const [p2, p3, p4] = [await newUser(), await newUser(), await newUser()];
    const eventId = await newEvent(host, { sport: 'pickleball' });
    for (const p of [p2, p3, p4]) await call(`/events/${eventId}/join`, { method: 'POST', cookie: p.cookie });

    const res = await call(`/events/${eventId}/matches`, {
      method: 'POST',
      cookie: p2.cookie,
      body: { team_a: [host.id, p2.id], team_b: [p3.id, p4.id], score_a: 11, score_b: 7 },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));

    const { players } = (await call('/leaderboard?sport=pickleball')).data;
    const byId = Object.fromEntries(players.map((p) => [p.id, p]));
    assert.equal(byId[host.id].rating, 1016);
    assert.equal(byId[p2.id].wins, 1);
    assert.equal(byId[p3.id].rating, 984);
    assert.equal(byId[p4.id].games, 1);
  });

  test('pemain di luar sesi atau tim tidak seimbang ditolak', async () => {
    const host = await newUser();
    const p2 = await newUser();
    const outsider = await newUser();
    const eventId = await newEvent(host);
    await call(`/events/${eventId}/join`, { method: 'POST', cookie: p2.cookie });
    const post = (body, cookie = host.cookie) => call(`/events/${eventId}/matches`, { method: 'POST', cookie, body });

    assert.equal((await post({ team_a: [host.id], team_b: [outsider.id], score_a: 21, score_b: 10 })).status, 400);
    assert.equal((await post({ team_a: [host.id, p2.id], team_b: [p2.id], score_a: 21, score_b: 10 })).status, 400);
    assert.equal((await post({ team_a: [host.id], team_b: [p2.id], score_a: 21, score_b: 21 })).status, 400);
    assert.equal((await post({ team_a: [host.id], team_b: [p2.id], score_a: 21, score_b: 10 }, outsider.cookie)).status, 403);
  });
});
