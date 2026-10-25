export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Handler cukup mengembalikan data biasa; pakai Reply bila butuh status atau cookie khusus.
export class Reply {
  constructor(data, { status = 200, cookie } = {}) {
    this.data = data;
    this.status = status;
    this.cookie = cookie;
  }
}

export function createRouter() {
  const routes = [];
  const add = (method) => (path, handler) => {
    const keys = [];
    const pattern = path.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    });
    routes.push({ method, re: new RegExp(`^${pattern}$`), keys, handler });
  };

  return {
    get: add('GET'),
    post: add('POST'),
    patch: add('PATCH'),
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = route.re.exec(pathname);
        if (!m) continue;
        const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}

const MAX_BODY = 64 * 1024;

export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Data terlalu besar');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body && typeof body === 'object' ? body : {};
  } catch {
    throw new HttpError(400, 'Format JSON tidak valid');
  }
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
