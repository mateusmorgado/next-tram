/** Small helpers shared by the intro's five demo screens. */
import { t } from '../../../i18n/index.ts';

/** What every demo gets: whether to keep still, the colour scheme and the shared 3D scene. */
export interface DemoContext {
  reduced: boolean;
  dark: boolean;
  scene(host: HTMLElement): Promise<IntroScene | null>;
  sceneNow(): IntroScene | null;
}

/** The 3D scene's handle (see scene.ts). Typed loosely here so the demos need not import three.js. */
export type IntroScene = ReturnType<typeof import('./scene.ts').createScene>;

/** A demo draws into the stage and returns a function that stops it. */
export type Demo = (stage: HTMLElement, ctx: DemoContext) => () => void;

/** A file next to index.html (icons, intro.css), as a full URL. */
export const ASSET = (path: string): string => new URL(path, document.baseURI).href;

export const ensureStyles = (): Promise<void> =>
  new Promise<void>((resolve) => {
    if (document.getElementById('introStyles')) return resolve();
    const link = document.createElement('link');
    link.id = 'introStyles';
    link.rel = 'stylesheet';
    link.href = ASSET('intro.css');
    link.onload = link.onerror = () => resolve();
    document.head.appendChild(link);
  });

export function isDark() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(bg);
  if (!m) return matchMedia('(prefers-color-scheme: dark)').matches;
  return (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128;
}

/** Run `tick(seconds, loopNo)` every frame, looping after `total` seconds. Returns a stop function. */
export function timeline(total: number, tick: (seconds: number, loop: number) => void, reduced: boolean, frozenAt = total * 0.8): () => void {
  if (reduced) {
    tick(frozenAt, 0);
    return () => {};
  }
  let raf = 0;
  let dead = false;
  const t0 = performance.now();
  const frame = (now: number) => {
    if (dead) return;
    const s = Math.max(0, now - t0) / 1000;
    tick(s % total, Math.floor(s / total));
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => {
    dead = true;
    cancelAnimationFrame(raf);
  };
}

export const setText = (el: Element | null, text: string): void => {
  if (el && el.textContent !== text) el.textContent = text;
};
export const setAttr = (el: Element | null, name: string, value: string | number): void => {
  if (el && el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value));
};
export const clock = (secs: number): string => `0:${String(Math.floor(secs)).padStart(2, '0')}`;

/** The app's main card, small. Used on the first and the last screen. */
export const miniHero = ({ mark = '' }: { mark?: string } = {}): string => `
  <div class="in-hero">
    ${mark}
    <small>${t('intro.demo.goToStop')}</small>
    <strong>Edlichstraße</strong>
    <div class="in-line"><span class="badge tram">3</span><span>→ Hauptbahnhof</span></div>
    <div class="in-count"><b class="in-num">6</b><i class="in-unit">min</i></div>
    <div class="in-leavebar">${t('intro.demo.leaveIn')}</div>
  </div>`;
