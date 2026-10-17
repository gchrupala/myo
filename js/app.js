// User interface: renders views from the state in store.js and handles input.

import * as S from './store.js';
import {
  dayKey,
  formatDay,
  formatDuration,
  formatField,
  formatNumber,
  formatWhen,
  restClock,
  setHeadline,
  summarizeSets,
} from './format.js';
import { LANGUAGES, language, nameFor, resolveLanguage, setLanguage, t } from './i18n.js';
import { gitHubRemote, parseRepo, syncOnce } from './sync.js';

const REST_PRESETS = [45, 60, 90, 120, 180];

const storage = openStorage();
let state = S.loadState(storage);
let saveFailed = !storage;

// Screens form a stack mirrored in browser history, so the phone's back
// gesture works. history can be unavailable in embedded frames.
const nav = [{ view: 'home', machineId: null }];
let historyOK = true;

const ui = {
  confirm: null, // key of the delete button waiting for a second tap
  confirmTimer: 0,
  draft: null, // edit form for a machine
  draftError: '',
  importCandidate: null,
  importError: '',
};

const app = document.getElementById('app');

function openStorage() {
  try {
    const ls = window.localStorage;
    ls.setItem('myo:probe', '1');
    ls.removeItem('myo:probe');
    return ls;
  } catch {
    return null;
  }
}

// Fingerprints of the machines as last saved, to stamp the ones that change
// (their updatedAt decides which version wins when devices sync).
let fingerprints = S.machineFingerprints(state);

function persist() {
  fingerprints = S.stampMachines(state, fingerprints, Date.now());
  if (!S.saveState(storage, state)) saveFailed = true;
  scheduleSync();
}

// ---------- sync with GitHub ----------
//
// The connection (repository and token) is kept on this device only, under
// its own key, so it never goes into a backup file or into the shared data.

const SYNC_KEY = 'myo:sync';
const SYNC_DELAY = 15000; // after a change, wait for more before pushing
let syncConfig = loadSyncConfig();
const sync = { busy: false, again: false, timer: 0 };

function loadSyncConfig() {
  try {
    const c = JSON.parse(storage?.getItem(SYNC_KEY) ?? 'null');
    return c?.repo && c?.token ? c : null;
  } catch {
    return null;
  }
}

function saveSyncConfig() {
  try {
    if (syncConfig) storage?.setItem(SYNC_KEY, JSON.stringify(syncConfig));
    else storage?.removeItem(SYNC_KEY);
  } catch {
    // Without storage the connection lasts until the page closes.
  }
}

function scheduleSync(delay = SYNC_DELAY) {
  if (!syncConfig) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(syncNow, delay);
}

async function syncNow() {
  const config = syncConfig;
  if (!config) return;
  if (sync.busy) {
    sync.again = true;
    return;
  }
  clearTimeout(sync.timer);
  sync.timer = 0;
  sync.busy = true;
  if (current().view === 'settings') render({ preserveFocus: true });
  let result = { error: null };
  try {
    await syncOnce({
      remote: gitHubRemote(config),
      getLocal: () => S.syncDoc(state),
      apply: (doc) => {
        state = S.applyDoc(state, doc);
        fingerprints = S.machineFingerprints(state);
        if (!S.saveState(storage, state)) saveFailed = true;
      },
      firstSync: !config.synced,
      now: Date.now(),
    });
    result = { synced: true, lastSyncAt: Date.now(), error: null };
  } catch (e) {
    // Being offline is not shown as an error; the next change, a return to
    // the app or getting back online tries again.
    result = e?.kind === 'network' ? {} : { error: e?.kind ?? 'bad' };
  } finally {
    sync.busy = false;
    if (syncConfig === config) {
      syncConfig = { ...config, ...result };
      saveSyncConfig();
    }
    render({ preserveFocus: true });
    if (sync.again) {
      sync.again = false;
      scheduleSync(1000);
    }
  }
}

async function connectSync(repoInput, tokenInput) {
  const repo = parseRepo(repoInput);
  const token = String(tokenInput ?? '').trim();
  Object.assign(ui, { syncRepo: repoInput, syncToken: token, syncError: null });
  if (!repo) ui.syncError = 'repoFormat';
  else if (!token) ui.syncError = 'token';
  if (ui.syncError) {
    render();
    return;
  }
  ui.syncConnecting = true;
  render();
  try {
    await gitHubRemote({ repo, token }).checkRepo();
    syncConfig = { repo, token, synced: false, lastSyncAt: null, error: null };
    saveSyncConfig();
    Object.assign(ui, { syncRepo: null, syncToken: null, syncConnecting: false });
    await syncNow();
  } catch (e) {
    Object.assign(ui, { syncError: e?.kind ?? 'bad', syncConnecting: false });
    render();
  }
}

