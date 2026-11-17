import type { Place } from './types.ts';


export function distanceKm(a?: Place | null, b?: Place | null): number {
  if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function pickNearest<T extends Place>(candidates: T[], hint?: Place | null): T | null {
  if (!candidates.length) return null;
  if (!hint || hint.lat == null) return candidates[0];
  return [...candidates].sort((p, q) => distanceKm(p, hint) - distanceKm(q, hint))[0];
}
