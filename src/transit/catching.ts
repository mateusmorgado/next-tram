/** Can you still make it? The walk, the spare time and the "run for it" rule decide. */
import type { Connection, Plan, SlotPlan } from './types.ts';

/** What the catch rules need to know about a departure. */
export type Catchable = Pick<Connection, 'depMs' | 'walk'> & Partial<Pick<Connection, 'walkBase' | 'noRun'>>;

/**
 * Running saves you at most RUN_SAVES_SECS on the walk, and never more than half of it.
 * So with 1 min left a 2 min walk is still a run, a 3 min walk is a missed tram.
 * The walk here includes the spare-time buffer, so a 1 min buffer means you never have to run.
 * With the "never run" setting (route.noRun) running saves nothing: you need the full walk.
 */
export const RUN_SAVES_SECS = 60;

export function runSaveSecs(conn: Catchable): number {
  if (conn.noRun) return 0;
  return Math.min(RUN_SAVES_SECS, ((conn.walkBase ?? conn.walk) || 0) * 30);
}

/** You can catch it if you can get there walking, or running for the last bit. */
export function isCatchable(conn: Catchable, now: number): boolean {
  return conn.depMs - now >= conn.walk * 60000 - runSaveSecs(conn) * 1000;
}

/** Catchable, but only if you run. */
export function needsRun(conn: Catchable, now: number): boolean {
  return isCatchable(conn, now) && conn.depMs - now < conn.walk * 60000;
}

/**
 * Decide what to show. `selectedId` locks the hero onto a tapped trip until it leaves.
 * Returns { hero, manual, tooTight, perSlot, upcoming }.
 */
export function planTrips(
  connections: Connection[],
  now: number,
  { selectedId = null, slots = 1, byArrival = false }: { selectedId?: string | null; slots?: number; byArrival?: boolean } = {},
): Plan {
  const upcoming = connections.filter((c) => c.depMs > now).sort((a, b) => a.depMs - b.depMs);
  // Trip back: you're already at the station, so the best tram is the one that gets you home first.
  const pick = (list: Connection[]): Connection | null => {
    const ok = list.filter((c) => isCatchable(c, now));
    if (!byArrival) return ok[0] || null;
    return ok.reduce((best: Connection | null, c) => (!best || (c.arrMs ?? Infinity) < (best.arrMs ?? Infinity) ? c : best), null);
  };
  const firstCatchable = pick(upcoming);
  // A tapped trip stays only while you can still make it; after that it counts as missed.
  const selected = selectedId ? upcoming.find((c) => c.id === selectedId && isCatchable(c, now)) || null : null;

  const hero = selected || firstCatchable;
  const manual = Boolean(selected) && selected !== firstCatchable;

  let tooTight: Connection | null = null;
  if (!manual) {
    const limit = hero ? hero.depMs : Infinity;
    tooTight = upcoming.find((c) => !isCatchable(c, now) && c.depMs <= limit) || null;
  }

  const perSlot: SlotPlan[] = [];
  for (let s = 0; s < slots; s++) {
    const mine = upcoming.filter((c) => c.slot === s);
    perSlot.push({ slot: s, next: pick(mine), count: mine.length });
  }

  return { hero, manual, tooTight, perSlot, upcoming: upcoming.slice(0, 20) };
}

export function minutesUntil(conn: Pick<Connection, 'depMs'>, now: number): number {
  return Math.max(0, Math.floor((conn.depMs - now) / 60000));
}