function applyLanguage() {
  setLanguage(resolveLanguage(state.prefs.lang, navigator.languages ?? [navigator.language]));
  document.documentElement.lang = language();
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const current = () => nav[nav.length - 1];
const today = () => dayKey(Date.now());
const valueText = (v) => (v === null || v === undefined ? '' : formatNumber(v));
// A full ring is drawn without dashes, which would leave a seam at the top.
const dash = (progress) => (progress >= 99.9 ? 'none' : `${progress.toFixed(2)} 100`);
// During the rest the ring empties towards the target; once it is reached
// the ring is full again (and turns yellow).
const restRing = (elapsed, target) => (elapsed >= target ? 100 : Math.max(0, (1 - elapsed / target) * 100));

// ---------- navigation ----------

function go(view, machineId = null) {
  nav.push({ view, machineId });
  onEnter();
  try {
    history.pushState({ depth: nav.length }, '');
  } catch {
    historyOK = false;
  }
  render();
  window.scrollTo(0, 0);
}

function switchTab(view) {
  nav.length = 1;
  nav[0] = { view, machineId: null };
  onEnter();
  render();
  window.scrollTo(0, 0);
}

function back() {
  if (nav.length <= 1) return;
  if (historyOK) {
    history.back(); // continues in the popstate handler
    return;
  }
  nav.pop();
  onEnter();
  render();
}

// Return to the first screen, dropping everything above it.
function resetToHome() {
  const steps = nav.length - 1;
  nav.length = 1;
  nav[0] = { view: 'home', machineId: null };
  onEnter();
  render();
  if (historyOK && steps > 0) history.go(-steps);
}

window.addEventListener('popstate', (e) => {
  const depth = e.state?.depth ?? 1;
  if (depth >= nav.length) return; // forward navigation: nothing to restore
  nav.length = Math.max(1, depth);
  onEnter();
  render();
});

function onEnter() {
  ui.confirm = null;
  ui.importError = '';
  const { view, machineId } = current();
  if (view === 'edit' && (!ui.draft || ui.draft.id !== machineId)) {
    ui.draft = draftFor(machineId);
    ui.draftError = '';
  }
  if (view !== 'edit') ui.draft = null;
}

// ---------- rendering ----------

function render({ preserveFocus = false } = {}) {
  let view = current().view;
  if ((view === 'exercise' || (view === 'edit' && current().machineId)) && !S.getMachine(state, current().machineId)) {
    nav.length = 1;
    view = nav[0].view;
  }
  const html =
    view === 'exercise' ? viewExercise()
    : view === 'history' ? viewHistory()
    : view === 'edit' ? viewEdit()
    : view === 'settings' ? viewSettings()
    : viewHome();

  // Timer-driven redraws must not throw away what the user is typing.
  const focused = document.activeElement;
  const keep =
    preserveFocus && focused?.tagName === 'INPUT' && focused.id && app.contains(focused)
      ? { id: focused.id, value: focused.value, start: focused.selectionStart, end: focused.selectionEnd }
      : null;
  const scrolls = new Map([...app.querySelectorAll('[data-scroll-key]')].map((el) => [el.dataset.scrollKey, el.scrollTop]));
  app.innerHTML = html;
  placeStacks(scrolls, !preserveFocus);
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.value = keep.value;
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(keep.start, keep.end);
      } catch {
        // Not every input type supports selection.
      }
    }
  }
  updateWakeLock();
}

// Gear icon from Feather (feathericons.com, MIT licence).
const GEAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

function topBar(tab) {
  const tabButton = (view, label) =>
    `<button class="tab" type="button" data-action="tab" data-view="${view}"${tab === view ? ' aria-current="page"' : ''}>${label}</button>`;
  return `<header class="bar">
    <span class="brand">myo</span>
    <nav class="tabs" aria-label="${t('nav.view')}">${tabButton('home', t('tab.machines'))}${tabButton('history', t('tab.history'))}</nav>
    <button class="icon-btn settings-btn" type="button" data-action="settings" aria-label="${t('nav.settings')}">${GEAR}</button>
  </header>`;
}

function subBar(title, extra = '') {
  return `<header class="bar">
    <button class="icon-btn" type="button" data-action="back" aria-label="${t('nav.back')}"><span aria-hidden="true">‹</span></button>
    <h1 class="bar-title">${esc(title)}</h1>
    ${extra}
  </header>`;
}

function storageNotice() {
  return `${saveFailed ? `<p class="notice">${t('storage.notice')}</p>` : ''}${syncNotice()}`;
}

// Shows the exercise in progress on every other screen.
function banner() {
  const a = state.active;
  const m = a && S.getMachine(state, a.machineId);
  if (!m) return '';
  const cur = current();
  if (cur.view === 'exercise' && cur.machineId === m.id) return '';
  const now = Date.now();
  let status;
  if (a.kind === 'cardio') {
    status = `<span data-live="cardio">${formatDuration(S.cardioElapsedMs(a, now) / 1000)}</span>${a.runningSince ? '' : ` · ${t('banner.paused')}`}`;
  } else if (a.phase === 'rest') {
    status = `${t('banner.rest')} <span data-live="rest">${restClock(S.restElapsedSec(a, now), m.restTarget)}</span>`;
  } else {
    status = t('banner.waiting');
  }
  return `<button class="banner" type="button" data-action="open" data-id="${esc(m.id)}">
    <span class="banner-label">${t('banner.active')}</span>
    <span class="banner-name">${esc(nameFor(m.name))}</span>
    <span class="banner-status">${status}</span>
    <span class="chevron" aria-hidden="true">›</span>
  </button>`;
}

function stepper({ id, label, value, placeholder = '—', action, attrs = '', disabled = false, inputmode = 'decimal' }) {
  const dis = disabled ? ' disabled' : '';
  return `<div class="stepper">
    <button type="button" data-action="${action}" data-dir="-1" ${attrs} aria-label="${esc(t('aria.less', { label }))}"${dis}>−</button>
    <input id="${esc(id)}" type="text" inputmode="${inputmode}" autocomplete="off" enterkeyhint="done" ${attrs} value="${esc(value)}" placeholder="${esc(placeholder)}">
    <button type="button" data-action="${action}" data-dir="1" ${attrs} aria-label="${esc(t('aria.more', { label }))}"${dis}>+</button>
  </div>`;
}

// ---------- home ----------

function bodyWeightPanel() {
  const day = today();
  const kg = S.bodyWeightOn(state, day);
  const latest = S.latestBodyWeight(state, day);
  const earlier = S.latestBodyWeight(state, prevDay(day));
  let note;
  if (kg !== null && earlier) {
    const diff = Math.round((kg - earlier.kg) * 10) / 10;
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
    note = t('bw.savedDiff', { since: formatDay(earlier.day, Date.now(), true), diff: `${sign}${formatNumber(Math.abs(diff))}` });
  } else if (kg !== null) {
    note = t('bw.saved');
  } else if (latest) {
    note = t('bw.last', { kg: formatNumber(latest.kg), day: formatDay(latest.day, Date.now(), true) });
  } else {
    note = t('bw.empty');
  }
  return `<section class="body-weight" aria-labelledby="bw-label">
    <div class="field">
      <label id="bw-label" for="bw-input">${t('bw.label')} <span class="unit">kg</span></label>
      ${stepper({
        id: 'bw-input',
        label: t('bw.aria'),
        value: valueText(kg),
        placeholder: latest ? formatNumber(latest.kg) : '—',
        action: 'bw-step',
        attrs: 'data-bw="1"',
        disabled: !latest,
      })}
    </div>
    <p class="field-note">${esc(note)}</p>
  </section>`;
}

function prevDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1).getTime());
}

function settingChips(fields) {
  const filled = fields.map(S.fieldSnapshot).filter((f) => f.value !== null);
  if (!filled.length) return '';
  return `<span class="chips">${filled.map((f) => `<span class="chip">${esc(formatField(f))}</span>`).join('')}</span>`;
}

function viewHome() {
  const now = Date.now();
  const rows = state.machines
    .map((m) => {
      const last = S.lastSession(state, m.id);
      const lastText = last
        ? t('home.last', { day: formatDay(last.day, now, true), summary: summarizeSets(last.sets) })
        : t('home.never');
      return `<li><button class="machine" type="button" data-action="open" data-id="${esc(m.id)}">
        <span class="machine-text">
          <span class="machine-name">${esc(nameFor(m.name))}</span>
          ${settingChips(m.fields)}
          <span class="machine-last">${esc(lastText)}</span>
        </span>
        <span class="chevron" aria-hidden="true">›</span>
      </button></li>`;
    })
    .join('');
  return `${topBar('home')}
  <main>
    ${banner()}
    ${storageNotice()}
    ${bodyWeightPanel()}
    <h2 class="section-title">${t('tab.machines')}</h2>
    <ul class="machines">${rows}</ul>
    <button class="btn wide" type="button" data-action="add-machine">${t('home.add')}</button>
  </main>`;
}

// ---------- exercise ----------

function settingsSection(m) {
  if (!m.fields.length) {
    return `<section class="settings"><p class="field-note">${t('ex.noSettings')}</p></section>`;
  }
  const rows = m.fields.map((f) => (f.kind === 'stack' ? stackSetting(f) : numberSetting(f))).join('');
  return `<section class="settings" aria-label="${t('ex.settingsAria')}">${rows}</section>`;
}

function numberSetting(f) {
  const label = nameFor(f.label);
  return `<div class="field">
    <label for="f-${esc(f.id)}">${esc(label)}${f.unit ? ` <span class="unit">${esc(f.unit)}</span>` : ''}</label>
    ${stepper({ id: `f-${f.id}`, label, value: valueText(f.value), action: 'step', attrs: `data-field="${esc(f.id)}"` })}
  </div>`;
}

// The two curved arrows printed on the add-on weight knob.
const KNOB_ARROWS = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M44 20 A32 32 0 0 0 22 50" />
  <path d="M56 20 A32 32 0 0 1 78 50" />
  <polygon points="14,47 30,47 22,60" />
  <polygon points="70,47 86,47 78,60" />
