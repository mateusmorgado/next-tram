import { $ } from '../dom.ts';
import { form } from './form.ts';
import { openSetup, syncSteppers } from './sheet.ts';
import { state } from '../store.ts';
import { t } from '../../i18n/index.ts';
import { shortStopName } from '../../transit/index.ts';

// ───────────────────────── Walk stopwatch ─────────────────────────
// Start at the front door, stop at the tram stop. The start time is saved, so the
// count survives a locked phone, and even the app being closed on the way.

export const TIMER_KEY = 'nexttram:walktimer';
/** The stopwatch: which field it is for, when it started (ms) and when it was stopped (ms, 0 = running). */
interface WalkTimer {
  key: string;
  start: number;
  stopped: number;
}

let walkTimer: WalkTimer | null = null;
let walkTick: ReturnType<typeof setInterval> | undefined;

export function walkKeyName(key: string): string {
  if (key === 'dest') return form.draft?.dest ? shortStopName(form.draft.dest.name) : t('timer.destStop');
  const s = form.draft?.stops[Number(key)]?.stop;
  const typed = $<HTMLInputElement>(key === '0' ? 'stop0' : 'stop1').value.trim();
  return s ? shortStopName(s.name) : typed || t('timer.yourStop');
}

export function saveWalkTimer(): void {
  try {
    if (walkTimer && !walkTimer.stopped) localStorage.setItem(TIMER_KEY, JSON.stringify({ key: walkTimer.key, start: walkTimer.start, routeId: form.editingId }));
    else localStorage.removeItem(TIMER_KEY);
  } catch {}
}

export function openWalkTimer(key: string | number, start = 0): void {
  walkTimer = { key: String(key), start, stopped: 0 };
  $('walkTimerTo').textContent = t('timer.from', { stop: walkKeyName(walkTimer.key) });
  renderWalkTimer();
  if (!$<HTMLDialogElement>('walkTimer').open) $<HTMLDialogElement>('walkTimer').showModal();
  if (start) startTicking();
}

export function startWalkTimer(): void {
  if (!walkTimer) return;
  walkTimer.start = Date.now();
  walkTimer.stopped = 0;
  saveWalkTimer();
  startTicking();
  renderWalkTimer();
}

export function startTicking(): void {
  clearInterval(walkTick);
  walkTick = setInterval(renderWalkTimer, 250);
}

export function walkTimerSecs(): number {
  if (!walkTimer?.start) return 0;
  return Math.max(0, Math.round(((walkTimer.stopped || Date.now()) - walkTimer.start) / 1000));
}

export function renderWalkTimer(): void {
  if (!walkTimer) return;
  const secs = walkTimerSecs();
  const running = Boolean(walkTimer.start && !walkTimer.stopped);
  const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('swTime').textContent = text;
  $('swTime').classList.toggle('running', running);
  $('swAgain').hidden = !walkTimer.stopped;
  $('swMain').textContent = !walkTimer.start ? t('timer.start') : running ? t('timer.stop') : t('timer.use', { time: text });
}

export function walkTimerMain(): void {
  if (!walkTimer) return;
  if (!walkTimer.start) return startWalkTimer();
  if (!walkTimer.stopped) {
    walkTimer.stopped = Date.now();
    clearInterval(walkTick);
    saveWalkTimer();
    return renderWalkTimer();
  }
  // Use it: whole seconds, up to the 30 minutes the steppers allow.
  const minutes = Math.min(30 * 60, walkTimerSecs()) / 60;
  if (walkTimer.key === 'dest') form.draft.destWalk = minutes;
  else if (form.draft.stops[Number(walkTimer.key)]) form.draft.stops[Number(walkTimer.key)].walk = minutes;
  closeWalkTimer();
  syncSteppers();
}

export function closeWalkTimer(): void {
  clearInterval(walkTick);
  walkTimer = null;
  saveWalkTimer();
  if ($<HTMLDialogElement>('walkTimer').open) $<HTMLDialogElement>('walkTimer').close();
}

/** The app was closed mid-walk: open that route's settings with the stopwatch still counting. */
export function resumeWalkTimer(): void {
  let saved: { key: string; start: number; routeId?: string } | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
  } catch {}
  if (!saved) return;
  const fresh = Date.now() - saved.start < 60 * 60000;
  if (!fresh || !saved.routeId || !state.routes.some((r) => r.id === saved.routeId)) {
    try {
      localStorage.removeItem(TIMER_KEY);
    } catch {}
    return;
  }
  openSetup(saved.routeId);
  openWalkTimer(saved.key, saved.start);
}
