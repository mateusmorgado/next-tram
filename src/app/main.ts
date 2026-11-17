import { renderFavs, renderRoute } from './components/route-bar.ts';
import { autoRefresh, refresh, scheduleRefresh } from './data.ts';
import { $, closest } from './dom.ts';
import { setupInstall } from './install.ts';
import { chooseLanguage, renderLangSwitch } from './language.ts';
import { render, setHeroLeftHandler } from './render.ts';
import { inkCache } from './components/monogram.ts';
import { countThisOpen, maybeShowIntro, showIntro } from './screens/intro-launcher.ts';
import { resumeWalkTimer } from './setup/walk-timer.ts';
import { scheduleSync, session, state } from './store.ts';
import { applyTheme, applyWatch } from './theme.ts';
import { wire } from './wiring/index.ts';
import { applyStaticText, detectLang, getLang, savedLang, setLang } from '../i18n/index.ts';

/** ?route=<id> and ?back=1 open a specific favorite (used by shortcuts and the watch). */
export function applyUrlParams(): void {
  const p = new URLSearchParams(location.search);
  const id = p.get('route');
  if (id && state.routes.some((r) => r.id === id)) state.activeId = id;
  if (p.get('back') === '1') session.reversed = true;
}

export async function init(): Promise<void> {
  await setLang(detectLang(savedLang(), navigator.languages?.length ? navigator.languages : [navigator.language]));
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
