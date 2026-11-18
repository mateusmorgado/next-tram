import type { Plan } from '../../transit/index.ts';
import { $, badge, esc, setHtml } from '../dom.ts';
import { activeRoute, session } from '../store.ts';
import { t } from '../../i18n/index.ts';
import { formatClock, formatWalk, minutesUntil, routeOptions, shortStopName } from '../../transit/index.ts';

export function renderCompare(plan: Plan, now: number, slots: number): void {
  const el = $('compare');
  if (slots < 2 || !session.lastFetch) {
    el.hidden = true;
    return;
  }
  const options = routeOptions(activeRoute(), session.reversed);
  el.hidden = false;
  const html = plan.perSlot
    .map((p) => {
      const o = options[p.slot];
      const name = session.reversed ? shortStopName(o.to.name) : shortStopName(o.from.name);
      // The green frame follows the tram shown above, also when you picked the other stop yourself.
      const shown = plan.hero?.slot === p.slot;
      const isBest = shown && !plan.manual;
      const n = p.next;
      return `<button class="stop-card ${shown ? 'best' : ''}" type="button" ${n ? `data-trip="${esc(n.id)}"` : 'disabled'}>
        <div class="meta"><span>${esc(session.reversed ? t('compare.getOff') : t('compare.stop', { n: p.slot + 1, walk: formatWalk(o.walkBase) }))}</span>${isBest ? `<span class="best-tag">${esc(t('compare.best'))}</span>` : ''}</div>
        <div class="name">${esc(name)}</div>
        ${
          n
            ? `<div class="next">${badge(n)}<span class="in">${minutesUntil(n, now)} ${esc(t('hero.min'))}</span><span class="at">${formatClock(session.reversed && n.arrMs ? n.arrMs : n.depMs)}</span></div>`
            : `<div class="none">${esc(p.count ? t('compare.nothing') : t('compare.noDepartures'))}</div>`
        }
      </button>`;
    })
    .join('');
  setHtml(el, html);
}
