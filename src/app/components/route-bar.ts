import type { Route } from '../../transit/index.ts';
import { $, esc } from '../dom.ts';
import { activeRoute, session, state } from '../store.ts';
import { CITIES } from '../../data/stops.ts';
import { t } from '../../i18n/index.ts';
import { shortStopName } from '../../transit/index.ts';

export function routeLabel(route: Route): string {
  if (route.label) return route.label;
  return shortStopName(route.dest?.name || 'Route');
}

export function renderFavs() {
  const bar = $('favBar');
  bar.innerHTML =
    state.routes
      .map(
        (r) =>
          `<button class="chip" type="button" data-route="${esc(r.id)}" aria-current="${r.id === state.activeId}">${esc(routeLabel(r))}</button>`,
      )
      .join('') + `<button class="chip chip-add" type="button" id="addRouteBtn">${esc(t('favs.new'))}</button>`;
}

export function renderRoute() {
  const route = activeRoute();
  const city = CITIES[route.city] || CITIES.leipzig;
  $('cityLabel').textContent = `${city.label} · ${city.operator}`;
  const homes = route.stops.map((s) => `<strong>${esc(shortStopName(s.stop.name))}</strong>`).join(' / ');
  const dest = `<strong>${esc(shortStopName(route.dest.name))}</strong>`;
  const full = session.reversed
    ? `<span class="back-tag">${esc(t('route.back'))}</span>${dest}<span class="arrow">→</span>${homes}`
    : `${homes}<span class="arrow">→</span>${dest}`;
  const short = session.reversed ? t('route.backShort', { dest }) : `→ ${dest}`;
  $('routeText').innerHTML = `<span class="rt-full">${full}</span><span class="rt-short">${short}</span>`;
  $('swapBtn').setAttribute('aria-pressed', String(session.reversed));
}
