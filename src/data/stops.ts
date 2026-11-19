/**
 * Static city and route data. Coordinates are hints: the transit module looks up
 * each stop's exact ID by name at runtime and uses the coordinates to choose
 * between stops with the same name.
 */

import type { CityKey, ModeFilter, Place, Route, Stop } from '../transit/types.ts';

export interface City {
  key: CityKey;
  label: string;
  operator: string;
  /** The engine that is asked first. */
  primary: 'transitous' | 'hafas';
  hafasBase: string;
  searchPrefix: string;
  center: Required<Place>;
  /** Stops farther than this from the center are ignored in searches (default 35 km). */
  radiusKm?: number;
}

export const CITIES: Record<CityKey, City> = {
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
  // TEMPORARY (Altenburg job demo): remove after 2026-12-19. To remove: delete the `altenburg` city, the abg* stops and the abg-busbahnhof preset here, 'altenburg' in CityKey (src/transit/types.ts), LINE_COLORS/HAFAS_PRODUCTS entries, the citySeg button in public/index.html and the Altenburg test. The ?add= mechanism itself can stay.
  altenburg: {
    key: 'altenburg',
    label: 'Altenburg',
    operator: 'THÜSAC',
    // Transitous has the DELFI timetable for the Altenburger Land buses.
    primary: 'transitous',
    hafasBase: 'https://v6.db.transport.rest',
    searchPrefix: 'Altenburg (Thür.)',
    center: { lat: 50.9876, lon: 12.4367 },
    // Small town: Gera and Leipzig stops of the same name must not win.
    radiusKm: 12,
  },
};

export const STOPS: Record<string, Stop> = {
  edlich: { name: 'Edlichstraße', query: 'Leipzig, Edlichstraße', lat: 51.3447, lon: 12.4149 },
  torgauer: { name: 'Torgauer Platz', query: 'Leipzig, Torgauer Platz', lat: 51.3469, lon: 12.4141 },
  leipzigHbf: { name: 'Hauptbahnhof', query: 'Leipzig Hauptbahnhof', lat: 51.3455, lon: 12.3817 },
  augustusplatz: { name: 'Augustusplatz', query: 'Leipzig, Augustusplatz', lat: 51.339, lon: 12.3812 },
  warschauer: { name: 'S+U Warschauer Str.', query: 'S+U Warschauer Str. (Berlin)', hafasId: '900120004', lat: 52.5058, lon: 13.4491 },
  strassmann: { name: 'Straßmannstr.', query: 'Straßmannstr. (Berlin)', lat: 52.5195, lon: 13.4567 },
  eberswalder: { name: 'U Eberswalder Str.', query: 'U Eberswalder Str. (Berlin)', hafasId: '900110006', lat: 52.5413, lon: 13.4123 },
  // TEMPORARY (Altenburg job demo): remove after 2026-12-19, see CITIES.altenburg.
  // Porphyrstr. has one platform (buses towards Windischleuba/Frohburg and the 505 loop).
  abgPorphyr: { name: 'Porphyrstr.', query: 'Altenburg (Thür.), Porphyrstr.', tid: 'de-DELFI_de:16077:30961::06', lat: 51.00786, lon: 12.4559 },
  // Altenburg's bus station is the bus terminal at the railway station; the timetable calls it "Bahnhof (Bus)".
  abgBusbahnhof: { name: 'Busbahnhof', query: 'Altenburg (Thür.), Bahnhof (Bus)', tid: 'de-DELFI_de:16077:12511::01', lat: 50.99687, lon: 12.44181 },
};

/**
 * A route has one or two origin stops (each with its own walk time), one
 * destination, and an optional walk time to the destination stop that is used
 * when the route is reversed for the trip home.
 */
export const DEFAULT_ROUTES: Route[] = [
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

/**
 * Ready-made routes that a link can add: `?add=<id>` (for example `?add=abg-busbahnhof&lang=de`).
 * They are not built in; the link adds one to the visitor's favorites and opens it.
 */
export const PRESET_ROUTES: Route[] = [
  // TEMPORARY (Altenburg job demo): remove after 2026-12-19, see CITIES.altenburg.
  {
    id: 'abg-busbahnhof',
    label: 'Busbahnhof',
    city: 'altenburg',
    stops: [{ stop: STOPS.abgPorphyr, walk: 6 }],
    dest: STOPS.abgBusbahnhof,
    modes: 'tram_bus',
  },
];

/** Bump when DEFAULT_ROUTES changes; saved favorites that still match an old default get updated once. */
export const DEFAULTS_VERSION = 2;
/** Old default route ids → what to do with them on upgrade (null = drop, id = replace with that default). */
export const RETIRED_DEFAULTS: Record<string, string | null> = { 'lej-augustusplatz': null, 'ber-m10': 'ber-strassmann' };

export const MODE_FILTERS: Record<ModeFilter, { label: string }> = {
  tram: { label: 'Tram only' },
  tram_bus: { label: 'Tram & bus' },
  all: { label: 'Everything' },
};

export const DEFAULT_MODE_FILTER: ModeFilter = 'tram_bus';
