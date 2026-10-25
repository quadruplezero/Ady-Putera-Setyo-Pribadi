import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  city          TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clubs (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  sport       TEXT NOT NULL,
  city        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS club_members (
  club_id   INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (club_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY,
  club_id      INTEGER REFERENCES clubs(id) ON DELETE SET NULL,
  host_id      INTEGER NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  sport        TEXT NOT NULL,
  venue        TEXT NOT NULL,
  city         TEXT NOT NULL,
  starts_at    TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  capacity     INTEGER NOT NULL,
  fee          INTEGER NOT NULL DEFAULT 0,
  level        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled')),
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_starts_at ON events(starts_at);

CREATE TABLE IF NOT EXISTS event_participants (
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status    TEXT NOT NULL CHECK (status IN ('going', 'waitlist')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport   TEXT NOT NULL,
  rating  REAL NOT NULL DEFAULT 1000,
  games   INTEGER NOT NULL DEFAULT 0,
  wins    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, sport)
);

CREATE TABLE IF NOT EXISTS matches (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sport       TEXT NOT NULL,
  team_a      TEXT NOT NULL,
  team_b      TEXT NOT NULL,
  score_a     INTEGER NOT NULL,
  score_b     INTEGER NOT NULL,
  delta_a     REAL NOT NULL,
  delta_b     REAL NOT NULL,
  recorded_by INTEGER NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL
);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
