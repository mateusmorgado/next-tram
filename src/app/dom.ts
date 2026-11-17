/** Small DOM and HTML-string helpers shared by every screen. */
import { t } from '../i18n/index.ts';
import { formatWalk } from '../transit/index.ts';
import type { Connection } from '../transit/index.ts';

/** The element with this id. The ids come from index.html, so a missing one is a bug and throws. */
export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
}

/** The closest ancestor of the event's target that matches `selector`, if any. */
export function closest<T extends Element = HTMLElement>(event: Event, selector: string): T | null {
  return event.target instanceof Element ? event.target.closest<T>(selector) : null;
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for use in an HTML string. */
export const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** The coloured line badge ("7", "M10", "S3"). */
export const badge = (c: Pick<Connection, 'product' | 'line'> & Partial<Pick<Connection, 'color'>>, size = ''): string => {
  const style = c.color ? ` style="background:${esc(c.color.bg)};color:${esc(c.color.fg)}"` : '';
  return `<span class="badge ${esc(c.product)} ${size}"${style}>${esc(c.line)}</span>`;
};

/** Only touch the DOM when the markup changed, so taps and focus survive the once-a-second tick. */
const htmlCache = new WeakMap<Element, string>();
export function setHtml(el: Element, html: string): boolean {
  if (htmlCache.get(el) === html) return false;
  htmlCache.set(el, html);
  el.innerHTML = html;
  return true;
}

/** "3:42 min walk", plus the spare time when there is some: "3:42 min walk + 30 s". */
export const walkText = (c: Pick<Connection, 'buffer' | 'walk' | 'walkBase'>): string =>
  c.buffer
    ? t('hero.walkSpare', { time: formatWalk(c.walkBase ?? c.walk), secs: c.buffer })
    : t('hero.walk', { time: formatWalk(c.walkBase ?? c.walk) });
