/**
 * "How it works": five short screens for someone opening NextTram for the first time.
 * Loaded on demand (see maybeShowIntro in screens/intro-launcher.ts), so none of this costs
 * anything on a normal start. Screens 2 and 3 use a small 3D scene (scene.ts + three.js), which
 * starts loading as soon as the intro opens; until it is there, and where WebGL is missing,
 * a flat map shows.
 */
import { t } from '../../../i18n/index.ts';
import { mountFast } from './demo-fast.ts';
import { mountLooks } from './demo-looks.ts';
import { mountScene } from './demo-scene.ts';
import { mountVoice } from './demo-voice.ts';
import { ensureStyles, isDark } from './helpers.ts';
import type { Demo, DemoContext, IntroScene } from './helpers.ts';

/** What the page tells the intro about itself, and what to do when it closes. */
export interface IntroOptions {
  /** Shown again after being skipped once. */
  reminder?: boolean;
  /** The person still has the built-in routes: the last button offers to set up their own. */
  needsSetup?: boolean;
  start?: number;
  onSetup?: () => void;
  onClose?: (result: IntroResult) => void;
}

export type IntroResult = 'skip' | 'done' | 'setup';

interface Step {
  key: string;
  mount: Demo;
}

const STEPS = [
  { key: 'fast', mount: mountFast },
  { key: 'walk', mount: mountScene('shortcut') },
  { key: 'run', mount: mountScene('run') },
  { key: 'voice', mount: mountVoice },
  { key: 'looks', mount: mountLooks },
];

let open: Promise<IntroResult> | null = null;

/**
 * @param {{ reminder?: boolean, needsSetup?: boolean, start?: number, onSetup?: () => void, onClose?: () => void }} [opts]
 */
export async function openIntro(opts: IntroOptions = {}): Promise<IntroResult> {
  if (open) return open;
  await ensureStyles();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = isDark();
  const dialog = document.createElement('dialog');
  dialog.className = 'intro';
  dialog.setAttribute('aria-labelledby', 'introTitle');
  dialog.innerHTML = `
    <div class="in-body">
      <header class="in-head">
        <div class="in-progress" aria-hidden="true">${STEPS.map(() => '<span></span>').join('')}</div>
        <button class="text-btn in-skip" type="button">${t('intro.skip')}</button>
      </header>
      <div class="in-stage"></div>
      <div class="in-copy" aria-live="polite">
        <p class="in-eyebrow"></p>
        <h2 id="introTitle"></h2>
        <p class="in-text"></p>
      </div>
      <footer class="in-nav">
        <button class="btn in-prev" type="button">${t('intro.back')}</button>
        <button class="btn btn-primary in-next" type="button">${t('intro.next')}</button>
      </footer>
    </div>`;
  document.body.appendChild(dialog);

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => dialog.querySelector(sel) as T;
  const stage = $('.in-stage');
  let index = -1;
  let unmount: (() => void) | null = null;
  let result: IntroResult = 'skip';

  // The 3D scene: one instance for both screens, loading in the background from the start.
  let scene: IntroScene | null = null;
  let scenePromise: Promise<IntroScene | null> | null = null;
  const sceneModule = import('./scene.ts').catch(() => null);
  const ctx: DemoContext = {
    reduced,
    dark,
    scene(host: HTMLElement) {
      scenePromise ||= sceneModule.then((mod) => {
        if (!mod || !dialog.isConnected) return null;
        try {
          scene = mod.createScene(host, { reduced, dark, onLost: () => host.closest('.in-3d')?.classList.remove('live') });
        } catch {
          scene = null; // no WebGL: the flat map stays
        }
        return scene;
      });
      return scenePromise;
    },
    sceneNow: () => scene,
  };

  function show(i: number) {
    const next = Math.min(Math.max(i, 0), STEPS.length - 1);
    if (next === index) return;
    const forward = next > index;
    index = next;
    const step = STEPS[index];
    const lastStep = index === STEPS.length - 1;
    unmount?.();
    stage.dataset.step = step.key;
    stage.classList.remove('from-left', 'from-right');
    void stage.offsetWidth;
    stage.classList.add(forward ? 'from-right' : 'from-left');
    unmount = step.mount(stage, ctx);
    $('.in-eyebrow').textContent = index === 0 ? (opts.reminder ? t('intro.reminder') : t('intro.welcome')) : t('intro.of', { n: index + 1, total: STEPS.length });
    $('#introTitle').textContent = t(`intro.${step.key}.title`);
    $('.in-text').innerHTML = t(`intro.${step.key}.text`);
    [...$('.in-progress').children].forEach((s, k) => {
      s.className = k < index ? 'done' : k === index ? 'now' : '';
    });
    $<HTMLButtonElement>('.in-prev').disabled = index === 0;
    $('.in-next').textContent = lastStep ? (opts.needsSetup ? t('intro.setup') : t('intro.gotIt')) : t('intro.next');
    $('.in-skip').textContent = lastStep ? t('intro.close') : t('intro.skip');
  }

  $('.in-next').addEventListener('click', () => {
    if (index < STEPS.length - 1) return show(index + 1);
    result = opts.needsSetup ? 'setup' : 'done';
    dialog.close();
  });
  $('.in-prev').addEventListener('click', () => show(index - 1));
  $('.in-skip').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  });
  // Swipe left / right to move between the screens.
  let down: { x: number; y: number } | null = null;
  dialog.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  dialog.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) show(index + (dx < 0 ? 1 : -1));
  });

  open = new Promise<IntroResult>((resolve) => {
    dialog.addEventListener('close', () => {
      unmount?.();
      scene?.destroy();
      dialog.remove();
      open = null;
      opts.onClose?.(result);
      if (result === 'setup') opts.onSetup?.();
      resolve(result);
    });
  });

  show(opts.start || 0);
  dialog.showModal();
  $('.in-next').focus({ preventScroll: true, focusVisible: false });
  return open;
}
