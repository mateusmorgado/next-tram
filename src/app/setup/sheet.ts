import type { CityKey, Route, Stop } from '../../transit/index.ts';
import type { DraftRoute } from '../types.ts';
import { renderFavs, renderRoute } from '../components/route-bar.ts';
import { refresh, resetData, switchRoute } from '../data.ts';
import { $ } from '../dom.ts';
import { render } from '../render.ts';
import { emptyDraft, form } from './form.ts';
import { activeRoute, clone, saveState, session, state } from '../store.ts';
import { DEFAULT_MODE_FILTER } from '../../data/stops.ts';
import { t } from '../../i18n/index.ts';
import { bufferSecs, formatWalk, shortStopName } from '../../transit/index.ts';

export function setBackWalk(on: boolean): void {
  form.backWalk = on;
  form.draft.destWalk = on ? Math.max(1, Number(form.draft.destWalk) || 3) : 0;
  syncSetupForm();
}

export function setSecondStop(on: boolean): void {
  form.secondStop = on;
  if (on && form.draft.stops.length < 2) form.draft.stops.push({ stop: null, walk: 4 });
  if (!on) form.draft.stops = form.draft.stops.slice(0, 1);
  syncSetupForm();
  if (on) $<HTMLInputElement>('stop1').focus();
}

export function openSetup(routeId: string | null): void {
  const base = routeId ? state.routes.find((r) => r.id === routeId) : null;
  form.editingId = base ? base.id : null;
  form.draft = base ? clone<DraftRoute>(base) : emptyDraft(activeRoute().city);
  form.backWalk = Number(form.draft.destWalk) > 0;
  if (!form.draft.stops.length) form.draft.stops.push({ stop: null, walk: 2 });
  form.draft.stops = form.draft.stops.slice(0, 2);
  form.secondStop = form.draft.stops.length > 1 && Boolean(form.draft.stops[1].stop);
  if (!form.secondStop) form.draft.stops = form.draft.stops.slice(0, 1);
  $('setupTitle').textContent = base ? t('setup.title.edit') : t('setup.title.new');
  $('deleteRouteBtn').hidden = !base || state.routes.length < 2;
  $('pinBtn').hidden = !base;
  $('saveBtn').textContent = base ? t('setup.save') : t('setup.add');
  $('setupError').hidden = true;
  syncSetupForm();
  $<HTMLDialogElement>('setupSheet').showModal();
}

export function syncSetupForm(): void {
  document.querySelectorAll<HTMLElement>('#citySeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.city === form.draft.city)));
  document.querySelectorAll<HTMLElement>('#modeSeg button').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.mode === (form.draft.modes || DEFAULT_MODE_FILTER))),
  );
  $<HTMLInputElement>('stop0').value = form.draft.stops[0]?.stop ? shortStopName(form.draft.stops[0].stop.name) : '';
  $<HTMLInputElement>('stop1').value = form.draft.stops[1]?.stop ? shortStopName(form.draft.stops[1].stop.name) : '';
  $('stop1Field').hidden = !form.secondStop;
  $('addStopWrap').hidden = form.secondStop;
  $('backWalkField').hidden = !form.backWalk;
  $('addBackWalkBtn').hidden = form.backWalk;
  $('stop0Label').textContent = form.secondStop ? t('setup.stop1') : t('setup.yourStop');
  document.querySelectorAll<HTMLElement>('#markSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mark === state.mark)));
  document.querySelectorAll<HTMLElement>('#bufferSeg button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.buffer) === state.buffer)));
  document.querySelectorAll<HTMLElement>('#runSeg button').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.run === 'yes') === state.run)));
  $<HTMLInputElement>('stopDest').value = form.draft.dest ? shortStopName(form.draft.dest.name) : '';
  $<HTMLInputElement>('routeLabel').value = form.draft.label || '';
  syncSteppers();
}

export function syncSteppers(): void {
  document.querySelectorAll<HTMLElement>('.stepper').forEach((st) => {
    const key = st.dataset.walk;
    const v = key === 'dest' ? form.draft.destWalk ?? 0 : form.draft.stops[Number(key)]?.walk ?? 0;
    const out = st.querySelector('output');
    if (out) out.textContent = formatWalk(v);
  });
}

