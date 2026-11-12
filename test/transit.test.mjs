import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStopName,
  expandStreetName,
  shortStopName,
  sameStopName,
  parseMotisPlan,
  parseHafasJourneys,
  planTrips,
  leaveAdvice,
  routeOptions,
  fetchRoute,
  createTransitClient,
  describePlan,
  isCatchable,
  formatWalk,
} from '../lib/transit.js';
import { DEFAULT_ROUTES } from '../lib/stops.js';

const T0 = Date.parse('2026-11-11T16:00:00Z'); // 17:00 in Leipzig
const iso = (min) => new Date(T0 + min * 60000).toISOString();

test('street name normalization', () => {
  assert.equal(normalizeStopName('Leipzig, Edlichstr.'), normalizeStopName('Edlichstraße'));
  assert.equal(normalizeStopName('edlichstrasse'), 'edlichstr');
  assert.equal(expandStreetName('edlichstr.'), 'edlichstraße');
  assert.equal(expandStreetName('Edlichstr'), 'Edlichstraße');
  assert.equal(expandStreetName('Torgauer Platz'), 'Torgauer Platz');
  assert.equal(shortStopName('Leipzig, Edlichstraße'), 'Edlichstraße');
  assert.equal(shortStopName('U Eberswalder Str. (Berlin)'), 'U Eberswalder Str.');
  assert.ok(sameStopName('Leipzig, Torgauer Platz', 'Torgauer Platz'));
  assert.ok(!sameStopName('Torgauer Platz', 'Edlichstraße'));
});

const motisLeg = (over) => ({
  mode: 'TRAM',
  from: { name: 'Edlichstraße', stopId: 'de-DELFI_de:14713:11508:1:1' },
  to: { name: 'Hauptbahnhof' },
  startTime: iso(5),
  endTime: iso(15),
  scheduledStartTime: iso(4),
  realTime: true,
  routeShortName: '7',
  headsign: 'Böhlitz-Ehrenberg',
  tripId: 'trip-7a',
  ...over,
});

test('parseMotisPlan keeps only legs boarding at the chosen stop', () => {
  const data = {
    itineraries: [
      { endTime: iso(16), legs: [{ mode: 'WALK' }, motisLeg({})] },
      // Walks to a different stop first: must be dropped.
      { endTime: iso(17), legs: [{ mode: 'WALK' }, motisLeg({ from: { name: 'Torgauer Platz' }, tripId: 'trip-3' })] },
      // S-Bahn when the filter is tram_bus: dropped.
      { endTime: iso(18), legs: [motisLeg({ mode: 'SUBURBAN', routeShortName: 'S3', tripId: 's' })] },
    ],
  };
  const list = parseMotisPlan(data, { from: { name: 'Edlichstraße', tid: 'de-DELFI_de:14713:11508' }, filter: 'tram_bus' });
  assert.equal(list.length, 1);
  assert.equal(list[0].lineName, 'Tram 7');
  assert.equal(list[0].line, '7');
  assert.equal(list[0].delayMin, 1);
  assert.equal(list[0].arrMs, Date.parse(iso(16)));
});

test('parseHafasJourneys maps DB "STR 3" and checks the origin', () => {
  const data = {
    journeys: [
      {
        legs: [
          {
            origin: { id: '123', name: 'Torgauer Platz, Leipzig' },
            destination: { name: 'Hauptbahnhof' },
            departure: iso(7),
            plannedDeparture: iso(7),
            departureDelay: 0,
            arrival: iso(19),
            line: { name: 'STR 3', product: 'tram' },
            direction: 'Knautkleeberg',
            tripId: 'x',
          },
        ],
      },
      {
        legs: [
          { walking: true, origin: { name: 'Torgauer Platz' }, arrival: iso(6) },
          { origin: { id: '999', name: 'Eisenbahnstraße' }, departure: iso(8), line: { name: 'Bus 70', product: 'bus' }, arrival: iso(20) },
        ],
      },
    ],
  };
  const list = parseHafasJourneys(data, { from: { name: 'Torgauer Platz', hafasId: '123' } });
  assert.equal(list.length, 1);
  assert.equal(list[0].lineName, 'Tram 3');
  assert.equal(list[0].boardAt, 'Torgauer Platz');
  assert.equal(list[0].realtime, true);
});

const conn = (slot, depMin, walk, extra = {}) => ({
  id: `${slot}:${depMin}`,
  slot,
  walk,
  depMs: T0 + depMin * 60000,
  arrMs: T0 + (depMin + 12) * 60000,
  lineName: slot === 0 ? 'Tram 7' : 'Tram 3',
  stopName: slot === 0 ? 'Edlichstraße' : 'Torgauer Platz',
  toName: 'Hauptbahnhof',
  direction: 'Somewhere',
  ...extra,
});

