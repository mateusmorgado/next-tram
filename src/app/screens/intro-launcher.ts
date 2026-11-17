import { countOpen, introDue } from '../intro-gate.ts';
import { openSetup } from '../setup/sheet.ts';
import { saveState, state } from '../store.ts';
import { DEFAULT_ROUTES } from '../../data/stops.ts';

// ── "How it works" intro: first open, again on the 4th open, and from the link at the bottom ──
let introOpen = false;
export const watchy = (): boolean => document.documentElement.classList.contains('watch') || matchMedia('(max-width: 300px) and (min-aspect-ratio: 2/3)').matches;
export const onlyDefaults = (): boolean => state.routes.every((r) => DEFAULT_ROUTES.some((d) => d.id === r.id));

export async function showIntro(auto: boolean): Promise<void> {
  if (introOpen) return;
  introOpen = true;
  try {
    const { openIntro } = await import('./intro/index.ts');
    const due = auto ? introDue(state) : '';
    await openIntro({
      reminder: due === 'reminder',
      needsSetup: onlyDefaults(),
      onClose: (result) => {
        if (auto) state.introShown = (state.introShown || 0) + 1;
        else if (result !== 'skip') state.introShown = Math.max(state.introShown || 0, 2); // read it on their own: no reminder needed
        saveState();
      },
      onSetup: () => openSetup(null),
    });
  } catch {} // offline before the intro was ever cached: try again next time
  introOpen = false;
}

export function maybeShowIntro(): void {
  if (introOpen || watchy() || document.querySelector('dialog[open]')) return;
  if (introDue(state)) showIntro(true);
}

export function countThisOpen(): void {
  if (countOpen(state)) saveState();
}