</svg>`;

// A weight stack drawn like the selector panel on the machine: lb on the left,
// kg on the right, a pin in the chosen plate, and the add-on weight dial.
function stackSetting(f) {
  const id = esc(f.id);
  const snap = S.fieldSnapshot(f);
  const total = snap.value === null ? '—' : `${formatNumber(snap.value)} kg`;
  const hint = snap.value === null ? `<p class="field-note">${t('stack.hint')}</p>` : '';
  const first = S.firstPosition(f);
  const rows = Array.from({ length: f.plates.count - first }, (_, k) => {
    const i = k + first;
    const w = S.plateWeights(f, i);
    const pinned = f.value === i;
    const lifted = f.value !== null && i >= 0 && i <= f.value;
    return `<button class="stack-row${lifted ? ' is-lifted' : ''}" type="button" data-action="plate" data-field="${id}" data-i="${i}" aria-pressed="${pinned}" aria-label="${formatNumber(w.lb)} lb, ${formatNumber(w.kg)} kg">
      <span class="stack-lb">${formatNumber(w.lb)}</span>
      <span class="stack-hole${pinned ? ' is-pin' : ''}"></span>
      <span class="stack-kg">${formatNumber(w.kg)}</span>
    </button>`;
  }).join('');
  const last = f.dial ? f.dial.count - 1 : 0;
  const dial = f.dial
    ? `<div class="dial" role="group" aria-label="${t('dial.name')}, ${esc(f.dial.unit)}">
        <span class="dial-knob">${KNOB_ARROWS}<span class="dial-window">${formatNumber(S.dialValue(f))}</span></span>
        <span class="dial-buttons">
          <button type="button" data-action="dial" data-field="${id}" data-dir="-1" aria-label="${t('dial.less')}"${f.dialPos <= 0 ? ' disabled' : ''}>−</button>
          <button type="button" data-action="dial" data-field="${id}" data-dir="1" aria-label="${t('dial.more')}"${f.dialPos >= last ? ' disabled' : ''}>+</button>
        </span>
        <span class="dial-unit">${esc(t('dial.caption', { unit: f.dial.unit }))}</span>
      </div>`
    : '';
  return `<div class="stack-field">
    <div class="stack-head">
      <span class="stack-label" id="lbl-${id}">${esc(nameFor(f.label))}</span>
      <span class="stack-total">${total}</span>
    </div>
    ${hint}
    <div class="stack-body">
      <div class="stack" role="group" aria-labelledby="lbl-${id}">
        <div class="stack-cols" aria-hidden="true"><span>lb</span><span></span><span>kg</span></div>
        <div class="stack-list" data-scroll-key="stack-${id}">${rows}</div>
      </div>
      ${dial}
    </div>
  </div>`;
}

// Keep each stack list where it was, then bring the pinned plate to the middle.
function placeStacks(previous, center) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  for (const list of app.querySelectorAll('.stack-list')) {
    const before = previous.get(list.dataset.scrollKey);
    if (before !== undefined) list.scrollTop = before;
    const pinned = list.querySelector('[aria-pressed="true"]');
    if (!pinned || (before !== undefined && !center)) continue;
    const top = pinned.offsetTop - (list.clientHeight - pinned.offsetHeight) / 2;
    list.scrollTo({ top, behavior: before !== undefined && !reduce ? 'smooth' : 'auto' });
  }
}

// The ring around the big button: rest progress, or full during a set.
function ring(progress, live) {
  return `<svg class="plate-ring" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="ring-track" cx="50" cy="50" r="46"></circle>
    <circle class="ring" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="${dash(progress)}"${live ? ' data-live="ring"' : ''}></circle>
  </svg>`;
}

const bigClass = (text) => `plate-big${text.length > 5 ? ' is-long' : ''}`;

// The circle is only the rest timer. Reps are set with the stepper and the
// set is saved with one button, which starts the rest.
function strengthControls(m, a, now, setsToday) {
  const phase = a?.phase === 'rest' ? 'rest' : 'ready';
  const nextSet = setsToday.length + 1;
  let big;
  let sub;
  let hint;
  let progress = 0;
  let cls = `plate is-${phase}`;
  if (phase === 'rest') {
    const elapsed = S.restElapsedSec(a, now);
    const done = elapsed >= m.restTarget;
    if (done) cls += ' is-done';
    big = restClock(elapsed, m.restTarget);
    sub = t('plate.rest');
    hint = t(done ? 'hint.restDone' : 'hint.rest', { target: formatDuration(m.restTarget), n: nextSet });
    progress = restRing(elapsed, m.restTarget);
  } else {
    big = String(nextSet);
    sub = t('plate.set');
    hint = t('hint.ready');
  }
  const bigHtml = phase === 'rest' ? `<span data-live="rest">${big}</span>` : big;
  const presets = REST_PRESETS.map(
    (s) =>
      `<button class="seg" type="button" data-action="rest-target" data-sec="${s}" aria-pressed="${m.restTarget === s}">${formatDuration(s)}</button>`,
  ).join('');
  return `<section class="plate-zone" aria-label="${t('ex.timerAria')}">
    <div class="${cls}" role="timer">
      ${ring(progress, phase === 'rest')}
      <span class="plate-face">
        <span class="${bigClass(big)}">${bigHtml}</span>
        <span class="plate-sub">${sub}</span>
      </span>
    </div>
    <p class="hint">${hint}</p>
    <div class="save-row">
      <div class="reps">
        <label class="reps-label" for="reps-input">${t('ex.reps')}</label>
        ${stepper({ id: 'reps-input', label: t('ex.reps'), value: String(S.repsFor(state, m.id)), action: 'reps-step', attrs: 'data-reps="1"', inputmode: 'numeric' })}
      </div>
      <button class="btn primary grow" type="button" data-action="save-set">${t('ex.saveSet', { n: nextSet })}</button>
    </div>
  </section>
  <section class="rest-settings" aria-labelledby="rest-label">
    <h2 class="section-title" id="rest-label">${t('ex.restTarget')}</h2>
    <div class="segs">${presets}</div>
    <label class="check"><input id="sound" type="checkbox"${state.prefs.sound ? ' checked' : ''}> ${t('ex.sound')}</label>
  </section>`;
}

function cardioControls(m, a, now) {
  const ms = a ? S.cardioElapsedMs(a, now) : 0;
  const running = Boolean(a?.runningSince);
  const started = ms > 0 || running;
  const cls = `plate ${running ? 'is-set' : started ? 'is-paused' : 'is-ready'}`;
  const sub = t(running ? 'cardio.running' : started ? 'cardio.paused' : 'cardio.stopwatch');
  const hint = t(running ? 'cardio.hintRunning' : started ? 'cardio.hintPaused' : 'cardio.hintReady');
  const big = formatDuration(ms / 1000);
  return `<section class="plate-zone" aria-label="${t('cardio.aria')}">
    <button class="${cls}" type="button" data-action="cardio-toggle">
      ${ring(started ? 100 : 0, false)}
      <span class="plate-face">
        <span class="sr">${t(running ? 'cardio.stop' : 'cardio.start')}. </span>
        <span class="${bigClass(big)}"><span data-live="cardio">${big}</span></span>
        <span class="plate-sub">${sub}</span>
      </span>
    </button>
    <p class="hint">${hint}</p>
    <div class="controls">
      <button class="btn primary grow" type="button" data-action="cardio-finish"${S.cardioCanFinish(state, m.id, now) ? '' : ' disabled'}>${t('cardio.finish')}</button>
    </div>
  </section>`;
}

// Sets with the rests between them.
function setRows(sets, deletable) {
  return sets
    .map((s, i) => {
      const rest =
        i > 0 && s.restBeforeSec !== null && s.restBeforeSec !== undefined
          ? `<li class="rest-row"><span>${t('set.rest', { time: formatDuration(s.restBeforeSec) })}</span></li>`
          : '';
      const { main, meta } = setHeadline(s);
      const confirming = ui.confirm === `set:${s.id}`;
      const del = deletable
        ? `<button class="set-del${confirming ? ' is-confirm' : ''}" type="button" data-action="del-set" data-id="${esc(s.id)}">${t(confirming ? 'set.confirm' : 'set.delete')}</button>`
        : '';
      return `${rest}<li class="set-row">
        <span class="set-n">${i + 1}</span>
        <span class="set-main">${esc(main)}</span>
        <span class="set-meta">${esc(meta)}</span>
        ${del}
      </li>`;
    })
    .join('');
}

function setLog(title, sets, deletable) {
  if (!sets.length) return '';
  return `<section class="log">
    <h2 class="section-title">${esc(title)}</h2>
    <ol class="sets">${setRows(sets, deletable)}</ol>
  </section>`;
}

function viewExercise() {
  const m = S.getMachine(state, current().machineId);
  const now = Date.now();
  const a = state.active?.machineId === m.id ? state.active : null;
  const day = dayKey(now);
  const setsToday = S.setsOn(state, m.id, day);
  const prev = S.lastSession(state, m.id, day);
  const controls = m.type === 'cardio' ? cardioControls(m, a, now) : strengthControls(m, a, now, setsToday);
  const end =
    a && m.type !== 'cardio' ? `<button class="btn wide" type="button" data-action="end">${t('ex.end')}</button>` : '';
  return `${subBar(nameFor(m.name), `<button class="btn small" type="button" data-action="edit" data-id="${esc(m.id)}">${t('ex.edit')}</button>`)}
  <main class="exercise">
    ${banner()}
    ${storageNotice()}
    ${settingsSection(m)}
    ${controls}
    ${setLog(setsToday.length ? `${t('day.today')} · ${summarizeSets(setsToday)}` : t('day.today'), setsToday, true)}
    ${prev ? setLog(t('ex.previous', { day: formatDay(prev.day, now) }), prev.sets, false) : ''}
    ${end}
  </main>`;
}

// ---------- history ----------

function dayTotals(blocks, bodyWeight) {
  const sets = blocks.flatMap((b) => b.sets);
  const strength = sets.filter((s) => s.type !== 'cardio');
  const cardio = sets.filter((s) => s.type === 'cardio');
  const cardioSec = cardio.reduce((n, s) => n + (s.durationSec || 0), 0);
  const kcal = cardio.reduce((n, s) => n + (s.settings?.find((f) => f.unit === 'kcal')?.value || 0), 0);
  const parts = [];
  if (bodyWeight !== null) parts.push(t('hist.weight', { kg: formatNumber(bodyWeight) }));
  if (strength.length) {
    const reps = strength.reduce((n, s) => n + s.reps, 0);
    parts.push(t('hist.sets', { n: strength.length, reps }));
  }
  if (cardio.length) {
    const cardioParts = [kcal ? `${formatNumber(kcal)} kcal` : '', cardioSec ? formatDuration(cardioSec) : ''];
    parts.push(`cardio ${cardioParts.filter(Boolean).join(', ')}`);
  }
  return parts.join(' · ');
}

function dataSection() {
  let confirm = '';
  if (ui.importCandidate) {
    const counts = { machines: ui.importCandidate.machines.length, sets: ui.importCandidate.sets.length };
    confirm = `<div class="notice" role="alert">
      <p>${t('data.confirm', counts)}</p>
      <div class="controls">
        <button class="btn danger" type="button" data-action="import-confirm">${t('data.replace')}</button>
        <button class="btn" type="button" data-action="import-cancel">${t('data.cancel')}</button>
      </div>
    </div>`;
  }
  const error = ui.importError ? `<p class="error" role="alert">${esc(ui.importError)}</p>` : '';
  return `<section class="data" aria-labelledby="data-label">
    <h2 class="section-title" id="data-label">${t('data.title')}</h2>
    <p class="field-note">${t('data.note')}</p>
    <div class="controls">
      <button class="btn" type="button" data-action="export">${t('data.export')}</button>
      <label class="btn" for="import-file">${t('data.import')}</label>
    </div>
    <input id="import-file" type="file" accept="application/json,.json" hidden>
    ${error}${confirm}
  </section>`;
}

function viewHistory() {
  const now = Date.now();
  const days = S.historyByDay(state);
  const body = days.length
    ? days
        .map(
          ({ day, blocks, bodyWeight }) => `<section class="day">
        <h2 class="day-title">${esc(formatDay(day, now))}</h2>
        <p class="day-totals">${esc(dayTotals(blocks, bodyWeight))}</p>
        ${blocks
          .map(
            (b) => `<article class="block">
          <h3 class="block-title">${esc(nameFor(S.getMachine(state, b.machineId)?.name ?? b.machineName))}</h3>
          <ol class="sets">${setRows(b.sets, true)}</ol>
        </article>`,
          )
          .join('')}
      </section>`,
        )
        .join('')
    : `<div class="empty">
        <p class="empty-title">${t('hist.emptyTitle')}</p>
        <p>${t('hist.emptyText')}</p>
      </div>`;
  return `${topBar('history')}
  <main>
    ${banner()}
    ${storageNotice()}
    ${body}
    ${dataSection()}
  </main>`;
}

// ---------- edit machine ----------

// The edit form keeps every number as typed. Each setting carries both the
// number and the stack options, so switching its kind keeps what was typed.
function draftField(f = {}) {
  const stack = f.kind === 'stack';
  const p = f.plates ?? S.DEFAULT_PLATES;
  const d = stack ? f.dial : S.DEFAULT_DIAL;
  return {
    id: f.id ?? null,
    kind: stack ? 'stack' : 'number',
    label: f.label ?? '',
    unit: stack ? 'kg' : (f.unit ?? ''),
    step: formatNumber(stack ? 5 : (f.step ?? 1)),
    plates: {
      count: String(p.count),
      kgFirst: formatNumber(p.kgFirst),
      kgStep: formatNumber(p.kgStep),
      lbFirst: formatNumber(p.lbFirst),
      lbStep: formatNumber(p.lbStep),
      zero: Boolean(p.zero),
    },
    dial: d
      ? { count: String(d.count), step: formatNumber(d.step), unit: d.unit }
      : { count: '0', step: formatNumber(S.DEFAULT_DIAL.step), unit: S.DEFAULT_DIAL.unit },
  };
}

// Default names appear translated in the form. origName and origLabel keep
// what is stored, so an untouched name is saved unchanged (see saveDraft).
function draftFor(machineId) {
  const m = machineId && S.getMachine(state, machineId);
  const fieldDraft = (f) => ({ ...draftField(f), label: nameFor(f.label), origLabel: f.label });
  if (m) return { id: m.id, name: nameFor(m.name), origName: m.name, type: m.type, fields: m.fields.map(fieldDraft) };
  return { id: null, name: '', type: 'strength', fields: [fieldDraft({ kind: 'stack', label: 'Ciężar' })] };
}

function draftFieldRow(f, i) {
  const input = (prop, value, attrs = '') =>
    `<input id="d-${prop.replace('.', '-')}-${i}" type="text" data-draft="${prop}" data-i="${i}" value="${esc(value)}" autocomplete="off" ${attrs}>`;
  const num = (prop, value, label) => input(prop, value, `inputmode="decimal" aria-label="${label}"`);
  const suffix = (html, unit) => `<span class="suffix">${html}<span aria-hidden="true">${unit}</span></span>`;
  const option = (value, label, current) => `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`;
  const body =
    f.kind === 'stack'
      ? `<div class="draft-grid">
          <label for="d-plates-count-${i}">${t('edit.plates')}</label>
          ${input('plates.count', f.plates.count, 'inputmode="numeric"')}
          <span></span>
          <span>${t('edit.firstPlate')}</span>
          ${suffix(num('plates.kgFirst', f.plates.kgFirst, t('edit.firstKg')), 'kg')}
          ${suffix(num('plates.lbFirst', f.plates.lbFirst, t('edit.firstLb')), 'lb')}
          <span>${t('edit.nextPlate')}</span>
          ${suffix(num('plates.kgStep', f.plates.kgStep, t('edit.nextKg')), '+kg')}
          ${suffix(num('plates.lbStep', f.plates.lbStep, t('edit.nextLb')), '+lb')}
          <label for="d-dial-count-${i}">${t('edit.dialCount')}</label>
          ${input('dial.count', f.dial.count, 'inputmode="numeric"')}
          <span class="draft-hint">${t('edit.noDial')}</span>
          <label for="d-dial-step-${i}">${t('edit.dialStep')}</label>
          ${input('dial.step', f.dial.step, 'inputmode="decimal"')}
          <select id="d-dial-unit-${i}" data-draft="dial.unit" data-i="${i}" aria-label="${t('edit.dialUnit')}">
            ${option('lb', 'lb', f.dial.unit)}${option('kg', 'kg', f.dial.unit)}
          </select>
          <label class="check draft-wide"><input id="d-plates-zero-${i}" type="checkbox" data-draft="plates.zero" data-i="${i}"${f.plates.zero ? ' checked' : ''}> ${t('edit.zero')}</label>
        </div>`
      : `<div class="draft-grid">
          <label for="d-unit-${i}">${t('edit.unit')}</label>
          ${input('unit', f.unit, 'placeholder="—"')}
          <span></span>
          <label for="d-step-${i}">${t('edit.step')}</label>
          ${input('step', f.step, 'inputmode="decimal"')}
          <span></span>
        </div>`;
  return `<div class="draft-field">
    <div class="draft-main">
      ${input('label', f.label, `placeholder="${t('edit.fieldPlaceholder')}" aria-label="${t('edit.fieldName')}"`)}
      <select id="d-kind-${i}" data-draft="kind" data-i="${i}" aria-label="${t('edit.kind')}">
        ${option('number', t('edit.kindNumber'), f.kind)}${option('stack', t('edit.kindStack'), f.kind)}
      </select>
      <button class="icon-btn" type="button" data-action="draft-remove" data-i="${i}" aria-label="${esc(t('edit.removeField', { label: f.label }))}"><span aria-hidden="true">×</span></button>
    </div>
    ${body}
  </div>`;
}

function viewEdit() {
  const d = ui.draft;
  const rows = d.fields.map(draftFieldRow).join('');
  const confirming = ui.confirm === `machine:${d.id}`;
  const del = d.id
    ? `<section class="danger-zone">
        <button class="btn danger wide" type="button" data-action="del-machine">${t(confirming ? 'edit.deleteConfirm' : 'edit.delete')}</button>
        <p class="field-note">${t('edit.deleteNote')}</p>
      </section>`
    : '';
  const typeOption = (value, label) =>
    `<label class="radio"><input type="radio" name="type" value="${value}"${d.type === value ? ' checked' : ''}> ${label}</label>`;
  return `${subBar(t(d.id ? 'edit.titleEdit' : 'edit.titleNew'))}
  <main>
    <form id="edit-form" class="edit" novalidate>
      <div class="form-row">
        <label for="d-name">${t('edit.name')}</label>
        <input id="d-name" type="text" data-draft="name" value="${esc(d.name)}" placeholder="${t('edit.namePlaceholder')}" autocomplete="off">
      </div>
      <fieldset class="form-row">
        <legend>${t('edit.type')}</legend>
        ${typeOption('strength', t('edit.typeStrength'))}
        ${typeOption('cardio', t('edit.typeCardio'))}
      </fieldset>
      <fieldset class="form-row">
        <legend>${t('edit.settings')}</legend>
        <p class="field-note">${t('edit.settingsNote')}</p>
        ${rows}
        <button class="btn" type="button" data-action="draft-add">${t('edit.addField')}</button>
      </fieldset>
      ${ui.draftError ? `<p class="error" role="alert">${esc(ui.draftError)}</p>` : ''}
      <button class="btn primary wide" type="submit">${t('edit.save')}</button>
    </form>
    ${del}
  </main>`;
}

function saveDraft() {
  const d = ui.draft;
  // A default name left as shown is saved as stored, so it keeps following
  // the interface language.
  const keep = (shown, stored) => (stored !== undefined && shown.trim() === nameFor(stored) ? stored : shown);
  const draft = {
    ...d,
    name: keep(d.name, d.origName),
    fields: d.fields.map((f) => ({ ...f, label: keep(f.label, f.origLabel) })),
  };
  const m = S.saveMachine(state, draft, Date.now());
  if (!m) {
    ui.draftError = t('edit.nameError');
    render();
    document.getElementById('d-name')?.focus();
    return;
  }
  ui.draftError = '';
  persist();
  back();
}

// ---------- settings ----------

function viewSettings() {
  const pref = state.prefs.lang;
  const system = LANGUAGES[resolveLanguage('system', navigator.languages ?? [navigator.language])];
  const option = (value, label, lang = '') =>
    `<label class="radio"${lang ? ` lang="${lang}"` : ''}><input type="radio" name="lang" value="${value}"${pref === value ? ' checked' : ''}> ${esc(label)}</label>`;
  return `${subBar(t('settings.title'))}
  <main>
    <fieldset class="form-row">
      <legend>${t('settings.language')}</legend>
      ${option('system', t('settings.system', { name: system }))}
      ${Object.entries(LANGUAGES).map(([code, name]) => option(code, name, code)).join('')}
    </fieldset>
    <p class="field-note">${t('settings.languageNote')}</p>
    ${syncSection()}
  </main>`;
}

function syncSection() {
  const c = syncConfig;
  const error = c ? c.error : ui.syncError;
  const errorHtml = error ? `<p class="error" role="alert">${t(`sync.err.${error}`)}</p>` : '';
  const head = `<h2 class="section-title" id="sync-label">${t('sync.title')}</h2>`;
  if (c) {
    const status = sync.busy ? t('sync.busy') : c.lastSyncAt ? t('sync.last', { when: formatWhen(c.lastSyncAt) }) : t('sync.never');
    const confirming = ui.confirm === 'sync-off';
    return `<section class="sync" aria-labelledby="sync-label">
      ${head}
      <p>${esc(t('sync.connected', { repo: c.repo }))}</p>
      <p class="field-note">${esc(status)}</p>
      ${errorHtml}
      <div class="controls">
        <button class="btn" type="button" data-action="sync-now"${sync.busy ? ' disabled' : ''}>${t('sync.now')}</button>
        <button class="btn${confirming ? ' danger' : ''}" type="button" data-action="sync-off">${t(confirming ? 'sync.disconnectConfirm' : 'sync.disconnect')}</button>
      </div>
      <p class="field-note">${t('sync.disconnectNote')}</p>
    </section>`;
  }
  return `<section class="sync" aria-labelledby="sync-label">
    ${head}
    <p class="field-note">${t('sync.intro')}</p>
    <ol class="steps">
      <li>${t('sync.step1')} <a href="https://github.com/new?name=myo-data&amp;visibility=private" target="_blank" rel="noopener">github.com/new</a></li>
      <li>${t('sync.step2')} <a href="https://github.com/settings/personal-access-tokens/new?name=Myo&amp;description=Myo+sync&amp;expires_in=366&amp;contents=write" target="_blank" rel="noopener">github.com/settings/personal-access-tokens</a></li>
      <li>${t('sync.step3')}</li>
    </ol>
    <form id="sync-form" class="edit sync-form" novalidate>
      <div class="form-row">
        <label for="sync-repo">${t('sync.repo')}</label>
        <input id="sync-repo" type="text" placeholder="gchrupala/myo-data" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(ui.syncRepo ?? '')}">
      </div>
      <div class="form-row">
        <label for="sync-token">${t('sync.token')}</label>
        <input id="sync-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(ui.syncToken ?? '')}">
      </div>
      ${errorHtml}
      <button class="btn primary wide" type="submit"${ui.syncConnecting ? ' disabled' : ''}>${t(ui.syncConnecting ? 'sync.connecting' : 'sync.connect')}</button>
    </form>
  </section>`;
}

// On the main screens when sync stopped working (not when merely offline).
function syncNotice() {
  return syncConfig?.error
    ? `<button class="notice notice-link" type="button" data-action="settings">${t('sync.homeError')}</button>`
    : '';
}

// ---------- live timers, signal, screen ----------

function renderLive() {
  const now = Date.now();
  const alert = S.checkRestAlert(state, now);
  if (alert) {
    persist();
    if (alert === 'alert') signal();
    render({ preserveFocus: true });
    return;
  }
  const finish = app.querySelector('[data-action="cardio-finish"]');
  if (finish) finish.disabled = !S.cardioCanFinish(state, current().machineId, now);
  const a = state.active;
  if (!a) return;
  const target = S.getMachine(state, a.machineId)?.restTarget ?? S.DEFAULT_REST;
  for (const el of app.querySelectorAll('[data-live]')) {
    const kind = el.dataset.live;
    if (kind === 'ring') {
      el.setAttribute('stroke-dasharray', dash(restRing(S.restElapsedSec(a, now), target)));
      continue;
    }
    let text = null;
    if (kind === 'rest' && a.phase === 'rest') text = restClock(S.restElapsedSec(a, now), target);
    else if (kind === 'cardio' && a.kind === 'cardio') text = formatDuration(S.cardioElapsedMs(a, now) / 1000);
    if (text !== null && el.textContent !== text) {
      el.textContent = text;
      el.closest('.plate-big')?.classList.toggle('is-long', text.length > 5);
    }
  }
}

let audioCtx = null;

// Browsers allow sound only after a tap, so this runs on every tap.
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function beep() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  for (const offset of [0, 0.28]) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.35, t + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.22);
  }
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (iPhone) or blocked.
  }
}

function signal() {
  if (state.prefs.sound) beep();
  vibrate([300, 150, 300]);
}

// Keep the screen on while an exercise screen is open.
let wakeLock = null;
let wakeLockPending = false;
async function updateWakeLock() {
  const want = current().view === 'exercise' && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && !wakeLockPending && 'wakeLock' in navigator) {
      wakeLockPending = true;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } else if (!want && wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      await lock.release();
    }
  } catch {
    wakeLock = null;
  } finally {
    wakeLockPending = false;
  }
}

// ---------- backup ----------

function exportData() {
  const data = JSON.stringify({ ...state, active: null, exportedAt: new Date().toISOString() }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `myo-${today()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = S.parseState(String(reader.result));
    ui.importCandidate = parsed;
    ui.importError = parsed ? '' : t('data.errorParse');
    render();
  };
  reader.onerror = () => {
    ui.importError = t('data.errorRead');
    render();
  };
  reader.readAsText(file);
}

