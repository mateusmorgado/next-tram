import { CITIES, DEFAULT_ROUTES, DEFAULT_MODE_FILTER } from './lib/stops.js';
import {
  createTransitClient,
  fetchRoute,
  planTrips,
  leaveAdvice,
  minutesUntil,
  formatClock,
  shortStopName,
  shortDirection,
  routeOptions,
  delayLabel,
  DELAY_BRACKETS,
} from './lib/transit.js';

const STORAGE_KEY = 'nexttram:v1';
const REFRESH_MS = 60_000;
const MAX_UPCOMING = 7;
const client = createTransitClient();
/** What the big faint mark in the card's corner shows: stop initials (Ed/TP), the line number, or nothing. */
const MARKS = ['stop', 'line', 'none'];

// ───────────────────────── State ─────────────────────────

const state = loadState();
let reversed = false;
let connections = [];
let lastFetch = 0;
let lastSource = '';
let selectedId = null;
let loading = false;
let fetchToken = 0;
let refreshTimer = null;
let lastPlan = null;
let swiped = false;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {}
  const routes = Array.isArray(saved.routes) && saved.routes.length ? saved.routes : clone(DEFAULT_ROUTES);
  const activeId = routes.some((r) => r.id === saved.activeId) ? saved.activeId : routes[0].id;
  const mark = MARKS.includes(saved.mark) ? saved.mark : 'stop';
  return { routes, activeId, theme: saved.theme || 'system', watch: Boolean(saved.watch), mark, countdown: Boolean(saved.countdown) };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const activeRoute = () => state.routes.find((r) => r.id === state.activeId) || state.routes[0];

