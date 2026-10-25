import { tx } from './db.js';
import { HttpError } from './http.js';
import { hashPassword, verifyPassword } from './auth.js';
import { INITIAL_RATING, matchDeltas } from './rating.js';

export const SPORTS = {
  badminton: { label: 'Badminton', icon: '🏸' },
  padel: { label: 'Padel', icon: '🎾' },
  pickleball: { label: 'Pickleball', icon: '🏓' },
  tenis: { label: 'Tenis', icon: '🎾' },
  tenis_meja: { label: 'Tenis Meja', icon: '🏓' },
  futsal: { label: 'Futsal', icon: '⚽' },
  basket: { label: 'Basket', icon: '🏀' },
  voli: { label: 'Voli', icon: '🏐' },
  lari: { label: 'Lari', icon: '🏃' },
};

export const LEVELS = {
  semua: 'Semua level',
  pemula: 'Pemula',
  menengah: 'Menengah',
  mahir: 'Mahir',
};

const now = () => new Date().toISOString();

// ---------- validasi ----------

function text(value, field, { min = 1, max = 200, optional = false } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s && optional) return '';
  if (s.length < min) throw new HttpError(400, `${field} wajib diisi${min > 1 ? ` (minimal ${min} karakter)` : ''}`);
  if (s.length > max) throw new HttpError(400, `${field} maksimal ${max} karakter`);
  return s;
}

function int(value, field, { min, max }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} harus angka bulat antara ${min} dan ${max}`);
  }
  return n;
}

function sport(value) {
  if (!Object.hasOwn(SPORTS, value)) throw new HttpError(400, 'Olahraga tidak dikenal');
  return value;
}

function id(value, field = 'ID') {
  return int(value, field, { min: 1, max: Number.MAX_SAFE_INTEGER });
}

// ---------- akun ----------

export function register(db, body) {
  const name = text(body.name, 'Nama', { max: 60 });
  const email = text(body.email, 'Email', { max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Format email tidak valid');
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) throw new HttpError(400, 'Kata sandi minimal 8 karakter');
  const city = text(body.city, 'Kota', { max: 60, optional: true });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'Email sudah terdaftar');
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (name, email, password_hash, city, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, hashPassword(password), city, now());
  return Number(lastInsertRowid);
}

export function login(db, body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new HttpError(401, 'Email atau kata sandi salah');
  }
  return user.id;
}

export function updateProfile(db, userId, body) {
  const name = text(body.name, 'Nama', { max: 60 });
  const city = text(body.city, 'Kota', { max: 60, optional: true });
  const bio = text(body.bio, 'Bio', { max: 300, optional: true });
  db.prepare('UPDATE users SET name = ?, city = ?, bio = ? WHERE id = ?').run(name, city, bio, userId);
}

export function getUserProfile(db, userId) {
  const user = db.prepare('SELECT id, name, city, bio, created_at FROM users WHERE id = ?').get(id(userId));
  if (!user) throw new HttpError(404, 'Pemain tidak ditemukan');
  const ratings = db
    .prepare('SELECT sport, rating, games, wins FROM ratings WHERE user_id = ? AND games > 0 ORDER BY rating DESC')
    .all(user.id);
  const clubs = db
    .prepare(
      `SELECT c.id, c.name, c.sport, c.city, m.role
       FROM club_members m JOIN clubs c ON c.id = m.club_id
       WHERE m.user_id = ? ORDER BY c.name`,
    )
    .all(user.id);
  const matches = listMatches(
    db,
    `WHERE EXISTS (SELECT 1 FROM json_each(m.team_a) WHERE value = ?1)
        OR EXISTS (SELECT 1 FROM json_each(m.team_b) WHERE value = ?1)
     ORDER BY m.created_at DESC LIMIT 20`,
    [user.id],
  );
  return { ...user, ratings, clubs, matches };
}

// ---------- klub ----------

export function createClub(db, userId, body) {
  const name = text(body.name, 'Nama klub', { min: 3, max: 80 });
  const s = sport(body.sport);
  const city = text(body.city, 'Kota', { max: 60 });
  const description = text(body.description, 'Deskripsi', { max: 1000, optional: true });
  return tx(db, () => {
    const t = now();
    const { lastInsertRowid } = db
      .prepare('INSERT INTO clubs (name, sport, city, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, s, city, description, userId, t);
    const clubId = Number(lastInsertRowid);
    db.prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(
      clubId,
      userId,
      t,
    );
    return clubId;
  });
}

export function listClubs(db, viewerId, query = {}) {
  const where = [];
  const params = [viewerId ?? 0];
  if (query.sport) {
    where.push('c.sport = ?');
    params.push(query.sport);
  }
  if (query.city) {
    where.push('c.city LIKE ?');
    params.push(`%${query.city}%`);
  }
  if (query.q) {
    where.push('(c.name LIKE ? OR c.description LIKE ?)');
    params.push(`%${query.q}%`, `%${query.q}%`);
  }
  return db
    .prepare(
      `SELECT c.*,
         (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id) AS member_count,
         (SELECT role FROM club_members m WHERE m.club_id = c.id AND m.user_id = ?) AS my_role
       FROM clubs c
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY member_count DESC, c.name LIMIT 100`,
    )
    .all(...params);
}

export function getClub(db, clubId, viewerId) {
  const club = db
    .prepare(
      `SELECT c.*, u.name AS owner_name,
         (SELECT role FROM club_members m WHERE m.club_id = c.id AND m.user_id = ?) AS my_role
       FROM clubs c JOIN users u ON u.id = c.owner_id WHERE c.id = ?`,
    )
    .get(viewerId ?? 0, id(clubId));
  if (!club) throw new HttpError(404, 'Klub tidak ditemukan');
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.city, m.role, r.rating
       FROM club_members m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN ratings r ON r.user_id = u.id AND r.sport = ? AND r.games > 0
       WHERE m.club_id = ?
       ORDER BY m.role = 'owner' DESC, r.rating DESC NULLS LAST, u.name`,
    )
    .all(club.sport, club.id);
  const events = listEvents(db, viewerId, { club_id: club.id });
  return { ...club, members, events };
}