export function stepWalk(key: string, delta: number): void {
  const clamp = (v: unknown) => Math.max(0, Math.min(30, (Number(v) || 0) + delta));
  if (key === 'dest') form.draft.destWalk = clamp(form.draft.destWalk);
  else if (form.draft.stops[Number(key)]) form.draft.stops[Number(key)].walk = clamp(form.draft.stops[Number(key)].walk);
  syncSteppers();
}

/** Run for a tram if that's the only way to make it, or never. All routes, applies right away. */
export function setRun(on: boolean): void {
  state.run = Boolean(on);
  for (const r of state.routes) {
    if (state.run) delete r.noRun;
    else r.noRun = true;
  }
  if (form.draft) form.draft.noRun = state.run ? undefined : true;
  session.connections = session.connections.map((c) => ({ ...c, noRun: !state.run }));
  saveState();
  syncSetupForm();
  render();
}

/** Spare time on top of every walk, for all routes. Applies right away, like the card mark. */
export function setBuffer(secs: number): void {
  state.buffer = bufferSecs(secs);
  for (const r of state.routes) {
    if (state.buffer) r.buffer = state.buffer;
    else delete r.buffer;
  }
  if (form.draft) form.draft.buffer = state.buffer || undefined;
  // Departures already loaded keep their walk; only the spare time on top changes.
  session.connections = session.connections.map((c) => (c.walkBase ? { ...c, buffer: state.buffer, walk: c.walkBase + state.buffer / 60 } : c));
  saveState();
  syncSetupForm();
  render();
}

export function readDraft(): DraftRoute {
  // Typed text that was never picked from the list still counts: it's looked up by name later.
  const typed = (id: string, current: Stop | null): Stop | null => {
    const v = $<HTMLInputElement>(id).value.trim();
    if (!v) return null;
    if (current && shortStopName(current.name) === v) return current;
    return { name: v };
  };
  form.draft.stops[0].stop = typed('stop0', form.draft.stops[0].stop);
  if (form.secondStop && form.draft.stops[1]) form.draft.stops[1].stop = typed('stop1', form.draft.stops[1].stop);
  form.draft.dest = typed('stopDest', form.draft.dest);
  form.draft.label = $<HTMLInputElement>('routeLabel').value.trim();
  const route = clone(form.draft);
  route.stops = route.stops.filter((s) => s.stop);
  if (state.buffer) route.buffer = state.buffer;
  else delete route.buffer;
  if (state.run) delete route.noRun;
  else route.noRun = true;
  return route;
}

export function validate(route: DraftRoute): string | null {
  if (!route.stops.length) return t('setup.needStop');
  if (!route.dest) return t('setup.needDest');
  return null;
}

export function saveSetup(asNew: boolean): void {
  const draft = readDraft();
  const problem = validate(draft);
  if (problem || !draft.dest) {
    $('setupError').textContent = problem;
    $('setupError').hidden = false;
    return;
  }
  const route: Route = { ...draft, dest: draft.dest, stops: draft.stops.flatMap((s) => (s.stop ? [{ stop: s.stop, walk: s.walk }] : [])) };
  if (asNew || !form.editingId) {
    route.id = `r${Date.now().toString(36)}`;
    if (asNew && route.label && state.routes.some((r) => r.label === route.label)) route.label += ' 2';
    state.routes.push(route);
  } else {
    route.id = form.editingId;
    state.routes = state.routes.map((r) => (r.id === form.editingId ? route : r));
  }
  state.activeId = route.id;
  saveState();
  $<HTMLDialogElement>('setupSheet').close();
  session.reversed = false;
  resetData();
  renderFavs();
  renderRoute();
  refresh();
}

export function deleteRoute(): void {
  if (!form.editingId || state.routes.length < 2) return;
  state.routes = state.routes.filter((r) => r.id !== form.editingId);
  $<HTMLDialogElement>('setupSheet').close();
  switchRoute(state.routes[0].id, true); // the deleted route was on screen: always reload
}
