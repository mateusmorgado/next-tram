import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCode, isValidCode, formatCode, normalizeCode, sanitizeRoutes, createRedisStore, fetchRoutes } from '../lib/favorites-sync.js';
import { DEFAULT_ROUTES } from '../lib/stops.js';

test('sync codes are 12 readable characters and round-trip through formatting', () => {
  const code = newCode();
  assert.ok(isValidCode(code));
  assert.equal(code.length, 12);
  assert.doesNotMatch(code, /[01oli]/);
  assert.equal(normalizeCode(formatCode(code).toUpperCase()), code);
  assert.equal(isValidCode('short'), false);
  assert.equal(isValidCode('has spaces in it'), false);
});

test('sanitizeRoutes keeps route fields only and drops broken routes', () => {
  const dirty = [
    { ...DEFAULT_ROUTES[0], secret: 'x', stops: [{ stop: { name: 'A', evil: 1 }, walk: 999 }] },
    { id: 'no-dest', stops: [{ stop: { name: 'B' }, walk: 1 }] },
    'nonsense',
  ];
  const clean = sanitizeRoutes(dirty);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].secret, undefined);
  assert.deepEqual(clean[0].stops, [{ stop: { name: 'A' }, walk: 60 }]);
  assert.equal(clean[0].buffer, undefined);
  const timed = sanitizeRoutes([{ ...DEFAULT_ROUTES[0], buffer: 30, stops: [{ stop: { name: 'A' }, walk: 222 / 60 }] }]);
  assert.equal(Math.round(timed[0].stops[0].walk * 60), 222);
  assert.equal(timed[0].buffer, 30);
  assert.equal(timed[0].noRun, undefined);
  assert.equal(sanitizeRoutes([{ ...DEFAULT_ROUTES[0], noRun: true }])[0].noRun, true);
  assert.deepEqual(sanitizeRoutes(DEFAULT_ROUTES).map((r) => r.id), DEFAULT_ROUTES.map((r) => r.id));
});

function fakeRedis() {
  const db = new Map();
  const calls = [];
  const fetchImpl = async (url, { headers, body }) => {
    const [cmd, key, value] = JSON.parse(body);
    calls.push({ cmd, key, auth: headers.Authorization });
    if (cmd === 'SET') db.set(key, value);
    return { ok: true, json: async () => ({ result: cmd === 'GET' ? db.get(key) ?? null : 'OK' }) };
  };
  return { db, calls, fetchImpl };
}

test('Redis store saves and reads favorites by code', async () => {
  const { calls, fetchImpl } = fakeRedis();
  const store = createRedisStore({ url: 'https://redis.test', token: 't0k', fetchImpl });
  assert.equal(await store.get('abcdefgh2345'), null);
  await store.set('abcdefgh2345', { routes: [1] });
  assert.deepEqual(await store.get('abcdefgh2345'), { routes: [1] });
  assert.equal(calls[1].key, 'favorites:abcdefgh2345');
  assert.equal(calls[1].auth, 'Bearer t0k');
  assert.equal(createRedisStore({}), null);
});

test('API saves favorites and assistants read the first one back', async () => {
  const redis = fakeRedis();
  process.env.KV_REST_API_URL = 'https://redis.test';
  process.env.KV_REST_API_TOKEN = 't0k';
  const realFetch = globalThis.fetch;
  globalThis.fetch = redis.fetchImpl;
  const { default: handler } = await import(`../api/favorites.js?t=${Date.now()}`);
  globalThis.fetch = realFetch;

  const call = async (method, code, body) => {
    const out = { status: 0, body: null, headers: {} };
    const res = {
      setHeader: (k, v) => (out.headers[k] = v),
      status: (s) => ((out.status = s), res),
      json: (b) => ((out.body = b), res),
      end: () => res,
    };
    globalThis.fetch = redis.fetchImpl;
    try {
      await handler({ method, query: { code }, body }, res);
    } finally {
      globalThis.fetch = realFetch;
    }
    return out;
  };

  const code = 'k7qm2xrdp9vt';
  assert.equal((await call('GET', code)).status, 404);
  assert.equal((await call('PUT', 'bad')).status, 400);
  const mine = [{ ...DEFAULT_ROUTES[1], label: 'Mine' }, DEFAULT_ROUTES[0]];
  const put = await call('PUT', formatCode(code), { routes: mine });
  assert.equal(put.status, 200);
  const got = await call('GET', code);
  assert.equal(got.status, 200);
  assert.equal(got.body.routes[0].label, 'Mine');

  // The assistants' side, talking to the same handler.
  const viaApi = async (url) => {
    const r = await call('GET', new URL(url).searchParams.get('code'));
    return { ok: r.status === 200, json: async () => r.body };
  };
  const routes = await fetchRoutes(formatCode(code), { fetchImpl: viaApi });
  assert.equal(routes[0].label, 'Mine');
  assert.equal(await fetchRoutes('k7qm2xrdzzzz', { fetchImpl: viaApi }), null);
  assert.equal(await fetchRoutes('nope', { fetchImpl: viaApi }), null);
});