export function joinClub(db, clubId, userId) {
  const club = db.prepare('SELECT id FROM clubs WHERE id = ?').get(id(clubId));
  if (!club) throw new HttpError(404, 'Klub tidak ditemukan');
  db.prepare("INSERT OR IGNORE INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(
    club.id,
    userId,
    now(),
  );
}

export function leaveClub(db, clubId, userId) {
  const member = db.prepare('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?').get(id(clubId), userId);
  if (!member) return;
  if (member.role === 'owner') throw new HttpError(400, 'Pemilik klub tidak bisa keluar dari klubnya sendiri');
  db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(clubId, userId);
}

// ---------- sesi main bareng ----------

const EVENT_SELECT = `
  SELECT e.*, u.name AS host_name, c.name AS club_name,
    (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.status = 'going') AS going_count,
    (SELECT COUNT(*) FROM event_participants p WHERE p.event_id = e.id AND p.status = 'waitlist') AS waitlist_count,
    (SELECT status FROM event_participants p WHERE p.event_id = e.id AND p.user_id = ?) AS my_status
  FROM events e
  JOIN users u ON u.id = e.host_id
  LEFT JOIN clubs c ON c.id = e.club_id`;

export function createEvent(db, userId, body) {
  const title = text(body.title, 'Judul', { min: 3, max: 100 });
  const s = sport(body.sport);
  const venue = text(body.venue, 'Lokasi', { max: 120 });
  const city = text(body.city, 'Kota', { max: 60 });
  const startsAt = new Date(body.starts_at);
  if (Number.isNaN(startsAt.getTime())) throw new HttpError(400, 'Waktu mulai tidak valid');
  if (startsAt.getTime() < Date.now()) throw new HttpError(400, 'Waktu mulai harus di masa depan');
  const duration = int(body.duration_min, 'Durasi (menit)', { min: 15, max: 720 });
  const capacity = int(body.capacity, 'Jumlah pemain', { min: 2, max: 200 });
  const fee = int(body.fee ?? 0, 'Biaya', { min: 0, max: 10_000_000 });
  const level = Object.hasOwn(LEVELS, body.level) ? body.level : 'semua';
  const description = text(body.description, 'Deskripsi', { max: 2000, optional: true });

  let clubId = null;
  if (body.club_id) {
    clubId = id(body.club_id, 'Klub');
    const member = db.prepare('SELECT 1 FROM club_members WHERE club_id = ? AND user_id = ?').get(clubId, userId);
    if (!member) throw new HttpError(403, 'Kamu harus menjadi anggota klub untuk membuat sesi atas nama klub');
  }

  return tx(db, () => {
    const t = now();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO events (club_id, host_id, title, sport, venue, city, starts_at, duration_min,
                             capacity, fee, level, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(clubId, userId, title, s, venue, city, startsAt.toISOString(), duration, capacity, fee, level, description, t);
    const eventId = Number(lastInsertRowid);
    if (body.host_plays !== false) {
      db.prepare("INSERT INTO event_participants (event_id, user_id, status, joined_at) VALUES (?, ?, 'going', ?)").run(
        eventId,
        userId,
        t,
      );
    }
    return eventId;
  });
}

export function listEvents(db, viewerId, query = {}) {
  const where = [];
  const params = [viewerId ?? 0];
  if (query.when === 'past') {
    where.push('e.starts_at < ?');
  } else {
    where.push("e.starts_at >= ? AND e.status = 'open'");
  }
  params.push(now());
  if (query.sport) {
    where.push('e.sport = ?');
    params.push(query.sport);
  }
  if (query.city) {
    where.push('e.city LIKE ?');
    params.push(`%${query.city}%`);
  }
  if (query.q) {
    where.push('(e.title LIKE ? OR e.venue LIKE ?)');
    params.push(`%${query.q}%`, `%${query.q}%`);
  }
  if (query.club_id) {
    where.push('e.club_id = ?');
    params.push(Number(query.club_id));
  }
  const order = query.when === 'past' ? 'DESC' : 'ASC';
  return db.prepare(`${EVENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.starts_at ${order} LIMIT 100`).all(...params);
}

export function myEvents(db, userId) {
  const mine = `(e.host_id = ? OR EXISTS (SELECT 1 FROM event_participants p WHERE p.event_id = e.id AND p.user_id = ?))`;
  const params = [userId, userId, userId, now()];
  return {
    upcoming: db
      .prepare(`${EVENT_SELECT} WHERE ${mine} AND e.starts_at >= ? AND e.status = 'open' ORDER BY e.starts_at ASC LIMIT 50`)
      .all(...params),
    past: db
      .prepare(`${EVENT_SELECT} WHERE ${mine} AND e.starts_at < ? ORDER BY e.starts_at DESC LIMIT 20`)
      .all(...params),
  };
}

function loadEvent(db, eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id(eventId));
  if (!event) throw new HttpError(404, 'Sesi tidak ditemukan');
  return event;
}

