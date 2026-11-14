import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCall, readStats } from '../lib/call-stats.js';

function memoryStore() {
  const m = new Map();
  return {
    m,
    async incrKey(k) { m.set(k, (m.get(k) || 0) + 1); },
    async mgetKeys(keys) { return keys.map((k) => (m.has(k) ? String(m.get(k)) : null)); },
  };
}

test('counts calls per endpoint and day', async () => {
  const s = memoryStore();
  const now = new Date('2026-11-14T12:00:00Z');
  await countCall(s, 'mcp', now);
  await countCall(s, 'mcp', now);
  await countCall(s, 'alexa', new Date('2026-11-12T08:00:00Z'));
  await countCall(s, 'nope', now);
  const r = await readStats(s, { now });
  assert.equal(r.total, 3);
  assert.equal(r.daily.length, 30);
  assert.equal(r.daily[29], 2);
  assert.equal(r.daily[27], 1);
  assert.deepEqual(r.services.map((x) => [x.name, x.count, x.allTime]), [['nexttram-mcp', 2, 2], ['nexttram-alexa', 1, 1], ['nexttram-say', 0, 0]]);
});

test('counting never throws', async () => {
  await countCall({ incrKey: async () => { throw new Error('down'); } }, 'say');
  await countCall(null, 'say');
});
