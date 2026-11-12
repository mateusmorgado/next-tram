/**
 * NextTram transit core. Shared by the PWA, the MCP server and the Alexa skill.
 *
 * - No dependencies, no API keys. Works in browsers and Node 18+ (global fetch).
 * - Leipzig: Transitous (MOTIS 2) first, DB HAFAS (v6.db.transport.rest) as fallback.
 * - Berlin:  BVG HAFAS (v6.bvg.transport.rest) first, Transitous as fallback.
 *
 * The pure functions (planTrips, leaveAdvice, describePlan, …) take `now` as an
 * argument so they can be unit-tested without network or clocks.
 */

import { CITIES, DEFAULT_MODE_FILTER } from './stops.js';
import { lineColor } from './lines.js';

export const TRANSITOUS_BASE = 'https://api.transitous.org';
export const TIME_ZONE = 'Europe/Berlin';

// ───────────────────────────── Name helpers ─────────────────────────────

/** Lower-case, unify "Straße/Strasse/Str./Str" → "str", drop punctuation. Used for matching. */
export function normalizeStopName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/stra(ß|ss)e\b/g, 'str')
    .replace(/str\./g, 'str')
    .replace(/\b(leipzig|berlin)\b/g, ' ')
    .replace(/[().,/+\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Edlichstr." / "edlichstr" → "Edlichstraße" so the APIs' search finds it. */
export function expandStreetName(value) {
  return String(value || '')
    .replace(/([A-Za-zÄÖÜäöüß])str\.(?=\s|,|$)/g, '$1straße')
    .replace(/([A-Za-zÄÖÜäöüß])str(?=\s|,|$)/g, '$1straße')
    .replace(/([A-Za-zÄÖÜäöüß])strasse\b/gi, '$1straße')
    .replace(/\bStr\.(?=\s|,|$)/g, 'Straße')
    .trim();
}

/** "Leipzig, Edlichstraße" / "Edlichstraße, Leipzig" / "U Eberswalder Str. (Berlin)" → short display name. */
export function shortStopName(value) {
  return String(value || '')
    .replace(/^(Leipzig|Berlin)[,\s]+/i, '')
    .replace(/,\s*(Leipzig|Berlin)$/i, '')
    .replace(/\s*\((Leipzig|Berlin)\)$/i, '')
    .trim();
}

/** True when two stop names refer to the same stop ("Leipzig, Edlichstr." vs "Edlichstraße"). */
export function sameStopName(a, b) {
  const x = normalizeStopName(a);
  const y = normalizeStopName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function distanceKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function pickNearest(candidates, hint) {
  if (!candidates.length) return null;
  if (!hint || hint.lat == null) return candidates[0];
  return [...candidates].sort((p, q) => distanceKm(p, hint) - distanceKm(q, hint))[0];
}

// ───────────────────────────── Line / mode helpers ─────────────────────────────

const MOTIS_PRODUCT = {
  TRAM: 'tram',
  BUS: 'bus',
  COACH: 'bus',
  SUBWAY: 'subway',
  METRO: 'subway',
  SUBURBAN: 'suburban',
  FERRY: 'ferry',
};

export function productFromMotisMode(mode, routeType) {
  const m = String(mode || '').toUpperCase();
  if (MOTIS_PRODUCT[m]) return MOTIS_PRODUCT[m];
  if (m === 'STREETCAR' || m === 'LIGHT_RAIL') return 'tram';
  if (m.includes('RAIL')) return 'rail';
  // Unknown mode: fall back to the GTFS route type (0 / 900–906 tram, 3 / 700–799 bus).
  const t = Number(routeType);
  if (t === 0 || (t >= 900 && t <= 906)) return 'tram';
  if (t === 3 || (t >= 700 && t <= 799)) return 'bus';
  return 'other';
}

export function productFromHafas(product) {
  const p = String(product || '').toLowerCase();
  if (p === 'tram') return 'tram';
  if (p === 'bus') return 'bus';
  if (p === 'subway') return 'subway';
  if (p === 'suburban') return 'suburban';
  if (p === 'ferry') return 'ferry';
  if (['regional', 'regionalexpress', 'national', 'nationalexpress', 'express'].includes(p)) return 'rail';
  return 'other';
}

/** Short line label for a badge: "7", "M10", "70", "S3", "E". Never "?". */
export function lineLabel(rawName, product) {
  let name = String(rawName || '').trim();
  name = name.replace(/^(STR|Tram|Str|Straßenbahn)\s+/i, '');
  name = name.replace(/^Bus\s+/i, '');
  // Leipzig's extra trams ("Einsetzer"/"Einsatzwagen") run as line "E".
  if (/^(einsetz|einsatz)/i.test(name)) return 'E';
  if (name) return name;
  return { tram: 'Tram', bus: 'Bus', subway: 'U', suburban: 'S', ferry: 'F' }[product] || '–';
}

/**
 * The line name from a MOTIS leg. Field names moved between API versions
 * (displayName since v4, routeShortName before), and some feeds only fill
 * tripShortName or routeLongName, e.g. for "E" extra trams.
 */
export function motisLineName(leg) {
  const pick = [leg?.displayName, leg?.routeShortName, leg?.tripShortName].find((v) => String(v ?? '').trim());
  if (pick != null) return String(pick).trim();
  const long = String(leg?.routeLongName || '').trim();
  return long.length <= 4 || /^(einsetz|einsatz)/i.test(long) ? long : '';
}

/** Human line name: "Tram 7", "Bus 70", "S3". */
export function lineName(rawName, product) {
  const label = lineLabel(rawName, product);
  if (product === 'tram') return `Tram ${label}`;
  if (product === 'bus') return `Bus ${label}`;
  return label;
}

export function modeAllowed(product, filter = DEFAULT_MODE_FILTER) {
  if (filter === 'all') return true;
  if (filter === 'tram') return product === 'tram';
  return product === 'tram' || product === 'bus';
}

// ───────────────────────────── Response parsers (pure) ─────────────────────────────

/**
 * MOTIS /api/v1/plan response → connections that board at `from`.
 * A connection is the first vehicle you board; arrival is the itinerary's end.
 */
export function parseMotisPlan(data, { from, filter = DEFAULT_MODE_FILTER, nearKm = 0 } = {}) {
  const itineraries = Array.isArray(data?.itineraries) ? data.itineraries : [];
  const out = [];
  for (const itin of itineraries) {
    const legs = Array.isArray(itin.legs) ? itin.legs : [];
    const transit = legs.filter((l) => l.mode && l.mode !== 'WALK' && l.mode !== 'BIKE' && l.mode !== 'CAR');
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
      apiColor: leg.routeColor ? { bg: leg.routeColor, fg: leg.routeTextColor } : null,
      source: 'transitous',
    });
  }
  return out;
}

function boardsAtStop(legFrom, stop) {
  if (!legFrom) return true;
  if (stop.tid && legFrom.stopId && sameStation(legFrom.stopId, stop.tid)) return true;
  return sameStopName(legFrom.name, stop.name);
}

/**
 * True when two Transitous stop IDs are the same stop or platforms of the same stop.
 * DELFI IDs look like "de-DELFI_de:14713:11508:1:1": country, district, stop, then area
 * and platform. The first three parts name the stop.
 */
export function sameStation(a, b) {
  const x = String(a);
  const y = String(b);
  if (x === y) return true;
  const station = (id) => {
    const parts = id.split(':');
    return parts.length >= 3 ? parts.slice(0, 3).join(':') : null;
  };
  const sx = station(x);
  return sx !== null && sx === station(y);
}

/** transport.rest /journeys response → connections that board at `from`. */
export function parseHafasJourneys(data, { from, filter = DEFAULT_MODE_FILTER } = {}) {
  const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
  const out = [];
  for (const journey of journeys) {
    const legs = Array.isArray(journey.legs) ? journey.legs : [];
    const transit = legs.filter((l) => !l.walking && l.line);
    const leg = transit[0];
    if (!leg) continue;

    if (from) {
      const sameId = from.hafasId && leg.origin?.id && String(leg.origin.id) === String(from.hafasId);
      if (!sameId && !sameStopName(leg.origin?.name, from.name)) continue;
    }

    const product = productFromHafas(leg.line.product || leg.line.mode);
    if (!modeAllowed(product, filter)) continue;

    const depIso = leg.departure || leg.plannedDeparture;
    const depMs = Date.parse(depIso);
    if (!Number.isFinite(depMs)) continue; // cancelled legs have no departure
    if (leg.cancelled) continue;
    const schedMs = leg.plannedDeparture ? Date.parse(leg.plannedDeparture) : depMs;
    const last = legs[legs.length - 1];
    const arrMs = Date.parse(last.arrival || last.plannedArrival);

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
      apiColor: leg.line.color ? { bg: leg.line.color.bg, fg: leg.line.color.fg } : null,
      source: 'hafas',
    });
  }
  return out;
}

