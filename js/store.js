// Data model and state changes. Plain functions over a plain object, with
// the current time passed in, so everything here runs and tests without a
// browser.
//
// state = {
//   machines: [{ id, name, type: 'strength' | 'cardio', restTarget, fields }],
//   sets:     [{ id, machineId, machineName, type, startedAt, endedAt,
//                reps, durationSec, restBeforeSec, settings }],
//   bodyWeights: [{ day: 'YYYY-MM-DD', kg }], at most one per day,
//   active:   the exercise in progress, or null,
//   prefs:    { sound },
// }
// A field is one machine setting: { id, label, unit, step, value }.
// Each saved set keeps a copy of the settings it was done with.

import { dayKey } from './format.js';

export const STORAGE_KEY = 'myo:v1';
export const SCHEMA = 1;
export const DEFAULT_REST = 90;

let seq = 0;
export function newId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function field(label, unit, step) {
  return { id: newId('f'), label, unit, step, value: null };
}
const weight = () => field('Ciężar', 'kg', 5);
const seat = () => field('Siedzisko', '', 1);

function machine(name, type, fields) {
  return { id: newId('m'), name, type, restTarget: DEFAULT_REST, fields };
}

export function defaultMachines() {
  return [
    machine('Podciąganie', 'strength', [weight()]),
    machine('Pompki na poręczach', 'strength', [weight()]),
    machine('Brzuch', 'strength', [weight(), seat()]),
    machine('Wyciskanie nad głowę', 'strength', [weight(), seat()]),
    machine('Wiosłowanie', 'strength', [weight(), seat()]),
    machine('Wyciskanie na klatkę', 'strength', [weight(), seat()]),
    machine('Pośladki', 'strength', [weight()]),
    machine('Taśma', 'cardio', [field('Prędkość', 'km/h', 0.5), field('Nachylenie', '%', 1)]),
  ];
}

export function createState() {
  return { schema: SCHEMA, machines: defaultMachines(), sets: [], bodyWeights: [], active: null, prefs: { sound: true } };
}

// ---------- persistence ----------

const positive = (v) => (Number.isFinite(v) && v > 0 ? v : null);

// Accepts a JSON string or an object. Returns a clean state, or null when the
// input is not Myo data.
export function parseState(input) {
  let data;
  try {
    data = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.machines) || !Array.isArray(data.sets)) {
    return null;
  }
  const machines = data.machines
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type === 'cardio' ? 'cardio' : 'strength',
      restTarget: positive(m.restTarget) ?? DEFAULT_REST,
      fields: (Array.isArray(m.fields) ? m.fields : [])
        .filter((f) => f && typeof f.label === 'string')
        .map((f) => ({
          id: typeof f.id === 'string' ? f.id : newId('f'),
          label: f.label,
          unit: typeof f.unit === 'string' ? f.unit : '',
          step: positive(f.step) ?? 1,
          value: Number.isFinite(f.value) ? f.value : null,
        })),
    }));
  const sets = data.sets.filter(
    (s) => s && typeof s.id === 'string' && typeof s.machineId === 'string' && Number.isFinite(s.endedAt),
  );
  const bodyWeights = (Array.isArray(data.bodyWeights) ? data.bodyWeights : []).filter(
    (w) => w && /^\d{4}-\d{2}-\d{2}$/.test(w.day) && positive(w.kg),
  );
  const ids = new Set(machines.map((m) => m.id));
  const active = data.active && ids.has(data.active.machineId) ? data.active : null;
  return { schema: SCHEMA, machines, sets, bodyWeights, active, prefs: { sound: data.prefs?.sound !== false } };
}

export function loadState(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const parsed = raw ? parseState(raw) : null;
    if (parsed) return parsed;
  } catch {
    // Storage can be blocked (private mode, sandboxed frame): start fresh.
  }
  return createState();
}

