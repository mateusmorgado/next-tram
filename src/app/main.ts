import { renderFavs, renderRoute } from './components/route-bar.ts';
import { autoRefresh, refresh, scheduleRefresh } from './data.ts';
import { $, closest } from './dom.ts';
import { setupInstall } from './install.ts';
import { chooseLanguage, renderLangSwitch } from './language.ts';
import { render, setHeroLeftHandler } from './render.ts';
import { inkCache } from './components/monogram.ts';
import { countThisOpen, maybeShowIntro, showIntro } from './screens/intro-launcher.ts';
import { resumeWalkTimer } from './setup/walk-timer.ts';
import { clone, saveState, scheduleSync, session, state } from './store.ts';
import { STORAGE_KEY } from './config.ts';
import { PRESET_ROUTES } from '../data/stops.ts';
import { applyTheme, applyWatch } from './theme.ts';
import { wire } from './wiring/index.ts';
import { applyStaticText, detectLang, getLang, savedLang, setLang } from '../i18n/index.ts';

/**
 * ?route=<id> and ?back=1 open a specific favorite (used by shortcuts and the watch).
 * ?add=<preset id> adds a ready-made route (PRESET_ROUTES) and opens it; on a first visit it
 * replaces the built-in Leipzig/Berlin examples, so a shared link shows only that route.
 */
export function applyUrlParams(): void {
  const p = new URLSearchParams(location.search);
  const preset = PRESET_ROUTES.find((r) => r.id === p.get('add'));
  if (preset) {
    let firstVisit = false;
    try {
      firstVisit = !localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (firstVisit) state.routes = [clone(preset)];
    else if (!state.routes.some((r) => r.id === preset.id)) state.routes.push(clone(preset));
    state.activeId = preset.id;
    saveState();
    // Reloading or installing from here keeps the route without adding it again.
    p.delete('add');
    p.set('route', preset.id);
    history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
  }
  const id = p.get('route');
  if (id && state.routes.some((r) => r.id === id)) state.activeId = id;
  if (p.get('back') === '1') session.reversed = true;
}

/** ?lang=de|en|pt opens the app in that language (a link shared in German stays German). */
function urlLang(): string {
  return new URLSearchParams(location.search).get('lang') || '';
}

export async function init(): Promise<void> {
  const fromUrl = urlLang();
  // A ?lang= link is remembered, so the app stays in that language after install.
  await setLang(detectLang(fromUrl || savedLang(), navigator.languages?.length ? navigator.languages : [navigator.language]), Boolean(fromUrl));
  applyStaticText();
  renderLangSwitch();
  document.fonts?.ready.then(() => { inkCache.clear(); render(); });
  setHeroLeftHandler(() => autoRefresh(true));
  applyUrlParams();
  applyTheme();
  applyWatch();
  wire();
  resumeWalkTimer();
  renderFavs();
  renderRoute();
  refresh();
  scheduleRefresh();
  setInterval(render, 1000);
  scheduleSync();
  setupInstall();
  countThisOpen();
  setTimeout(maybeShowIntro, 400); // after the first paint, so the app is already there behind it
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    countThisOpen();
    maybeShowIntro();
  });
  $('introBtn').addEventListener('click', () => showIntro(false));
  $('langSwitch').addEventListener('click', (e) => {
    const b = closest(e, '[data-lang]');
    const code = b?.dataset.lang;
    if (code && code !== getLang()) void chooseLanguage(code);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

void init();