test('walk buffer: too-tight tram is skipped and reported', () => {
  const list = [conn(0, 1, 2), conn(1, 3, 4), conn(1, 6, 4), conn(0, 9, 2)];
  const plan = planTrips(list, T0, { slots: 2 });
  assert.equal(plan.hero.id, '1:6');
  assert.equal(plan.tooTight.id, '0:1');
  assert.equal(plan.perSlot[0].next.id, '0:9');
  assert.equal(plan.perSlot[1].next.id, '1:6');
  assert.equal(plan.manual, false);
});

test('catchable boundary is exactly the walk time', () => {
  assert.ok(isCatchable(conn(0, 2, 2), T0));
  assert.ok(!isCatchable(conn(0, 2, 2), T0 + 1000));
});

test('tapping a trip locks the hero until it leaves', () => {
  const list = [conn(0, 3, 2), conn(0, 9, 2)];
  let plan = planTrips(list, T0, { selectedId: '0:9' });
  assert.equal(plan.hero.id, '0:9');
  assert.equal(plan.manual, true);
  assert.equal(plan.tooTight, null);
  plan = planTrips(list, T0 + 10 * 60000, { selectedId: '0:9' });
  assert.equal(plan.hero, null);
});

test('leave advice', () => {
  assert.deepEqual(leaveAdvice(conn(0, 6, 2), T0), { now: false, minutes: 4 });
  assert.equal(leaveAdvice(conn(0, 2, 2), T0).now, true);
  assert.equal(leaveAdvice(conn(0, 5, 0), T0).atStop, true);
});

test('routeOptions forward and reversed', () => {
  const route = DEFAULT_ROUTES[0];
  const fwd = routeOptions(route);
  assert.equal(fwd.length, 2);
  assert.equal(fwd[0].from.name, 'Edlichstraße');
  assert.equal(fwd[1].walk, 4);
  const back = routeOptions(route, true);
  assert.equal(back[0].from.name, 'Hauptbahnhof');
  assert.equal(back[1].to.name, 'Torgauer Platz');
  assert.equal(back[0].walk, 0);
  // The trip-back walk is opt-in: none unless the route sets one.
  assert.equal(routeOptions({ ...route, destWalk: 7 }, true)[1].walk, 7);
  // Missing walk becomes the default, not NaN.
  assert.equal(routeOptions({ ...route, stops: [{ stop: route.stops[0].stop }] })[0].walk, 2);
});

test('fetchRoute queries both stops in parallel and falls back to HAFAS', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (u.host === 'api.transitous.org' && u.pathname.endsWith('/geocode')) {
      const text = u.searchParams.get('text');
      if (text.includes('Edlich')) return json([{ type: 'STOP', id: 'de-DELFI_de:14713:11508', name: 'Edlichstraße', lat: 51.3447, lon: 12.4149 }]);
      if (text.includes('Torgauer')) return json([{ type: 'STOP', id: 'de-DELFI_de:14713:11600', name: 'Torgauer Platz', lat: 51.3469, lon: 12.4141 }]);
      return json([{ type: 'STOP', id: 'de-DELFI_de:14713:hbf', name: 'Leipzig Hauptbahnhof', lat: 51.3455, lon: 12.3817 }]);
    }
    if (u.host === 'api.transitous.org' && u.pathname.endsWith('/plan')) {
      if (u.searchParams.get('fromPlace').endsWith('11600')) return json({}, 503); // Torgauer Platz fails on Transitous
      return json({ itineraries: [{ endTime: iso(16), legs: [motisLeg({})] }] });
    }
    if (u.pathname === '/locations') return json([{ type: 'stop', id: '555', name: 'Leipzig, Torgauer Platz', location: { latitude: 51.3469, longitude: 12.4141 } }, { type: 'stop', id: '8010205', name: 'Leipzig Hbf', location: { latitude: 51.3455, longitude: 12.3817 } }]);
    if (u.pathname === '/journeys') {
      assert.equal(u.searchParams.get('tram'), 'true');
      assert.equal(u.searchParams.get('suburban'), 'false');
      return json({ journeys: [{ legs: [{ origin: { id: '555', name: 'Torgauer Platz' }, departure: iso(3), plannedDeparture: iso(3), arrival: iso(14), line: { name: 'STR 8', product: 'tram' }, direction: 'Grünau', tripId: 't8' }] }] });
    }
    return json({}, 404);
  };
  const client = createTransitClient({ fetchImpl });
  const { connections, options, errors } = await fetchRoute(client, DEFAULT_ROUTES[0]);
  assert.equal(errors.length, 0);
  assert.deepEqual(connections.map((c) => [c.slot, c.lineName]), [[1, 'Tram 8'], [0, 'Tram 7']]);
  assert.equal(options[0].from.tid, 'de-DELFI_de:14713:11508');
  assert.equal(options[1].from.hafasId, '555');

  const plan = planTrips(connections, T0, { slots: 2 });
  assert.equal(plan.hero.lineName, 'Tram 7'); // Tram 8 in 3 min is too tight for a 4 min walk
  assert.equal(plan.tooTight.lineName, 'Tram 8');
  const text = describePlan(plan, T0);
  assert.equal(text, "You won't make Tram 8 at Torgauer Platz. Leave in 3 minutes for Tram 7 at Edlichstraße.");
  assert.equal(describePlan(plan, T0, { lang: 'de' }), 'Tram 8 ab Torgauer Platz schaffst du nicht mehr. Geh in 3 Minuten los, Tram 7 ab Edlichstraße.');
});

