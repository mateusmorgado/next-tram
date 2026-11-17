import test from 'node:test';
import assert from 'node:assert/strict';
import { countOpen, introDue, OPEN_GAP_MS } from '../src/app/intro-gate.ts';

const HOUR = 60 * 60_000;

test('the intro shows on the first open and again on the 4th', () => {
  const state = {};
  const shownAt = [];
  let now = 1_700_000_000_000;
  for (let open = 1; open <= 8; open++) {
    now += 5 * HOUR;
    countOpen(state, now);
    const due = introDue(state);
    if (due) {
      shownAt.push([open, due]);
      state.introShown = (state.introShown || 0) + 1;
    }
  }
  assert.deepEqual(shownAt, [
    [1, 'first'],
    [4, 'reminder'],
  ]);
});

test('reloads and quick returns are the same open', () => {
  const state = {};
  const t0 = 1_700_000_000_000;
  assert.equal(countOpen(state, t0), true);
  assert.equal(countOpen(state, t0 + 1000), false);
  assert.equal(countOpen(state, t0 + OPEN_GAP_MS - 1), false);
  assert.equal(state.opens, 1);
  assert.equal(countOpen(state, t0 + OPEN_GAP_MS + 1), true);
  assert.equal(state.opens, 2);
});

test('someone who already uses the app sees the intro once, as a first-timer', () => {
  const state = { routes: [{ id: 'x' }] }; // saved before the intro existed
  countOpen(state, 1_700_000_000_000);
  assert.equal(introDue(state), 'first');
});

test('an intro that could not be shown yet stays due', () => {
  const state = {};
  for (let i = 1; i <= 6; i++) countOpen(state, 1_700_000_000_000 + i * HOUR);
  assert.equal(introDue(state), 'first'); // e.g. the watch view never showed it
  state.introShown = 1;
  assert.equal(introDue(state), 'reminder');
  state.introShown = 2;
  assert.equal(introDue(state), '');
});

test('a clock that jumped backwards does not block counting', () => {
  const state = { opens: 2, lastOpen: 2_000_000_000_000 };
  assert.equal(countOpen(state, 1_700_000_000_000), true);
  assert.equal(state.opens, 3);
});
