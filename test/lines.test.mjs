import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineColor, normalizeHex, contrastText, LINE_COLORS } from '../lib/lines.js';
import { parseMotisPlan, parseHafasJourneys } from '../lib/transit.js';

test('hex normalization and contrast', () => {
  assert.equal(normalizeHex('f0d722'), '#F0D722');
  assert.equal(normalizeHex('#abc'), '#AABBCC');
  assert.equal(normalizeHex('red'), null);
  assert.equal(contrastText('#F0D722'), '#111111');
  assert.equal(contrastText('#224F86'), '#FFFFFF');
});

test('curated table beats API colour, API beats default', () => {
  assert.deepEqual(lineColor('berlin', 'subway', 'U4', { bg: '123456' }), { bg: '#F0D722', fg: '#111111', source: 'table' });
  assert.deepEqual(lineColor('leipzig', 'tram', '99', { bg: '0a5fa8', fg: 'ffffff' }), { bg: '#0A5FA8', fg: '#FFFFFF', source: 'api' });
  assert.equal(lineColor('leipzig', 'tram', '99', { bg: 'FFFFFF' }).source, 'default'); // placeholder white ignored
  assert.equal(lineColor('leipzig', 'tram', '99', null).bg, '#D7262F');
});

test('table override for a Leipzig line', (t) => {
  const before = LINE_COLORS.leipzig.tram['3'];
  LINE_COLORS.leipzig.tram['3'] = { bg: '#00FF00' };
  t.after(() => { LINE_COLORS.leipzig.tram['3'] = before; });
  assert.equal(lineColor('leipzig', 'tram', '3', { bg: '111111' }).bg, '#00FF00');
});

test('LVB lines use the network map colours, whatever the feed sends', () => {
  assert.deepEqual(lineColor('leipzig', 'tram', '3', { bg: 'E2101D' }), { bg: '#65B32E', fg: '#FFFFFF', source: 'table' });
  assert.deepEqual(lineColor('leipzig', 'tram', '8', null), { bg: '#FFCC00', fg: '#1D1D1B', source: 'table' });
  assert.equal(lineColor('leipzig', 'tram', '7', null).bg, '#213A8F');
  assert.equal(lineColor('leipzig', 'tram', '11', null).bg, '#E30613');
  assert.equal(lineColor('leipzig', 'tram', 'n17', null).bg, '#65B32E');
});

test('parsers keep the API colours', () => {
  const now = Date.now();
  const iso = (m) => new Date(now + m * 60000).toISOString();
  const motis = parseMotisPlan({ itineraries: [{ endTime: iso(9), legs: [{ mode: 'TRAM', from: { name: 'A' }, startTime: iso(3), routeShortName: '7', routeColor: '0A5FA8', routeTextColor: 'FFFFFF' }] }] });
  assert.deepEqual(motis[0].apiColor, { bg: '0A5FA8', fg: 'FFFFFF' });
  const hafas = parseHafasJourneys({ journeys: [{ legs: [{ origin: { name: 'A' }, departure: iso(3), arrival: iso(9), line: { name: 'M10', product: 'tram', color: { fg: '#fff', bg: '#be1414' } } }] }] });
  assert.deepEqual(hafas[0].apiColor, { bg: '#be1414', fg: '#fff' });
});
