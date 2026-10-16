// User interface: renders views from the state in store.js and handles input.

import * as S from './store.js';
import {
  dayKey,
  formatDay,
  formatDuration,
  formatField,
  formatNumber,
  plural,
  setHeadline,
  summarizeSets,
} from './format.js';

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

function persist() {
  if (!S.saveState(storage, state)) saveFailed = true;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const current = () => nav[nav.length - 1];
const today = () => dayKey(Date.now());
const valueText = (v) => (v === null || v === undefined ? '' : formatNumber(v));
// "Dzisiaj" -> "dzisiaj" inside a sentence.
const inSentence = (text) => text.charAt(0).toLowerCase() + text.slice(1);
// A full ring is drawn without dashes, which would leave a seam at the top.
const dash = (progress) => (progress >= 100 ? 'none' : `${progress.toFixed(2)} 100`);

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

function topBar(tab) {
  const tabButton = (view, label) =>
    `<button class="tab" type="button" data-action="tab" data-view="${view}"${tab === view ? ' aria-current="page"' : ''}>${label}</button>`;
  return `<header class="bar">
    <span class="brand">myo</span>
    <nav class="tabs" aria-label="Widok">${tabButton('home', 'Maszyny')}${tabButton('history', 'Historia')}</nav>
  </header>`;
}

function subBar(title, extra = '') {
  return `<header class="bar">
    <button class="icon-btn" type="button" data-action="back" aria-label="Wróć"><span aria-hidden="true">‹</span></button>
    <h1 class="bar-title">${esc(title)}</h1>
    ${extra}
  </header>`;
}

function storageNotice() {
  return saveFailed
    ? '<p class="notice">Ta przeglądarka nie zapisuje danych (na przykład w trybie prywatnym). Serie znikną po zamknięciu strony.</p>'
    : '';
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
    status = `<span data-live="cardio">${formatDuration(S.cardioElapsedMs(a, now) / 1000)}</span>${a.runningSince ? '' : ' · pauza'}`;
  } else if (a.phase === 'rest') {
    status = `odpoczynek <span data-live="rest">${formatDuration(S.restElapsedSec(a, now))}</span>`;
  } else if (a.phase === 'set') {
    status = `seria · ${a.reps} powt.`;
  } else {
    status = 'czeka na serię';
  }
  return `<button class="banner" type="button" data-action="open" data-id="${esc(m.id)}">
    <span class="banner-label">Trwa</span>
    <span class="banner-name">${esc(m.name)}</span>
    <span class="banner-status">${status}</span>
    <span class="chevron" aria-hidden="true">›</span>
  </button>`;
}

