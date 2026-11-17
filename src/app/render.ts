import { $ } from './dom.ts';
import { renderCompare } from './screens/compare.ts';
import { renderWatchNav } from './components/watch-nav.ts';
import { fitMonogram } from './components/monogram.ts';
import { renderHero } from './screens/hero.ts';
import { renderUpcoming } from './screens/upcoming.ts';
import { activeRoute, session } from './store.ts';
import { t } from '../i18n/index.ts';
import { planTrips, routeOptions } from '../transit/index.ts';

/** Called when the shown tram has left, so the app can fetch fresh data (set up in main.ts). */
let onHeroLeft: () => void = () => {};
export function setHeroLeftHandler(fn: () => void): void {
  onHeroLeft = fn;
}

export function render(): void {
  const now = Date.now();
  const route = activeRoute();
  const slots = routeOptions(route, session.reversed).length;
  const plan = planTrips(session.connections, now, { selectedId: session.selectedId, slots, byArrival: session.reversed });
  if (session.selectedId && plan.hero?.id !== session.selectedId) session.selectedId = null; // left, or missed even running
  session.lastPlan = plan;

  renderHero(plan, now, slots);
  fitMonogram();
  renderWatchNav(plan, now);
  renderCompare(plan, now, slots);
  renderUpcoming(plan, now);
  renderStatus(now);

  // When the shown tram leaves, fetch fresh data.
  if (session.lastFetch && plan.hero && plan.hero.depMs <= now + 1000) onHeroLeft();
}

export function renderStatus(now: number): void {
  const el = $('statusText');
  if (session.loading && !session.lastFetch) el.textContent = t('status.loadingLive');
  else if (!session.lastFetch) el.textContent = session.loadFailed ? t('status.notLoaded') : '';
  else {
    const ago = Math.round((now - session.lastFetch) / 1000);
    const when = ago < 10 ? t('status.justNow') : ago < 60 ? t('status.secsAgo', { n: ago }) : t('status.minAgo', { n: Math.floor(ago / 60) });
    el.textContent = `${t('status.updated', { when })}${session.lastSource ? ` · ${session.lastSource}` : ''}`;
  }
  document.body.classList.toggle('loading', session.loading);
}
