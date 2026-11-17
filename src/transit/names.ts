/** Stop-name helpers: matching, street-name expansion, short display names. */

/** Lower-case, unify "Straße/Strasse/Str./Str" → "str", drop punctuation. Used for matching. */
export function normalizeStopName(value?: unknown): string {
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
export function expandStreetName(value?: unknown): string {
  return String(value || '')
    .replace(/([A-Za-zÄÖÜäöüß])str\.(?=\s|,|$)/g, '$1straße')
    .replace(/([A-Za-zÄÖÜäöüß])str(?=\s|,|$)/g, '$1straße')
    .replace(/([A-Za-zÄÖÜäöüß])strasse\b/gi, '$1straße')
    .replace(/\bStr\.(?=\s|,|$)/g, 'Straße')
    .trim();
}

/** "Leipzig, Edlichstraße" / "Edlichstraße, Leipzig" / "U Eberswalder Str. (Berlin)" → short display name. */
export function shortStopName(value?: unknown): string {
  return String(value || '')
    .replace(/^(Leipzig|Berlin)[,\s]+/i, '')
    .replace(/,\s*(Leipzig|Berlin)$/i, '')
    .replace(/\s*\((Leipzig|Berlin)\)$/i, '')
    .trim();
}

/** True when two stop names refer to the same stop ("Leipzig, Edlichstr." vs "Edlichstraße"). */
export function sameStopName(a?: unknown, b?: unknown): boolean {
  const x = normalizeStopName(a);
  const y = normalizeStopName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}
