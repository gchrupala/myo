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
// A field is one machine setting, of one of two kinds:
//   number: { id, kind: 'number', label, unit, step, value }
//   stack:  { id, kind: 'stack', label, value, dialPos, plates, dial }
//           A selectorized weight stack. value is the index of the pinned
//           plate (0 = top) or null; plates describes the kg and lb labels
//           printed beside the plates; dial is the add-on weight knob
//           ({ count, step, unit }, value = position * step) or null.
// Each saved set keeps a copy of the settings it was done with
// (see fieldSnapshot).

import { dayKey } from './format.js';

export const STORAGE_KEY = 'myo:v1';
export const SCHEMA = 5;
export const DEFAULT_REST = 90;
export const LB_TO_KG = 0.45359237;

// From a Cybex selector panel: 13 plates labelled 10–112 lb and 4.5–52.5 kg.
export const DEFAULT_PLATES = { count: 13, kgFirst: 4.5, kgStep: 4, lbFirst: 10, lbStep: 8.5 };
// The add-on weight knob (Cybex Twist Select): its window shows 0, 5, 10, 15 lb
// on the chin-up and dip machines. Other machines may differ.
export const DEFAULT_DIAL = { count: 4, step: 5, unit: 'lb' };

let seq = 0;
export function newId(prefix) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function field(label, unit, step) {
  return { id: newId('f'), kind: 'number', label, unit, step, value: null };
}
function stackField(label = 'Ciężar') {
  return {
    id: newId('f'),
    kind: 'stack',
    label,
    value: null,
    dialPos: 0,
    plates: { ...DEFAULT_PLATES },
    dial: { ...DEFAULT_DIAL },
  };
}
const weight = () => stackField();
// The main setting of a treadmill: energy in kcal, as set or shown on it.
const energy = () => field('Energia', 'kcal', 10);
const seat = () => field('Siedzisko', '', 1);

function machine(name, type, fields) {
  return { id: newId('m'), name, type, restTarget: DEFAULT_REST, fields };
}

// Stacks differ between machines. Cybex Eagle NX: a 10 lb top plate, then
// 20 lb plates, labelled 4.5, 13.5, 22.5 … kg; it fits the overhead and chest
// press readings. Abdominal and row read 67 kg, which is on neither stack;
// 9 kg plates from 4 kg is an assumption until their panels are checked.
const EAGLE_PLATES = { count: 12, kgFirst: 4.5, kgStep: 9, lbFirst: 10, lbStep: 20 };
const HEAVY_PLATES = { count: 12, kgFirst: 4, kgStep: 9, lbFirst: 10, lbStep: 20 };

// Stacks and settings (plate kg + dial lb) from the session of 16 Oct 2026.
const MACHINE_SETUP = {
  'Podciąganie': { kg: 16.5, dial: 0 },
  'Pompki na poręczach': { kg: 8.5, dial: 0 },
  'Brzuch': { plates: HEAVY_PLATES, kg: 67, dial: 10 },
  'Wyciskanie nad głowę': { plates: EAGLE_PLATES, kg: 31.5, dial: 15 },
  'Wiosłowanie': { plates: HEAVY_PLATES, kg: 67, dial: 10 },
  'Wyciskanie na klatkę': { plates: EAGLE_PLATES, kg: 49.5, dial: 5 },
};

function applySetup(m) {
  const setup = MACHINE_SETUP[m.name];
  const f = m.fields.find((x) => x.kind === 'stack');
  if (!setup || !f) return m;
  if (setup.plates) f.plates = { ...setup.plates };
  f.value = nearestPlate(f, setup.kg);
  f.dialPos = f.dial ? clamp(Math.round(setup.dial / f.dial.step), 0, f.dial.count - 1) : 0;
  return m;
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
    machine('Taśma', 'cardio', [energy(), field('Prędkość', 'km/h', 0.5), field('Nachylenie', '%', 1)]),
  ].map(applySetup);
}

export function createState() {
  return { schema: SCHEMA, machines: defaultMachines(), sets: [], bodyWeights: [], active: null, prefs: { sound: true } };
}

// ---------- persistence ----------

const positive = (v) => (Number.isFinite(v) && v > 0 ? v : null);
const nonNegative = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
const intIn = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function parsePlates(p = {}) {
  return {
    count: intIn(p.count, 1, 60) ?? DEFAULT_PLATES.count,
    kgFirst: nonNegative(p.kgFirst) ?? DEFAULT_PLATES.kgFirst,
    kgStep: positive(p.kgStep) ?? DEFAULT_PLATES.kgStep,
    lbFirst: nonNegative(p.lbFirst) ?? DEFAULT_PLATES.lbFirst,
    lbStep: positive(p.lbStep) ?? DEFAULT_PLATES.lbStep,
  };
}

