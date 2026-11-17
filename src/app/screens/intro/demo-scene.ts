/** Screens 2 and 3: the 3D neighbourhood (walk time, and the run-for-it rule). */
import { t } from '../../../i18n/index.ts';
import type { SceneUpdate } from './scene.ts';
import { setAttr, setText } from './helpers.ts';
import type { Demo } from './helpers.ts';

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

export function mountScene(mode: 'shortcut' | 'run'): Demo {
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
    const box = stage.querySelector('.in-3d') as HTMLElement;
    const q = (sel: string) => stage.querySelector(sel) as HTMLElement;
    let dead = false;
    let lastWalk = 5;

    const update = (s: SceneUpdate) => {
      if (dead) return;
      if (s.mode === 'shortcut') {
        setText(q('[data-walk]'), `${s.walkMin} min`);
        q('[data-leave] b').textContent = String(s.leaveMin);
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

