/**
 * Favorites sync: the app saves its favorite routes online under a personal code,
 * so the MCP server (Claude, ChatGPT, Gemini) and the Alexa skill can answer for
 * the user's first favorite instead of a built-in default.
 *
 * Shared by the app (newCode, pushRoutes), the API function in api/favorites.js
 * (isValidCode, sanitizeRoutes, createRedisStore) and the assistants (fetchRoutes).
 * No dependencies: storage is Upstash Redis over its REST API.
 */

export const APP_URL = 'https://app.nexttram.morgado.tech';
const CODE_RE = /^[a-z0-9]{8,32}$/;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i, easy to read aloud
const MAX_ROUTES = 20;

export const isValidCode = (code) => typeof code === 'string' && CODE_RE.test(code);

/** A new random sync code like "k7qm-2xrd-p9vt" (stored without dashes). */
export function newCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return Array.from(random(12), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const formatCode = (code) => String(code).match(/.{1,4}/g)?.join('-') ?? '';
export const normalizeCode = (input) => String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v) => (Number.isFinite(v) ? v : undefined);

function cleanStop(s) {
  if (!s || typeof s !== 'object') return null;
  const name = str(s.name);
  if (!name) return null;
  const out = { name, query: str(s.query), lat: num(s.lat), lon: num(s.lon), hafasId: str(s.hafasId, 40), tid: str(s.tid, 80) };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

/** Keep only the fields a route needs, so the store never holds anything else. */
export function sanitizeRoutes(routes) {
  if (!Array.isArray(routes)) return [];
  return routes
    .slice(0, MAX_ROUTES)
    .map((r) => {
      if (!r || typeof r !== 'object') return null;
      const dest = cleanStop(r.dest);
      const stops = (Array.isArray(r.stops) ? r.stops : [])
        .slice(0, 2)
        .map((o) => ({ stop: cleanStop(o?.stop), walk: Math.max(0, Math.min(60, Number(o?.walk) || 0)) }))
        .filter((o) => o.stop);
      if (!dest || !stops.length) return null;
      const out = {
        id: str(r.id, 40) || 'route',
        label: str(r.label, 24) || '',
        city: r.city === 'berlin' ? 'berlin' : 'leipzig',
        stops,
        dest,
      };
      if (typeof r.modes === 'string') out.modes = str(r.modes, 20);
      if (Number.isFinite(Number(r.destWalk))) out.destWalk = Math.max(0, Math.min(60, Number(r.destWalk)));
      return out;
    })
    .filter(Boolean);
}

/**
 * Upstash Redis over REST. Vercel's Upstash integration sets KV_REST_API_URL/TOKEN
 * (older) or UPSTASH_REDIS_REST_URL/TOKEN (newer); either works.
 */
export function createRedisStore({ url, token, fetchImpl = fetch } = {}) {
  if (!url || !token) return null;
  const call = async (cmd) => {
    const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
    if (!res.ok) throw new Error(`Storage HTTP ${res.status}`);
    return (await res.json()).result;
  };
  const key = (code) => `favorites:${code}`;
  return {
    async get(code) {
      const raw = await call(['GET', key(code)]);
      return raw ? JSON.parse(raw) : null;
    },
    async set(code, value) {
      // Unused codes expire after a year; every save renews it.
      await call(['SET', key(code), JSON.stringify(value), 'EX', 60 * 60 * 24 * 365]);
    },
    // Plain keys, for the Alexa pairing (api/_alexa-link.js).
    getKey: (k) => call(['GET', k]),
    /** Sets k only if it doesn't exist yet; true when it was set. */
    async addKey(k, value, seconds) {
      return (await call(['SET', k, value, 'EX', seconds, 'NX'])) === 'OK';
    },
    async setKey(k, value, seconds) {
      await call(['SET', k, value, 'EX', seconds]);
    },
    takeKey: (k) => call(['GETDEL', k]),
    async delKey(k) {
      await call(['DEL', k]);
    },
  };
}

/** App side: save the favorites under the code. Errors are swallowed by the caller. */
export async function pushRoutes(code, routes, { base = '', fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${base}/api/favorites?code=${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routes: sanitizeRoutes(routes) }),
  });
  if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
  return res.json();
}

/** Assistant side: the user's favorites, first one first, or null when unavailable. */
export async function fetchRoutes(code, { base = APP_URL, fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  const c = normalizeCode(code);
  if (!isValidCode(c)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/favorites?code=${c}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const routes = sanitizeRoutes((await res.json()).routes);
    return routes.length ? routes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