function parseDial(d) {
  if (!d || typeof d !== 'object') return null;
  const count = intIn(d.count, 2, 20);
  if (count === null) return null;
  return { count, step: positive(d.step) ?? DEFAULT_DIAL.step, unit: d.unit === 'kg' ? 'kg' : 'lb' };
}

function parseField(f, schema) {
  const id = typeof f.id === 'string' ? f.id : newId('f');
  // Version 1 had only number fields; its default "Ciężar [kg]" becomes a stack.
  if (schema < 2 && f.kind === undefined && f.label === 'Ciężar' && f.unit === 'kg') {
    const s = { ...stackField(f.label), id };
    if (Number.isFinite(f.value)) s.value = nearestPlate(s, f.value);
    return s;
  }
  if (f.kind === 'stack') {
    const plates = parsePlates(f.plates);
    const dial = parseDial(f.dial);
    // Version 2 guessed 0/2/4/6 lb for the dial; the machines show 0/5/10/15.
    if (schema < 3 && dial?.count === 4 && dial.step === 2 && dial.unit === 'lb') dial.step = DEFAULT_DIAL.step;
    return {
      id,
      kind: 'stack',
      label: f.label,
      value: intIn(f.value, 0, plates.count - 1),
      dialPos: dial ? (intIn(f.dialPos, 0, dial.count - 1) ?? 0) : 0,
      plates,
      dial,
    };
  }
  return {
    id,
    kind: 'number',
    label: f.label,
    unit: typeof f.unit === 'string' ? f.unit : '',
    step: positive(f.step) ?? 1,
    value: Number.isFinite(f.value) ? f.value : null,
  };
}

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
  const schema = Number.isInteger(data.schema) ? data.schema : 1;
  const machines = data.machines
    .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
    .map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type === 'cardio' ? 'cardio' : 'strength',
      restTarget: positive(m.restTarget) ?? DEFAULT_REST,
      fields: (Array.isArray(m.fields) ? m.fields : [])
        .filter((f) => f && typeof f.label === 'string')
        .map((f) => parseField(f, schema)),
    }));
  const sets = data.sets.filter(
    (s) => s && typeof s.id === 'string' && typeof s.machineId === 'string' && Number.isFinite(s.endedAt),
  );
  const bodyWeights = (Array.isArray(data.bodyWeights) ? data.bodyWeights : []).filter(
    (w) => w && /^\d{4}-\d{2}-\d{2}$/.test(w.day) && positive(w.kg),
  );
  // Version 3 had no energy setting on the treadmill.
  if (schema < 4) {
    for (const m of machines) {
      if (m.type === 'cardio' && m.name === 'Taśma' && !m.fields.some((f) => f.unit === 'kcal')) m.fields.unshift(energy());
    }
  }
  // Version 4 had one stack for all machines and no settings from a session.
  if (schema < 5) machines.filter((m) => m.type === 'strength').forEach(applySetup);
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
  if (!f || f.kind === 'stack' || v === undefined) return false;
  f.value = v === null ? null : round(v);
  return true;
}

export function stepField(state, machineId, fieldId, direction) {
  const f = getField(state, machineId, fieldId);
  if (!f || f.kind === 'stack') return;
  f.value = Math.max(0, round((f.value ?? 0) + direction * f.step));
}

// ---------- weight stacks ----------

// The labels printed beside plate number `index` (0 = top plate).
export function plateWeights(field, index) {
  const p = field.plates;
  return { kg: round(p.kgFirst + index * p.kgStep), lb: round(p.lbFirst + index * p.lbStep) };
}

export function dialValue(field, pos = field.dialPos) {
  return field.dial ? round(pos * field.dial.step) : 0;
}

export function nearestPlate(field, kg) {
  let best = 0;
  for (let i = 1; i < field.plates.count; i++) {
    if (Math.abs(plateWeights(field, i).kg - kg) < Math.abs(plateWeights(field, best).kg - kg)) best = i;
  }
  return best;
}

// The plate kg label plus the dial, in kg to one decimal. Labels on machines
// are rounded, so this is approximate.
export function stackTotalKg(field) {
  if (field.value === null) return null;
  const dial = dialValue(field);
  const dialKg = field.dial?.unit === 'lb' ? dial * LB_TO_KG : dial;
  return Math.round((plateWeights(field, field.value).kg + dialKg) * 10) / 10;
}

