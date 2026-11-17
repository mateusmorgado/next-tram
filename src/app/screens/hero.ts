import type { Connection, Plan } from '../../transit/index.ts';
import { delayChip } from '../components/delay-chip.ts';
import { heroMark } from '../components/monogram.ts';
import { $, badge, esc, setHtml, walkText } from '../dom.ts';
import { render } from '../render.ts';
import { activeRoute, session, state } from '../store.ts';
import { t, tn } from '../../i18n/index.ts';
import { formatClock, isCatchable, leaveAdvice, shortDirection, shortStopName } from '../../transit/index.ts';

export function renderHero(plan: Plan, now: number, slots: number): void {
  const el = $('hero');
  const c = plan.hero;
  if (!c) {
    if (!session.settled) return; // keep skeleton until the first answer
    if (session.loadFailed && !session.connections.length) {
      const offline = navigator.onLine === false;
      setHtml(
        el,
        `<div class="hero-empty" id="heroMain"><strong>${esc(offline ? t('hero.offline') : t('hero.failed'))}</strong>${
          esc(offline ? t('hero.offlineText') : t('hero.failedText'))
        }</div>`,
      );
      return;
    }
    setHtml(
      el,
      `<div class="hero-empty"><strong>${esc(t('hero.none'))}</strong>${
        esc(session.connections.length ? t('hero.noneText') : t('hero.noneFound'))
      }</div>`,
    );
    return;
  }
  const secs = Math.max(0, Math.floor((c.depMs - now) / 1000));
  const mins = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  const advice = leaveAdvice(c, now);

  let delay = '';
  if (!c.realtime) delay = `<span class="delay plan">${esc(t('hero.scheduled'))}</span>`;
  else delay = delayChip(c.delayMin);

  let leave;
  // No walk set for the trip back: you're already at the stop, so no leave advice at all.
  if (advice.atStop) leave = session.reversed ? '' : `<div class="leave idle">${esc(t('hero.atStop'))}</div>`;
  else if (advice.now)
    leave = advice.run
      ? `<div class="leave now">🏃 ${esc(t('hero.runNow'))}<small>${esc(t('hero.runNowSub', { walk: walkText(c) }))}</small></div>`
      : `<div class="leave now">🏃 ${esc(t('hero.leaveNow'))}<small>${esc(walkText(c))}</small></div>`;
  else
    leave =
      advice.minutes === 0
        ? `<div class="leave">🚶 ${esc(t('hero.leaveNow'))}<small>${esc(walkText(c))}</small></div>` // still on time: green, not the red hurry bar
        : `<div class="leave">🚶 ${esc(t('hero.leaveIn', { n: advice.minutes }))}<small>${esc(walkText(c))}</small></div>`;
  const eyebrow = session.reversed ? esc(t('hero.from', { stop: c.boardAt || c.stopName })) : esc(t('hero.goToStop'));
  const placeName = session.reversed ? c.toName : c.stopName;
  const place = esc(placeName);
  const mark = heroMark(c, placeName, slots);
  const pick = plan.manual
    ? `<span class="pick">${esc(t('hero.pick'))} · <button class="link" type="button" id="autoBtn">${esc(t('hero.backToFastest'))}</button></span>`
    : eyebrow;
  const html = `
    <div class="hero-main" id="heroMain" title="${esc(t('hero.tapRefresh'))}">
      ${mark}
      <div class="hero-eyebrow">${pick}</div>
      <div class="hero-stop">${place}</div>
      <div class="hero-line">${badge(c, 'lg')}<span class="dir" title="${esc(c.direction)}">→ ${esc(shortDirection(c.direction))}</span></div>
      <div class="hero-count">
        <button type="button" class="count ${state.countdown ? 'timer' : ''}" id="countBtn" aria-label="${esc(t('hero.countAria', { minutes: tn('minutes', mins) }))}">
          ${
            state.countdown
              ? `<span class="count-num"><span class="timer-text" data-tick="clock"></span></span><span class="count-unit" aria-hidden="true">&#8203;</span>`
              : `<span class="count-num">${mins}</span><span class="count-unit">${esc(t('hero.min'))}</span>`
          }
        </button>
        <div class="times">
          <div>${esc(t('hero.leaves'))} <b>${formatClock(c.depMs)}</b> ${delay}</div>
          ${c.arrMs ? `<div>${esc(t('hero.arrives'))} <b>${formatClock(c.arrMs)}</b>${c.transfers ? ` · ${changeText(c)}` : ''}</div>` : ''}
          ${c.walkAfterMin ? `<div class="walk-after">${esc(t('hero.getOff', { stop: c.getOffAt || t('hero.nearbyStop'), n: c.walkAfterMin }))}</div>` : ''}
        </div>
      </div>
    </div>
    ${leave}`;
  setHtml(el, html);
  // The seconds tick in place; everything else only changes about once a minute.
  el.querySelectorAll<HTMLElement>('[data-tick]').forEach((tick) => {
    const text = tick.dataset.tick === 'ss' ? ss : `${mins}:${ss}`;
    if (tick.textContent !== text) tick.textContent = text;
  });
}

/** "change at Ostplatz to 3", so a changing trip doesn't look like a direct one. */
export function changeText(c: Connection): string {
  const first = c.changes?.[0];
  if (!first?.at) return tn('change', c.transfers);
  const more = c.transfers > 1 ? t('change.more', { n: c.transfers - 1 }) : '';
  return `${esc(t('change.at', { at: first.at }))}${first.line ? esc(t('change.to', { line: first.line })) : ''}${more}`;
}
