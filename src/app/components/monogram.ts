/** The big faint mark in the hero card's corner: stop initials, or the line number. */
import { esc } from '../dom.ts';
import { activeRoute, state } from '../store.ts';
import { shortStopName } from '../../transit/index.ts';
import type { Connection } from '../../transit/index.ts';

/**
 * Short stop mark: "Edlichstraße" → "Ed", "Torgauer Platz" → "TP", "S+U Warschauer Str." → "WS".
 * Kept distinct between the route's stops by adding a letter when two would collide.
 */
export function stopMonogram(name: string): string {
  const route = activeRoute();
  const names = [...route.stops.map((s) => s.stop.name), route.dest.name].map(shortStopName);
  const base = (n: string, len: number): string => {
    const words = shortStopName(n)
      .replace(/^(S\+U|S|U)\s+/, '')
      .split(/[\s\-/]+/)
      .filter((w) => /^[A-Za-zÄÖÜäöüß]/.test(w));
    if (words.length >= 2) return (words[0][0] + words[1].slice(0, len - 1)).replace(/^(.)(.*)$/, (m, a, b) => a.toUpperCase() + (len > 2 ? b.toLowerCase() : b.toUpperCase()));
    const w = words[0] || n;
    return w.slice(0, len).replace(/^./, (ch) => ch.toUpperCase());
  };
  const me = shortStopName(name);
  for (let len = 2; len <= 4; len++) {
    const mine = base(me, len);
    if (!names.some((o) => o !== me && base(o, len) === mine)) return mine;
  }
  return base(me, 2);
}

/**
 * Put the mark's ink (not its text box) exactly in the card's top-right corner, so the
 * letters touch both borders whatever font the device uses. The rounded corner may clip them.
 */
interface Ink {
  top: number;
  right: number;
}

export const inkCache = new Map<string, Ink>();
let measureCtx: CanvasRenderingContext2D | null = null;

export function fitMonogram(): void {
  const el = document.querySelector<HTMLElement>('#hero .monogram');
  if (!el) return;
  el.style.top = el.style.right = '';
  const cs = getComputedStyle(el);
  if (cs.transform !== 'none') return; // watch layout centres it instead
  const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const key = `${el.textContent}|${font}|${cs.letterSpacing}|${cs.lineHeight}|${cs.paddingLeft}`;
  let ink = inkCache.get(key);
  if (!ink) {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    if (!measureCtx || !('actualBoundingBoxAscent' in TextMetrics.prototype)) return;
    measureCtx.font = font;
    if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = cs.letterSpacing;
    const m = measureCtx.measureText(el.textContent ?? '');
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.05;
    const baseline = parseFloat(cs.paddingTop) + (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    ink = { top: baseline - m.actualBoundingBoxAscent, right: parseFloat(cs.paddingLeft) + m.actualBoundingBoxRight };
    inkCache.set(key, ink);
  }
  // Overshoot the corner a little so the card's border clips the letters: no sliver of gap on any font.
  const bleed = parseFloat(cs.fontSize) * 0.07;
  const bleedTop = parseFloat(cs.fontSize) * 0.015; // just past the edge, so the top bar of a T stays full
  el.style.top = `${-ink.top - bleedTop}px`;
  el.style.right = `${-(el.offsetWidth - ink.right) - bleed}px`;
}

export function heroMark(c: Connection, placeName: string, slots: number): string {
  if (state.mark === 'line' && c.line && c.lineKnown !== false) {
    const tint = c.color?.bg ? ` style="--mono-tint:${esc(c.color.bg)}"` : '';
    return `<span class="monogram line-mark"${tint} aria-hidden="true">${esc(c.line)}</span>`;
  }
  // "Tram number" with no known number falls back to the stop initials, never "?".
  if ((state.mark === 'stop' || state.mark === 'line') && slots > 1) return `<span class="monogram" aria-hidden="true">${esc(stopMonogram(placeName))}</span>`;
  return '';
}