/** Keep one entry per vehicle (earliest arrival wins). */
export function dedupeByTrip(list) {
  const best = new Map();
  for (const c of list) {
    const key = `${c.tripKey}|${c.schedMs}`;
    const prev = best.get(key);
    if (!prev || (c.arrMs ?? Infinity) < (prev.arrMs ?? Infinity)) best.set(key, c);
  }
  return [...best.values()];
}

// ───────────────────────────── Network client ─────────────────────────────

const HAFAS_PRODUCTS = {
  berlin: ['suburban', 'subway', 'tram', 'bus', 'ferry', 'express', 'regional'],
  leipzig: ['nationalExpress', 'national', 'regionalExpress', 'regional', 'suburban', 'bus', 'ferry', 'subway', 'tram', 'taxi'],
};

const MOTIS_MODES = { tram: 'TRAM', tram_bus: 'TRAM,BUS', all: 'TRANSIT' };

export function createTransitClient({ fetchImpl, timeoutMs = 12000, userAgent } = {}) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));

  async function getJson(url) {
    const headers = { Accept: 'application/json' };
    if (userAgent) headers['User-Agent'] = userAgent;
    let signal;
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) signal = AbortSignal.timeout(timeoutMs);
    const res = await doFetch(url, { headers, signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} from ${new URL(url).host}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function cityOf(cityKey) {
    return CITIES[cityKey] || CITIES.leipzig;
  }

  function withCity(city, query) {
    const q = expandStreetName(query);
    return new RegExp(`\\b${city.searchPrefix}\\b`, 'i').test(q) ? q : `${city.searchPrefix}, ${q}`;
  }

  // ── Stop search ──

  async function searchTransitous(cityKey, query) {
    const city = cityOf(cityKey);
    const params = new URLSearchParams({ text: withCity(city, query), language: 'de' });
    const items = await getJson(`${TRANSITOUS_BASE}/api/v1/geocode?${params}`);
    return (Array.isArray(items) ? items : [])
      .filter((i) => i.type === 'STOP')
      .filter((i) => distanceKm(i, city.center) < 35)
      .map((i) => ({ name: shortStopName(i.name), tid: i.id, lat: i.lat, lon: i.lon }));
  }

  async function searchHafas(cityKey, query) {
    const city = cityOf(cityKey);
    const params = new URLSearchParams({
      query: withCity(city, query),
      results: '8',
      stops: 'true',
      addresses: 'false',
      poi: 'false',
    });
    const items = await getJson(`${city.hafasBase}/locations?${params}`);
    return (Array.isArray(items) ? items : [])
      .filter((i) => i.type === 'stop' || i.type === 'station')
      .map((i) => ({
        name: shortStopName(i.name),
        hafasId: String(i.id),
        lat: i.location?.latitude,
        lon: i.location?.longitude,
      }))
      .filter((s) => distanceKm(s, city.center) < 35);
  }

  /** Autocomplete: both engines in parallel, merged by name, primary engine first. */
  async function searchStops(cityKey, query) {
    const city = cityOf(cityKey);
    if (!String(query || '').trim()) return [];
    const [t, h] = await Promise.allSettled([searchTransitous(cityKey, query), searchHafas(cityKey, query)]);
    const tList = t.status === 'fulfilled' ? t.value : [];
    const hList = h.status === 'fulfilled' ? h.value : [];
    const [first, second] = city.primary === 'transitous' ? [tList, hList] : [hList, tList];
    const merged = [];
    for (const s of first) {
      if (!merged.some((m) => normalizeStopName(m.name) === normalizeStopName(s.name))) merged.push({ ...s });
    }
    for (const s of second) {
      const twin = merged.find(
        (m) => normalizeStopName(m.name) === normalizeStopName(s.name) && distanceKm(m, s) < 0.6,
      );
      if (twin) {
        twin.tid ??= s.tid;
        twin.hafasId ??= s.hafasId;
      } else if (!merged.some((m) => normalizeStopName(m.name) === normalizeStopName(s.name))) {
        merged.push({ ...s });
      }
    }
    if (t.status === 'rejected' && h.status === 'rejected') throw t.reason;
    return merged.slice(0, 8);
  }

  async function nearbyHafas(cityKey, lat, lon) {
    const city = cityOf(cityKey);
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      results: '8',
      distance: '1200',
      stops: 'true',
      poi: 'false',
    });
    const items = await getJson(`${city.hafasBase}/locations/nearby?${params}`);
    return (Array.isArray(items) ? items : [])
      .filter((i) => i.type === 'stop' || i.type === 'station')
      .map((i) => ({
        name: shortStopName(i.name),
        hafasId: String(i.id),
        lat: i.location?.latitude,
        lon: i.location?.longitude,
        distance: i.distance,
      }));
  }

  /**
   * Transitous: every stop/platform inside a small box around you. Platform IDs are left out on
   * purpose: planning from one platform would only find trams in one direction, so the stop
   * is looked up again by name when the route is used.
   */
  async function nearbyTransitous(cityKey, lat, lon) {
    const dLat = 0.011; // ≈ 1.2 km
    const dLon = dLat / Math.cos((lat * Math.PI) / 180);
    const params = new URLSearchParams({ min: `${lat - dLat},${lon - dLon}`, max: `${lat + dLat},${lon + dLon}` });
    let items;
    try {
      items = await getJson(`${TRANSITOUS_BASE}/api/v1/map/stops?${params}`);
    } catch {
      items = await getJson(`${TRANSITOUS_BASE}/api/v1/reverse-geocode?${new URLSearchParams({ place: `${lat},${lon}`, type: 'STOP' })}`);
    }
    return (Array.isArray(items) ? items : [])
      .filter((i) => i && i.name && i.lat != null && i.lon != null && (!i.type || i.type === 'STOP'))
      .map((i) => ({ name: shortStopName(i.name), lat: i.lat, lon: i.lon }));
  }

  /**
   * Stops near a position, nearest first, one entry per stop name. Both engines are asked at
   * once, so it still works when one of them is down.
   */
  async function nearbyStops(cityKey, lat, lon) {
    const [t, h] = await Promise.allSettled([nearbyTransitous(cityKey, lat, lon), nearbyHafas(cityKey, lat, lon)]);
    if (t.status === 'rejected' && h.status === 'rejected') throw h.reason;
    const here = { lat, lon };
    const all = [...(h.status === 'fulfilled' ? h.value : []), ...(t.status === 'fulfilled' ? t.value : [])]
      .map((s) => ({ ...s, distance: s.lat != null ? Math.round(distanceKm(here, s) * 1000) : s.distance }))
      .filter((s) => s.distance == null || s.distance <= 1200)
      .sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9));
    const byName = [];
    for (const s of all) {
      const twin = byName.find((m) => normalizeStopName(m.name) === normalizeStopName(s.name));
      if (!twin) byName.push({ ...s });
      else twin.hafasId ??= s.hafasId;
    }
    return byName.slice(0, 6);
  }

  // ── Stop resolution (fills in missing IDs; returns a new object) ──

  async function resolveForTransitous(cityKey, stop) {
    if (stop.tid) return stop;
    const found = await searchTransitous(cityKey, stop.query || stop.name).catch(() => []);
    const named = found.filter((s) => sameStopName(s.name, stop.name));
    const best = pickNearest(named.length ? named : found, stop);
    if (best && (named.length || distanceKm(best, stop) < 0.5)) return { ...stop, tid: best.tid };
    return stop; // fall back to coordinates
  }

  async function resolveForHafas(cityKey, stop) {
    if (stop.hafasId) return stop;
    const found = await searchHafas(cityKey, stop.query || stop.name);
    const named = found.filter((s) => sameStopName(s.name, stop.name));
    const best = pickNearest(named.length ? named : found, stop);
    if (!best) throw new Error(`Stop not found: ${stop.name}`);
    return { ...stop, hafasId: best.hafasId };
  }

  // ── Connections ──

  async function viaTransitous(cityKey, from, to, filter, { anyPlatform = false } = {}) {
    const f = await resolveForTransitous(cityKey, from);
    const t = await resolveForTransitous(cityKey, to);
    const place = (s) => s.tid || (s.lat != null ? `${s.lat},${s.lon}` : null);
    if (!place(f) || !place(t)) throw new Error('Stop has no ID or coordinates');

    // anyPlatform (trip back): start from the place, not one stop ID, so every tram stop
    // around a big station counts. At Leipzig Hbf trams 3/7/8 and 9 use different stops.
    const fromPlace = anyPlatform && f.lat != null ? `${f.lat},${f.lon}` : place(f);
    const base = { fromPlace, toPlace: place(t), time: new Date().toISOString() };
    const extended = {
      ...base,
      transitModes: MOTIS_MODES[filter] || MOTIS_MODES.tram_bus,
      // seconds: board at this stop, don't walk to another one (5 min around a station on the trip back)
      maxPreTransitTime: anyPlatform ? '300' : '120',
      numItineraries: '8',
    };
    let data;
    try {
      data = await getJson(`${TRANSITOUS_BASE}/api/v1/plan?${new URLSearchParams(extended)}`);
    } catch (err) {
      if (err.status !== 400) throw err;
      // Older/newer MOTIS versions may reject an optional parameter: retry with the minimum.
      data = await getJson(`${TRANSITOUS_BASE}/api/v1/plan?${new URLSearchParams(base)}`);
    }
    return { list: parseMotisPlan(data, { from: f, filter, nearKm: anyPlatform ? 0.4 : 0 }), from: f, to: t };
  }

  async function viaHafas(cityKey, from, to, filter) {
    const city = cityOf(cityKey);
    const f = await resolveForHafas(cityKey, from);
    const t = await resolveForHafas(cityKey, to);
    const params = new URLSearchParams({
      from: f.hafasId,
      to: t.hafasId,
      results: '8',
      stopovers: 'false',
      remarks: 'false',
    });
    if (filter !== 'all') {
      for (const p of HAFAS_PRODUCTS[city.key] || []) {
        const on = p === 'tram' || (filter === 'tram_bus' && p === 'bus');
        params.set(p, on ? 'true' : 'false');
      }
    }
    const data = await getJson(`${city.hafasBase}/journeys?${params}`);
    return { list: parseHafasJourneys(data, { from: f, filter }), from: f, to: t };
  }

  /**
   * Live connections from one stop to another, with automatic engine fallback.
   * Returns { list, from, to, source } where from/to carry any IDs that were looked up.
   */
  async function connections(cityKey, from, to, filter = DEFAULT_MODE_FILTER, opts = {}) {
    const city = cityOf(cityKey);
    const engines = city.primary === 'transitous' ? [viaTransitous, viaHafas] : [viaHafas, viaTransitous];
    let lastError = null;
    let fromOut = from;
    let toOut = to;
    for (const engine of engines) {
      try {
        const r = await engine(cityKey, fromOut, toOut, filter, opts);
        fromOut = r.from;
        toOut = r.to;
        if (r.list.length) return { ...r, list: dedupeByTrip(r.list) };
      } catch (err) {
        lastError = err;
      }
    }
    if (lastError) throw lastError;
    return { list: [], from: fromOut, to: toOut };
  }

  return { searchStops, nearbyStops, connections };
}