// ───────────────────────── DOM helpers ─────────────────────────

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const badge = (c, size = '') => {
  const style = c.color ? ` style="background:${esc(c.color.bg)};color:${esc(c.color.fg)}"` : '';
  return `<span class="badge ${esc(c.product)} ${size}"${style}>${esc(c.line)}</span>`;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ───────────────────────── Rendering ─────────────────────────

function routeLabel(route) {
  if (route.label) return route.label;
  return shortStopName(route.dest?.name || 'Route');
}

function renderFavs() {
  const bar = $('favBar');
  bar.innerHTML =
    state.routes
      .map(
        (r) =>
          `<button class="chip" type="button" data-route="${esc(r.id)}" aria-current="${r.id === state.activeId}">${esc(routeLabel(r))}</button>`,
      )
      .join('') + `<button class="chip chip-add" type="button" id="addRouteBtn">+ New</button>`;
}

function renderRoute() {
  const route = activeRoute();
  const city = CITIES[route.city] || CITIES.leipzig;
  $('cityLabel').textContent = `${city.label} · ${city.operator}`;
  const homes = route.stops.map((s) => `<strong>${esc(shortStopName(s.stop.name))}</strong>`).join(' / ');
  const dest = `<strong>${esc(shortStopName(route.dest.name))}</strong>`;
  const full = reversed
    ? `<span class="back-tag">Back</span>${dest}<span class="arrow">→</span>${homes}`
    : `${homes}<span class="arrow">→</span>${dest}`;
  const short = reversed ? `${dest} → home` : `→ ${dest}`;
  $('routeText').innerHTML = `<span class="rt-full">${full}</span><span class="rt-short">${short}</span>`;
  $('swapBtn').setAttribute('aria-pressed', String(reversed));
}

function render() {
  const now = Date.now();
  const route = activeRoute();
  const slots = routeOptions(route, reversed).length;
  const plan = planTrips(connections, now, { selectedId, slots });
  if (selectedId && !plan.upcoming.some((c) => c.id === selectedId)) selectedId = null;
  lastPlan = plan;

  renderHero(plan, now, slots);
  fitMonogram();
  renderWatchNav(plan, now);
  renderCompare(plan, now, slots);
  renderUpcoming(plan, now);
  renderStatus(now);

  // When the shown tram leaves, fetch fresh data.
  if (lastFetch && !loading && plan.hero && plan.hero.depMs <= now + 1000) refresh();
}

/**
 * Short stop mark: "Edlichstraße" → "Ed", "Torgauer Platz" → "TP", "S+U Warschauer Str." → "WS".
 * Kept distinct between the route's stops by adding a letter when two would collide.
 */
function stopMonogram(name) {
  const route = activeRoute();
  const names = [...route.stops.map((s) => s.stop.name), route.dest.name].map(shortStopName);
  const base = (n, len) => {
    const words = shortStopName(n)
      .replace(/^(S\+U|S|U)\s+/, '')
      .split(/[\s\-/]+/)
      .filter((w) => /^[A-Za-zÄÖÜäöüß]/.test(w));
    if (words.length >= 2) return (words[0][0] + words[1].slice(0, len - 1)).replace(/^(.)(.*)$/, (m, a, b) => a.toUpperCase() + (len > 2 ? b.toLowerCase() : b.toUpperCase()));
    const w = words[0] || n;
    return w.slice(0, len).replace(/^./, (ch) => ch.toUpperCase());
  };
  const me = shortStopName(name);
  for (let len = 2; len <= 4; len++) {
    const mine = base(me, len);
    if (!names.some((o) => o !== me && base(o, len) === mine)) return mine;
  }
  return base(me, 2);
}

/**
 * Put the mark's ink (not its text box) exactly in the card's top-right corner, so the
 * letters touch both borders whatever font the device uses. The rounded corner may clip them.
 */
const inkCache = new Map();
let measureCtx = null;
function fitMonogram() {
  const el = document.querySelector('#hero .monogram');
  if (!el) return;
  el.style.top = el.style.right = '';
  const cs = getComputedStyle(el);
  if (cs.transform !== 'none') return; // watch layout centres it instead
  const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const key = `${el.textContent}|${font}|${cs.letterSpacing}|${cs.lineHeight}|${cs.paddingLeft}`;
  let ink = inkCache.get(key);
  if (!ink) {
    measureCtx ||= document.createElement('canvas').getContext('2d');
    if (!measureCtx || !('actualBoundingBoxAscent' in TextMetrics.prototype)) return;
    measureCtx.font = font;
    if ('letterSpacing' in measureCtx) measureCtx.letterSpacing = cs.letterSpacing;
    const m = measureCtx.measureText(el.textContent);
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.05;
    const baseline = parseFloat(cs.paddingTop) + (lineH - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    ink = { top: baseline - m.actualBoundingBoxAscent, right: parseFloat(cs.paddingLeft) + m.actualBoundingBoxRight };
    inkCache.set(key, ink);
  }
  // Overshoot the corner a little so the card's border clips the letters: no sliver of gap on any font.
  const bleed = parseFloat(cs.fontSize) * 0.07;
  const bleedTop = parseFloat(cs.fontSize) * 0.015; // just past the edge, so the top bar of a T stays full
  el.style.top = `${-ink.top - bleedTop}px`;
  el.style.right = `${-(el.offsetWidth - ink.right) - bleed}px`;
}

function heroMark(c, placeName, slots) {
  if (state.mark === 'line' && c.line && c.lineKnown !== false) {
    const tint = c.color?.bg ? ` style="--mono-tint:${esc(c.color.bg)}"` : '';
    return `<span class="monogram line-mark"${tint} aria-hidden="true">${esc(c.line)}</span>`;
  }
  // "Tram number" with no known number falls back to the stop initials, never "?".
  if ((state.mark === 'stop' || state.mark === 'line') && slots > 1) return `<span class="monogram" aria-hidden="true">${esc(stopMonogram(placeName))}</span>`;
  return '';
}

/** Watch: step through catchable departures without opening the list. */
function watchNeighbours(plan, now) {
  const list = plan.upcoming.filter((c) => c.depMs - now >= c.walk * 60000);
  const i = plan.hero ? list.findIndex((c) => c.id === plan.hero.id) : -1;
  return { prev: i > 0 ? list[i - 1] : null, next: i >= 0 ? list[i + 1] || null : null, index: i, total: list.length };
}

function renderWatchNav(plan, now) {
  const { prev, next, index, total } = watchNeighbours(plan, now);
  $('prevBtn').hidden = !prev;
  $('nextBtn').hidden = !next;
  $('watchPos').textContent = total > 1 && index >= 0 ? `${index + 1}/${total}` : '';
}

function stepTrip(dir) {
  if (!lastPlan) return;
  const n = watchNeighbours(lastPlan, Date.now());
  const target = dir > 0 ? n.next : n.prev;
  if (!target) return;
  selectedId = target.id;
  render();
}

function renderHero(plan, now, slots) {
  const el = $('hero');
  const c = plan.hero;
  if (!c) {
    if (!lastFetch) return; // keep skeleton until the first answer
    el.innerHTML = `<div class="hero-empty"><strong>No catchable departures</strong>${
      connections.length ? 'Nothing you can still reach in the next hour or two.' : 'No trams or buses found for this route right now.'
    }</div>`;
    return;
  }
  const secs = Math.max(0, Math.floor((c.depMs - now) / 1000));
  const mins = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');
  const advice = leaveAdvice(c, now);

  let delay = '';
  if (!c.realtime) delay = '<span class="delay plan">scheduled</span>';
  else delay = delayChip(c.delayMin);

  let leave;
  // No walk set for the trip back: you're already at the stop, so no leave advice at all.
  if (advice.atStop) leave = reversed ? '' : `<div class="leave idle">You're at the stop</div>`;
  else if (advice.now)
    leave = `<div class="leave now">🏃 Leave now<small>${plural(c.walk, 'min')} walk${advice.late ? ', hurry' : ''}</small></div>`;
  else
    leave =
      advice.minutes === 0
        ? `<div class="leave">🚶 Leave now<small>${c.walk} min walk</small></div>` // still on time: green, not the red hurry bar
        : `<div class="leave">🚶 Leave in ${advice.minutes} min<small>${c.walk} min walk</small></div>`;
  const eyebrow = reversed ? `From ${esc(c.stopName)} to` : 'Go to stop';
  const placeName = reversed ? c.toName : c.stopName;
  const place = esc(placeName);
  const mark = heroMark(c, placeName, slots);
  const pick = plan.manual
    ? `<span class="pick">Your pick · <button class="link" type="button" id="autoBtn">back to fastest</button></span>`
    : eyebrow;
  el.innerHTML = `
    <div class="hero-main" id="heroMain" title="Tap to refresh">
      ${mark}
      <div class="hero-eyebrow">${pick}</div>
      <div class="hero-stop">${place}</div>
      <div class="hero-line">${badge(c, 'lg')}<span class="dir" title="${esc(c.direction)}">→ ${esc(shortDirection(c.direction))}</span></div>
      <div class="hero-count">
        <button type="button" class="count ${state.countdown ? 'timer' : ''}" id="countBtn" aria-label="${mins} minutes ${secs % 60} seconds. Tap to switch between minutes and timer">
          ${
            state.countdown
              ? `<span class="count-num"><span class="timer-text">${mins}:${ss}</span></span><span class="count-unit" aria-hidden="true">&#8203;</span>`
              : `<span class="count-num">${mins}</span><span class="count-unit">min</span><span class="count-sec">${mins}:${ss}</span>`
          }
        </button>
        <div class="times">
          <div>leaves <b>${formatClock(c.depMs)}</b> ${delay}</div>
          ${c.arrMs ? `<div>arrives <b>${formatClock(c.arrMs)}</b>${c.transfers ? ` · ${plural(c.transfers, 'change')}` : ''}</div>` : ''}
        </div>
      </div>
    </div>
    ${leave}`;
}

function renderCompare(plan, now, slots) {
  const el = $('compare');
  if (slots < 2 || !lastFetch) {
    el.hidden = true;
    return;
  }
  const options = routeOptions(activeRoute(), reversed);
  el.hidden = false;
  el.innerHTML = plan.perSlot
    .map((p) => {
      const o = options[p.slot];
      const name = reversed ? shortStopName(o.to.name) : shortStopName(o.from.name);
      const isBest = plan.hero && plan.hero.slot === p.slot && !plan.manual;
      const n = p.next;
      return `<button class="stop-card ${isBest ? 'best' : ''}" type="button" ${n ? `data-trip="${esc(n.id)}"` : 'disabled'}>
        <div class="meta"><span>${reversed ? 'Get off at' : `Stop ${p.slot + 1} · ${o.walk} min walk`}</span>${isBest ? '<span class="best-tag">Best</span>' : ''}</div>
        <div class="name">${esc(name)}</div>
        ${
          n
            ? `<div class="next">${badge(n)}<span class="in">${minutesUntil(n, now)} min</span><span class="at">${formatClock(reversed && n.arrMs ? n.arrMs : n.depMs)}</span></div>`
            : `<div class="none">${p.count ? 'Nothing catchable' : 'No departures found'}</div>`
        }
      </button>`;
    })
    .join('');
}

function renderUpcoming(plan, now) {
  const section = $('upcomingSection');
  if (!plan.upcoming.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const multi = routeOptions(activeRoute(), reversed).length > 1;
  $('tripList').innerHTML = plan.upcoming
    .map((c) => {
      const tight = c.depMs - now < c.walk * 60000;
      const selected = plan.hero && plan.hero.id === c.id;
      const sub = [
        multi ? (reversed ? `to ${c.toName}` : `from ${c.stopName}`) : '',
        c.arrMs ? `arr ${formatClock(c.arrMs)}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const d = c.realtime ? delayLabel(c.delayMin) : null;
      const chip = d && d.key !== 'ontime' ? delayChip(c.delayMin, 'sm') : '';
      return `<li><button class="trip ${tight ? 'tight' : ''} ${selected ? 'selected' : ''}" type="button" data-trip="${esc(c.id)}">
        <span class="t">${formatClock(c.depMs)}</span>
        ${badge(c)}
        <span class="info"><span class="dir" title="${esc(c.direction)}">${esc(shortDirection(c.direction))}</span><span class="sub">${chip}${esc(sub)}</span></span>
        <span class="in">${tight ? 'too tight' : `${minutesUntil(c, now)} min`}</span>
      </button></li>`;
    })
    .join('');
  capUpcoming();
}

