/**
 * Static city and route data. Coordinates are hints: the transit module looks up
 * each stop's exact ID by name at runtime and uses the coordinates to choose
 * between stops with the same name.
 */

export const CITIES = {
  leipzig: {
    key: 'leipzig',
    label: 'Leipzig',
    operator: 'LVB',
    // Transitous (MOTIS) covers the full MDV/LVB timetable with real-time data.
    primary: 'transitous',
    hafasBase: 'https://v6.db.transport.rest',
    searchPrefix: 'Leipzig',
    center: { lat: 51.3397, lon: 12.3731 },
  },
  berlin: {
    key: 'berlin',
    label: 'Berlin',
    operator: 'BVG',
    primary: 'hafas',
    hafasBase: 'https://v6.bvg.transport.rest',
    searchPrefix: 'Berlin',
    center: { lat: 52.52, lon: 13.405 },
  },
};

/** @typedef {{ name: string, query?: string, lat?: number, lon?: number, hafasId?: string, tid?: string }} Stop */

export const STOPS = {
  edlich: { name: 'Edlichstraße', query: 'Leipzig, Edlichstraße', lat: 51.3447, lon: 12.4149 },
  torgauer: { name: 'Torgauer Platz', query: 'Leipzig, Torgauer Platz', lat: 51.3469, lon: 12.4141 },
  leipzigHbf: { name: 'Hauptbahnhof', query: 'Leipzig Hauptbahnhof', lat: 51.3455, lon: 12.3817 },
  augustusplatz: { name: 'Augustusplatz', query: 'Leipzig, Augustusplatz', lat: 51.339, lon: 12.3812 },
  warschauer: { name: 'S+U Warschauer Str.', query: 'S+U Warschauer Str. (Berlin)', hafasId: '900120004', lat: 52.5058, lon: 13.4491 },
  strassmann: { name: 'Straßmannstr.', query: 'Straßmannstr. (Berlin)', lat: 52.5195, lon: 13.4567 },
  eberswalder: { name: 'U Eberswalder Str.', query: 'U Eberswalder Str. (Berlin)', hafasId: '900110006', lat: 52.5413, lon: 13.4123 },
};

/**
 * A route has one or two origin stops (each with its own walk time), one
 * destination, and an optional walk time to the destination stop that is used
 * when the route is reversed for the trip home.
 */
export const DEFAULT_ROUTES = [
  {
    id: 'lej-hbf',
    label: 'Hbf',
    city: 'leipzig',
    stops: [
      { stop: STOPS.edlich, walk: 2 },
      { stop: STOPS.torgauer, walk: 4 },
    ],
    dest: STOPS.leipzigHbf,
  },
  {
    id: 'ber-strassmann',
    label: 'Straßmannstr.',
    city: 'berlin',
    stops: [{ stop: STOPS.strassmann, walk: 2 }],
    dest: STOPS.eberswalder,
  },
];

/** Bump when DEFAULT_ROUTES changes; saved favorites that still match an old default get updated once. */
export const DEFAULTS_VERSION = 2;
/** Old default route ids → what to do with them on upgrade (null = drop, id = replace with that default). */
export const RETIRED_DEFAULTS = { 'lej-augustusplatz': null, 'ber-m10': 'ber-strassmann' };

export const MODE_FILTERS = {
  tram: { label: 'Tram only' },
  tram_bus: { label: 'Tram & bus' },
  all: { label: 'Everything' },
};

export const DEFAULT_MODE_FILTER = 'tram_bus';