// ---------- input ----------

function armConfirm(key) {
  ui.confirm = key;
  clearTimeout(ui.confirmTimer);
  ui.confirmTimer = setTimeout(() => {
    if (ui.confirm === key) {
      ui.confirm = null;
      render({ preserveFocus: true });
    }
  }, 4000);
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  unlockAudio();
  const now = Date.now();
  const machineId = current().machineId;
  switch (el.dataset.action) {
    case 'tab':
      switchTab(el.dataset.view);
      return;
    case 'open':
      go('exercise', el.dataset.id);
      return;
    case 'back':
      back();
      return;
    case 'add-machine':
      go('edit', null);
      return;
    case 'settings':
      go('settings');
      return;
    case 'edit':
      go('edit', el.dataset.id);
      return;
    case 'reps-step':
      S.stepReps(state, machineId, Number(el.dataset.dir));
      break;
    case 'save-set':
      S.saveSet(state, machineId, now);
      vibrate(15);
      break;
    case 'end':
      S.endExercise(state, now);
      persist();
      back();
      return;
    case 'rest-target':
      S.setRestTarget(state, machineId, Number(el.dataset.sec), now);
      break;
    case 'step':
      S.stepField(state, machineId, el.dataset.field, Number(el.dataset.dir));
      break;
    case 'bw-step':
      S.stepBodyWeight(state, today(), Number(el.dataset.dir), now);
      break;
    case 'plate':
      S.setStackPlate(state, machineId, el.dataset.field, Number(el.dataset.i));
      break;
    case 'dial':
      S.stepDial(state, machineId, el.dataset.field, Number(el.dataset.dir));
      break;
    case 'cardio-toggle':
      S.startExercise(state, machineId, now);
      S.toggleCardio(state, now);
      break;
    case 'cardio-finish':
      // Energy alone can be saved without starting the stopwatch.
      S.startExercise(state, machineId, now);
      S.endExercise(state, now);
      persist();
      back();
      return;
    case 'del-set':
      if (ui.confirm === `set:${el.dataset.id}`) {
        S.deleteSet(state, el.dataset.id, now);
        ui.confirm = null;
      } else {
        armConfirm(`set:${el.dataset.id}`);
      }
      break;
    case 'export':
      exportData();
      return;
    case 'import-confirm':
      state = ui.importCandidate;
      ui.importCandidate = null;
      fingerprints = S.machineFingerprints(state);
      applyLanguage();
      break;
    case 'sync-now':
      syncNow();
      return;
    case 'sync-off':
      if (ui.confirm === 'sync-off') {
        syncConfig = null;
        saveSyncConfig();
        ui.confirm = null;
      } else {
        armConfirm('sync-off');
      }
      render();
      return;
    case 'import-cancel':
      ui.importCandidate = null;
      render();
      return;
    case 'draft-add':
      ui.draft.fields.push(draftField());
      render();
      document.getElementById(`d-label-${ui.draft.fields.length - 1}`)?.focus();
      return;
    case 'draft-remove':
      ui.draft.fields.splice(Number(el.dataset.i), 1);
      render();
      return;
    case 'del-machine':
      if (ui.confirm === `machine:${ui.draft.id}`) {
        S.deleteMachine(state, ui.draft.id, now);
        persist();
        resetToHome();
      } else {
        armConfirm(`machine:${ui.draft.id}`);
        render();
      }
      return;
    default:
      return;
  }
  persist();
  render();
});