/** Cap the list at 7 visible rows; the rest scrolls inside it. */
function capUpcoming() {
  const list = $('tripList');
  const rows = list.children;
  if (rows.length <= MAX_UPCOMING) {
    list.style.maxHeight = '';
    list.classList.remove('scrolls');
    return;
  }
  const last = rows[MAX_UPCOMING - 1];
  // A sliver of the 8th row peeks out so it's clear the list scrolls.
  const bottom = last.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop;
  list.style.maxHeight = `${Math.round(bottom + 14)}px`;
  list.classList.add('scrolls');
}

function delayChip(delayMin, size = '') {
  const d = delayLabel(delayMin);
  return `<span class="delay ${d.key} ${size}" role="button" tabindex="0" data-delay-info title="What does ${esc(d.label)} mean?">${esc(d.label)}</span>`;
}

function openDelayInfo() {
  $('delayInfoList').innerHTML =
    DELAY_BRACKETS.map((b) => `<li><span class="delay ${b.key}">${esc(b.label)}</span><span>${esc(b.text)}</span></li>`).join('') +
    `<li><span class="delay plan">scheduled</span><span>No live data for this tram, only the timetable.</span></li>`;
  $('delayInfo').showModal();
}

function renderStatus(now) {
  const el = $('statusText');
  if (loading && !lastFetch) el.textContent = 'Loading live departures…';
  else if (!lastFetch) el.textContent = '';
  else {
    const ago = Math.round((now - lastFetch) / 1000);
    const when = ago < 10 ? 'just now' : ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)} min ago`;
    el.textContent = `Updated ${when}${lastSource ? ` · ${lastSource}` : ''}`;
  }
  document.body.classList.toggle('loading', loading);
}

// ───────────────────────── Data ─────────────────────────

async function refresh() {
  const route = activeRoute();
  const token = ++fetchToken;
  loading = true;
  renderStatus(Date.now());
  try {
    const result = await fetchRoute(client, route, { reversed });
    if (token !== fetchToken) return;
    connections = result.connections;
    lastFetch = Date.now();
    const sources = new Set(result.connections.map((c) => c.source));
    lastSource = [...sources].map((s) => (s === 'transitous' ? 'Transitous' : CITIES[route.city]?.key === 'berlin' ? 'BVG' : 'DB')).join(' + ');
    cacheResolvedIds(route, result.options);
    const err = $('errorNotice');
    if (result.errors.length) {
      const failed = result.errors
        .map((e) => {
          const o = result.options.find((x) => x.slot === e.slot);
          return shortStopName((reversed ? o?.to : o?.from)?.name || '');
        })
        .join(', ');
      err.textContent = `Couldn't load ${failed}. Showing the other stop only.`;
      err.hidden = false;
    } else err.hidden = true;
  } catch (e) {
    if (token !== fetchToken) return;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    $('errorNotice').textContent = offline
      ? "You're offline. Departures will load when you're back online."
      : `Couldn't load live departures (${e.message}). Tap Refresh to try again.`;
    $('errorNotice').hidden = false;
    if (!lastFetch) lastFetch = Date.now();
  } finally {
    if (token === fetchToken) {
      loading = false;
      render();
    }
  }
}

