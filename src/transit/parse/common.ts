import { shortStopName } from '../names.ts';
import type { Departure } from '../types.ts';


/**
 * The planner plans door to door, so a journey may end with a walk: "ride the 1 to a stop
 * near home, then walk". Keep where you get off and how long that walk is, so it can be said.
 */
export function walkAfter(getOffName: string | undefined, lastArrMs: number, arrMs: number): Pick<Departure, 'getOffAt' | 'walkAfterMin'> {
  const mins = Number.isFinite(lastArrMs) && Number.isFinite(arrMs) ? Math.round((arrMs - lastArrMs) / 60000) : 0;
  return mins >= 2 ? { getOffAt: shortStopName(getOffName || ''), walkAfterMin: mins } : {};
}

/** Keep one entry per vehicle (earliest arrival wins). */
export function dedupeByTrip<T extends Departure>(list: T[]): T[] {
  const best = new Map<string, T>();
  for (const c of list) {
    const key = `${c.tripKey}|${c.schedMs}`;
    const prev = best.get(key);
    if (!prev || (c.arrMs ?? Infinity) < (prev.arrMs ?? Infinity)) best.set(key, c);
  }
  return [...best.values()];
}
