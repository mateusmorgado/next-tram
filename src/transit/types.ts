/** Shared types of the transit core. */

export type CityKey = 'leipzig' | 'berlin' | 'altenburg';
export type Lang = 'en' | 'de' | 'pt';
/** Which vehicles count: trams only, trams and buses, or everything. */
export type ModeFilter = 'tram' | 'tram_bus' | 'all';
export type Product = 'tram' | 'bus' | 'subway' | 'suburban' | 'rail' | 'ferry' | 'other';

/** A stop. IDs are filled in lazily: `tid` for Transitous, `hafasId` for HAFAS. */
export interface Stop {
  name: string;
  query?: string;
  lat?: number;
  lon?: number;
  hafasId?: string;
  tid?: string;
  /** Meters from the search position (nearby search only). */
  distance?: number;
}

export interface Place {
  lat?: number;
  lon?: number;
}

export interface RouteStop {
  stop: Stop;
  /** Minutes on foot from home to this stop. */
  walk: number;
}

/** A favorite route: one or two home stops, one destination. */
export interface Route {
  id: string;
  label: string;
  city: CityKey;
  stops: RouteStop[];
  dest: Stop;
  modes?: ModeFilter;
  /** Minutes on foot at the destination, used for the trip back. */
  destWalk?: number;
  /** Never run for a tram. */
  noRun?: boolean;
  /** Spare seconds added to every walk. */
  buffer?: number;
}

export interface ApiColor {
  bg?: string;
  fg?: string;
}

export interface LineColor {
  bg: string;
  fg: string;
  source: 'table' | 'api' | 'default';
}

/** The first vehicle you board, as parsed from either engine. */
export interface Departure {
  tripKey: string;
  /** Badge label: "7", "M10", "S3". */
  line: string;
  lineKnown: boolean;
  /** "Tram 7". */
  lineName: string;
  product: Product;
  direction: string;
  depMs: number;
  schedMs: number;
  delayMin: number;
  realtime: boolean;
  arrMs: number | null;
  boardAt: string;
  transfers: number;
  changes: { line: string; at: string }[];
  /** Where you get off, when the journey ends with a walk. */
  getOffAt?: string;
  walkAfterMin?: number;
  apiColor: ApiColor | null;
  source: 'transitous' | 'hafas';
}

/** A departure placed in a route: which stop, how far to walk, which colour. */
export interface Connection extends Departure {
  id: string;
  slot: number;
  /** Minutes: the walk plus the spare time. */
  walk: number;
  walkBase: number;
  /** Spare seconds. */
  buffer: number;
  noRun: boolean;
  color: LineColor;
  stopName: string;
  toName: string;
}

/** One origin → destination request of a route. */
export interface RouteOption {
  slot: number;
  from: Stop;
  to: Stop;
  walkBase: number;
  buffer: number;
  walk: number;
  noRun: boolean;
}

export interface SlotPlan {
  slot: number;
  next: Connection | null;
  count: number;
}

export interface Plan {
  hero: Connection | null;
  /** The hero was picked by tapping, not the fastest. */
  manual: boolean;
  /** Something leaves before the hero but you cannot reach it. */
  tooTight: Connection | null;
  perSlot: SlotPlan[];
  upcoming: Connection[];
}

export interface LeaveAdvice {
  now: boolean;
  minutes: number;
  atStop?: boolean;
  late?: boolean;
  run?: boolean;
}

export interface DelayBracket {
  key: 'early' | 'ontime' | 'late' | 'late2' | 'late3';
  label: string;
  max?: number;
  text: string;
}

export interface FetchRouteResult {
  connections: Connection[];
  options: RouteOption[];
  errors: { slot: number; message: string }[];
}

// ── Raw API shapes (only the fields the parsers read) ──

export interface MotisPlace {
  name?: string;
  stopId?: string;
  lat?: number;
  lon?: number;
}

export interface MotisLeg {
  mode?: string;
  routeType?: number;
  from?: MotisPlace;
  to?: MotisPlace;
  startTime: string;
  scheduledStartTime?: string;
  endTime: string;
  tripId?: string;
  displayName?: string;
  routeShortName?: string;
  tripShortName?: string;
  routeLongName?: string;
  headsign?: string;
  realTime?: boolean;
  routeColor?: string;
  routeTextColor?: string;
}

export interface MotisPlan {
  itineraries?: { endTime?: string; legs?: MotisLeg[] }[];
}

export interface HafasLeg {
  walking?: boolean;
  cancelled?: boolean;
  tripId?: string;
  line?: { name?: string; product?: string; mode?: string; color?: { bg?: string; fg?: string } };
  origin?: { id?: string; name?: string };
  destination?: { name?: string };
  direction?: string;
  departure?: string;
  plannedDeparture?: string;
  arrival?: string;
  plannedArrival?: string;
  departureDelay?: number | null;
}

/** A HAFAS leg that is a vehicle ride (has a line). */
export type HafasRide = HafasLeg & { line: NonNullable<HafasLeg['line']> };

export interface HafasJourneys {
  journeys?: { legs?: HafasLeg[] }[];
}
