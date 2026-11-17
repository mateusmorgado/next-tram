/** The app's saved state (localStorage) and what is on screen right now (`session`). */
import { MARKS, STORAGE_KEY } from './config.ts';
import { DEFAULTS_VERSION, DEFAULT_ROUTES, RETIRED_DEFAULTS } from '../data/stops.ts';
import { isValidCode, newCode, pushRoutes } from '../sync/favorites-sync.ts';
import { BUFFER_CHOICES, bufferSecs } from '../transit/index.ts';
import type { Connection, Plan, Route } from '../transit/index.ts';
import type { AppState } from './types.ts';

// ───────────────────────── Saved state ─────────────────────────

export const state: AppState = loadState();

// ───────────────────────── Not saved ─────────────────────────

/** What the screen is showing right now. */
export const session = {
  /** Trip back home instead of going out. */
  reversed: false,
  connections: [] as Connection[],
  /** Last successful load. */
  lastFetch: 0,
  /** The first answer (data or an error) has arrived. */
  settled: false,
  /** The latest attempt failed. */
  loadFailed: false,
  failCount: 0,
  lastAttempt: 0,
  lastSource: '',
  /** A tapped trip stays in the hero until it leaves. */
  selectedId: null as string | null,
  loading: false,
  /** Lets an old answer be ignored when a newer request has started. */
  fetchToken: 0,
  refreshTimer: undefined as ReturnType<typeof setInterval> | undefined,
  lastPlan: null as Plan | null,
  /** A swipe just ended, so the click that follows it must be ignored. */
  swiped: false,
};

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/** Reads the saved state, repairing or defaulting anything missing or old. */
function loadState(): AppState {
  let saved: Record<string, any> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {}
  let routes: Route[] = Array.isArray(saved.routes) && saved.routes.length ? saved.routes : clone(DEFAULT_ROUTES);
  // Saved favorites that are still old built-in defaults get dropped or swapped for the new ones, once.
  if ((saved.defaults || 1) < DEFAULTS_VERSION) {
    routes = routes.flatMap((r) => {
      if (!(r.id in RETIRED_DEFAULTS)) return [r];
      const next = DEFAULT_ROUTES.find((d) => d.id === RETIRED_DEFAULTS[r.id]);
      return next && !routes.some((x) => x.id === next.id) ? [clone(next)] : [];
    });
    if (!routes.length) routes = clone(DEFAULT_ROUTES);
  }
  const activeId = routes.some((r) => r.id === saved.activeId) ? saved.activeId : routes[0].id;
  const mark = MARKS.includes(saved.mark) ? saved.mark : 'stop';
  // Spare time is one setting for all routes; each route carries a copy so the assistants see it too.
  const buffer = BUFFER_CHOICES.includes(saved.buffer) ? saved.buffer : bufferSecs(routes[0]?.buffer);
  // Running for a tram is allowed unless turned off; like spare time, each route carries a copy.
  const run = typeof saved.run === 'boolean' ? saved.run : routes[0]?.noRun !== true;
  return {
    routes,
    activeId,
    theme: saved.theme || 'system',
    watch: Boolean(saved.watch),
    mark,
    buffer,
    run,
    countdown: Boolean(saved.countdown),
    defaults: DEFAULTS_VERSION,
    syncCode: isValidCode(saved.syncCode) ? saved.syncCode : newCode(),
    synced: saved.synced || '',
    installHidden: Boolean(saved.installHidden),
    opens: Number(saved.opens) || 0,
    lastOpen: Number(saved.lastOpen) || 0,
    introShown: Number(saved.introShown) || 0,
  };
}

export function saveState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
  scheduleSync();
}

// Favorites go online under state.syncCode so Claude, ChatGPT, Gemini and Alexa answer for the first one.
let syncTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSync(): void {
  const snapshot = JSON.stringify(state.routes);
  if (snapshot === state.synced) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      await pushRoutes(state.syncCode, state.routes);
      state.synced = snapshot;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {} // offline or storage not set up yet: try again on the next save or start
  }, 1500);
}

export const activeRoute = (): Route => state.routes.find((r) => r.id === state.activeId) || state.routes[0];
