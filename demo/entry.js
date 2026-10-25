// Menjalankan seluruh backend MainBareng di browser: rute API yang sama dengan
// server, database SQLite (sql.js) yang disimpan di localStorage, dan fetch('/api/…')
// yang dialihkan ke penangan API lokal.
import { configure } from './sqlite-shim.js';
import { openDb } from '../src/db.js';
import { seed, DEMO_PASSWORD } from '../src/seed.js';
import { createApiHandler } from '../src/api.js';
import { HttpError } from '../src/http.js';

const DB_KEY = 'mainbareng-demo-db-v1';
const SID_KEY = 'mainbareng-demo-sid';

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* penyimpanan diblokir: demo tetap jalan tanpa menyimpan */
    }
  },
};

function fromBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function openDemoDb(SQL) {
  const saved = storage.get(DB_KEY);
  if (saved) {
    try {
      configure(SQL, fromBase64(saved));
      const db = openDb(':memory:');
      db.prepare('SELECT 1 FROM users LIMIT 1').get();
      return { db, fresh: false };
    } catch {
      storage.set(SID_KEY, null);
    }
  }
  configure(SQL, null);
  const db = openDb(':memory:');
  seed(db);
  return { db, fresh: true };
}

async function start() {
  const SQL = await window.initSqlJs({ wasmBinary: fromBase64(window.__SQL_WASM__) });
  const { db, fresh } = openDemoDb(SQL);
  const handle = createApiHandler(db);
  let sid = storage.get(SID_KEY);

  const persist = () => storage.set(DB_KEY, toBase64(db.export()));
  const applyCookie = (cookie) => {
    const m = /^sid=([^;]*)/.exec(cookie);
    if (!m) return;
    sid = !m[1] || /Max-Age=0/.test(cookie) ? null : m[1];
    storage.set(SID_KEY, sid);
  };
  const request = (method, url, headers, readBody) =>
    handle({ method, url, headers: { cookie: sid ? `sid=${sid}` : '', ...headers }, readBody });

  if (fresh) {
    // Kunjungan pertama langsung masuk sebagai akun demo supaya semua fitur bisa dicoba.
    const reply = await request('POST', new URL('http://demo/api/auth/login'), { 'content-type': 'application/json' }, async () => ({
      email: 'ady@demo.id',
      password: DEMO_PASSWORD,
    }));
    applyCookie(reply.cookie ?? '');
    persist();
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const headers = {};
    for (const [k, v] of Object.entries(init.headers || {})) headers[k.toLowerCase()] = v;
    const reply = await request(method, url, headers, async () => {
      try {
        return JSON.parse(init.body || '{}');
      } catch {
        throw new HttpError(400, 'Format JSON tidak valid');
      }
    });
    if (reply.cookie) applyCookie(reply.cookie);
    if (method !== 'GET' && reply.status < 400) persist();
    return new Response(JSON.stringify(reply.data), {
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  document.getElementById('demo-reset').addEventListener('click', () => {
    storage.set(DB_KEY, null);
    storage.set(SID_KEY, null);
    location.hash = '#/';
    location.reload();
  });

  await import('../public/app.js');
}

start().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML =
    '<div class="empty"><p>Demo gagal dimuat di browser ini. Coba muat ulang halaman atau buka di browser lain.</p></div>';
});