export function getEvent(db, eventId, viewerId) {
  const event = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(viewerId ?? 0, id(eventId));
  if (!event) throw new HttpError(404, 'Sesi tidak ditemukan');
  const people = db
    .prepare(
      `SELECT u.id, u.name, p.status, p.joined_at, r.rating, r.games
       FROM event_participants p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN ratings r ON r.user_id = u.id AND r.sport = ?
       WHERE p.event_id = ?
       ORDER BY p.joined_at, p.rowid`,
    )
    .all(event.sport, event.id);
  return {
    ...event,
    participants: people.filter((p) => p.status === 'going'),
    waitlist: people.filter((p) => p.status === 'waitlist'),
    matches: listMatches(db, 'WHERE m.event_id = ? ORDER BY m.created_at DESC', [event.id]),
  };
}

export function joinEvent(db, eventId, userId) {
  return tx(db, () => {
    const event = loadEvent(db, eventId);
    if (event.status !== 'open') throw new HttpError(400, 'Sesi ini sudah dibatalkan');
    if (event.starts_at < now()) throw new HttpError(400, 'Sesi ini sudah dimulai atau lewat');
    const existing = db
      .prepare('SELECT status FROM event_participants WHERE event_id = ? AND user_id = ?')
      .get(event.id, userId);
    if (existing) return existing.status;
    const { n } = db
      .prepare("SELECT COUNT(*) AS n FROM event_participants WHERE event_id = ? AND status = 'going'")
      .get(event.id);
    const status = n < event.capacity ? 'going' : 'waitlist';
    db.prepare('INSERT INTO event_participants (event_id, user_id, status, joined_at) VALUES (?, ?, ?, ?)').run(
      event.id,
      userId,
      status,
      now(),
    );
    return status;
  });
}

export function leaveEvent(db, eventId, userId) {
  return tx(db, () => {
    const event = loadEvent(db, eventId);
    const existing = db
      .prepare('SELECT status FROM event_participants WHERE event_id = ? AND user_id = ?')
      .get(event.id, userId);
    if (!existing) return null;
    db.prepare('DELETE FROM event_participants WHERE event_id = ? AND user_id = ?').run(event.id, userId);
    if (existing.status !== 'going') return null;
    // Kursi kosong: naikkan pemain pertama di daftar tunggu.
    const next = db
      .prepare(
        `SELECT user_id FROM event_participants
         WHERE event_id = ? AND status = 'waitlist'
         ORDER BY joined_at, rowid LIMIT 1`,
      )
      .get(event.id);
    if (next) {
      db.prepare("UPDATE event_participants SET status = 'going' WHERE event_id = ? AND user_id = ?").run(
        event.id,
        next.user_id,
      );
      return next.user_id;
    }
    return null;
  });
}