// ───────────────────────────── Route → options → plan ─────────────────────────────

/**
 * A route turns into one "option" per origin stop. Forward: home stop → destination.
 * Reversed (trip home): destination → each home stop, so you take whichever gets you home first.
 */
export function routeOptions(route, reversed = false) {
  const stops = (route?.stops || []).filter((s) => s?.stop?.name);
  const buffer = bufferSecs(route?.buffer);
  // `walk` is what planning uses: the walk itself plus the spare time, in minutes (seconds precision).
  // No walk (you're at the stop) means no spare time either.
  const withBuffer = (walkBase) => ({ walkBase, buffer: walkBase ? buffer : 0, walk: walkBase ? walkBase + buffer / 60 : 0 });
  if (!reversed) {
    return stops.map((s, i) => ({ slot: i, from: s.stop, to: route.dest, ...withBuffer(num(s.walk, i === 0 ? 2 : 4)) }));
  }
  // The walk to the destination stop for the trip back is opt-in; without it there's nothing to plan around.
  return stops.map((s, i) => ({ slot: i, from: route.dest, to: s.stop, ...withBuffer(num(route.destWalk, 0)) }));
}

/** Spare seconds on top of every walk, for people who'd rather not run. */
export const BUFFER_CHOICES = [0, 15, 30, 60];