/** Remember the stop IDs the APIs gave us, so the next request skips the lookup. */
function cacheResolvedIds(route, options) {
  const pick = (s) => ({ tid: s.tid, hafasId: s.hafasId });
  options.forEach((o) => {
    const home = reversed ? o.to : o.from;
    const away = reversed ? o.from : o.to;
    const slot = route.stops[o.slot];
    if (slot) Object.assign(slot.stop, stripUndefined(pick(home)));
    Object.assign(route.dest, stripUndefined(pick(away)));
  });
  saveState();
}

function stripUndefined(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));
}

function switchRoute(id) {
  if (id === state.activeId && lastFetch) return;
  state.activeId = id;
  reversed = false;
  resetData();
  saveState();
  renderFavs();
  renderRoute();
  refresh();
}

function resetData() {
  connections = [];
  lastFetch = 0;
  selectedId = null;
  $('hero').innerHTML = '<div class="hero-skeleton"><div class="sk sk-line"></div><div class="sk sk-big"></div><div class="sk sk-line short"></div></div>';
  $('compare').hidden = true;
  $('upcomingSection').hidden = true;
  $('errorNotice').hidden = true;
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastFetch >= REFRESH_MS) refresh();
  }, 5000);
}

// ───────────────────────── Theme & watch ─────────────────────────