app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.field) {
    const machineId = current().machineId;
    S.setFieldValue(state, machineId, t.dataset.field, t.value);
    persist();
    const f = S.getMachine(state, machineId)?.fields.find((x) => x.id === t.dataset.field);
    t.value = valueText(f?.value);
  } else if (t.dataset.reps) {
    const machineId = current().machineId;
    S.setReps(state, machineId, t.value);
    persist();
    t.value = String(S.repsFor(state, machineId));
  } else if (t.dataset.bw) {
    S.setBodyWeight(state, today(), t.value, Date.now());
    persist();
    render();
  } else if (t.id === 'sound') {
    state.prefs.sound = t.checked;
    persist();
  } else if (t.name === 'lang') {
    state.prefs.lang = t.value;
    persist();
    applyLanguage();
    render();
    app.querySelector(`input[name="lang"][value="${t.value}"]`)?.focus();
  } else if (t.name === 'type' && ui.draft) {
    ui.draft.type = t.value;
  } else if (t.dataset.draft === 'kind' && ui.draft) {
    ui.draft.fields[Number(t.dataset.i)].kind = t.value;
    render();
    document.getElementById(t.id)?.focus();
  } else if (t.id === 'import-file' && t.files?.[0]) {
    readImport(t.files[0]);
  }
});

