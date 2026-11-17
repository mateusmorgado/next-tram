/** MOTIS 2 (Transitous) response parser. */
import { DEFAULT_MODE_FILTER } from '../../data/stops.ts';
import { distanceKm } from '../geo.ts';
import { lineLabel, lineName, modeAllowed, motisLineName, productFromMotisMode } from '../products.ts';
import { sameStopName, shortStopName } from '../names.ts';
import type { Departure, ModeFilter, MotisLeg, MotisPlace, MotisPlan, Stop } from '../types.ts';
import { walkAfter } from './common.ts';


/**
 * MOTIS /api/v1/plan response → connections that board at `from`.
 * A connection is the first vehicle you board; arrival is the itinerary's end.
 */
export function parseMotisPlan(
  data: MotisPlan | null | undefined,
  { from, filter = DEFAULT_MODE_FILTER, nearKm = 0 }: { from?: Stop; filter?: ModeFilter; nearKm?: number } = {},
): Departure[] {
  const itineraries = Array.isArray(data?.itineraries) ? data.itineraries : [];
  const out: Departure[] = [];
  for (const itin of itineraries) {
    const legs = Array.isArray(itin.legs) ? itin.legs : [];
    const transit = legs.filter((l: MotisLeg) => l.mode && l.mode !== 'WALK' && l.mode !== 'BIKE' && l.mode !== 'CAR');
    const leg = transit[0];
    if (!leg) continue;

    // Must board at the chosen stop, not at a different stop nearby.
    // On the trip back `nearKm` also allows other platforms of a big station (Hbf has several).
    if (from && !boardsAtStop(leg.from, from) && !(nearKm && distanceKm(leg.from, from) <= nearKm)) continue;

    const product = productFromMotisMode(leg.mode, leg.routeType);
    if (!modeAllowed(product, filter)) continue;

    const depMs = Date.parse(leg.startTime);
    if (!Number.isFinite(depMs)) continue;
    const schedMs = leg.scheduledStartTime ? Date.parse(leg.scheduledStartTime) : depMs;
    const arrMs = Date.parse(itin.endTime || leg.endTime);

    out.push({
      tripKey: leg.tripId || `${motisLineName(leg)}|${schedMs}`,
      line: lineLabel(motisLineName(leg), product),
      lineKnown: Boolean(motisLineName(leg)),
      lineName: lineName(motisLineName(leg), product),
      product,
      direction: shortStopName(leg.headsign || leg.to?.name || ''),
      depMs,
      schedMs,
      delayMin: Math.round((depMs - schedMs) / 60000),
      realtime: Boolean(leg.realTime),
      arrMs: Number.isFinite(arrMs) ? arrMs : null,
      boardAt: shortStopName(leg.from?.name || from?.name || ''),
      transfers: Math.max(0, transit.length - 1),
      changes: transit.slice(1).map((l) => ({ line: lineLabel(motisLineName(l), productFromMotisMode(l.mode, l.routeType)), at: shortStopName(l.from?.name || '') })),
      ...walkAfter(transit[transit.length - 1].to?.name, Date.parse(transit[transit.length - 1].endTime), arrMs),
      apiColor: leg.routeColor ? { bg: leg.routeColor, fg: leg.routeTextColor } : null,
      source: 'transitous',
    });
  }
  return out;
}

function boardsAtStop(legFrom: MotisPlace | undefined, stop: Stop): boolean {
  if (!legFrom) return true;
  if (stop.tid && legFrom.stopId && sameStation(legFrom.stopId, stop.tid)) return true;
  return sameStopName(legFrom.name, stop.name);
}

/**
 * True when two Transitous stop IDs are the same stop or platforms of the same stop.
 * DELFI IDs look like "de-DELFI_de:14713:11508:1:1": country, district, stop, then area
 * and platform. The first three parts name the stop.
 */
export function sameStation(a: unknown, b: unknown): boolean {
  const x = String(a);
  const y = String(b);
  if (x === y) return true;
  const station = (id: string) => {
    const parts = id.split(':');
    return parts.length >= 3 ? parts.slice(0, 3).join(':') : null;
  };
  const sx = station(x);
  return sx !== null && sx === station(y);
}
