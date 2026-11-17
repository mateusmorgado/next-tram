/** transport.rest (HAFAS) response parser. */
import { DEFAULT_MODE_FILTER } from '../../data/stops.ts';
import { lineLabel, lineName, modeAllowed, productFromHafas } from '../products.ts';
import { sameStopName, shortStopName } from '../names.ts';
import type { Departure, HafasJourneys, HafasRide, ModeFilter, Stop } from '../types.ts';
import { walkAfter } from './common.ts';


/** transport.rest /journeys response → connections that board at `from`. */
export function parseHafasJourneys(
  data: HafasJourneys | null | undefined,
  { from, filter = DEFAULT_MODE_FILTER }: { from?: Stop; filter?: ModeFilter } = {},
): Departure[] {
  const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
  const out: Departure[] = [];
  for (const journey of journeys) {
    const legs = Array.isArray(journey.legs) ? journey.legs : [];
    const transit = legs.filter((l): l is HafasRide => !l.walking && Boolean(l.line));
    const leg = transit[0];
    if (!leg) continue;

    if (from) {
      const sameId = from.hafasId && leg.origin?.id && String(leg.origin.id) === String(from.hafasId);
      if (!sameId && !sameStopName(leg.origin?.name, from.name)) continue;
    }

    const product = productFromHafas(leg.line.product || leg.line.mode);
    if (!modeAllowed(product, filter)) continue;

    const depIso = leg.departure || leg.plannedDeparture;
    const depMs = Date.parse(depIso ?? '');
    if (!Number.isFinite(depMs)) continue; // cancelled legs have no departure
    if (leg.cancelled) continue;
    const schedMs = leg.plannedDeparture ? Date.parse(leg.plannedDeparture) : depMs;
    const last = legs[legs.length - 1];
    const arrMs = Date.parse(last.arrival || last.plannedArrival || '');

    out.push({
      tripKey: leg.tripId || `${leg.line.name}|${schedMs}`,
      line: lineLabel(leg.line.name, product),
      lineKnown: Boolean(String(leg.line.name || '').trim()),
      lineName: lineName(leg.line.name, product),
      product,
      direction: shortStopName(leg.direction || leg.destination?.name || ''),
      depMs,
      schedMs,
      delayMin: Math.round((depMs - schedMs) / 60000),
      realtime: typeof leg.departureDelay === 'number',
      arrMs: Number.isFinite(arrMs) ? arrMs : null,
      boardAt: shortStopName(leg.origin?.name || from?.name || ''),
      transfers: Math.max(0, transit.length - 1),
      changes: transit.slice(1).map((l) => ({ line: lineLabel(l.line?.name, productFromHafas(l.line?.product || l.line?.mode)), at: shortStopName(l.origin?.name || '') })),
      ...walkAfter(transit[transit.length - 1].destination?.name, Date.parse(transit[transit.length - 1].arrival || transit[transit.length - 1].plannedArrival || ''), arrMs),
      apiColor: leg.line.color ? { bg: leg.line.color.bg, fg: leg.line.color.fg } : null,
      source: 'hafas',
    });
  }
  return out;
}
