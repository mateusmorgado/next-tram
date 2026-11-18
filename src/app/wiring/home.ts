/** Events of the main screen: favorites, swapping direction, stepping through trams, theme, watch. */
import { stepTrip } from '../actions.ts';
import { openDelayInfo } from '../components/delay-chip.ts';
import { renderFavs, renderRoute } from '../components/route-bar.ts';
import { autoRefresh, refresh, resetData, switchRoute } from '../data.ts';
import { $, closest } from '../dom.ts';
import { render } from '../render.ts';
import { watchy } from '../screens/intro-launcher.ts';
import { capUpcoming } from '../screens/upcoming.ts';
import { openSetup } from '../setup/sheet.ts';
import { saveState, session, state } from '../store.ts';
import { applyWatch, toggleTheme } from '../theme.ts';

const isWatch = (): boolean => document.documentElement.classList.contains('watch');

export function wireHome(): void {
  $('favBar').addEventListener('click', (e) => {
    const chip = closest(e, '[data-route]');
    if (chip) {
      const id = chip.dataset.route ?? '';
      if (id === state.activeId) openSetup(state.activeId);
      else switchRoute(id);
    } else if (closest(e, '#addRouteBtn')) openSetup(null);
  });
  $('swapBtn').addEventListener('click', () => {
    session.reversed = !session.reversed;
    resetData();
    renderRoute();
    refresh();
  });
  $('refreshBtn').addEventListener('click', () => refresh());
  $('nextBtn').addEventListener('click', () => stepTrip(1));
  $('prevBtn').addEventListener('click', () => stepTrip(-1));
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && closest(e, '[data-delay-info]')) {
      e.preventDefault();
      openDelayInfo();
      return;
    }
    if ($<HTMLDialogElement>('setupSheet').open || closest(e, 'input')) return;
    if (e.key === 'ArrowRight') stepTrip(1);
    if (e.key === 'ArrowLeft') stepTrip(-1);
  });

  // Swipe left/right on the countdown to step through trams.
  let touchX: number | null = null;
  $('hero').addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  $('hero').addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) {
      session.swiped = true;
      stepTrip(dx < 0 ? 1 : -1);
    }
  });

  $('upcomingMore').addEventListener('click', () => {
    session.upcomingOpen = !session.upcomingOpen;
    render();
    capUpcoming();
  });

  $('setupBtn').addEventListener('click', () => openSetup(state.activeId));
  $('themeBtn').addEventListener('click', toggleTheme);
  $('watchBtn').addEventListener('click', () => {
    state.watch = !state.watch;
    applyWatch();
    saveState();
  });

  document.addEventListener('click', (e) => {
    if (closest(e, '[data-delay-info]')) {
      e.stopPropagation();
      openDelayInfo();
      return;
    }
    const trip = closest(e, '[data-trip]');
    if (trip && trip.getAttribute('aria-disabled') !== 'true') {
      session.selectedId = trip.dataset.trip ?? null;
      render();
      if (!isWatch()) $('hero').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (closest(e, '#countBtn')) {
      state.clock = state.clock === 'timer' ? 'minutes' : 'timer'; // live mm:ss timer ⇄ big minutes
      saveState();
      render();
      return;
    }
    if (closest(e, '#autoBtn')) {
      session.selectedId = null;
      render();
      return;
    }
    if (session.swiped) {
      session.swiped = false;
      return;
    }
    if (closest(e, '#heroMain') || (isWatch() && closest(e, '.hero'))) refresh();
  });

  // Watch: tap the route to cycle favorites.
  $('routeText').addEventListener('click', () => {
    if (!watchy() || state.routes.length < 2) return;
    const i = state.routes.findIndex((r) => r.id === state.activeId);
    switchRoute(state.routes[(i + 1) % state.routes.length].id);
    renderFavs();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - session.lastFetch > 30_000) autoRefresh(true);
  });
  window.addEventListener('online', () => refresh());
  window.addEventListener('resize', capUpcoming);
  // iOS Safari ignores user-scalable=no in the viewport tag, so stop its pinch gesture here.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}
