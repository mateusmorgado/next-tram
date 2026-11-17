/**
 * When to show the "How it works" intro by itself: on the first open, and once more
 * on the 4th open, in case the first one was skipped.
 *
 * An "open" is a start of the app, or a return to it after a break. Reloads and quick
 * hops between apps inside OPEN_GAP_MS count as the same open.
 */

export const OPEN_GAP_MS = 30 * 60_000;
export const REMINDER_OPEN = 4;

/** The counters the intro gate reads and writes (a slice of the saved app state). */
export interface IntroCounters {
  opens?: number;
  lastOpen?: number;
  introShown?: number;
}

/** Count this start (or return) as a new open when the last one is long enough ago. */
export function countOpen(state: IntroCounters, now = Date.now()): boolean {
  const last = Number(state.lastOpen) || 0;
  if ((state.opens ?? 0) > 0 && now - last < OPEN_GAP_MS && now >= last) return false;
  state.opens = (Number(state.opens) || 0) + 1;
  state.lastOpen = now;
  return true;
}

/** 'first', 'reminder' or '' (nothing to show). */
export function introDue(state: IntroCounters): 'first' | 'reminder' | '' {
  const shown = Number(state.introShown) || 0;
  if (shown === 0) return 'first';
  if (shown === 1 && (Number(state.opens) || 0) >= REMINDER_OPEN) return 'reminder';
  return '';
}
