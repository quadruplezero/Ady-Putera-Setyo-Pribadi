import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { readJson, sendJson } from './http.js';
import { createApiHandler } from './api.js';
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
  const handleApi = createApiHandler(db);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Metode tidak diizinkan' });
      return serveStatic(req, res, url.pathname);
    }
    const reply = await handleApi({ method: req.method, url, headers: req.headers, readBody: () => readJson(req) });
    sendJson(res, reply.status, reply.data, reply.cookie ? { 'Set-Cookie': reply.cookie } : {});
  });

  return { server, db };
}