app.addEventListener('input', (e) => {
  const t = e.target;
  const prop = t.dataset.draft;
  if (!prop || !ui.draft) return;
  if (prop === 'name') {
    ui.draft.name = t.value;
    return;
  }
  const i = Number(t.dataset.i);
  const f = ui.draft.fields[i];
  const [group, key] = prop.split('.');
  const value = t.type === 'checkbox' ? t.checked : t.value;
  if (key) f[group][key] = value;
  else f[group] = value;
  if (group === 'plates') syncPlateUnits(f, key, i);
});

// The kg and lb labels of a plate describe the same weight: typing one fills
// in the other, rounded to 0.5 like the labels on machines.
const PLATE_PAIRS = { kgFirst: ['lbFirst', S.kgToLb], lbFirst: ['kgFirst', S.lbToKg], kgStep: ['lbStep', S.kgToLb], lbStep: ['kgStep', S.lbToKg] };
function syncPlateUnits(f, key, i) {
  const pair = PLATE_PAIRS[key];
  const n = S.parseNumber(f.plates[key]);
  if (!pair || n === null || n === undefined || n < 0) return;
  const [other, convert] = pair;
  f.plates[other] = formatNumber(convert(n));
  const input = document.getElementById(`d-plates-${other}-${i}`);
  if (input) input.value = f.plates[other];
}

