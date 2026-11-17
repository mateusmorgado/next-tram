/** Events of the setup sheet: stops, walk times, look and behaviour settings, the walk stopwatch. */
import type { CityKey, ModeFilter } from '../../transit/index.ts';
import { $, closest } from '../dom.ts';
import { render } from '../render.ts';
import { setupCombo } from '../setup/combo.ts';
import { form } from '../setup/form.ts';
import { useGps } from '../setup/gps.ts';
import { deleteRoute, saveSetup, setBackWalk, setBuffer, setRun, setSecondStop, stepWalk, syncSetupForm } from '../setup/sheet.ts';
import { closeWalkTimer, openWalkTimer, startWalkTimer, walkTimerMain } from '../setup/walk-timer.ts';
import { saveState, state } from '../store.ts';
import type { MarkKind } from '../types.ts';

export function wireSetup(): void {
  $('citySeg').addEventListener('click', (e) => {
    const city = closest(e, '[data-city]')?.dataset.city as CityKey | undefined;
    if (!city || city === form.draft.city) return;
    form.draft.city = city;
    form.draft.stops = form.secondStop ? [{ stop: null, walk: 2 }, { stop: null, walk: 4 }] : [{ stop: null, walk: 2 }];
    form.draft.dest = null;
    syncSetupForm();
  });
  $('modeSeg').addEventListener('click', (e) => {
    const mode = closest(e, '[data-mode]')?.dataset.mode as ModeFilter | undefined;
    if (!mode) return;
    form.draft.modes = mode;
    syncSetupForm();
  });
  document.querySelectorAll<HTMLElement>('.stepper').forEach((stepper) =>
    stepper.addEventListener('click', (e) => {
      const b = closest(e, '[data-step]');
      if (b) stepWalk(stepper.dataset.walk ?? '', Number(b.dataset.step));
    }),
  );
  setupCombo('stop0', (s) => (form.draft.stops[0].stop = s));
  setupCombo('stop1', (s) => form.draft.stops[1] && (form.draft.stops[1].stop = s));
  setupCombo('stopDest', (s) => (form.draft.dest = s));
  $('addStopBtn').addEventListener('click', () => setSecondStop(true));
  $('removeStopBtn').addEventListener('click', () => setSecondStop(false));
  $('addBackWalkBtn').addEventListener('click', () => setBackWalk(true));
  $('removeBackWalkBtn').addEventListener('click', () => setBackWalk(false));
  $('markSeg').addEventListener('click', (e) => {
    const mark = closest(e, '[data-mark]')?.dataset.mark as MarkKind | undefined;
    if (!mark) return;
    state.mark = mark; // a look setting: applies right away, to every route
    saveState();
    syncSetupForm();
    render();
  });
  $('runSeg').addEventListener('click', (e) => {
    const b = closest(e, '[data-run]');
    if (b) setRun(b.dataset.run === 'yes');
  });
  $('bufferSeg').addEventListener('click', (e) => {
    const b = closest(e, '[data-buffer]');
    if (b) setBuffer(Number(b.dataset.buffer));
  });

  // Walk stopwatch
  document.querySelectorAll<HTMLElement>('.time-walk').forEach((b) => b.addEventListener('click', () => openWalkTimer(b.dataset.time ?? '')));
  $('swMain').addEventListener('click', walkTimerMain);
  $('swAgain').addEventListener('click', () => startWalkTimer());
  $('swCancel').addEventListener('click', () => closeWalkTimer());
  $('walkTimer').addEventListener('cancel', (e) => {
    e.preventDefault(); // Esc or the back gesture shouldn't throw a walk in progress away by accident
    closeWalkTimer();
  });

  $('gpsBtn').addEventListener('click', useGps);
  $('saveBtn').addEventListener('click', () => saveSetup(false));
  $('pinBtn').addEventListener('click', () => saveSetup(true));
  $('deleteRouteBtn').addEventListener('click', deleteRoute);
  $('setupForm').addEventListener('submit', (e) => {
    // Enter in a text field shouldn't close the sheet; only the × button does.
    if ((e as SubmitEvent).submitter?.getAttribute('value') !== 'cancel') e.preventDefault();
  });
}