function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = state.theme;
}

function toggleTheme() {
  const dark = state.theme === 'dark' || (state.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  state.theme = dark ? 'light' : 'dark';
  applyTheme();
  saveState();
}

function applyWatch() {
  document.documentElement.classList.toggle('watch', state.watch);
  $('watchBtn').setAttribute('aria-pressed', String(state.watch));
}

// ───────────────────────── Setup sheet ─────────────────────────

let draft = null;
let editingId = null;
let secondStop = false; // the "Stop 2" field only shows after "+ Add a second stop"
let backWalk = false; // the trip-back walk only shows after "+ Add a walk for the trip back"

function setBackWalk(on) {
  backWalk = on;
  draft.destWalk = on ? Math.max(1, Number(draft.destWalk) || 3) : 0;
  syncSetupForm();
}

function setSecondStop(on) {
  secondStop = on;
  if (on && draft.stops.length < 2) draft.stops.push({ stop: null, walk: 4 });
  if (!on) draft.stops = draft.stops.slice(0, 1);
  syncSetupForm();
  if (on) $('stop1').focus();
}

function openSetup(routeId) {
  const base = routeId ? state.routes.find((r) => r.id === routeId) : null;
  editingId = base ? base.id : null;
  draft = base
    ? clone(base)
    : {
        id: '',
        label: '',
        city: activeRoute().city,
        stops: [{ stop: null, walk: 2 }],
        dest: null,
        modes: DEFAULT_MODE_FILTER,
      };
  backWalk = Number(draft.destWalk) > 0;
  if (!draft.stops.length) draft.stops.push({ stop: null, walk: 2 });
  draft.stops = draft.stops.slice(0, 2);
  secondStop = draft.stops.length > 1 && Boolean(draft.stops[1].stop);
  if (!secondStop) draft.stops = draft.stops.slice(0, 1);
  $('setupTitle').textContent = base ? 'Edit route' : 'New route';
  $('deleteRouteBtn').hidden = !base || state.routes.length < 2;
  $('pinBtn').hidden = !base;
  $('saveBtn').textContent = base ? 'Save' : 'Add favorite';
  $('setupError').hidden = true;
  syncSetupForm();
  $('setupSheet').showModal();
}

function syncSetupForm() {
  document.querySelectorAll('#citySeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.city === draft.city)));
  document.querySelectorAll('#modeSeg button').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.mode === (draft.modes || DEFAULT_MODE_FILTER))),
  );
  $('stop0').value = draft.stops[0]?.stop ? shortStopName(draft.stops[0].stop.name) : '';
  $('stop1').value = draft.stops[1]?.stop ? shortStopName(draft.stops[1].stop.name) : '';
  $('stop1Field').hidden = !secondStop;
  $('addStopWrap').hidden = secondStop;
  $('backWalkField').hidden = !backWalk;
  $('addBackWalkBtn').hidden = backWalk;
  $('stop0Label').textContent = secondStop ? 'Stop 1' : 'Your stop';
  document.querySelectorAll('#markSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mark === state.mark)));
  $('stopDest').value = draft.dest ? shortStopName(draft.dest.name) : '';
  $('routeLabel').value = draft.label || '';
  syncSteppers();
}