export function saveState(storage, state) {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---------- machines and settings ----------

export function getMachine(state, id) {
  return state.machines.find((m) => m.id === id) || null;
}

function getField(state, machineId, fieldId) {
  return getMachine(state, machineId)?.fields.find((f) => f.id === fieldId) || null;
}

// "42,5" -> 42.5, "" -> null, "abc" -> undefined (invalid).
export function parseNumber(input) {
  const s = String(input ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const round = (n) => Math.round(n * 1000) / 1000;

// Returns false and keeps the old value when the input is not a number.
export function setFieldValue(state, machineId, fieldId, input) {
  const f = getField(state, machineId, fieldId);
  const v = parseNumber(input);
  if (!f || v === undefined) return false;
  f.value = v === null ? null : round(v);
  return true;
}

export function stepField(state, machineId, fieldId, direction) {
  const f = getField(state, machineId, fieldId);
  if (!f) return;
  f.value = Math.max(0, round((f.value ?? 0) + direction * f.step));
}

export function setRestTarget(state, machineId, seconds, now) {
  const m = getMachine(state, machineId);
  if (!m || !positive(seconds)) return;
  m.restTarget = seconds;
  const a = state.active;
  if (a && a.machineId === machineId && a.kind === 'strength' && a.phase === 'rest') {
    // Do not sound the signal for a target that has already passed.
    a.alerted = (now - a.restStartedAt) / 1000 >= seconds;
  }
}

// Adds a machine or updates an existing one from an edit form draft:
// { id | null, name, type, fields: [{ id | null, label, unit, step }] }.
// Existing fields keep their current values.
export function saveMachine(state, draft, now) {
  const name = String(draft.name || '').trim();
  if (!name) return null;
  const type = draft.type === 'cardio' ? 'cardio' : 'strength';
  const existing = draft.id ? getMachine(state, draft.id) : null;
  const fields = (draft.fields || [])
    .filter((f) => String(f.label || '').trim())
    .map((f) => {
      const prev = existing?.fields.find((x) => x.id === f.id);
      return {
        id: prev?.id ?? newId('f'),
        label: String(f.label).trim(),
        unit: String(f.unit || '').trim(),
        step: positive(parseNumber(f.step)) ?? 1,
        value: prev?.value ?? null,
      };
    });
  if (existing) {
    if (existing.type !== type && state.active?.machineId === existing.id) endExercise(state, now);
    Object.assign(existing, { name, type, fields });
    return existing;
  }
  const m = { id: newId('m'), name, type, restTarget: DEFAULT_REST, fields };
  state.machines.push(m);
  return m;
}

// Saved sets stay in the history.
export function deleteMachine(state, machineId, now) {
  if (state.active?.machineId === machineId) endExercise(state, now);
  state.machines = state.machines.filter((m) => m.id !== machineId);
}

export function deleteSet(state, setId) {
  state.sets = state.sets.filter((s) => s.id !== setId);
}

// ---------- body weight ----------

// An empty input removes the entry for that day. Returns false when the
// input is not a positive number.
export function setBodyWeight(state, day, input) {
  const kg = parseNumber(input);
  if (kg === undefined || (kg !== null && kg <= 0)) return false;
  state.bodyWeights = state.bodyWeights.filter((w) => w.day !== day);
  if (kg !== null) state.bodyWeights.push({ day, kg: round(kg) });
  return true;
}

export function bodyWeightOn(state, day) {
  return state.bodyWeights.find((w) => w.day === day)?.kg ?? null;
}

// The latest entry on or before the given day.
export function latestBodyWeight(state, day) {
  let best = null;
  for (const w of state.bodyWeights) {
    if (w.day <= day && (!best || w.day > best.day)) best = w;
  }
  return best;
}

// Steps from today's entry, or from the latest earlier one.
export function stepBodyWeight(state, day, direction, step = 0.1) {
  const base = latestBodyWeight(state, day)?.kg;
  if (base === undefined) return;
  setBodyWeight(state, day, String(Math.max(step, round(base + direction * step))));
}

// ---------- the exercise in progress ----------
//
// Strength phases: 'ready' (no set yet), 'set' (counting reps),
// 'rest' (timer running since the last set ended).
// The first rep tap of a set ends the rest; its length is saved with the set.

function snapshot(m) {
  return m.fields.map((f) => ({ label: f.label, unit: f.unit, value: f.value }));
}

export function startExercise(state, machineId, now) {
  if (state.active?.machineId === machineId) return state.active;
  if (state.active) endExercise(state, now);
  const m = getMachine(state, machineId);
  if (!m) return null;
  state.active =
    m.type === 'cardio'
      ? { machineId, kind: 'cardio', startedAt: null, elapsedMs: 0, runningSince: null }
      : { machineId, kind: 'strength', phase: 'ready', reps: 0, setStartedAt: null, restStartedAt: null, alerted: false };
  return state.active;
}

const strengthActive = (state) => (state.active?.kind === 'strength' ? state.active : null);
const cardioActive = (state) => (state.active?.kind === 'cardio' ? state.active : null);

export function addRep(state, now) {
  const a = strengthActive(state);
  if (!a) return;
  if (a.phase !== 'set') {
    a.phase = 'set';
    a.setStartedAt = now;
    a.reps = 0;
  }
  a.reps += 1;
}

// Taking away the only rep undoes the start of the set, so a stray tap
// during rest does not stop the rest timer.
export function removeRep(state) {
  const a = strengthActive(state);
  if (!a || a.phase !== 'set') return;
  a.reps = Math.max(0, a.reps - 1);
  if (a.reps === 0) {
    a.phase = a.restStartedAt ? 'rest' : 'ready';
    a.setStartedAt = null;
  }
}

export function finishSet(state, now) {
  const a = strengthActive(state);
  if (!a || a.phase !== 'set' || a.reps < 1) return null;
  const m = getMachine(state, a.machineId);
  if (!m) return null;
  const set = {
    id: newId('s'),
    machineId: m.id,
    machineName: m.name,
    type: 'strength',
    startedAt: a.setStartedAt,
    endedAt: now,
    reps: a.reps,
    durationSec: null,
    restBeforeSec: a.restStartedAt ? Math.round((a.setStartedAt - a.restStartedAt) / 1000) : null,
    settings: snapshot(m),
  };
  state.sets.push(set);
  Object.assign(a, { phase: 'rest', reps: 0, setStartedAt: null, restStartedAt: now, alerted: false });
  return set;
}

export function restElapsedSec(active, now) {
  return active?.phase === 'rest' ? (now - active.restStartedAt) / 1000 : 0;
}

// Call on every timer tick. Returns 'alert' once when the rest reaches the
// target, 'late' when the target passed long ago (page was in the
// background), and null otherwise.
export function checkRestAlert(state, now) {
  const a = strengthActive(state);
  if (!a || a.phase !== 'rest' || a.alerted) return null;
  const target = getMachine(state, a.machineId)?.restTarget ?? DEFAULT_REST;
  const elapsed = restElapsedSec(a, now);
  if (elapsed < target) return null;
  a.alerted = true;
  return elapsed - target <= 5 ? 'alert' : 'late';
}

export function cardioElapsedMs(active, now) {
  if (!active || active.kind !== 'cardio') return 0;
  return active.elapsedMs + (active.runningSince ? now - active.runningSince : 0);
}

// Start, pause or resume the cardio stopwatch.
export function toggleCardio(state, now) {
  const a = cardioActive(state);
  if (!a) return;
  if (a.runningSince) {
    a.elapsedMs += now - a.runningSince;
    a.runningSince = null;
  } else {
    if (!a.startedAt) a.startedAt = now;
    a.runningSince = now;
  }
}

export function finishCardio(state, now) {
  const a = cardioActive(state);
  if (!a) return null;
  const ms = cardioElapsedMs(a, now);
  const m = getMachine(state, a.machineId);
  if (ms < 1000 || !m) return null;
  const set = {
    id: newId('s'),
    machineId: m.id,
    machineName: m.name,
    type: 'cardio',
    startedAt: a.startedAt,
    endedAt: now,
    reps: null,
    durationSec: Math.round(ms / 1000),
    restBeforeSec: null,
    settings: snapshot(m),
  };
  state.sets.push(set);
  Object.assign(a, { startedAt: null, elapsedMs: 0, runningSince: null });
  return set;
}

// Ends the exercise. Unsaved work (reps counted, stopwatch time) is saved.
export function endExercise(state, now) {
  const a = state.active;
  if (!a) return;
  if (a.kind === 'strength') finishSet(state, now);
  else finishCardio(state, now);
  state.active = null;
}

// ---------- history queries ----------

const byTime = (a, b) => a.endedAt - b.endedAt;

export function setsOn(state, machineId, day) {
  return state.sets.filter((s) => s.machineId === machineId && dayKey(s.endedAt) === day).sort(byTime);
}

// The most recent day with sets on this machine, optionally before a given day.
export function lastSession(state, machineId, beforeDay = null) {
  let best = null;
  for (const s of state.sets) {
    if (s.machineId !== machineId) continue;
    const d = dayKey(s.endedAt);
    if (beforeDay && d >= beforeDay) continue;
    if (!best || d > best) best = d;
  }
  return best ? { day: best, sets: setsOn(state, machineId, best) } : null;
}

// Days newest first; within a day, consecutive sets on one machine form a
// block. Days with only a body weight entry are included.
export function historyByDay(state) {
  const days = new Map();
  for (const w of state.bodyWeights) days.set(w.day, []);
  for (const s of [...state.sets].sort(byTime)) {
    const d = dayKey(s.endedAt);
    if (!days.has(d)) days.set(d, []);
    const blocks = days.get(d);
    const last = blocks[blocks.length - 1];
    if (last && last.machineId === s.machineId) last.sets.push(s);
    else blocks.push({ machineId: s.machineId, machineName: s.machineName, sets: [s] });
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, blocks]) => ({ day, blocks, bodyWeight: bodyWeightOn(state, day) }));
}