function stepper({ id, label, value, placeholder = '—', action, attrs = '', disabled = false }) {
  const dis = disabled ? ' disabled' : '';
  return `<div class="stepper">
    <button type="button" data-action="${action}" data-dir="-1" ${attrs} aria-label="${esc(label)}: mniej"${dis}>−</button>
    <input id="${esc(id)}" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" ${attrs} value="${esc(value)}" placeholder="${esc(placeholder)}">
    <button type="button" data-action="${action}" data-dir="1" ${attrs} aria-label="${esc(label)}: więcej"${dis}>+</button>
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
    note = `Zapisano na dzisiaj. Od ${inSentence(formatDay(earlier.day))}: ${sign}${formatNumber(Math.abs(diff))} kg.`;
  } else if (kg !== null) {
    note = 'Zapisano na dzisiaj.';
  } else if (latest) {
    note = `Ostatnio ${formatNumber(latest.kg)} kg (${inSentence(formatDay(latest.day))}). Wpisz dzisiejszą albo użyj − i +.`;
  } else {
    note = 'Wpisz, a zapisze się z dzisiejszą datą.';
  }
  return `<section class="body-weight" aria-labelledby="bw-label">
    <div class="field">
      <label id="bw-label" for="bw-input">Twoja waga <span class="unit">kg</span></label>
      ${stepper({
        id: 'bw-input',
        label: 'Waga',
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
        ? `Ostatnio ${inSentence(formatDay(last.day, now))} · ${summarizeSets(last.sets)}`
        : 'Jeszcze bez zapisanych serii';
      return `<li><button class="machine" type="button" data-action="open" data-id="${esc(m.id)}">
        <span class="machine-text">
          <span class="machine-name">${esc(m.name)}</span>
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
    <h2 class="section-title">Maszyny</h2>
    <ul class="machines">${rows}</ul>
    <button class="btn wide" type="button" data-action="add-machine">Dodaj maszynę</button>
  </main>`;
}

// ---------- exercise ----------

function settingsSection(m) {
  if (!m.fields.length) {
    return '<section class="settings"><p class="field-note">Ta maszyna nie ma ustawień. Dodasz je w edycji.</p></section>';
  }
  const rows = m.fields.map((f) => (f.kind === 'stack' ? stackSetting(f) : numberSetting(f))).join('');
  return `<section class="settings" aria-label="Ustawienia maszyny">${rows}</section>`;
}

function numberSetting(f) {
  return `<div class="field">
    <label for="f-${esc(f.id)}">${esc(f.label)}${f.unit ? ` <span class="unit">${esc(f.unit)}</span>` : ''}</label>
    ${stepper({ id: `f-${f.id}`, label: f.label, value: valueText(f.value), action: 'step', attrs: `data-field="${esc(f.id)}"` })}
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
  const hint = snap.value === null ? '<p class="field-note">Dotknij płytki, w którą wkładasz bolec.</p>' : '';
  const rows = Array.from({ length: f.plates.count }, (_, i) => {
    const w = S.plateWeights(f, i);
    const pinned = f.value === i;
    const lifted = f.value !== null && i <= f.value;
    return `<button class="stack-row${lifted ? ' is-lifted' : ''}" type="button" data-action="plate" data-field="${id}" data-i="${i}" aria-pressed="${pinned}" aria-label="${formatNumber(w.lb)} lb, ${formatNumber(w.kg)} kg">
      <span class="stack-lb">${formatNumber(w.lb)}</span>
      <span class="stack-hole${pinned ? ' is-pin' : ''}"></span>
      <span class="stack-kg">${formatNumber(w.kg)}</span>
    </button>`;
  }).join('');
  const last = f.dial ? f.dial.count - 1 : 0;
  const dial = f.dial
    ? `<div class="dial" role="group" aria-label="Tarcza, ${esc(f.dial.unit)}">
        <span class="dial-knob">${KNOB_ARROWS}<span class="dial-window">${formatNumber(S.dialValue(f))}</span></span>
        <span class="dial-buttons">
          <button type="button" data-action="dial" data-field="${id}" data-dir="-1" aria-label="Tarcza: mniej"${f.dialPos <= 0 ? ' disabled' : ''}>−</button>
          <button type="button" data-action="dial" data-field="${id}" data-dir="1" aria-label="Tarcza: więcej"${f.dialPos >= last ? ' disabled' : ''}>+</button>
        </span>
        <span class="dial-unit">tarcza, ${esc(f.dial.unit)}</span>
      </div>`
    : '';
  return `<div class="stack-field">
    <div class="stack-head">
      <span class="stack-label" id="lbl-${id}">${esc(f.label)}</span>
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

function strengthControls(m, a, now, setsToday) {
  const phase = a ? a.phase : 'ready';
  const nextSet = setsToday.length + 1;
  let big;
  let sub;
  let hint;
  let progress = 0;
  let cls = `plate is-${phase}`;
  if (phase === 'set') {
    big = String(a.reps);
    sub = plural(a.reps, 'powtórzenie', 'powtórzenia', 'powtórzeń');
    hint = `Seria ${nextSet} · <span data-live="set">${formatDuration((now - a.setStartedAt) / 1000)}</span>`;
    progress = 100;
  } else if (phase === 'rest') {
    const elapsed = S.restElapsedSec(a, now);
    const done = elapsed >= m.restTarget;
    if (done) cls += ' is-done';
    big = formatDuration(elapsed);
    sub = 'odpoczynek';
    hint = done
      ? `Minął cel ${formatDuration(m.restTarget)}. Czas na serię ${nextSet}.`
      : `Cel ${formatDuration(m.restTarget)}. Dotknij, gdy zaczniesz serię ${nextSet}.`;
    progress = Math.min(100, (elapsed / m.restTarget) * 100);
  } else {
    big = '0';
    sub = 'powtórzeń';
    hint = 'Dotykaj koła przy każdym powtórzeniu.';
  }
  const bigHtml = phase === 'rest' ? `<span data-live="rest">${big}</span>` : big;
  const presets = REST_PRESETS.map(
    (s) =>
      `<button class="seg" type="button" data-action="rest-target" data-sec="${s}" aria-pressed="${m.restTarget === s}">${formatDuration(s)}</button>`,
  ).join('');
  return `<section class="plate-zone" aria-label="Licznik powtórzeń">
    <button class="${cls}" type="button" data-action="rep">
      ${ring(progress, phase === 'rest')}
      <span class="plate-face">
        <span class="sr">Dodaj powtórzenie. </span>
        <span class="${bigClass(big)}">${bigHtml}</span>
        <span class="plate-sub">${sub}</span>
      </span>
    </button>
    <p class="hint">${hint}</p>
    <div class="controls">
      <button class="btn" type="button" data-action="unrep" aria-label="Odejmij powtórzenie"${phase === 'set' ? '' : ' disabled'}>−1</button>
      <button class="btn primary grow" type="button" data-action="finish-set"${phase === 'set' && a.reps > 0 ? '' : ' disabled'}>Zakończ serię</button>
    </div>
  </section>
  <section class="rest-settings" aria-labelledby="rest-label">
    <h2 class="section-title" id="rest-label">Cel odpoczynku</h2>
    <div class="segs">${presets}</div>
    <label class="check"><input id="sound" type="checkbox"${state.prefs.sound ? ' checked' : ''}> Dźwięk po upływie celu</label>
  </section>`;
}

function cardioControls(m, a, now) {
  const ms = a ? S.cardioElapsedMs(a, now) : 0;
  const running = Boolean(a?.runningSince);
  const started = ms > 0 || running;
  const cls = `plate ${running ? 'is-set' : started ? 'is-paused' : 'is-ready'}`;
  const sub = running ? 'trwa' : started ? 'pauza' : 'stoper';
  const hint = running ? 'Dotknij, aby zatrzymać.' : started ? 'Dotknij, aby wznowić.' : 'Dotknij, aby włączyć stoper.';
  const big = formatDuration(ms / 1000);
  return `<section class="plate-zone" aria-label="Stoper">
    <button class="${cls}" type="button" data-action="cardio-toggle">
      ${ring(started ? 100 : 0, false)}
      <span class="plate-face">
        <span class="sr">${running ? 'Zatrzymaj stoper' : 'Włącz stoper'}. </span>
        <span class="${bigClass(big)}"><span data-live="cardio">${big}</span></span>
        <span class="plate-sub">${sub}</span>
      </span>
    </button>
    <p class="hint">${hint}</p>
    <div class="controls">
      <button class="btn primary grow" type="button" data-action="cardio-finish"${S.cardioCanFinish(state, m.id, now) ? '' : ' disabled'}>Zapisz i zakończ</button>
    </div>
  </section>`;
}

// Sets with the rests between them.
function setRows(sets, deletable) {
  return sets
    .map((s, i) => {
      const rest =
        i > 0 && s.restBeforeSec !== null && s.restBeforeSec !== undefined
          ? `<li class="rest-row"><span>odpoczynek ${formatDuration(s.restBeforeSec)}</span></li>`
          : '';
      const { main, meta } = setHeadline(s);
      const confirming = ui.confirm === `set:${s.id}`;
      const del = deletable
        ? `<button class="set-del${confirming ? ' is-confirm' : ''}" type="button" data-action="del-set" data-id="${esc(s.id)}">${confirming ? 'Usunąć?' : 'Usuń'}</button>`
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
    a && m.type !== 'cardio' ? '<button class="btn wide" type="button" data-action="end">Zakończ ćwiczenie</button>' : '';
  return `${subBar(m.name, `<button class="btn small" type="button" data-action="edit" data-id="${esc(m.id)}">Edytuj</button>`)}
  <main class="exercise">
    ${banner()}
    ${storageNotice()}
    ${settingsSection(m)}
    ${controls}
    ${setLog(setsToday.length ? `Dzisiaj · ${summarizeSets(setsToday)}` : 'Dzisiaj', setsToday, true)}
    ${prev ? setLog(`Poprzednio · ${formatDay(prev.day, now)}`, prev.sets, false) : ''}
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
  if (bodyWeight !== null) parts.push(`waga ${formatNumber(bodyWeight)} kg`);
  if (strength.length) {
    const reps = strength.reduce((n, s) => n + s.reps, 0);
    parts.push(`${strength.length} ${plural(strength.length, 'seria', 'serie', 'serii')}, ${reps} powt.`);
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
    const n = ui.importCandidate.machines.length;
    const k = ui.importCandidate.sets.length;
    confirm = `<div class="notice" role="alert">
      <p>Plik zawiera ${n} ${plural(n, 'maszynę', 'maszyny', 'maszyn')} i ${k} ${plural(k, 'serię', 'serie', 'serii')}. Obecne dane zostaną zastąpione.</p>
      <div class="controls">
        <button class="btn danger" type="button" data-action="import-confirm">Zastąp dane</button>
        <button class="btn" type="button" data-action="import-cancel">Anuluj</button>
      </div>
    </div>`;
  }
  const error = ui.importError ? `<p class="error" role="alert">${esc(ui.importError)}</p>` : '';
  return `<section class="data" aria-labelledby="data-label">
    <h2 class="section-title" id="data-label">Kopia danych</h2>
    <p class="field-note">Dane są zapisane tylko w tej przeglądarce, na tym telefonie. Pobierz kopię przed zmianą telefonu albo wyczyszczeniem danych przeglądarki.</p>
    <div class="controls">
      <button class="btn" type="button" data-action="export">Pobierz kopię</button>
      <label class="btn" for="import-file">Wczytaj kopię</label>
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
          <h3 class="block-title">${esc(S.getMachine(state, b.machineId)?.name ?? b.machineName)}</h3>
          <ol class="sets">${setRows(b.sets, true)}</ol>
        </article>`,
          )
          .join('')}
      </section>`,
        )
        .join('')
    : `<div class="empty">
        <p class="empty-title">Historia jest pusta</p>
        <p>Wybierz maszynę w zakładce Maszyny i dotykaj dużego koła przy każdym powtórzeniu. Po „Zakończ serię” seria trafi tutaj z datą, ustawieniami i czasem odpoczynku.</p>
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
    },
    dial: d
      ? { count: String(d.count), step: formatNumber(d.step), unit: d.unit }
      : { count: '0', step: formatNumber(S.DEFAULT_DIAL.step), unit: S.DEFAULT_DIAL.unit },
  };
}

function draftFor(machineId) {
  const m = machineId && S.getMachine(state, machineId);
  if (m) return { id: m.id, name: m.name, type: m.type, fields: m.fields.map(draftField) };
  return { id: null, name: '', type: 'strength', fields: [draftField({ kind: 'stack', label: 'Ciężar' })] };
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
          <label for="d-plates-count-${i}">Płytek</label>
          ${input('plates.count', f.plates.count, 'inputmode="numeric"')}
          <span></span>
          <span>Pierwsza płytka</span>
          ${suffix(num('plates.kgFirst', f.plates.kgFirst, 'Pierwsza płytka w kg'), 'kg')}
          ${suffix(num('plates.lbFirst', f.plates.lbFirst, 'Pierwsza płytka w funtach'), 'lb')}
          <span>Każda następna</span>
          ${suffix(num('plates.kgStep', f.plates.kgStep, 'Każda następna płytka w kg'), '+kg')}
          ${suffix(num('plates.lbStep', f.plates.lbStep, 'Każda następna płytka w funtach'), '+lb')}
          <label for="d-dial-count-${i}">Tarcza: pozycji</label>
          ${input('dial.count', f.dial.count, 'inputmode="numeric"')}
          <span class="draft-hint">0 = bez tarczy</span>
          <label for="d-dial-step-${i}">Tarcza: co</label>
          ${input('dial.step', f.dial.step, 'inputmode="decimal"')}
          <select id="d-dial-unit-${i}" data-draft="dial.unit" data-i="${i}" aria-label="Jednostka tarczy">
            ${option('lb', 'lb', f.dial.unit)}${option('kg', 'kg', f.dial.unit)}
          </select>
        </div>`
      : `<div class="draft-grid">
          <label for="d-unit-${i}">Jednostka</label>
          ${input('unit', f.unit, 'placeholder="—"')}
          <span></span>
          <label for="d-step-${i}">Krok − i +</label>
          ${input('step', f.step, 'inputmode="decimal"')}
          <span></span>
        </div>`;
  return `<div class="draft-field">
    <div class="draft-main">
      ${input('label', f.label, 'placeholder="np. Oparcie" aria-label="Nazwa ustawienia"')}
      <select id="d-kind-${i}" data-draft="kind" data-i="${i}" aria-label="Rodzaj ustawienia">
        ${option('number', 'Liczba', f.kind)}${option('stack', 'Stos ciężarków', f.kind)}
      </select>
      <button class="icon-btn" type="button" data-action="draft-remove" data-i="${i}" aria-label="Usuń ustawienie ${esc(f.label)}"><span aria-hidden="true">×</span></button>
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
        <button class="btn danger wide" type="button" data-action="del-machine">${confirming ? 'Na pewno usunąć?' : 'Usuń maszynę'}</button>
        <p class="field-note">Zapisane serie zostaną w historii.</p>
      </section>`
    : '';
  const typeOption = (value, label) =>
    `<label class="radio"><input type="radio" name="type" value="${value}"${d.type === value ? ' checked' : ''}> ${label}</label>`;
  return `${subBar(d.id ? 'Edytuj maszynę' : 'Nowa maszyna')}
  <main>
    <form id="edit-form" class="edit" novalidate>
      <div class="form-row">
        <label for="d-name">Nazwa</label>
        <input id="d-name" type="text" data-draft="name" value="${esc(d.name)}" placeholder="np. Prasa nożna" autocomplete="off">
      </div>
      <fieldset class="form-row">
        <legend>Rodzaj</legend>
        ${typeOption('strength', 'Siłowa: serie i powtórzenia')}
        ${typeOption('cardio', 'Cardio: stoper')}
      </fieldset>
      <fieldset class="form-row">
        <legend>Ustawienia</legend>
        <p class="field-note">Na przykład ciężar, wysokość siedziska, pozycja oparcia. „Stos ciężarków” to płytki z bolcem i tarczą do małych dodatków, opisane tak jak na maszynie.</p>
        ${rows}
        <button class="btn" type="button" data-action="draft-add">Dodaj ustawienie</button>
      </fieldset>
      ${ui.draftError ? `<p class="error" role="alert">${esc(ui.draftError)}</p>` : ''}
      <button class="btn primary wide" type="submit">Zapisz</button>
    </form>
    ${del}
  </main>`;
}

function saveDraft() {
  const m = S.saveMachine(state, ui.draft, Date.now());
  if (!m) {
    ui.draftError = 'Podaj nazwę maszyny.';
    render();
    document.getElementById('d-name')?.focus();
    return;
  }
  ui.draftError = '';
  persist();
  back();
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
  for (const el of app.querySelectorAll('[data-live]')) {
    const kind = el.dataset.live;
    if (kind === 'ring') {
      const target = S.getMachine(state, a.machineId)?.restTarget ?? S.DEFAULT_REST;
      el.setAttribute('stroke-dasharray', dash(Math.min(100, (S.restElapsedSec(a, now) / target) * 100)));
      continue;
    }
    let text = null;
    if (kind === 'rest' && a.phase === 'rest') text = formatDuration(S.restElapsedSec(a, now));
    else if (kind === 'set' && a.phase === 'set') text = formatDuration((now - a.setStartedAt) / 1000);
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
    ui.importError = parsed ? '' : 'Nie udało się wczytać pliku. To nie jest kopia danych Myo.';
    render();
  };
  reader.onerror = () => {
    ui.importError = 'Nie udało się odczytać pliku.';
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
    case 'edit':
      go('edit', el.dataset.id);
      return;
    case 'rep':
      S.startExercise(state, machineId, now);
      S.addRep(state, now);
      vibrate(15);
      break;
    case 'unrep':
      S.removeRep(state);
      break;
    case 'finish-set':
      S.finishSet(state, now);
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
      S.stepBodyWeight(state, today(), Number(el.dataset.dir));
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
        S.deleteSet(state, el.dataset.id);
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
      break;
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
  } else if (t.dataset.bw) {
    S.setBodyWeight(state, today(), t.value);
    persist();
    render();
  } else if (t.id === 'sound') {
    state.prefs.sound = t.checked;
    persist();
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
  const f = ui.draft.fields[Number(t.dataset.i)];
  const [group, key] = prop.split('.');
  if (key) f[group][key] = t.value;
  else f[group] = t.value;
});

// Enter closes the phone keyboard and saves the value.
app.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Enter' && t.tagName === 'INPUT' && (t.dataset.field || t.dataset.bw)) t.blur();
});

app.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'edit-form') saveDraft();
});

document.addEventListener('visibilitychange', () => {
  updateWakeLock();
  renderLive();
  // An installed app can stay open for days; look for a new version on return.
  if (document.visibilityState === 'visible') swRegistration?.update().catch(() => {});
});

// ---------- start ----------

try {
  // The app sets the scroll position itself; a restored one after a reload
  // would open a screen halfway down.
  history.scrollRestoration = 'manual';
  history.replaceState({ depth: 1 }, '');
} catch {
  historyOK = false;
}
if (state.active && S.getMachine(state, state.active.machineId)) go('exercise', state.active.machineId);
else render();
setInterval(renderLive, 250);

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
