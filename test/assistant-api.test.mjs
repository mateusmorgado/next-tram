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
      const [cmd, key, value, ...flags] = JSON.parse(opts.body);
      if (cmd === 'GET') return json({ result: db.get(key) ?? null });
      if (cmd === 'GETDEL') {
        const v = db.get(key) ?? null;
        db.delete(key);
        return json({ result: v });
      }
      if (cmd === 'DEL') return json({ result: Number(db.delete(key)) });
      if (flags.includes('NX') && db.has(key)) return json({ result: null });
      db.set(key, value);
      return json({ result: 'OK' });
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

// api/alexa.js: respond() is what the Web handler runs, minus the Request/Response wrapping.
async function alexaEndpoint() {
  const { respond } = await import('../api/alexa.js');
  return (o = {}) => respond({ method: 'POST', headers: {}, ...o }, o.deps);
}

function call(handler, { method = 'POST', query = {}, body, headers = {}, rawBody, deps } = {}) {
  const out = { status: 0, body: null, headers: {} };
  const res = {
    setHeader: (k, v) => (out.headers[k] = v),
    status: (s) => ((out.status = s), res),
    json: (b) => ((out.body = b), res),
    end: () => res,
  };
  return Promise.resolve(handler({ method, query, body, headers, rawBody }, res, deps)).then(() => out);
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

test('online Alexa endpoint refuses unsigned requests', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch());
  const alexa = await alexaEndpoint();
  const raw = JSON.stringify({ request: { type: 'LaunchRequest', locale: 'en-US', timestamp: new Date().toISOString() } });
  assert.equal((await alexa({ rawBody: raw })).status, 400);
  assert.equal((await alexa({ method: 'GET' })).status, 405);
});

test('online Alexa endpoint as Vercel runs it: Web Request in, Response out', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch());
  const { default: endpoint } = await import('../api/alexa.js');
  const url = 'https://app.nexttram.morgado.tech/api/alexa';
  const get = await endpoint.fetch(new Request(url));
  assert.equal(get.status, 405);
  const unsigned = await endpoint.fetch(new Request(url, { method: 'POST', body: JSON.stringify({ request: { type: 'LaunchRequest' } }) }));
  assert.equal(unsigned.status, 400);
  assert.equal(unsigned.headers.get('cache-control'), 'no-store');
});

test('online Alexa endpoint: a verified request with ?code= answers for that code', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch());
  const alexa = await alexaEndpoint();
  const verify = async ({ rawBody }) => JSON.parse(rawBody);
  const raw = JSON.stringify({ request: { type: 'LaunchRequest', locale: 'en-US' } });
  const out = await alexa({ query: { code: CODE }, rawBody: raw, deps: { verify } });
  assert.equal(out.status, 200);
  assert.match(out.body.response.outputSpeech.text, /Tram 7/);
});

test('"connect my stops": Alexa says a number, the app sends it, then Alexa uses that code', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch());
  const alexa = await alexaEndpoint();
  const { default: link } = await import('../api/alexa-link.js');
  const verify = async ({ rawBody }) => JSON.parse(rawBody);
  const ask = (request) =>
    alexa({ rawBody: JSON.stringify({ context: { System: { user: { userId: 'amzn1.ask.account.TEST' } } }, request: { locale: 'en-US', ...request } }), deps: { verify } });

  const linkReply = await ask({ type: 'IntentRequest', intent: { name: 'LinkIntent' } });
  const pin = linkReply.body.response.card.content.match(/number: (\d\d)\n/)[1];
  assert.match(linkReply.body.response.outputSpeech.ssml, new RegExp(`<say-as interpret-as="cardinal">${pin}</say-as>`));
  assert.ok(![...db.keys()].some((k) => k.includes('amzn1')), 'only a hash of the Alexa user ID is stored');

  assert.equal((await call(link, { body: { pin: pin === '99' ? '98' : '99', code: CODE } })).status, 404);
  assert.equal((await call(link, { body: { pin: ` ${pin} `, code: CODE } })).status, 200);
  assert.equal((await call(link, { body: { pin, code: CODE } })).status, 404, 'a number works once');

  const { store } = await import('../api/_store.js');
  const { createPairing } = await import('../api/_alexa-link.js');
  assert.equal(await createPairing(store).lookup('amzn1.ask.account.TEST'), CODE, 'this Alexa user now uses the code');
  assert.match((await ask({ type: 'LaunchRequest' })).body.response.outputSpeech.text, /Tram 7/);

  await ask({ type: 'IntentRequest', intent: { name: 'UnlinkIntent' } });
  assert.ok(![...db.keys()].some((k) => k.startsWith('alexa:user:')));
});

test('api/say answers in plain text for Siri, following the code, language and back', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch());
  const { default: say, pickLocale } = await import('../api/say.js');
  const base = 'https://app.nexttram.morgado.tech/api/say';
  const res = await say.fetch(new Request(`${base}?code=${CODE}`, { headers: { 'Accept-Language': 'en-GB,en;q=0.9' } }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/plain/);
  assert.match(await res.text(), /Tram 7/);
  const de = await say.fetch(new Request(`${base}?code=${CODE}&lang=de&back=1`));
  assert.match(await de.text(), /Tram 7|Bahn|Geh/);
  assert.equal((await say.fetch(new Request(base, { method: 'POST', body: 'x' }))).status, 405);
  assert.equal(pickLocale(undefined, 'de-DE,de;q=0.9'), 'de-DE');
  assert.equal(pickLocale('en', 'de-DE'), 'en-US');
});
