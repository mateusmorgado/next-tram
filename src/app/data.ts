import { renderFavs, renderRoute } from './components/route-bar.ts';
import { REFRESH_MS, RETRY_MS, client } from './config.ts';
import type { Route, RouteOption, Stop } from '../transit/index.ts';
import { $, setHtml } from './dom.ts';
import { render, renderStatus } from './render.ts';
import { activeRoute, saveState, session, state } from './store.ts';
import { CITIES } from '../data/stops.ts';
import { t } from '../i18n/index.ts';
import { fetchRoute, shortStopName } from '../transit/index.ts';

// ───────────────────────── Data ─────────────────────────

export async function refresh() {
  const route = activeRoute();
  const token = ++session.fetchToken;
  session.loading = true;
  session.lastAttempt = Date.now();
  renderStatus(Date.now());
  try {
    const result = await fetchRoute(client, route, { reversed: session.reversed });
    if (token !== session.fetchToken) return;
    session.connections = result.connections;
    session.lastFetch = Date.now();
    session.loadFailed = false;
    session.failCount = 0;
    const sources = new Set(result.connections.map((c) => c.source));
    session.lastSource = [...sources].map((s) => (s === 'transitous' ? 'Transitous' : CITIES[route.city]?.key === 'berlin' ? 'BVG' : 'DB')).join(' + ');
    cacheResolvedIds(route, result.options);
    const err = $('errorNotice');
    if (result.errors.length) {
      const failed = result.errors
        .map((e) => {
          const o = result.options.find((x) => x.slot === e.slot);
          return shortStopName((session.reversed ? o?.to : o?.from)?.name || '');
        })
        .join(', ');
      err.textContent = t('error.partial', { stops: failed });
      err.hidden = false;
    } else err.hidden = true;
  } catch (e) {
    if (token !== session.fetchToken) return;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    $('errorNotice').textContent = offline
      ? t('error.offline')
      : t('error.failed', { reason: (e as Error).message });
    $('errorNotice').hidden = false;
    session.loadFailed = true;
    session.failCount++;
  } finally {
    if (token === session.fetchToken) {
      session.loading = false;
      session.settled = true;
      render();
    }
  }
}

/**
 * Refresh started by the app itself (timer, tab shown again, tram just left). It never
 * interrupts a request that is still running, and it backs off while the APIs are failing.
 * Taps on Refresh call refresh() directly and always go through.
 */
export function autoRefresh(dueNow = false) {
  if (session.loading || document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (session.failCount) {
    if (now - session.lastAttempt < RETRY_MS[Math.min(session.failCount, RETRY_MS.length) - 1]) return;
  } else if (!dueNow && now - session.lastFetch < REFRESH_MS) return;
  else if (now - session.lastAttempt < 5000) return;
  refresh();
}

/** Remember the stop IDs the APIs gave us, so the next request skips the lookup. */
export function cacheResolvedIds(route: Route, options: RouteOption[]): void {
  const pick = (s: Stop) => ({ tid: s.tid, hafasId: s.hafasId });
  options.forEach((o: RouteOption) => {
    const home = session.reversed ? o.to : o.from;
    const away = session.reversed ? o.from : o.to;
    const slot = route.stops[o.slot];
    if (slot) Object.assign(slot.stop, stripUndefined(pick(home)));
    Object.assign(route.dest, stripUndefined(pick(away)));
  });
  saveState();
}

export function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) as Partial<T>;
}

export function switchRoute(id: string, force = false): void {
  if (!force && id === state.activeId && session.lastFetch) return;
  state.activeId = id;
  session.reversed = false;
  resetData();
  saveState();
  renderFavs();
  renderRoute();
  refresh();
}

export function resetData() {
  session.connections = [];
  session.lastFetch = 0;
  session.settled = false;
  session.loadFailed = false;
  session.failCount = 0;
  session.selectedId = null;
  setHtml($('hero'), '<div class="hero-skeleton"><div class="sk sk-line"></div><div class="sk sk-big"></div><div class="sk sk-line short"></div></div>');
  $('compare').hidden = true;
  $('upcomingSection').hidden = true;
  $('errorNotice').hidden = true;
}

export function scheduleRefresh() {
  clearInterval(session.refreshTimer);
  session.refreshTimer = setInterval(() => autoRefresh(), 5000);
}
