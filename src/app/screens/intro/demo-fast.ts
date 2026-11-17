/** Screen 1: one answer right away, a race between a typical journey planner and NextTram. */
import { t } from '../../../i18n/index.ts';
import { ASSET, clock, miniHero, setAttr, setText, timeline } from './helpers.ts';
import type { DemoContext } from './helpers.ts';

export function mountFast(stage: HTMLElement, ctx: DemoContext): () => void {
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
  const race = stage.firstElementChild as HTMLElement;
  const slow = race.querySelector('[data-clock="slow"]');
  const fast = race.querySelector('[data-clock="fast"]');
  const PHASES: [number, string][] = [[0, 'splash'], [2.4, 'home'], [4.2, 'search'], [6.9, 'wait'], [7.9, 'list']];
  return timeline(
    12.5,
    (t) => {
      const phase = PHASES.filter(([at]) => t >= at).pop()?.[1] ?? 'splash';
      setAttr(race, 'data-phase', phase);
      race.classList.toggle('ready', t >= 0.75);
      race.classList.toggle('thinking', t >= 8.8);
      race.classList.toggle('fading', t >= 12);
      setText(fast, t >= 0.75 ? '0:01 ✓' : '0:00');
      fast?.classList.toggle('ok', t >= 0.75);
      setText(slow, clock(Math.min(t, 11.4) * 1.6));
    },
    ctx.reduced,
    10,
  );
}