export function cancelEvent(db, eventId, userId) {
  const event = loadEvent(db, eventId);
  if (event.host_id !== userId) throw new HttpError(403, 'Hanya host yang bisa membatalkan sesi');
  db.prepare("UPDATE events SET status = 'cancelled' WHERE id = ?").run(event.id);
}

// ---------- pertandingan & rating ----------

function listMatches(db, clause, params) {
  const rows = db
    .prepare(
      `SELECT m.*, e.title AS event_title FROM matches m JOIN events e ON e.id = m.event_id ${clause}`,
    )
    .all(...params);
  if (!rows.length) return [];
  const ids = new Set();
  for (const r of rows) {
    r.team_a = JSON.parse(r.team_a);
    r.team_b = JSON.parse(r.team_b);
    [...r.team_a, ...r.team_b].forEach((x) => ids.add(x));
  }
  const names = new Map(
    db
      .prepare(`SELECT id, name FROM users WHERE id IN (${[...ids].map(() => '?').join(',')})`)
      .all(...ids)
      .map((u) => [u.id, u.name]),
  );
  const player = (pid) => ({ id: pid, name: names.get(pid) ?? 'Pemain' });
  return rows.map((r) => ({ ...r, team_a: r.team_a.map(player), team_b: r.team_b.map(player) }));
}

function teamIds(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new HttpError(400, `${label} harus berisi 1 (tunggal) atau 2 (ganda) pemain`);
  }
  return value.map((v) => id(v, 'Pemain'));
}

export function recordMatch(db, eventId, userId, body) {
  const teamA = teamIds(body.team_a, 'Tim A');
  const teamB = teamIds(body.team_b, 'Tim B');
  if (teamA.length !== teamB.length) throw new HttpError(400, 'Jumlah pemain kedua tim harus sama');
  const all = [...teamA, ...teamB];
  if (new Set(all).size !== all.length) throw new HttpError(400, 'Satu pemain tidak boleh muncul dua kali');
  const scoreA = int(body.score_a, 'Skor Tim A', { min: 0, max: 99 });
  const scoreB = int(body.score_b, 'Skor Tim B', { min: 0, max: 99 });
  if (scoreA === scoreB) throw new HttpError(400, 'Skor tidak boleh seri');

  return tx(db, () => {
    const event = loadEvent(db, eventId);
    if (event.status !== 'open') throw new HttpError(400, 'Sesi ini sudah dibatalkan');
    const going = new Set(
      db
        .prepare("SELECT user_id FROM event_participants WHERE event_id = ? AND status = 'going'")
        .all(event.id)
        .map((r) => r.user_id),
    );
    if (event.host_id !== userId && !going.has(userId)) {
      throw new HttpError(403, 'Hanya host atau peserta yang bisa mencatat skor');
    }
    if (!all.every((p) => going.has(p))) throw new HttpError(400, 'Semua pemain harus peserta sesi ini');

    const ensure = db.prepare('INSERT OR IGNORE INTO ratings (user_id, sport, rating) VALUES (?, ?, ?)');
    const read = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND sport = ?');
    const rating = (pid) => {
      ensure.run(pid, event.sport, INITIAL_RATING);
      return read.get(pid, event.sport).rating;
    };
    const { deltaA, deltaB } = matchDeltas(teamA.map(rating), teamB.map(rating), scoreA, scoreB);
    const update = db.prepare(
      'UPDATE ratings SET rating = ROUND(rating + ?, 1), games = games + 1, wins = wins + ? WHERE user_id = ? AND sport = ?',
    );
    const aWon = scoreA > scoreB ? 1 : 0;
    teamA.forEach((pid) => update.run(deltaA, aWon, pid, event.sport));
    teamB.forEach((pid) => update.run(deltaB, 1 - aWon, pid, event.sport));

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO matches (event_id, sport, team_a, team_b, score_a, score_b, delta_a, delta_b, recorded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(event.id, event.sport, JSON.stringify(teamA), JSON.stringify(teamB), scoreA, scoreB, deltaA, deltaB, userId, now());
    return Number(lastInsertRowid);
  });
}

export function leaderboard(db, query = {}) {
  const s = sport(query.sport || 'badminton');
  const params = [s];
  let cityClause = '';
  if (query.city) {
    cityClause = 'AND u.city LIKE ?';
    params.push(`%${query.city}%`);
  }
  return db
    .prepare(
      `SELECT u.id, u.name, u.city, r.rating, r.games, r.wins
       FROM ratings r JOIN users u ON u.id = r.user_id
       WHERE r.sport = ? AND r.games > 0 ${cityClause}
       ORDER BY r.rating DESC, r.wins DESC LIMIT 100`,
    )
    .all(...params);
}
