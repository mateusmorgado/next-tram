/**
 * "How it works": five short screens for someone opening NextTram for the first time.
 * Loaded on demand (see maybeShowIntro in app.js), so none of this costs anything on a normal start.
 * Screens 2 and 3 use a small 3D scene (lib/intro-scene.js + three.js), which starts loading
 * as soon as the intro opens; until it is there, and where WebGL is missing, a flat map shows.
 */

import { t } from './i18n.js';

const ASSET = (path) => new URL(`../${path}`, import.meta.url).href;

const ensureStyles = () =>
  new Promise((resolve) => {
    if (document.getElementById('introStyles')) return resolve();
    const link = document.createElement('link');
    link.id = 'introStyles';
    link.rel = 'stylesheet';
    link.href = ASSET('intro.css');
    link.onload = link.onerror = () => resolve();
    document.head.appendChild(link);
  });

function isDark() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(bg);
  if (!m) return matchMedia('(prefers-color-scheme: dark)').matches;
  return (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128;
}

/** Run `tick(seconds, loopNo)` every frame, looping after `total` seconds. Returns a stop function. */
function timeline(total, tick, reduced, frozenAt = total * 0.8) {
  if (reduced) {
    tick(frozenAt, 0);
    return () => {};
  }
  let raf = 0;
  let dead = false;
  const t0 = performance.now();
  const frame = (now) => {
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

const setText = (el, text) => {
  if (el && el.textContent !== text) el.textContent = text;
};
const setAttr = (el, name, value) => {
  if (el && el.getAttribute(name) !== String(value)) el.setAttribute(name, value);
};
const clock = (secs) => `0:${String(Math.floor(secs)).padStart(2, '0')}`;

/** The app's main card, small. Used on the first and the last screen. */
const miniHero = ({ mark = '' } = {}) => `
  <div class="in-hero">
    ${mark}
    <small>${t('intro.demo.goToStop')}</small>
    <strong>Edlichstraße</strong>
    <div class="in-line"><span class="badge tram">3</span><span>→ Hauptbahnhof</span></div>
    <div class="in-count"><b class="in-num">6</b><i class="in-unit">min</i></div>
    <div class="in-leavebar">${t('intro.demo.leaveIn')}</div>
  </div>`;

// ── 1. One answer, right away ──
function mountFast(stage, ctx) {
  stage.innerHTML = `
    <div class="in-race" data-phase="splash">
      <figure class="in-phone slow">
        <div class="in-screen">
          <div class="in-scr splash"><span class="in-logo"></span><span class="in-spin"></span><small>${t('intro.demo.loading')}</small></div>
          <div class="in-scr home">
            <span class="in-bar"></span>
            <span class="in-banner"><b>${t('intro.demo.offers')}</b><i></i></span>
            <span class="in-tiles"><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <span class="in-tabs"><i></i><i></i><i></i><i></i></span>
          </div>
          <div class="in-scr search">
            <span class="in-bar"></span>
            <small>${t('intro.demo.from')}</small><span class="in-field"><i class="a"></i></span>
            <small>${t('intro.demo.to')}</small><span class="in-field"><i class="b"></i></span>
            <span class="in-go">${t('intro.demo.search')}</span>
          </div>
          <div class="in-scr wait"><span class="in-spin"></span></div>
          <div class="in-scr list">
            <span class="in-bar"></span>
            <span class="in-row"><b>12:04</b><i></i><em>+3</em></span>
            <span class="in-row"><b>12:10</b><i></i></span>
            <span class="in-row"><b>12:14</b><i></i><em>+1</em></span>
            <span class="in-think">${t('intro.demo.think')}</span>
          </div>
        </div>
        <figcaption><span>${t('intro.demo.typical')}</span><b class="in-clock" data-clock="slow">0:00</b></figcaption>
      </figure>
      <figure class="in-phone fast">
        <div class="in-screen">
          <div class="in-scr skeleton"><i></i><i></i><i></i></div>
          <div class="in-scr app">
            <span class="in-apptop"><img src="${ASSET('icons/icon.svg')}" alt="" width="14" height="14"><b>NextTram</b></span>
            ${miniHero()}
            <span class="in-later"><span class="badge tram">7</span><i></i><b>11 min</b></span>
          </div>
        </div>
        <figcaption><span>NextTram</span><b class="in-clock" data-clock="fast">0:00</b></figcaption>
      </figure>
    </div>`;
  const race = stage.firstElementChild;
  const slow = race.querySelector('[data-clock="slow"]');
  const fast = race.querySelector('[data-clock="fast"]');
  const PHASES = [[0, 'splash'], [2.4, 'home'], [4.2, 'search'], [6.9, 'wait'], [7.9, 'list']];
  return timeline(
    12.5,
    (t) => {
      const phase = PHASES.filter(([at]) => t >= at).pop()[1];
      setAttr(race, 'data-phase', phase);
      race.classList.toggle('ready', t >= 0.75);
      race.classList.toggle('thinking', t >= 8.8);
      race.classList.toggle('fading', t >= 12);
      setText(fast, t >= 0.75 ? '0:01 ✓' : '0:00');
      fast.classList.toggle('ok', t >= 0.75);
      setText(slow, clock(Math.min(t, 11.4) * 1.6));
    },
    ctx.reduced,
    10,
  );
}

// ── 2 + 3. The 3D neighbourhood ──
// The same picture, flat: shows while the 3D scene loads and where WebGL is not available.
const flatMap = () => `
  <svg class="in-map" viewBox="-13 -22 31 38" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g class="m-plate">
      <rect x="-8.7" y="-22.2" width="15.4" height="14.4" rx=".6"/><rect x="-8.7" y="-3.7" width="15.4" height="15.4" rx=".6"/>
      <rect x="-8.7" y="13.8" width="15.4" height="6" rx=".6"/><rect x="-23" y="-3.7" width="12.2" height="15.4" rx=".6"/>
      <rect x="-23" y="-22.2" width="12.2" height="14.4" rx=".6"/><rect x="13.3" y="-22.2" width="8" height="14.4" rx=".6"/>
    </g>
    <rect class="m-park" x="14" y="-3" width="8" height="14" rx=".6"/>
    <g class="m-roof">
      <path d="M-8-21.5H6v13H-8zM-5.4-18.9v7.8H3.4v-7.8z" fill-rule="evenodd"/>
      <path d="M-8-3H6v2.6H-8zM-8-.4h2.6v8.8H-8zM-8 8.4h5.7V11H-8zM.3 8.4H6V11H.3zM3.4 2H6v6.4H3.4z"/>
      <path d="M-8 14.5H6V17H-8zM-13-3h1.5v14H-13zM-13-21.5h1.5v13H-13zM14-21.5h4v13h-4z"/>
    </g>
    <path class="m-glow" d="M10-22V16"/>
    <path class="m-rail" d="M9.58-22V16M10.42-22V16"/>
    <rect class="m-platform" x="7.2" y="-18" width="1.5" height="6" rx=".3"/>
    <path class="m-street" d="M-1 5V12.75H7.4V-15"/>
    <text class="m-door" x="-1" y="9.4">${t('intro.demo.frontDoor')}</text><text class="m-door" x="4.6" y="0.1">${t('intro.demo.backExit')}</text>
    <path class="m-short" d="M-1 5 2.6 .95 7.4 .75V-15"/>
    <circle class="m-homering" cx="-1" cy="5" r="1.5"/><circle class="m-home" cx="-1" cy="5" r=".6"/>
    <circle class="m-node" cx="10" cy="-15" r=".62"/><circle class="m-nodein" cx="10" cy="-15" r=".36"/>
    <circle class="m-sign" cx="6" cy="-17.6" r="1.05"/><text class="m-h" x="6" y="-17">H</text>
  </svg>`;

function mountScene(mode) {
  const hud =
    mode === 'shortcut'
      ? `<div class="in-hud">
           <div class="in-walkset"><span>${t('intro.demo.yourWalk')}</span>
             <span class="in-stepper"><i data-minus>−</i><b data-walk>5 min</b><i>+</i></span>
           </div>
           <div class="in-pill" data-leave>${t('intro.demo.leaveInPill', { n: 2 })}</div>
         </div>`
      : `<div class="in-hud run">
           <div class="in-dep"><span class="badge tram">3</span><span class="in-dir">→ Hauptbahnhof</span><b data-dep>2 min</b></div>
           <div class="in-pill now" data-run>${t('intro.demo.runNow')}</div>
         </div>`;
  return (stage, ctx) => {
    stage.innerHTML = `<div class="in-3d" data-mode="${mode}">${flatMap()}</div>${hud}`;
    const box = stage.querySelector('.in-3d');
    const q = (sel) => stage.querySelector(sel);
    let dead = false;
    let lastWalk = 5;

    const update = (s) => {
      if (dead) return;
      if (s.mode === 'shortcut') {
        setText(q('[data-walk]'), `${s.walkMin} min`);
        q('[data-leave] b').textContent = s.leaveMin;
        if (s.walkMin !== lastWalk) {
          const minus = q('[data-minus]');
          minus.classList.remove('tap');
          void minus.offsetWidth; // restart the tap ring
          if (s.walkMin < lastWalk) minus.classList.add('tap');
          lastWalk = s.walkMin;
        }
        q('.in-hud').classList.toggle('saved', s.phase === 'saved');
      } else {
        const caught = s.phase === 'caught';
        setText(q('[data-dep]'), caught ? t('intro.demo.onBoard') : s.depMin > 0 ? `${s.depMin} min` : t('intro.demo.now'));
        const pill = q('[data-run]');
        if (pill.classList.contains('ok') !== caught) {
          pill.classList.toggle('ok', caught);
          pill.classList.toggle('now', !caught);
          pill.innerHTML = caught ? t('intro.demo.made') : t('intro.demo.runNow');
        }
      }
    };

    // No 3D (yet): show how the screen ends, so the flat map still tells the story.
    if (mode === 'shortcut') update({ mode, walkMin: 3, leaveMin: 4, phase: 'saved' });
    lastWalk = 3;

    ctx.scene(box).then((scene) => {
      if (dead || !scene) return;
      if (mode === 'shortcut') {
        lastWalk = 5;
        update({ mode, walkMin: 5, leaveMin: 2, phase: 'street' });
      }
      scene.attach(box);
      scene.play(mode, update);
      box.classList.add('live');
    });

    return () => {
      dead = true;
      ctx.sceneNow()?.pause();
    };
  };
}

// ── 4. Just ask ──
// What to say, in the current language (voice.* in lib/i18n/*.js).
const VOICES = [
  { key: 'alexa', ask: () => t('voice.alexaOpen') },
  { key: 'siri', ask: () => `${t('voice.siri')}?` },
  { key: 'gemini', ask: () => t('voice.google') },
  { key: 'claude', ask: () => t('voice.askQ') },
  { key: 'chatgpt', ask: () => t('voice.askQ') },
];

function mountVoice(stage, ctx) {
  stage.innerHTML = `
    <div class="in-voice" data-phase="idle">
      <div class="in-chat">
        <p class="in-bubble me" data-ask></p>
        <p class="in-bubble them"><span class="in-eq" aria-hidden="true"><i></i><i></i><i></i></span>${t('voice.introAnswer')}</p>
      </div>
      <ul class="in-logos">
        ${VOICES.map((v) => `<li data-voice="${v.key}"><img src="${ASSET(`icons/assistants/${v.key}.svg`)}" alt="" width="40" height="40"></li>`).join('')}
      </ul>
    </div>`;
  const root = stage.firstElementChild;
  const ask = root.querySelector('[data-ask]');
  const logos = [...root.querySelectorAll('[data-voice]')];
  let shown = -1;
  return timeline(
    5.6,
    (t, n) => {
      const i = n % VOICES.length;
      if (i !== shown) {
        shown = i;
        ask.textContent = `“${VOICES[i].ask()}”`;
        logos.forEach((li, k) => li.classList.toggle('on', k === i));
      }
      setAttr(root, 'data-phase', t < 0.35 ? 'idle' : t < 1.5 ? 'ask' : t < 5.1 ? 'answer' : 'out');
    },
    ctx.reduced,
    3,
  );
}

// ── 5. Make it yours ──
const LOOKS = [
  { key: 'minutes', label: () => t('intro.demo.minutes') },
  { key: 'timer', label: () => t('intro.demo.countdown') },
  { key: 'line', label: () => t('intro.demo.lineNumber') },
  { key: 'theme', label: () => '' }, // filled in: the theme you are not using right now
  { key: 'watch', label: () => t('intro.demo.watch') },
];

function mountLooks(stage, ctx) {
  const looks = LOOKS.map((l) => ({ ...l, label: l.key === 'theme' ? (ctx.dark ? t('intro.demo.light') : t('intro.demo.dark')) : l.label() }));
  stage.innerHTML = `
    <div class="in-looks" data-look="minutes">
      <div class="in-lookcard ${ctx.dark ? 'to-light' : 'to-dark'}">
        ${miniHero({ mark: '<span class="in-mark" data-mark aria-hidden="true">Ed</span>' })}
      </div>
      <ul class="in-chips">${looks.map((l) => `<li data-chip="${l.key}">${l.label}</li>`).join('')}</ul>
    </div>`;
  const root = stage.firstElementChild;
  const num = root.querySelector('.in-num');
  const unit = root.querySelector('.in-unit');
  const mark = root.querySelector('[data-mark]');
  const chips = [...root.querySelectorAll('[data-chip]')];
  const EACH = 2.1;
  return timeline(
    EACH * looks.length,
    (t) => {
      const i = Math.min(looks.length - 1, Math.floor(t / EACH));
      const look = looks[i].key;
      setAttr(root, 'data-look', look);
      chips.forEach((c, k) => c.classList.toggle('on', k === i));
      const timer = look === 'timer';
      setText(num, timer ? `5:${String(42 - Math.floor(t - EACH)).padStart(2, '0')}` : '6');
      setText(unit, timer ? '' : 'min');
      setText(mark, look === 'line' ? '3' : 'Ed');
    },
    ctx.reduced,
    EACH * 2.5,
  );
}

const STEPS = [
  { key: 'fast', mount: mountFast },
  { key: 'walk', mount: mountScene('shortcut') },
  { key: 'run', mount: mountScene('run') },
  { key: 'voice', mount: mountVoice },
  { key: 'looks', mount: mountLooks },
];

let open = null;

/**
 * @param {{ reminder?: boolean, needsSetup?: boolean, start?: number, onSetup?: () => void, onClose?: () => void }} [opts]
 */
export async function openIntro(opts = {}) {
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

  const $ = (sel) => dialog.querySelector(sel);
  const stage = $('.in-stage');
  let index = -1;
  let unmount = null;
  let result = 'skip';

  // The 3D scene: one instance for both screens, loading in the background from the start.
  let scene = null;
  let scenePromise = null;
  const sceneModule = import('./intro-scene.js').catch(() => null);
  const ctx = {
    reduced,
    dark,
    scene(host) {
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

  function show(i) {
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
    $('.in-prev').disabled = index === 0;
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
  let down = null;
  dialog.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  dialog.addEventListener('pointerup', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) show(index + (dx < 0 ? 1 : -1));
  });

  open = new Promise((resolve) => {
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