// Enter closes the phone keyboard and saves the value.
app.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Enter' && t.tagName === 'INPUT' && (t.dataset.field || t.dataset.bw || t.dataset.reps)) t.blur();
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'edit-form') saveDraft();
  if (e.target.id === 'sync-form') {
    connectSync(document.getElementById('sync-repo')?.value, document.getElementById('sync-token')?.value);
  }
});

document.addEventListener('visibilitychange', () => {
  updateWakeLock();
  renderLive();
  if (document.visibilityState === 'visible') {
    // An installed app can stay open for days; look for a new version and
    // for data from other devices on return.
    swRegistration?.update().catch(() => {});
    if (syncConfig && Date.now() - (syncConfig.lastSyncAt ?? 0) > 60000) syncNow();
  } else if (sync.timer) {
    // Leaving the app: push pending changes now rather than never.
    syncNow();
  }
});

window.addEventListener('online', () => syncNow());

// ---------- start ----------

try {
  // The app sets the scroll position itself; a restored one after a reload
  // would open a screen halfway down.
  history.scrollRestoration = 'manual';
  history.replaceState({ depth: 1 }, '');
} catch {
  historyOK = false;
}
applyLanguage();
if (state.active && S.getMachine(state, state.active.machineId)) go('exercise', state.active.machineId);
else render();
setInterval(renderLive, 250);
syncNow();

// Offline support and updates. When a new version of sw.js takes over, reload
// once so the new files are used at once instead of on the next launch.
// Everything the user did is saved, including an exercise in progress.
let swRegistration = null;
try {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        swRegistration = reg;
      })
      .catch(() => {});
  }
} catch {
  // Service workers are unavailable in some embedded frames.
}