test('fetchRoute throws when every stop fails', async () => {
  const client = createTransitClient({ fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(fetchRoute(client, DEFAULT_ROUTES[1]), /HTTP 500/);
});

test('nearbyStops works when transport.rest is down, nearest first, one per name', async () => {
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (u.host.endsWith('transport.rest')) return json({ error: 'down' }, 503);
    if (u.pathname.endsWith('/map/stops')) {
      return json([
        { name: 'Torgauer Platz', stopId: 'q1', lat: 51.3469, lon: 12.4141 },
        { name: 'Edlichstraße', stopId: 'q2', lat: 51.3447, lon: 12.4149 },
        { name: 'Edlichstraße', stopId: 'q3', lat: 51.3448, lon: 12.415 },
        { name: 'Far Away', stopId: 'q4', lat: 51.4, lon: 12.5 },
      ]);
    }
    return json([]);
  };
  const client = createTransitClient({ fetchImpl });
  const near = await client.nearbyStops('leipzig', 51.3449, 12.4152);
  assert.deepEqual(near.map((s) => s.name), ['Edlichstraße', 'Torgauer Platz']);
  assert.ok(near[0].distance < near[1].distance);
  assert.equal(near[0].tid, undefined); // platform IDs are not kept
});

test('nearbyStops falls back to reverse-geocode', async () => {
  const fetchImpl = async (url) => {
    const u = new URL(url);
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (u.pathname.endsWith('/reverse-geocode')) return json([{ type: 'STOP', name: 'Leipzig, Edlichstraße', lat: 51.3447, lon: 12.4149 }]);
    return json({}, 404);
  };
  const near = await createTransitClient({ fetchImpl }).nearbyStops('leipzig', 51.3449, 12.4152);
  assert.equal(near[0].name, 'Edlichstraße');
});

test('delayLabel brackets', async () => {
  const { delayLabel } = await import('../lib/transit.js');
  const k = (d) => delayLabel(d).label;
  assert.deepEqual([-3, -1, 0, 0.4, 1, 3, 4, 7, 8, 25].map(k), ['early', 'early', 'on time', 'on time', 'late', 'late', '+late', '+late', '++late', '++late']);
});

test('shortDirection abbreviates long directions like a departure board', async () => {
  const { shortDirection: f } = await import('../lib/transit.js');
  assert.equal(f('Leipzig, Böhlitz-Ehrenberg'), 'Böhlitz-E.');
  assert.equal(f('Knautkleeberg'), 'Knautkleeberg');
  assert.equal(f('Grünau-Nord'), 'Grünau-Nord');
  assert.equal(f('Markkleeberg-West'), 'Markkleeberg-W.');
  assert.equal(f('S+U Hauptbahnhof'), 'S+U Hbf');
  assert.equal(f('Schönefeld, Ost'), 'Schönefeld O.');
  assert.equal(f('Lützschena, Am Wasserturm'), 'Lützschena');
  assert.equal(f('S Schöneweide/Sterndamm'), 'S Schöneweide');
  assert.ok(f('Universitätsklinikum').length <= 16);
});

test('line names never show "?" and handle Leipzig "E" trams', async () => {
  const { lineLabel, motisLineName, productFromMotisMode } = await import('../lib/transit.js');
  assert.equal(lineLabel('STR E', 'tram'), 'E');
  assert.equal(lineLabel('E', 'tram'), 'E');
  assert.equal(lineLabel('Einsetzer', 'tram'), 'E');
  assert.equal(lineLabel('', 'bus'), 'Bus');
  assert.notEqual(lineLabel('', 'other'), '?');
  assert.equal(motisLineName({ displayName: '7', routeShortName: '' }), '7');
  assert.equal(motisLineName({ routeShortName: '', tripShortName: 'E' }), 'E');
  assert.equal(motisLineName({ routeShortName: '', routeLongName: 'Einsatzwagen' }), 'Einsatzwagen');
  assert.equal(motisLineName({ routeShortName: '', routeLongName: 'Böhlitz-Ehrenberg - Sommerfeld' }), '');
  assert.equal(productFromMotisMode('OTHER', 900), 'tram');
  const [c] = parseMotisPlan({ itineraries: [{ endTime: iso(15), legs: [{ ...motisLeg({}), routeShortName: undefined, displayName: 'E' }] }] });
  assert.equal(c.line, 'E');
  assert.equal(c.lineName, 'Tram E');
});

test('a tram boarding at another stop is dropped even when both IDs are DELFI IDs', async () => {
  const { sameStation } = await import('../lib/transit.js');
  assert.ok(sameStation('de-DELFI_de:14713:11508:1:1', 'de-DELFI_de:14713:11508'));
  assert.ok(sameStation('de-DELFI_de:14713:11508:1:1', 'de-DELFI_de:14713:11508:2:2'));
  assert.ok(!sameStation('de-DELFI_de:14713:11509:1:1', 'de-DELFI_de:14713:11508'));
  assert.ok(!sameStation('q1', 'q2'));
  const data = {
    itineraries: [
      { endTime: iso(16), legs: [motisLeg({})] },
      { endTime: iso(17), legs: [motisLeg({ from: { name: 'Torgauer Platz', stopId: 'de-DELFI_de:14713:11509:2:2' }, tripId: 'other' })] },
    ],
  };
  const list = parseMotisPlan(data, { from: { name: 'Edlichstraße', tid: 'de-DELFI_de:14713:11508' }, filter: 'tram_bus' });
  assert.deepEqual(list.map((c) => c.tripKey), ['trip-7a']);
});

test('trip back accepts every tram stop around a big station, and names the change', () => {
  const t = (m) => new Date(Date.UTC(2026, 10, 12, 10, m)).toISOString();
  const hbf = { name: 'Hauptbahnhof', lat: 51.3455, lon: 12.3817 };
  const data = {
    itineraries: [
      { endTime: t(30), legs: [{ mode: 'TRAM', from: { name: 'Hbf. Westseite', lat: 51.3448, lon: 12.3792 }, startTime: t(5), routeShortName: '9', headsign: 'Connewitz', tripId: 'a' },
        { mode: 'TRAM', from: { name: 'Ostplatz', lat: 51.33, lon: 12.39 }, startTime: t(15), routeShortName: '3', tripId: 'b' }] },
      { endTime: t(25), legs: [{ mode: 'TRAM', from: { name: 'Willy-Brandt-Platz', lat: 51.3442, lon: 12.3808 }, startTime: t(8), routeShortName: '3', headsign: 'Taucha', tripId: 'c' }] },
      { endTime: t(25), legs: [{ mode: 'TRAM', from: { name: 'Gohlis', lat: 51.37, lon: 12.37 }, startTime: t(8), routeShortName: '4', tripId: 'd' }] },
    ],
  };
  assert.deepEqual(parseMotisPlan(data, { from: hbf }).map((c) => c.line), []); // strict: other platforms dropped
  const near = parseMotisPlan(data, { from: hbf, nearKm: 0.4 });
  assert.deepEqual(near.map((c) => c.line), ['9', '3']);
  assert.deepEqual(near[0].changes, [{ line: '3', at: 'Ostplatz' }]);
  assert.equal(near[1].transfers, 0);
});

test('trip back picks the tram that gets you home first', () => {
  const now = Date.UTC(2026, 10, 12, 10, 0);
  const m = (x) => now + x * 60000;
  const conns = [
    { id: 'nine', slot: 0, walk: 0, depMs: m(4), arrMs: m(27) },
    { id: 'three', slot: 0, walk: 0, depMs: m(6), arrMs: m(18) },
  ];
  assert.equal(planTrips(conns, now).hero.id, 'nine');
  assert.equal(planTrips(conns, now, { byArrival: true }).hero.id, 'three');
  assert.equal(planTrips(conns, now, { byArrival: true }).perSlot[0].next.id, 'three');
});

describe('voice answer rules', () => {
  const now = Date.parse('2026-11-12T10:00:00Z');
  const c = (slot, lineName, stopName, dep, walk) => ({ slot, lineName, stopName, depMs: now + dep * 60000, walk });
  const say = (conns, slots, opts = {}) => describePlan(planTrips(conns, now, { slots }), now, opts);

  test('one stop: no stop name; the backup is a real one, not a tram a minute behind', () => {
    const conns = [c(0, 'Tram 8', 'Torgauer Platz', 10, 5), c(0, 'Tram 8', 'Torgauer Platz', 11, 5), c(0, 'Tram 8', 'Torgauer Platz', 18, 5)];
    assert.equal(say(conns, 1), 'Leave in 5 minutes for Tram 8. Or leave in 13 minutes for Tram 8.');
    assert.equal(say(conns, 1, { lang: 'de' }), 'Geh in 5 Minuten los, Tram 8. Oder in 13 Minuten, Tram 8.');
  });

  test('two stops: the stop is named', () => {
    const conns = [c(1, 'Tram 3', 'Torgauer Platz', 6, 4), c(0, 'Tram 7', 'Edlichstraße', 16, 4)];
    assert.equal(say(conns, 2), 'Leave in 2 minutes for Tram 3 at Torgauer Platz. Or leave in 12 minutes for Tram 7 at Edlichstraße.');
  });

  test('leave now, and a long gap is announced instead of a far-away backup', () => {
    const conns = [c(0, 'Tram 8', 'X', 6, 6), c(0, 'Tram 8', 'X', 40, 6)];
    assert.equal(say(conns, 1), 'Leave now for Tram 8, it goes in 6 minutes. After that, nothing for 34 minutes.');
    assert.equal(say(conns, 1, { lang: 'de' }), 'Geh jetzt los, Tram 8, fährt in 6 Minuten. Danach kommt 34 Minuten lang nichts.');
  });

  test('trip back: you are at the station, so "leaves in" and "then"', () => {
    const conns = [c(0, 'Tram 8', 'Hbf', 4, 0), c(0, 'Tram 3', 'Hbf', 12, 0)];
    assert.equal(say(conns, 1, { reversed: true }), 'Tram 8 leaves in 4 minutes. Then Tram 3 in 12 minutes.');
    assert.equal(say(conns, 1, { reversed: true, lang: 'de' }), 'Tram 8 fährt in 4 Minuten. Danach Tram 3 in 12 Minuten.');
  });
});

describe('stopwatch walk times and spare time', () => {
  const route = {
    city: 'leipzig',
    stops: [{ stop: { name: 'Edlichstraße' }, walk: 222 / 60 }, { stop: { name: 'Torgauer Platz' }, walk: 0 }],
    dest: { name: 'Hbf' },
    destWalk: 3,
    buffer: 30,
  };

  test('walk keeps its seconds and the buffer goes on top, but not when you are at the stop', () => {
    const [a, b] = routeOptions(route);
    assert.equal(Math.round(a.walk * 60), 222 + 30);
    assert.equal(Math.round(a.walkBase * 60), 222);
    assert.equal(a.buffer, 30);
    assert.equal(b.walk, 0);
    assert.equal(b.buffer, 0);
    const [back] = routeOptions(route, true);
    assert.equal(back.walk, 3.5);
    assert.equal(routeOptions({ ...route, buffer: undefined })[0].walk, 3.7);
  });

  test('walk times read as minutes, or m:ss from the stopwatch', () => {
    assert.equal(formatWalk(4), '4 min');
    assert.equal(formatWalk(222 / 60), '3:42 min');
    assert.equal(formatWalk(0.75), '0:45 min');
  });

  test('the leave time counts walk plus buffer, for the app and the assistants', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    const walk = routeOptions(route)[0].walk; // 4:12
    const conn = { slot: 0, lineName: 'Tram 7', stopName: 'Edlichstraße', depMs: now + 10 * 60000, walk };
    assert.deepEqual(leaveAdvice(conn, now), { now: false, minutes: 5 });
    assert.equal(describePlan(planTrips([conn], now), now), 'Leave in 5 minutes for Tram 7.');
    // 4 min 20 s before it leaves: fine without the buffer, too tight with it
    const soon = { ...conn, depMs: now + 260000 };
    assert.equal(isCatchable(soon, now), true);
    assert.equal(isCatchable({ ...soon, depMs: now + 240000 }, now), false);
  });
});