export function bufferSecs(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(120, n));
}

/** Walk minutes, kept to whole seconds so a stopwatch time like 3:42 survives. */
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== '' ? Math.max(0, Math.min(30, Math.round(n * 60) / 60)) : fallback;
}

/** "4 min" for whole minutes, "3:42 min" for a stopwatch time. */
export function formatWalk(minutes) {
  const secs = Math.round((Number(minutes) || 0) * 60);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}:${String(s).padStart(2, '0')} min` : `${m} min`;
}

/**
 * Fetch every option in parallel. Returns { connections, options, errors } where
 * `options` carry resolved stop IDs so callers can cache them.
 */
export async function fetchRoute(client, route, { reversed = false } = {}) {
  const options = routeOptions(route, reversed);
  const filter = route.modes || DEFAULT_MODE_FILTER;
  const settled = await Promise.allSettled(
    options.map((o) => client.connections(route.city, o.from, o.to, filter, { anyPlatform: reversed })),
  );
  const connections = [];
  const errors = [];
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
    const err = new Error(errors[0].message);
    err.errors = errors;
    throw err;
  }
  return { connections, options, errors };
}

/** You can catch it if it leaves no earlier than your walk takes. */
export function isCatchable(conn, now) {
  return conn.depMs - now >= conn.walk * 60000;
}

/**
 * Decide what to show. `selectedId` locks the hero onto a tapped trip until it leaves.
 * Returns { hero, manual, tooTight, perSlot, upcoming }.
 */
export function planTrips(connections, now, { selectedId = null, slots = 1, byArrival = false } = {}) {
  const upcoming = connections.filter((c) => c.depMs > now).sort((a, b) => a.depMs - b.depMs);
  // Trip back: you're already at the station, so the best tram is the one that gets you home first.
  const pick = (list) => {
    const ok = list.filter((c) => isCatchable(c, now));
    if (!byArrival) return ok[0] || null;
    return ok.reduce((best, c) => (!best || (c.arrMs ?? Infinity) < (best.arrMs ?? Infinity) ? c : best), null);
  };
  const firstCatchable = pick(upcoming);
  const selected = selectedId ? upcoming.find((c) => c.id === selectedId) || null : null;

  const hero = selected || firstCatchable;
  const manual = Boolean(selected) && selected !== firstCatchable;

  let tooTight = null;
  if (!manual) {
    const limit = hero ? hero.depMs : Infinity;
    tooTight = upcoming.find((c) => !isCatchable(c, now) && c.depMs <= limit) || null;
  }

  const perSlot = [];
  for (let s = 0; s < slots; s++) {
    const mine = upcoming.filter((c) => c.slot === s);
    perSlot.push({ slot: s, next: pick(mine), count: mine.length });
  }

  return { hero, manual, tooTight, perSlot, upcoming: upcoming.slice(0, 20) };
}

export function minutesUntil(conn, now) {
  return Math.max(0, Math.floor((conn.depMs - now) / 60000));
}

/** "Leave in 4 min" / "Leave now". */
/**
 * Short form of a tram's direction (Richtung), the way German departure boards shorten it.
 * Short names stay as they are. Longer ones lose the city prefix and get the usual short
 * forms (Hauptbahnhof → Hbf, Bahnhof → Bf, Straße → Str., Platz → Pl., Nord → N.); a
 * "District, Stop" name keeps the district; a double name keeps its first part and the
 * initial of the rest. "Böhlitz-Ehrenberg" → "Böhlitz-E.", "S+U Hauptbahnhof" → "S+U Hbf".
 */
export function shortDirection(name, { soft = 12, hard = 16 } = {}) {
  let s = shortStopName(String(name || '')).replace(/\s*\([^)]*\)\s*$/, '').trim();
  s = s.replace(/Hauptbahnhof/g, 'Hbf');
  if (s.length <= soft) return s;
  s = s
    .replace(/\bBahnhof\b/g, 'Bf')
    .replace(/stra(ß|ss)e\b/gi, (m) => (m[0] === 'S' ? 'Str.' : 'str.'))
    .replace(/(^|[\s-])Platz\b/g, '$1Pl.')
    .replace(/\b(Nord|Süd|Ost|West)\b/g, (m) => ({ Nord: 'N.', Süd: 'S.', Ost: 'O.', West: 'W.' })[m]);
  if (s.length <= soft) return s;
  if (s.includes(',')) {
    // "Lützschena, Am Wasserturm" → "Lützschena", but "Schönefeld, Ost" → "Schönefeld O."
    const [head, tail = ''] = s.split(',').map((x) => x.trim());
    s = tail.length <= 3 ? `${head} ${tail}`.trim() : head;
  }
  if (s.includes('/')) s = s.split('/')[0].trim(); // "S Schöneweide/Sterndamm" → "S Schöneweide"
  if (s.length <= soft) return s;
  const hy = s.split('-');
  if (hy.length > 1 && hy[0].length >= 3) {
    s = [hy[0], ...hy.slice(1).map((w) => (w.length <= 3 || w.endsWith('.') ? w : `${w[0]}.`))].join('-');
  }
  if (s.length <= hard) return s;
  const cut = s.slice(0, hard + 1).replace(/[\s-]+\S*$/, '');
  return cut.length >= 6 && cut.length <= hard ? cut : `${s.slice(0, hard - 1)}.`;
}

/**
 * Delay as a word instead of minutes. Brackets: early ≥ 1 min ahead of schedule, on time,
 * late 1–3 min, +late 4–7 min, ++late 8 min or more.
 */
export const DELAY_BRACKETS = [
  { key: 'early', label: 'early', text: 'Leaves 1 min or more before its timetable time. Be at the stop on time.' },
  { key: 'ontime', label: 'on time', text: 'Within a minute of the timetable.' },
  { key: 'late', label: 'late', max: 3, text: '1 to 3 minutes behind.' },
  { key: 'late2', label: '+late', max: 7, text: '4 to 7 minutes behind.' },
  { key: 'late3', label: '++late', text: '8 minutes or more behind.' },
];

export function delayLabel(delayMin) {
  const d = Math.round(Number(delayMin) || 0);
  const pick = (key) => DELAY_BRACKETS.find((b) => b.key === key);
  if (d <= -1) return pick('early');
  if (d < 1) return pick('ontime');
  if (d <= 3) return pick('late');
  if (d <= 7) return pick('late2');
  return pick('late3');
}

export function leaveAdvice(conn, now) {
  const secs = (conn.depMs - now) / 1000;
  const walkSecs = conn.walk * 60;
  if (conn.walk === 0) return { now: false, minutes: 0, atStop: true };
  if (secs <= walkSecs) return { now: true, minutes: 0, late: secs < walkSecs };
  return { now: false, minutes: Math.floor((secs - walkSecs) / 60) };
}

const clockFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

export function formatClock(ms) {
  return ms == null ? '' : clockFormat.format(new Date(ms));
}

// Voice answer rules (Alexa, Claude, ChatGPT all use describePlan):
//  - lead with when to leave the house; minutes only, no clock times or arrival
//  - name the stop only when the route has two stops; never the direction
//  - add one backup that leaves at least BACKUP_GAP_MIN later (a tram one minute
//    behind is no real backup); if that is more than LONG_GAP_MIN away, warn instead
//  - trip back: you're at the station already, so "leaves in" instead of "leave in"
export const BACKUP_GAP_MIN = 3;
export const LONG_GAP_MIN = 20;

const leaveMs = (c) => c.depMs - (c.walk || 0) * 60000;
const minsFrom = (ms, now) => Math.max(0, Math.floor((ms - now) / 60000));

/** The backup after `hero`: the first catchable tram leaving at least BACKUP_GAP_MIN later. */
export function backupFor(plan, now) {
  const { hero } = plan;
  if (!hero) return null;
  return (
    (plan.upcoming || [])
      .filter((c) => c !== hero && isCatchable(c, now) && leaveMs(c) >= leaveMs(hero) + BACKUP_GAP_MIN * 60000)
      .sort((a, b) => leaveMs(a) - leaveMs(b))[0] || null
  );
}

const WORDS = {
  en: {
    min: (n) => `${n} ${n === 1 ? 'minute' : 'minutes'}`,
    at: (stop) => ` at ${stop}`,
    leave: (m, what) => (m === 0 ? `Leave now for ${what}` : `Leave in ${m} for ${what}`),
    goesIn: (m) => (m === 0 ? ', it goes now' : `, it goes in ${m}`),
    orLeave: (m, what) => `Or leave in ${m} for ${what}.`,
    leaves: (what, m) => `${what} leaves ${m === 0 ? 'now' : `in ${m}`}`,
    then: (what, m) => `Then ${what} in ${m}.`,
    gap: (m) => `After that, nothing for ${m}.`,
    missed: (what) => `You won't make ${what}.`,
    change: (ch) => ` Change at ${ch.at} to ${ch.line}.`,
    noneTight: (what) => `You won't make ${what}, and nothing else is coming soon.`,
    none: 'I could not find any departures right now.',
  },
  de: {
    min: (n) => `${n} ${n === 1 ? 'Minute' : 'Minuten'}`,
    at: (stop) => ` ab ${stop}`,
    leave: (m, what) => (m === 0 ? `Geh jetzt los, ${what}` : `Geh in ${m} los, ${what}`),
    goesIn: (m) => (m === 0 ? ', fährt jetzt' : `, fährt in ${m}`),
    orLeave: (m, what) => `Oder in ${m}, ${what}.`,
    leaves: (what, m) => `${what} fährt ${m === 0 ? 'jetzt' : `in ${m}`}`,
    then: (what, m) => `Danach ${what} in ${m}.`,
    gap: (m) => `Danach kommt ${m} lang nichts.`,
    missed: (what) => `${what} schaffst du nicht mehr.`,
    change: (ch) => ` Umsteigen an ${ch.at} in ${ch.line}.`,
    noneTight: (what) => `${what} schaffst du nicht mehr, und danach kommt so bald nichts.`,
    none: 'Ich habe gerade keine Verbindungen gefunden.',
  },
};

