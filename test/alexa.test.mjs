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
