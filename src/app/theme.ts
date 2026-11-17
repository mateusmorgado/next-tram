import { $ } from './dom.ts';
import { saveState, state } from './store.ts';

// ───────────────────────── Theme & watch ─────────────────────────

export function applyTheme(): void {
  const root = document.documentElement;
  if (state.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = state.theme;
}

export function toggleTheme(): void {
  const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  state.theme = dark ? 'light' : 'dark';
  applyTheme();
  saveState();
}

export function applyWatch(): void {
  document.documentElement.classList.toggle('watch', state.watch);
  $('watchBtn').setAttribute('aria-pressed', String(state.watch));
}
