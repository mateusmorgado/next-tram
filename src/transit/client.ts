/** Network client: stop search, nearby stops and live connections, with automatic engine fallback. */
import { CITIES, DEFAULT_MODE_FILTER, type City } from '../data/stops.ts';
import { TRANSITOUS_BASE } from './constants.ts';
import { distanceKm, pickNearest } from './geo.ts';
import { expandStreetName, normalizeStopName, sameStopName, shortStopName } from './names.ts';
import { parseHafasJourneys } from './parse/hafas.ts';
import { parseMotisPlan } from './parse/motis.ts';
import { dedupeByTrip } from './parse/common.ts';
import type { CityKey, Departure, ModeFilter, Stop } from './types.ts';

export interface ConnectionOptions {
  /** Trip back: plan from the place, so every platform of a big station counts. */
  anyPlatform?: boolean;
}

export interface EngineResult {
  list: Departure[];
  from: Stop;
  to: Stop;
  source?: string;
}


const HAFAS_PRODUCTS: Record<string, string[]> = {
  berlin: ['suburban', 'subway', 'tram', 'bus', 'ferry', 'express', 'regional'],
  altenburg: ['nationalExpress', 'national', 'regionalExpress', 'regional', 'suburban', 'bus', 'ferry', 'subway', 'tram', 'taxi'],
  leipzig: ['nationalExpress', 'national', 'regionalExpress', 'regional', 'suburban', 'bus', 'ferry', 'subway', 'tram', 'taxi'],
};

const MOTIS_MODES: Record<string, string> = { tram: 'TRAM', tram_bus: 'TRAM,BUS', all: 'TRANSIT' };

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  userAgent?: string;
}

