import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROUTES } from '../lib/stops.js';

// The online MCP and Alexa endpoints read favorites straight from storage under the code.
const CODE = 'k7qm2xrdp9vt';
const mine = { ...DEFAULT_ROUTES[0], id: 'mine', label: 'Work' };
const db = new Map([[`favorites:${CODE}`, JSON.stringify({ routes: [mine] })]]);
process.env.KV_REST_API_URL = 'https://redis.test';
process.env.KV_REST_API_TOKEN = 't0k';

function fakeFetch() {
  const now = Date.now();
  const iso = (m) => new Date(now + m * 60000).toISOString();
  return async (url, opts = {}) => {
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (String(url).startsWith('https://redis.test')) {
      const [cmd, key] = JSON.parse(opts.body);
      return json({ result: cmd === 'GET' ? db.get(key) ?? null : 'OK' });
    }
    const u = new URL(url);
    if (u.pathname.endsWith('/geocode')) {
      const text = u.searchParams.get('text');
      return json([{ type: 'STOP', id: `id-${text}`, name: text, lat: 51.34, lon: 12.4 }]);
    }
    return json({
      itineraries: [{ endTime: iso(20), legs: [{ mode: 'TRAM', from: { name: 'A' }, startTime: iso(9), endTime: iso(20), routeShortName: '7', headsign: 'Zentrum', realTime: true }] }],
    });
  };
}

function call(handler, { method = 'POST', query = {}, body } = {}) {
  const out = { status: 0, body: null, headers: {} };
  const res = {
    setHeader: (k, v) => (out.headers[k] = v),
    status: (s) => ((out.status = s), res),
    json: (b) => ((out.body = b), res),
    end: () => res,
  };
  return Promise.resolve(handler({ method, query, body }, res)).then(() => out);
}

test('online MCP server answers initialize, lists tools and follows the code', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch());
  const { default: mcp } = await import('../api/mcp.js');

  const init = await call(mcp, { body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } } });
  assert.equal(init.status, 200);
  assert.equal(init.body.result.serverInfo.name, 'next-tram');

  assert.equal((await call(mcp, { body: { jsonrpc: '2.0', method: 'notifications/initialized' } })).status, 202);
  assert.equal((await call(mcp, { method: 'GET' })).status, 405);

  const list = await call(mcp, { body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } });
  assert.ok(list.body.result.tools.some((x) => x.name === 'get_next_tram'));

  const routes = await call(mcp, { query: { code: CODE }, body: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_routes', arguments: {} } } });
  assert.match(routes.body.result.content[0].text, /^- mine \(Work\)/);

  const noCode = await call(mcp, { body: { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_routes', arguments: {} } } });
  assert.match(noCode.body.result.content[0].text, new RegExp(`^- ${DEFAULT_ROUTES[0].id}`));

  const next = await call(mcp, { query: { code: CODE }, body: [{ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_next_tram', arguments: {} } }] });
  assert.ok(Array.isArray(next.body));
  assert.match(next.body[0].result.content[0].text, /Tram 7/);
});

test('online Alexa endpoint answers a launch request', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch());
  const { default: alexa } = await import('../api/alexa.js');
  const out = await call(alexa, { query: { code: CODE }, body: { request: { type: 'LaunchRequest', locale: 'en-US' } } });
  assert.equal(out.status, 200);
  assert.match(out.body.response.outputSpeech.text, /Tram 7/);
  assert.equal((await call(alexa, { method: 'GET' })).status, 405);
});
