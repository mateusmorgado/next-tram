/** Turning a favorite route into departures: one request per origin stop, merged and sorted. */
import { DEFAULT_MODE_FILTER } from '../data/stops.ts';
import { lineColor } from '../data/lines.ts';
import { shortStopName } from './names.ts';
import type { TransitClient } from './client.ts';
import type { Connection, FetchRouteResult, Route, RouteOption } from './types.ts';


/**
 * A route turns into one "option" per origin stop. Forward: home stop → destination.
 * Reversed (trip home): destination → each home stop, so you take whichever gets you home first.
 */
export function routeOptions(route: Route, reversed = false): RouteOption[] {
  const stops = (route?.stops || []).filter((s) => s?.stop?.name);
  const buffer = bufferSecs(route?.buffer);
  const noRun = route?.noRun === true; // "never run for a tram" setting
  // `walk` is what planning uses: the walk itself plus the spare time, in minutes (seconds precision).
  // No walk (you're at the stop) means no spare time either.
  const withBuffer = (walkBase: number) => ({ walkBase, buffer: walkBase ? buffer : 0, walk: walkBase ? walkBase + buffer / 60 : 0, noRun });
  if (!reversed) {
    return stops.map((s, i) => ({ slot: i, from: s.stop, to: route.dest, ...withBuffer(num(s.walk, i === 0 ? 2 : 4)) }));
  }
  // The walk to the destination stop for the trip back is opt-in; without it there's nothing to plan around.
  return stops.map((s, i) => ({ slot: i, from: route.dest, to: s.stop, ...withBuffer(num(route.destWalk, 0)) }));
}

/** Spare seconds on top of every walk, for people who'd rather not run. */
export const BUFFER_CHOICES: readonly number[] = [0, 15, 30, 60];

export function bufferSecs(value?: unknown): number {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(120, n));
}

/** Walk minutes, kept to whole seconds so a stopwatch time like 3:42 survives. */
function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== '' ? Math.max(0, Math.min(30, Math.round(n * 60) / 60)) : fallback;
}

/** "4 min" for whole minutes, "3:42 min" for a stopwatch time. */
export function formatWalk(minutes?: unknown): string {
  const secs = Math.round((Number(minutes) || 0) * 60);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
}

/**
 * Fetch every option in parallel. Returns { connections, options, errors } where
 * `options` carry resolved stop IDs so callers can cache them.
 */
export async function fetchRoute(client: TransitClient, route: Route, { reversed = false }: { reversed?: boolean } = {}): Promise<FetchRouteResult> {
  const options = routeOptions(route, reversed);
  const filter = route.modes || DEFAULT_MODE_FILTER;
  const settled = await Promise.allSettled(
    options.map((o) => client.connections(route.city, o.from, o.to, filter, { anyPlatform: reversed })),
  );
  const connections: Connection[] = [];
  const errors: FetchRouteResult['errors'] = [];
  settled.forEach((r, i) => {
    const o = options[i];
    if (r.status === 'fulfilled') {
      o.from = r.value.from;
      o.to = r.value.to;
      for (const c of r.value.list) {
        connections.push({
          ...c,
          id: `${o.slot}:${c.tripKey}:${c.schedMs}`,
          slot: o.slot,
          walk: o.walk,
          walkBase: o.walkBase,
          buffer: o.buffer,
          noRun: o.noRun,
          color: lineColor(route.city, c.product, c.line, c.apiColor),
          stopName: shortStopName(o.from.name),
          toName: shortStopName(o.to.name),
        });
      }
    } else {
      errors.push({ slot: o.slot, message: r.reason?.message || String(r.reason) });
    }
  });
  connections.sort((a, b) => a.depMs - b.depMs || (a.arrMs ?? 0) - (b.arrMs ?? 0));
  if (!connections.length && errors.length === options.length && options.length) {
    const err: Error & { errors?: FetchRouteResult['errors'] } = new Error(errors[0].message);
    err.errors = errors;
    throw err;
  }
  return { connections, options, errors };
}