function syncSteppers() {
  document.querySelectorAll('.stepper').forEach((st) => {
    const key = st.dataset.walk;
    const v = key === 'dest' ? draft.destWalk ?? 0 : draft.stops[Number(key)]?.walk ?? 0;
    st.querySelector('output').textContent = `${v} min`;
  });
}

function stepWalk(key, delta) {
  const clamp = (v) => Math.max(0, Math.min(30, (Number(v) || 0) + delta));
  if (key === 'dest') draft.destWalk = clamp(draft.destWalk);
  else if (draft.stops[Number(key)]) draft.stops[Number(key)].walk = clamp(draft.stops[Number(key)].walk);
  syncSteppers();
}

function readDraft() {
  // Typed text that was never picked from the list still counts: it's looked up by name later.
  const typed = (id, current) => {
    const v = $(id).value.trim();
    if (!v) return null;
    if (current && shortStopName(current.name) === v) return current;
    return { name: v };
  };
  draft.stops[0].stop = typed('stop0', draft.stops[0].stop);
  if (secondStop && draft.stops[1]) draft.stops[1].stop = typed('stop1', draft.stops[1].stop);
  draft.dest = typed('stopDest', draft.dest);
  draft.label = $('routeLabel').value.trim();
  const route = clone(draft);
  route.stops = route.stops.filter((s) => s.stop);
  return route;
}

function validate(route) {
  if (!route.stops.length) return 'Pick at least one stop near you.';
  if (!route.dest) return 'Pick a destination.';
  return null;
}

function saveSetup(asNew) {
  const route = readDraft();
  const problem = validate(route);
  if (problem) {
    $('setupError').textContent = problem;
    $('setupError').hidden = false;
    return;
  }
  if (asNew || !editingId) {
    route.id = `r${Date.now().toString(36)}`;
    if (asNew && route.label && state.routes.some((r) => r.label === route.label)) route.label += ' 2';
    state.routes.push(route);
  } else {
    route.id = editingId;
    state.routes = state.routes.map((r) => (r.id === editingId ? route : r));
  }
  state.activeId = route.id;
  saveState();
  $('setupSheet').close();
  reversed = false;
  resetData();
  renderFavs();
  renderRoute();
  refresh();
}

function deleteRoute() {
  if (!editingId || state.routes.length < 2) return;
  state.routes = state.routes.filter((r) => r.id !== editingId);
  state.activeId = state.routes[0].id;
  saveState();
  $('setupSheet').close();
  switchRoute(state.activeId);
  renderFavs();
}

