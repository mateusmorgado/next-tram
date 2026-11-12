import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../alexa-skill.mjs';

test('Alexa answers a launch request in German with live data', async (t) => {
  const now = Date.now();
  const iso = (m) => new Date(now + m * 60000).toISOString();
  t.mock.method(globalThis, 'fetch', async (url) => {
    const u = new URL(url);
    const json = (b) => ({ ok: true, status: 200, json: async () => b });
    if (u.pathname.endsWith('/geocode')) {
      const text = u.searchParams.get('text');
      const name = text.includes('Edlich') ? 'Edlichstraße' : text.includes('Torgauer') ? 'Torgauer Platz' : 'Hauptbahnhof';
      return json([{ type: 'STOP', id: `id-${name}`, name, lat: 51.34, lon: 12.4 }]);
    }
    const from = u.searchParams.get('fromPlace');
    const stop = from.includes('Edlich') ? 'Edlichstraße' : 'Torgauer Platz';
    return json({
      itineraries: [
        { endTime: iso(20), legs: [{ mode: 'TRAM', from: { name: stop }, startTime: iso(stop === 'Edlichstraße' ? 8 : 12), endTime: iso(20), routeShortName: stop === 'Edlichstraße' ? '7' : '3', headsign: 'Zentrum', realTime: true }] },
      ],
    });
  });
  const res = await handler({ request: { type: 'LaunchRequest', locale: 'de-DE' } });
  assert.match(res.response.outputSpeech.text, /^Geh zur Haltestelle Edlichstraße\. Tram 7 Richtung Zentrum fährt in [78] Minuten ab/);
  assert.equal(res.response.shouldEndSession, true);
});

test('Alexa says sorry when the APIs are down', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 502, json: async () => ({}) }));
  const res = await handler({ request: { type: 'IntentRequest', locale: 'en-US', intent: { name: 'NextTramIntent', slots: {} } } });
  assert.match(res.response.outputSpeech.text, /could not get live departures/);
});

test('Help and fallback keep listening with a reprompt; Stop ends', async () => {
  const intent = (name, locale = 'en-US') => handler({ request: { type: 'IntentRequest', locale, intent: { name, slots: {} } } }, null, {});
  const help = await intent('AMAZON.HelpIntent');
  assert.equal(help.response.shouldEndSession, false);
  assert.ok(help.response.reprompt.outputSpeech.text);
  const fb = await intent('AMAZON.FallbackIntent', 'de-DE');
  assert.equal(fb.response.shouldEndSession, false);
  assert.match(fb.response.outputSpeech.text, /nächste Bahn/);
  assert.equal((await intent('AMAZON.StopIntent')).response.shouldEndSession, true);
  assert.deepEqual((await handler({ request: { type: 'SessionEndedRequest' } }, null, {})).response, {});
});

test('"connect my stops" without online storage says it is not available', async () => {
  const res = await handler({ request: { type: 'IntentRequest', locale: 'en-US', intent: { name: 'LinkIntent' } } }, null, {});
  assert.match(res.response.outputSpeech.text, /not available/);
});
