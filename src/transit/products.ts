import { DEFAULT_MODE_FILTER } from '../data/stops.ts';
import type { ModeFilter, MotisLeg, Product } from './types.ts';


const MOTIS_PRODUCT: Record<string, Product> = {
  TRAM: 'tram',
  BUS: 'bus',
  COACH: 'bus',
  SUBWAY: 'subway',
  METRO: 'subway',
  SUBURBAN: 'suburban',
  FERRY: 'ferry',
};

export function productFromMotisMode(mode?: string | null, routeType?: number | string | null): Product {
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

export function productFromHafas(product?: string | null): Product {
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
export function lineLabel(rawName: unknown, product?: Product): string {
  let name = String(rawName || '').trim();
  name = name.replace(/^(STR|Tram|Str|Straßenbahn)\s+/i, '');
  name = name.replace(/^Bus\s+/i, '');
  // Leipzig's extra trams ("Einsetzer"/"Einsatzwagen") run as line "E".
  if (/^(einsetz|einsatz)/i.test(name)) return 'E';
  if (name) return name;
  return ({ tram: 'Tram', bus: 'Bus', subway: 'U', suburban: 'S', ferry: 'F' } as Partial<Record<Product, string>>)[product as Product] || '–';
}

/**
 * The line name from a MOTIS leg. Field names moved between API versions
 * (displayName since v4, routeShortName before), and some feeds only fill
 * tripShortName or routeLongName, e.g. for "E" extra trams.
 */
export function motisLineName(leg?: MotisLeg): string {
  const pick = [leg?.displayName, leg?.routeShortName, leg?.tripShortName].find((v) => String(v ?? '').trim());
  if (pick != null) return String(pick).trim();
  const long = String(leg?.routeLongName || '').trim();
  return long.length <= 4 || /^(einsetz|einsatz)/i.test(long) ? long : '';
}

/** Human line name: "Tram 7", "Bus 70", "S3". */
export function lineName(rawName: unknown, product?: Product): string {
  const label = lineLabel(rawName, product);
  if (product === 'tram') return `Tram ${label}`;
  if (product === 'bus') return `Bus ${label}`;
  return label;
}

export function modeAllowed(product: Product, filter: ModeFilter = DEFAULT_MODE_FILTER): boolean {
  if (filter === 'all') return true;
  if (filter === 'tram') return product === 'tram';
  return product === 'tram' || product === 'bus';
}