/** Autocomplete for one stop input. */
function setupCombo(inputId, onPick) {
  const input = $(inputId);
  const list = input.parentElement.querySelector('.suggestions');
  let timer = null;
  let items = [];
  let active = -1;
  let seq = 0;

  const close = () => {
    list.hidden = true;
    active = -1;
  };
  const show = (html) => {
    list.innerHTML = html;
    list.hidden = false;
  };
  const choose = (i) => {
    const s = items[i];
    if (!s) return;
    input.value = s.name;
    onPick(s);
    close();
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return close();
    timer = setTimeout(async () => {
      const my = ++seq;
      show('<li class="muted">Searching…</li>');
      try {
        items = await client.searchStops(draft.city, q);
      } catch {
        items = [];
      }
      if (my !== seq) return;
      if (!items.length) return show('<li class="muted">No stops found</li>');
      active = -1;
      show(items.map((s, i) => `<li role="option" data-i="${i}" aria-selected="false">${esc(s.name)}</li>`).join(''));
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      list.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active >= 0 ? active : 0);
    } else if (e.key === 'Escape') close();
  });
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) {
      e.preventDefault();
      choose(Number(li.dataset.i));
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

function useGps() {
  const btn = $('gpsBtn');
  const label = btn.lastChild;
  const original = label.textContent;
  const done = () => {
    label.textContent = original;
    btn.disabled = false;
  };
  const fail = (msg) => {
    $('setupError').textContent = msg;
    $('setupError').hidden = false;
    done();
  };
  if (!window.isSecureContext) return fail('Location only works over https (or on localhost).');
  if (!navigator.geolocation) return fail('Location is not available in this browser.');
  $('setupError').hidden = true;
  btn.disabled = true;
  label.textContent = ' Finding your location…';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      label.textContent = ' Looking for stops nearby…';
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const near = await client.nearbyStops(draft.city, lat, lon);
        if (!near.length) return fail(`No ${CITIES[draft.city]?.label || ''} stops within about 1 km of you. Type your stop instead.`);
        const walkMin = (m) => Math.max(1, Math.round((m || 0) / 80)); // ~80 m per minute
        const asStop = (s) => stripUndefined({ name: s.name, tid: s.tid, hafasId: s.hafasId, lat: s.lat, lon: s.lon });
        draft.stops[0] = { stop: asStop(near[0]), walk: walkMin(near[0].distance) };
        // Only fill Stop 2 if the person already opened it.
        if (secondStop && near[1]) draft.stops[1] = { stop: asStop(near[1]), walk: walkMin(near[1].distance) };
        syncSetupForm();
        done();
      } catch (e) {
        fail(`Couldn't look up stops near you (${e.message}). Type your stop instead.`);
      }
    },
    (err) => {
      const why =
        err.code === 1
          ? 'Location permission is blocked. Allow it for this site in your browser settings, or type your stop.'
          : err.code === 3
            ? 'Finding your location took too long. Try again outside or type your stop.'
            : "Your phone couldn't tell where you are. Is location turned on?";
      fail(why);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
  );
}

// ───────────────────────── Wiring ─────────────────────────