export function setStackPlate(state, machineId, fieldId, index) {
  const f = getField(state, machineId, fieldId);
  if (!f || f.kind !== 'stack' || !Number.isInteger(index)) return;
  f.value = clamp(index, 0, f.plates.count - 1);
}

export function stepDial(state, machineId, fieldId, direction) {
  const f = getField(state, machineId, fieldId);
  if (!f || f.kind !== 'stack' || !f.dial) return;
  f.dialPos = clamp(f.dialPos + direction, 0, f.dial.count - 1);
}

// What a saved set keeps of a setting. For a stack, value is the total in kg
// and the rest records what was set on the machine.
export function fieldSnapshot(f) {
  if (f.kind !== 'stack') return { label: f.label, unit: f.unit, value: f.value };
  if (f.value === null) return { label: f.label, kind: 'stack', unit: 'kg', value: null };
  const w = plateWeights(f, f.value);
  return {
    label: f.label,
    kind: 'stack',
    unit: 'kg',
    value: stackTotalKg(f),
    plate: f.value + 1,
    plateKg: w.kg,
    plateLb: w.lb,
    dial: dialValue(f),
    dialUnit: f.dial?.unit ?? null,
  };
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

// A stack field from edit form strings, keeping what was set on the machine.
function stackFromDraft(f, prev, label) {
  const num = (v) => parseNumber(v) ?? undefined;
  const plates = parsePlates({
    count: num(f.plates?.count),
    kgFirst: num(f.plates?.kgFirst),
    kgStep: num(f.plates?.kgStep),
    lbFirst: num(f.plates?.lbFirst),
    lbStep: num(f.plates?.lbStep),
  });
  const dial = parseDial({ count: num(f.dial?.count), step: num(f.dial?.step), unit: f.dial?.unit });
  const s = { id: prev?.id ?? newId('f'), kind: 'stack', label, value: null, dialPos: 0, plates, dial };
  if (prev?.kind === 'stack') {
    s.value = prev.value === null ? null : Math.min(prev.value, plates.count - 1);
    s.dialPos = dial ? Math.min(prev.dialPos, dial.count - 1) : 0;
  } else if (Number.isFinite(prev?.value)) {
    s.value = nearestPlate(s, prev.value);
  }
  return s;
}

// Adds a machine or updates an existing one from an edit form draft:
// { id | null, name, type, fields: [{ id | null, kind, label, unit, step,
//   plates: { count, kgFirst, kgStep, lbFirst, lbStep }, dial: { count, step, unit } }] },
// with numbers as typed (strings). Existing fields keep their current values.
export function saveMachine(state, draft, now) {
  const name = String(draft.name || '').trim();
  if (!name) return null;
  const type = draft.type === 'cardio' ? 'cardio' : 'strength';
  const existing = draft.id ? getMachine(state, draft.id) : null;
  const fields = (draft.fields || [])
    .filter((f) => String(f.label || '').trim())
    .map((f) => {
      const prev = existing?.fields.find((x) => x.id === f.id);
      const label = String(f.label).trim();
      if (f.kind === 'stack') return stackFromDraft(f, prev, label);
      return {
        id: prev?.id ?? newId('f'),
        kind: 'number',
        label,
        unit: String(f.unit || '').trim(),
        step: positive(parseNumber(f.step)) ?? 1,
        value: prev?.kind === 'stack' ? stackTotalKg(prev) : (prev?.value ?? null),
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
  return m.fields.map(fieldSnapshot);
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

// The energy (kcal) setting of a machine, when it has one and it is filled in.
export function energyKcal(m) {
  const f = m?.fields.find((x) => x.kind !== 'stack' && x.unit === 'kcal');
  return f && f.value > 0 ? f.value : null;
}

// A cardio entry needs stopwatch time or the energy in kcal.
export function cardioCanFinish(state, machineId, now) {
  const a = state.active?.machineId === machineId ? cardioActive(state) : null;
  return cardioElapsedMs(a, now) >= 1000 || energyKcal(getMachine(state, machineId)) !== null;
}

export function finishCardio(state, now) {
  const a = cardioActive(state);
  if (!a) return null;
  const ms = cardioElapsedMs(a, now);
  const m = getMachine(state, a.machineId);
  if (!m || !cardioCanFinish(state, m.id, now)) return null;
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