/** An HTTP error that remembers the status, so callers can react to a 400. */
class HttpError extends Error {
  status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`);
    this.status = status;
  }
}

type Json = any; // API replies are untrusted: every consumer below reads them defensively.

export function createTransitClient({ fetchImpl, timeoutMs = 12000, userAgent }: ClientOptions = {}) {
  const doFetch: typeof fetch = fetchImpl || ((...a) => globalThis.fetch(...a));

  async function getJson(url: string): Promise<Json> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (userAgent) headers['User-Agent'] = userAgent;
    let signal: AbortSignal | undefined;
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) signal = AbortSignal.timeout(timeoutMs);
    const res = await doFetch(url, { headers, signal });
    if (!res.ok) throw new HttpError(res.status, url);
    return res.json();
  }

  function cityOf(cityKey: CityKey): City {
    return CITIES[cityKey] || CITIES.leipzig;
  }

  function withCity(city: City, query: string): string {
    const q = expandStreetName(query);
    const town = city.searchPrefix.split(/[\s,(]/)[0]; // "Altenburg (Thür.)" → "Altenburg"
    return new RegExp(`\\b${town}\\b`, 'i').test(q) ? q : `${city.searchPrefix}, ${q}`;
  }

  // ── Stop search ──

  async function searchTransitous(cityKey: CityKey, query: string): Promise<Stop[]> {
    const city = cityOf(cityKey);
    const params = new URLSearchParams({ text: withCity(city, query), language: 'de' });
    const items = await getJson(`${TRANSITOUS_BASE}/api/v1/geocode?${params}`);
    return (Array.isArray(items) ? items : [])
      .filter((i: Json) => i.type === 'STOP')
      .filter((i: Json) => distanceKm(i, city.center) < (city.radiusKm ?? 35))
      .map((i: Json) => ({ name: shortStopName(i.name), tid: i.id, lat: i.lat, lon: i.lon }));
  }

  async function searchHafas(cityKey: CityKey, query: string): Promise<Stop[]> {
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
      .filter((i: Json) => i.type === 'stop' || i.type === 'station')
      .map((i: Json) => ({
        name: shortStopName(i.name),
        hafasId: String(i.id),
        lat: i.location?.latitude,
        lon: i.location?.longitude,
      }))
      .filter((s: Stop) => distanceKm(s, city.center) < (city.radiusKm ?? 35));
  }

  /** Autocomplete: both engines in parallel, merged by name, primary engine first. */
  async function searchStops(cityKey: CityKey, query: string): Promise<Stop[]> {
    const city = cityOf(cityKey);
    if (!String(query || '').trim()) return [];
    const [t, h] = await Promise.allSettled([searchTransitous(cityKey, query), searchHafas(cityKey, query)]);
    const tList = t.status === 'fulfilled' ? t.value : [];
    const hList = h.status === 'fulfilled' ? h.value : [];
    const [first, second] = city.primary === 'transitous' ? [tList, hList] : [hList, tList];
    const merged: Stop[] = [];
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

  async function nearbyHafas(cityKey: CityKey, lat: number, lon: number): Promise<Stop[]> {
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
      .filter((i: Json) => i.type === 'stop' || i.type === 'station')
      .map((i: Json) => ({
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
  async function nearbyTransitous(_cityKey: CityKey, lat: number, lon: number): Promise<Stop[]> {
    const dLat = 0.011; // ≈ 1.2 km
    const dLon = dLat / Math.cos((lat * Math.PI) / 180);
    const params = new URLSearchParams({ min: `${lat - dLat},${lon - dLon}`, max: `${lat + dLat},${lon + dLon}` });
    let items: Json;
    try {
      items = await getJson(`${TRANSITOUS_BASE}/api/v1/map/stops?${params}`);
    } catch {
      items = await getJson(`${TRANSITOUS_BASE}/api/v1/reverse-geocode?${new URLSearchParams({ place: `${lat},${lon}`, type: 'STOP' })}`);
    }
    return (Array.isArray(items) ? items : [])
      .filter((i: Json) => i && i.name && i.lat != null && i.lon != null && (!i.type || i.type === 'STOP'))
      .map((i: Json) => ({ name: shortStopName(i.name), lat: i.lat, lon: i.lon }));
  }

  /**
   * Stops near a position, nearest first, one entry per stop name. Both engines are asked at
   * once, so it still works when one of them is down.
   */
  async function nearbyStops(cityKey: CityKey, lat: number, lon: number): Promise<Stop[]> {
    const [t, h] = await Promise.allSettled([nearbyTransitous(cityKey, lat, lon), nearbyHafas(cityKey, lat, lon)]);
    if (t.status === 'rejected' && h.status === 'rejected') throw h.reason;
    const here = { lat, lon };
    const all = [...(h.status === 'fulfilled' ? h.value : []), ...(t.status === 'fulfilled' ? t.value : [])]
      .map((s) => ({ ...s, distance: s.lat != null ? Math.round(distanceKm(here, s) * 1000) : s.distance }))
      .filter((s) => s.distance == null || s.distance <= 1200)
      .sort((a, b) => (a.distance ?? 9e9) - (b.distance ?? 9e9));
    const byName: Stop[] = [];
    for (const s of all) {
      const twin = byName.find((m) => normalizeStopName(m.name) === normalizeStopName(s.name));
      if (!twin) byName.push({ ...s });
      else twin.hafasId ??= s.hafasId;
    }
    return byName.slice(0, 6);
  }

  // ── Stop resolution (fills in missing IDs; returns a new object) ──

  async function resolveForTransitous(cityKey: CityKey, stop: Stop): Promise<Stop> {
    if (stop.tid) return stop;
    const found = await searchTransitous(cityKey, stop.query || stop.name).catch(() => []);
    const named = found.filter((s) => sameStopName(s.name, stop.name));
    const best = pickNearest(named.length ? named : found, stop);
    if (best && (named.length || distanceKm(best, stop) < 0.5)) return { ...stop, tid: best.tid };
    return stop; // fall back to coordinates
  }

  async function resolveForHafas(cityKey: CityKey, stop: Stop): Promise<Stop> {
    if (stop.hafasId) return stop;
    const found = await searchHafas(cityKey, stop.query || stop.name);
    const named = found.filter((s) => sameStopName(s.name, stop.name));
    const best = pickNearest(named.length ? named : found, stop);
    if (!best) throw new Error(`Stop not found: ${stop.name}`);
    return { ...stop, hafasId: best.hafasId };
  }

  // ── Connections ──

  async function viaTransitous(cityKey: CityKey, from: Stop, to: Stop, filter: ModeFilter, { anyPlatform = false }: ConnectionOptions = {}): Promise<EngineResult> {
    const f = await resolveForTransitous(cityKey, from);
    const t = await resolveForTransitous(cityKey, to);
    const place = (s: Stop) => s.tid || (s.lat != null ? `${s.lat},${s.lon}` : null);
    const fromId = place(f);
    const toId = place(t);
    if (!fromId || !toId) throw new Error('Stop has no ID or coordinates');

    // anyPlatform (trip back): start from the place, not one stop ID, so every tram stop
    // around a big station counts. At Leipzig Hbf trams 3/7/8 and 9 use different stops.
    const fromPlace = anyPlatform && f.lat != null ? `${f.lat},${f.lon}` : fromId;
    const base = { fromPlace, toPlace: toId, time: new Date().toISOString() };
    const extended = {
      ...base,
      transitModes: MOTIS_MODES[filter] || MOTIS_MODES.tram_bus,
      // seconds: board at this stop, don't walk to another one (5 min around a station on the trip back)
      maxPreTransitTime: anyPlatform ? '300' : '120',
      numItineraries: '8',
    };
    let data: Json;
    try {
      data = await getJson(`${TRANSITOUS_BASE}/api/v1/plan?${new URLSearchParams(extended)}`);
    } catch (err) {
      if ((err as HttpError).status !== 400) throw err;
      // Older/newer MOTIS versions may reject an optional parameter: retry with the minimum.
      data = await getJson(`${TRANSITOUS_BASE}/api/v1/plan?${new URLSearchParams(base)}`);
    }
    return { list: parseMotisPlan(data, { from: f, filter, nearKm: anyPlatform ? 0.4 : 0 }), from: f, to: t };
  }

  async function viaHafas(cityKey: CityKey, from: Stop, to: Stop, filter: ModeFilter): Promise<EngineResult> {
    const city = cityOf(cityKey);
    const f = await resolveForHafas(cityKey, from);
    const t = await resolveForHafas(cityKey, to);
    const params = new URLSearchParams({
      from: f.hafasId as string,
      to: t.hafasId as string,
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
  async function connections(cityKey: CityKey, from: Stop, to: Stop, filter: ModeFilter = DEFAULT_MODE_FILTER, opts: ConnectionOptions = {}): Promise<EngineResult> {
    const city = cityOf(cityKey);
    const engines = city.primary === 'transitous' ? [viaTransitous, viaHafas] : [viaHafas, viaTransitous];
    let lastError: unknown = null;
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

export type TransitClient = ReturnType<typeof createTransitClient>;
