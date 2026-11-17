import { $ } from './dom.ts';
import { saveState, state } from './store.ts';
import { t } from '../i18n/index.ts';

// ───────────────────────── Install card ─────────────────────────
// Chrome/Edge/Android hand us an install prompt; iPhone Safari has none, so we show the steps instead.

/** Chrome's `beforeinstallprompt` event: not in the DOM typings yet. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallMode = 'prompt' | 'ios' | 'menu';

let installPrompt: InstallPromptEvent | null = null;

export function isInstalled() {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

let installMode: InstallMode = 'prompt';
export const currentInstallMode = (): InstallMode => installMode;

export function showInstallCard(mode: InstallMode): void {
  if (state.installHidden || isInstalled()) return;
  installMode = mode;
  const ios = mode === 'ios';
  $('installHint').textContent = ios ? t('install.hintIos') : mode === 'menu' ? t('install.hintMenu') : t('install.hint');
  $('installGo').hidden = mode !== 'prompt';
  $('installCard').hidden = false;
}

export function hideInstallCard(remember: boolean): void {
  $('installCard').hidden = true;
  if (remember) { state.installHidden = true; saveState(); }
}

export function setupInstall() {
  if (state.installHidden || isInstalled()) return;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPromptEvent;
    showInstallCard('prompt');
  });
  addEventListener('appinstalled', () => hideInstallCard(true));
  $('installGo').addEventListener('click', async () => {
    if (!installPrompt) return;
    void installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    installPrompt = null;
    if (outcome === 'accepted') hideInstallCard(true);
    else showInstallCard('menu');
  });
  $('installX').addEventListener('click', () => hideInstallCard(true));
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) showInstallCard('ios');
  else if (/Android|Mobile/.test(ua)) setTimeout(() => { if (!installPrompt) showInstallCard('menu'); }, 2500);
}
