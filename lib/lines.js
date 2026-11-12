/**
 * Line badge colours.
 *
 * Order of preference:
 *   1. LINE_COLORS below (curated, per city + product + line), so you can fix any colour here.
 *   2. The colour the transit API sends (GTFS route_color via Transitous, or HAFAS line.color).
 *   3. A neutral default per vehicle type.
 *
 * Values are CSS hex colours. `fg` is optional: when it is missing, black or white is
 * picked automatically for contrast.
 */

export const LINE_COLORS = {
  leipzig: {
    // LVB tram lines, from the LVB network maps (day map Nov 2026, night map Dec 2025).
    // The live feeds send every LVB tram in one red, so these are curated here.
    tram: {
      1: { bg: '#65B32E' }, '1E': { bg: '#65B32E' }, 3: { bg: '#65B32E' }, '3E': { bg: '#65B32E' }, N17: { bg: '#65B32E' },
      2: { bg: '#FFCC00', fg: '#1D1D1B' }, 8: { bg: '#FFCC00', fg: '#1D1D1B' }, 9: { bg: '#FFCC00', fg: '#1D1D1B' },
      4: { bg: '#213A8F' }, 7: { bg: '#213A8F' }, 12: { bg: '#213A8F' }, 15: { bg: '#213A8F' },
      10: { bg: '#E30613' }, 11: { bg: '#E30613' }, 14: { bg: '#E30613' }, 16: { bg: '#E30613' }, N10: { bg: '#E30613' },
    },
    bus: {},
  },
  berlin: {
    subway: {
      U1: { bg: '#7DAD4C' },
      U2: { bg: '#DA421E' },
      U3: { bg: '#16683D' },
      U4: { bg: '#F0D722' },
      U5: { bg: '#7E5330' },
      U6: { bg: '#8C6DAB' },
      U7: { bg: '#528DBA' },
      U8: { bg: '#224F86' },
      U9: { bg: '#F3791D' },
    },
    suburban: {
      S1: { bg: '#DA6BA2' },
      S2: { bg: '#007734' },
      S25: { bg: '#007734' },
      S26: { bg: '#007734' },
      S3: { bg: '#0066AD' },
      S41: { bg: '#AD5937' },
      S42: { bg: '#CB6418' },
      S45: { bg: '#CD9C53' },
      S46: { bg: '#CD9C53' },
      S47: { bg: '#CD9C53' },
      S5: { bg: '#EB7405' },
      S7: { bg: '#816DA6' },
      S75: { bg: '#816DA6' },
      S8: { bg: '#66AA22' },
      S85: { bg: '#66AA22' },
      S9: { bg: '#992746' },
    },
    tram: {},
    bus: {},
  },
};

const DEFAULTS = {
  tram: '#D7262F',
  bus: '#7B3FA0',
  subway: '#1D5FB4',
  suburban: '#188744',
  rail: '#5B6170',
  ferry: '#1D7FB4',
  other: '#5B6170',
};

/** Accepts "abc", "#abc", "aabbcc", "#aabbcc"; returns "#AABBCC" or null. */
export function normalizeHex(value) {
  if (!value) return null;
  let h = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? `#${h.toUpperCase()}` : null;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Black or white, whichever reads better on `bg`. */
export function contrastText(bg) {
  return luminance(bg) > 0.4 ? '#111111' : '#FFFFFF';
}

/**
 * @param {string} city   'leipzig' | 'berlin'
 * @param {string} product 'tram' | 'bus' | 'subway' | …
 * @param {string} line   badge label, e.g. '7', 'M10', 'U2'
 * @param {{bg?: string, fg?: string}} [api] colour from the API, if any
 * @returns {{ bg: string, fg: string, source: 'table' | 'api' | 'default' }}
 */
export function lineColor(city, product, line, api) {
  const curated = LINE_COLORS[city]?.[product]?.[String(line).toUpperCase()] || LINE_COLORS[city]?.[product]?.[String(line)];
  const fromTable = normalizeHex(curated?.bg);
  if (fromTable) return { bg: fromTable, fg: normalizeHex(curated.fg) || contrastText(fromTable), source: 'table' };

  const fromApi = normalizeHex(api?.bg);
  // Some feeds send white or black as a placeholder "no colour": ignore those.
  if (fromApi && fromApi !== '#FFFFFF' && fromApi !== '#000000') {
    return { bg: fromApi, fg: normalizeHex(api.fg) || contrastText(fromApi), source: 'api' };
  }

  const bg = DEFAULTS[product] || DEFAULTS.other;
  return { bg, fg: '#FFFFFF', source: 'default' };
}
