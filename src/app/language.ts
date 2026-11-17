import { renderFavs, renderRoute } from './components/route-bar.ts';
import { $, esc } from './dom.ts';
import { currentInstallMode, showInstallCard } from './install.ts';
import { render } from './render.ts';
import { inkCache } from './components/monogram.ts';
import { LANGS, applyStaticText, getLang, setLang } from '../i18n/index.ts';

// ── Language: the saved choice, else the browser's. The footer switches it. ──
export function renderLangSwitch(): void {
  const el = $('langSwitch');
  el.innerHTML = LANGS.map(
    (l) => `<button type="button" class="lang-btn" data-lang="${l.code}" lang="${l.code}" aria-pressed="${l.code === getLang()}" title="${esc(l.name)}">${esc(l.name)}</button>`,
  ).join('');
}

/** Every piece of text that is not redrawn by the next render(). */
export function applyLanguage(): void {
  applyStaticText();
  renderLangSwitch();
  renderFavs();
  renderRoute();
  inkCache.clear();
  render();
  if (!$('installCard').hidden) showInstallCard(currentInstallMode());
}

export async function chooseLanguage(code: string): Promise<void> {
  await setLang(code, true);
  applyLanguage();
}
