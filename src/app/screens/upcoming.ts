import { delayChip } from '../components/delay-chip.ts';
import { FOLDED_UPCOMING, MAX_UPCOMING } from '../config.ts';
import type { Connection, Plan } from '../../transit/index.ts';
import { $, badge, esc, setHtml } from '../dom.ts';
import { activeRoute, session } from '../store.ts';
import { t } from '../../i18n/index.ts';
import { delayLabel, formatClock, isCatchable, minutesUntil, routeOptions, shortDirection } from '../../transit/index.ts';

export function renderUpcoming(plan: Plan, now: number): void {
  const section = $('upcomingSection');
  // Trams you can't make even running are gone from the list; the ones you'd have to run for say "run".
  const reachable = plan.upcoming.filter((c) => isCatchable(c, now));
  if (!reachable.length) {
    section.hidden = true;
    return;
  }
  const wasHidden = section.hidden;
  section.hidden = false;
  const multi = routeOptions(activeRoute(), session.reversed).length > 1;
  const rows = upcomingRows(reachable);
  const html = rows
    .map((group, i) => {
      const c = group[0];
      const tight = c.depMs - now < c.walk * 60000;
      const heroId = plan.hero?.id;
      const selected = heroId !== undefined && group.some((g) => g.id === heroId);
      // On the trip back one tram can bring you to both home stops: one row, both arrivals.
      const sub =
        group.length > 1
          ? group
              .filter((g) => g.arrMs)
              .sort((x, y) => (x.arrMs ?? 0) - (y.arrMs ?? 0))
              .map((g) => `${g.toName} ${formatClock(g.arrMs)}`)
              .join(' · ')
          : [multi ? (session.reversed ? t('upcoming.to', { name: c.toName }) : t('upcoming.from', { name: c.stopName })) : '', c.walkAfterMin ? t('upcoming.walk', { n: c.walkAfterMin }) : '', c.arrMs ? t('upcoming.arr', { time: formatClock(c.arrMs) }) : '']
              .filter(Boolean)
              .join(' · ');
      const d = c.realtime ? delayLabel(c.delayMin) : null;
      const chip = d && d.key !== 'ontime' ? delayChip(c.delayMin, 'sm') : '';
      const folded = !session.upcomingOpen && i >= FOLDED_UPCOMING;
      return `<li${folded ? ' hidden' : ''}><button class="trip ${tight ? 'tight' : ''} ${selected ? 'selected' : ''}" type="button" data-trip="${esc(c.id)}">
        <span class="t">${formatClock(c.depMs)}</span>
        ${badge(c)}
        <span class="info"><span class="dir" title="${esc(c.direction)}">${esc(shortDirection(c.direction))}</span><span class="sub${group.length > 1 ? ' both' : ''}">${chip}${esc(sub)}</span></span>
        <span class="in">${tight ? esc(t('upcoming.run')) : `${minutesUntil(c, now)} ${esc(t('hero.min'))}`}</span>
      </button></li>`;
    })
    .join('');
  const more = $('upcomingMore');
  const extra = rows.length - FOLDED_UPCOMING;
  more.hidden = extra <= 0;
  more.setAttribute('aria-expanded', String(session.upcomingOpen));
  const label = session.upcomingOpen ? t('upcoming.less') : t('upcoming.more', { n: extra });
  if (more.textContent !== label) more.textContent = label;
  if (setHtml($('tripList'), html) || wasHidden) capUpcoming();
}

/** Group the same departure (same vehicle, same stop) into one row. */
export function upcomingRows(list: Connection[]): Connection[][] {
  const rows = new Map<string, Connection[]>();
  for (const c of list) {
    const key = `${c.tripKey}|${c.schedMs}|${c.stopName}`;
    if (rows.has(key)) rows.get(key)?.push(c);
    else rows.set(key, [c]);
  }
  return [...rows.values()];
}

/** Opened up, the list shows at most 7 rows; the rest scrolls inside it. */
export function capUpcoming() {
  const list = $('tripList');
  const rows = list.children;
  if (!session.upcomingOpen || rows.length <= MAX_UPCOMING) {
    list.style.maxHeight = '';
    list.classList.remove('scrolls');
    return;
  }
  const last = rows[MAX_UPCOMING - 1];
  // A sliver of the 8th row peeks out so it's clear the list scrolls.
  // Rects are in zoomed pixels when the page is zoomed for Chrome's desktop-site mode (index.html).
  const zoom = list.currentCSSZoom || 1;
  const bottom = (last.getBoundingClientRect().bottom - list.getBoundingClientRect().top) / zoom + list.scrollTop;
  list.style.maxHeight = `${Math.round(bottom + 14)}px`;
  list.classList.add('scrolls');
}
