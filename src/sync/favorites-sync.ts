/**
 * Favorites sync: the app saves its favorite routes online under a personal code,
 * so the MCP server (Claude, ChatGPT, Gemini) and the Alexa skill can answer for
 * the user's first favorite instead of a built-in default.
 *
 * Shared by the app (newCode, pushRoutes), the API function in api/favorites.js
 * (isValidCode, sanitizeRoutes, createRedisStore) and the assistants (fetchRoutes).
 * No dependencies: storage is Upstash Redis over its REST API.
 */

import type { Route, Stop } from '../transit/types.ts';

export const APP_URL = 'https://app.nexttram.morgado.tech';
const CODE_RE = /^[a-z0-9]{8,32}$/;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i, easy to read aloud
const MAX_ROUTES = 20;

export const isValidCode = (code: unknown): code is string => typeof code === 'string' && CODE_RE.test(code);

/** A new random sync code like "k7qm-2xrd-p9vt" (stored without dashes). */
export function newCode(random: (n: number) => ArrayLike<number> = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(random(12), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export const formatCode = (code: unknown): string => String(code).match(/.{1,4}/g)?.join('-') ?? '';
export const normalizeCode = (input: unknown): string => String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const str = (v: unknown, max = 120): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Untrusted JSON from the client or the store. */
type Raw = Record<string, any>;

function cleanStop(s: Raw | null | undefined): Stop | null {
  if (!s || typeof s !== 'object') return null;
  const name = str(s.name);
  if (!name) return null;
  const out: Raw = { name, query: str(s.query), lat: num(s.lat), lon: num(s.lon), hafasId: str(s.hafasId, 40), tid: str(s.tid, 80) };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as Stop;
}

/** Walk minutes, 0–60, to the second (a stopwatch time like 3:42 is 3.7). */
const walkMin = (v: unknown): number => Math.max(0, Math.min(60, Math.round((Number(v) || 0) * 60) / 60));

/** Keep only the fields a route needs, so the store never holds anything else. */
export function sanitizeRoutes(routes: unknown): Route[] {
  if (!Array.isArray(routes)) return [];
  return routes
    .slice(0, MAX_ROUTES)
    .map((r: Raw): Route | null => {
      if (!r || typeof r !== 'object') return null;
      const dest = cleanStop(r.dest);
      const stops = (Array.isArray(r.stops) ? r.stops : [])
        .slice(0, 2)
        .map((o: Raw) => ({ stop: cleanStop(o?.stop), walk: walkMin(o?.walk) }))
        .filter((o): o is { stop: Stop; walk: number } => o.stop !== null);
      if (!dest || !stops.length) return null;
      const out: Route = {
        id: str(r.id, 40) || 'route',
        label: str(r.label, 24) || '',
        city: r.city === 'berlin' ? 'berlin' : 'leipzig',
        stops,
        dest,
      };
      if (typeof r.modes === 'string') out.modes = str(r.modes, 20) as Route['modes'];
      if (Number.isFinite(Number(r.destWalk))) out.destWalk = walkMin(r.destWalk);
      if (r.noRun === true) out.noRun = true;
      if (Number(r.buffer) > 0) out.buffer = Math.max(0, Math.min(120, Math.round(Number(r.buffer))));
      return out;
    })
    .filter((r): r is Route => r !== null);
}

/**
 * Upstash Redis over REST. Vercel's Upstash integration sets KV_REST_API_URL/TOKEN
 * (older) or UPSTASH_REDIS_REST_URL/TOKEN (newer); either works.
 */
export interface RedisStoreOptions {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export function createRedisStore({ url, token, fetchImpl = fetch }: RedisStoreOptions = {}) {
  if (!url || !token) return null;
  const call = async (cmd: (string | number)[]): Promise<any> => {
    const res = await fetchImpl(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
    if (!res.ok) throw new Error(`Storage HTTP ${res.status}`);
    return (await res.json()).result;
  };
  const key = (code: string) => `favorites:${code}`;
  return {
    async get(code: string): Promise<{ routes?: unknown } | null> {
      const raw = await call(['GET', key(code)]);
      return raw ? JSON.parse(raw) : null;
    },
    async set(code: string, value: unknown): Promise<void> {
      // Unused codes expire after a year; every save renews it.
      await call(['SET', key(code), JSON.stringify(value), 'EX', 60 * 60 * 24 * 365]);
    },
    // Plain keys, for the Alexa pairing (api/_alexa-link.js).
    getKey: (k: string): Promise<string | null> => call(['GET', k]),
    /** Sets k only if it doesn't exist yet; true when it was set. */
    async addKey(k: string, value: string, seconds: number): Promise<boolean> {
      return (await call(['SET', k, value, 'EX', seconds, 'NX'])) === 'OK';
    },
    async setKey(k: string, value: string, seconds: number): Promise<void> {
      await call(['SET', k, value, 'EX', seconds]);
    },
    takeKey: (k: string): Promise<string | null> => call(['GETDEL', k]),
    async delKey(k: string): Promise<void> {
      await call(['DEL', k]);
    },
    // Counters for lib/call-stats.js.
    async incrKey(k: string, seconds?: number): Promise<void> {
      await call(['INCR', k]);
      if (seconds) await call(['EXPIRE', k, seconds]);
    },
    mgetKeys: (keys: string[]): Promise<(string | null)[]> => call(['MGET', ...keys]),
  };
}

export type RedisStore = NonNullable<ReturnType<typeof createRedisStore>>;

/** App side: save the favorites under the code. Errors are swallowed by the caller. */
export async function pushRoutes(code: string, routes: Route[], { base = '', fetchImpl = fetch }: { base?: string; fetchImpl?: typeof fetch } = {}): Promise<unknown> {
  const res = await fetchImpl(`${base}/api/favorites?code=${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routes: sanitizeRoutes(routes) }),
  });
  if (!res.ok) throw new Error(`Sync HTTP ${res.status}`);
  return res.json();
}

/** Assistant side: the user's favorites, first one first, or null when unavailable. */
export async function fetchRoutes(
  code: unknown,
  { base = APP_URL, fetchImpl = fetch, timeoutMs = 4000 }: { base?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<Route[] | null> {
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