function wire() {
  $('favBar').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-route]');
    if (chip) {
      if (chip.dataset.route === state.activeId) openSetup(state.activeId);
      else switchRoute(chip.dataset.route);
    } else if (e.target.closest('#addRouteBtn')) openSetup(null);
  });
  $('swapBtn').addEventListener('click', () => {
    reversed = !reversed;
    resetData();
    renderRoute();
    refresh();
  });
  $('refreshBtn').addEventListener('click', refresh);
  $('nextBtn').addEventListener('click', () => stepTrip(1));
  $('prevBtn').addEventListener('click', () => stepTrip(-1));
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-delay-info]')) {
      e.preventDefault();
      openDelayInfo();
      return;
    }
    if ($('setupSheet').open || e.target.closest?.('input')) return;
    if (e.key === 'ArrowRight') stepTrip(1);
    if (e.key === 'ArrowLeft') stepTrip(-1);
  });
  // Swipe left/right on the countdown to step through trams.
  let touchX = null;
  $('hero').addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
  $('hero').addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) {
      swiped = true;
      stepTrip(dx < 0 ? 1 : -1);
    }
  });
  $('setupBtn').addEventListener('click', () => openSetup(state.activeId));
  $('themeBtn').addEventListener('click', toggleTheme);
  $('watchBtn').addEventListener('click', () => {
    state.watch = !state.watch;
    applyWatch();
    saveState();
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-delay-info]')) {
      e.stopPropagation();
      openDelayInfo();
      return;
    }
    const trip = e.target.closest('[data-trip]');
    if (trip && trip.getAttribute('aria-disabled') !== 'true') {
      selectedId = trip.dataset.trip;
      render();
      if (!document.documentElement.classList.contains('watch')) $('hero').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (e.target.closest('#countBtn')) {
      state.countdown = !state.countdown; // big minutes ⇄ live mm:ss timer
      saveState();
      render();
      return;
    }
    if (e.target.closest('#autoBtn')) {
      selectedId = null;
      render();
      return;
    }
    if (swiped) {
      swiped = false;
      return;
    }
    if (e.target.closest('#heroMain') || (document.documentElement.classList.contains('watch') && e.target.closest('.hero'))) refresh();
  });

  // Watch: tap the route to cycle favorites.
  $('routeText').addEventListener('click', () => {
    const watchy = document.documentElement.classList.contains('watch') || matchMedia('(max-width: 380px)').matches;
    if (!watchy || state.routes.length < 2) return;
    const i = state.routes.findIndex((r) => r.id === state.activeId);
    switchRoute(state.routes[(i + 1) % state.routes.length].id);
    renderFavs();
  });

  // Setup sheet
  $('citySeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-city]');
    if (!b || b.dataset.city === draft.city) return;
    draft.city = b.dataset.city;
    draft.stops = secondStop ? [{ stop: null, walk: 2 }, { stop: null, walk: 4 }] : [{ stop: null, walk: 2 }];
    draft.dest = null;
    syncSetupForm();
  });
  $('modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    draft.modes = b.dataset.mode;
    syncSetupForm();
  });
  document.querySelectorAll('.stepper').forEach((st) =>
    st.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (b) stepWalk(st.dataset.walk, Number(b.dataset.step));
    }),
  );
  setupCombo('stop0', (s) => (draft.stops[0].stop = s));
  setupCombo('stop1', (s) => draft.stops[1] && (draft.stops[1].stop = s));
  $('addStopBtn').addEventListener('click', () => setSecondStop(true));
  $('removeStopBtn').addEventListener('click', () => setSecondStop(false));
  $('addBackWalkBtn').addEventListener('click', () => setBackWalk(true));
  $('removeBackWalkBtn').addEventListener('click', () => setBackWalk(false));
  $('markSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mark]');
    if (!b) return;
    state.mark = b.dataset.mark; // a look setting: applies right away, to every route
    saveState();
    syncSetupForm();
    render();
  });
  setupCombo('stopDest', (s) => (draft.dest = s));
  $('gpsBtn').addEventListener('click', useGps);
  $('saveBtn').addEventListener('click', () => saveSetup(false));
  $('pinBtn').addEventListener('click', () => saveSetup(true));
  $('deleteRouteBtn').addEventListener('click', deleteRoute);
  $('setupForm').addEventListener('submit', (e) => {
    // Enter in a text field shouldn't close the sheet; only the × button does.
    if (e.submitter?.value !== 'cancel') e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastFetch > 30_000) refresh();
  });
  window.addEventListener('online', refresh);
}

function applyUrlParams() {
  const p = new URLSearchParams(location.search);
  const id = p.get('route');
  if (id && state.routes.some((r) => r.id === id)) state.activeId = id;
  if (p.get('back') === '1') reversed = true;
}

function init() {
  document.fonts?.ready.then(() => { inkCache.clear(); render(); });
  applyUrlParams();
  applyTheme();
  applyWatch();
  wire();
  renderFavs();
  renderRoute();
  refresh();
  scheduleRefresh();
  setInterval(render, 1000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