/**
 * Plain sentences for voice assistants. lang: 'en' | 'de'.
 * stops: how many stops the route has (defaults to the plan's slots); the stop is named only with two.
 */
export function describePlan(plan, now, { lang = 'en', reversed = false, stops } = {}) {
  const w = WORDS[lang === 'de' ? 'de' : 'en'];
  const { hero, tooTight } = plan;
  const twoStops = !reversed && (stops ?? plan.perSlot?.length ?? 1) > 1;
  const what = (c) => `${c.lineName}${twoStops && c.stopName ? w.at(c.stopName) : ''}`;

  if (!hero) return tooTight ? w.noneTight(what(tooTight)) : w.none;

  const parts = [];
  const backup = backupFor(plan, now);
  const atStop = reversed || !hero.walk;

  if (tooTight && !reversed) parts.push(w.missed(what(tooTight)));

  if (atStop) {
    parts.push(`${w.leaves(what(hero), minsFrom(hero.depMs, now) && w.min(minsFrom(hero.depMs, now)))}.`);
  } else {
    const leaveIn = minsFrom(leaveMs(hero), now);
    let first = w.leave(leaveIn && w.min(leaveIn), what(hero));
    if (leaveIn === 0) first += w.goesIn(minsFrom(hero.depMs, now) && w.min(minsFrom(hero.depMs, now)));
    parts.push(`${first}.`);
  }
  if (reversed && hero.changes?.length) parts[parts.length - 1] += w.change(hero.changes[0]);

  if (backup) {
    const m = minsFrom(atStop ? backup.depMs : leaveMs(backup), now);
    if (m > LONG_GAP_MIN) parts.push(w.gap(w.min(m)));
    else parts.push(atStop ? w.then(what(backup), w.min(m)) : w.orLeave(w.min(m), what(backup)));
  }
  return parts.join(' ');
}
