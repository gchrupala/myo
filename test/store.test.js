import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/store.js';

const T0 = new Date(2026, 9, 16, 18, 0, 0).getTime();
const sec = (n) => T0 + n * 1000;

function fresh() {
  const state = S.createState();
  const byName = (name) => state.machines.find((m) => m.name === name);
  return { state, row: byName('Wiosłowanie'), tread: byName('Taśma') };
}

test('default machines', () => {
  const { state } = fresh();
  assert.deepEqual(
    state.machines.map((m) => m.name),
    [
      'Podciąganie',
      'Pompki na poręczach',
      'Brzuch',
      'Wyciskanie nad głowę',
      'Wiosłowanie',
      'Wyciskanie na klatkę',
      'Pośladki',
      'Taśma',
    ],
  );
  assert.deepEqual(
    state.machines.filter((m) => m.type === 'cardio').map((m) => m.name),
    ['Taśma'],
  );
});

test('counts reps, saves sets and measures rest between them', () => {
  const { state, row } = fresh();
  S.setFieldValue(state, row.id, row.fields[0].id, '40');
  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.addRep(state, sec(3));
  S.addRep(state, sec(5));
  const first = S.finishSet(state, sec(6));
  assert.equal(first.reps, 3);
  assert.equal(first.startedAt, sec(1));
  assert.equal(first.restBeforeSec, null);
  assert.deepEqual(first.settings[0], { label: 'Ciężar', unit: 'kg', value: 40 });
  assert.equal(state.active.phase, 'rest');
  assert.equal(S.restElapsedSec(state.active, sec(36)), 30);

  // Settings changed during the rest apply to the next set only.
  S.stepField(state, row.id, row.fields[0].id, 1);
  S.addRep(state, sec(101));
  S.addRep(state, sec(103));
  const second = S.finishSet(state, sec(104));
  assert.equal(second.reps, 2);
  assert.equal(second.restBeforeSec, 95);
  assert.equal(second.settings[0].value, 45);
  assert.equal(first.settings[0].value, 40);
  assert.equal(state.sets.length, 2);
});

test('removing the only rep resumes the rest timer', () => {
  const { state, row } = fresh();
  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.finishSet(state, sec(2));
  S.addRep(state, sec(30));
  S.removeRep(state);
  assert.equal(state.active.phase, 'rest');
  assert.equal(state.active.restStartedAt, sec(2));
  assert.equal(S.finishSet(state, sec(31)), null);
});

test('rest alert fires once, and not for a passed target', () => {
  const { state, row } = fresh();
  S.setRestTarget(state, row.id, 60, sec(0));
  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.finishSet(state, sec(10));
  assert.equal(S.checkRestAlert(state, sec(69)), null);
  assert.equal(S.checkRestAlert(state, sec(70)), 'alert');
  assert.equal(S.checkRestAlert(state, sec(71)), null);

  // Raising the target re-arms the alert.
  S.setRestTarget(state, row.id, 90, sec(72));
  assert.equal(state.active.alerted, false);
  assert.equal(S.checkRestAlert(state, sec(100)), 'alert');

  // Lowering it below the elapsed time does not sound it.
  S.setRestTarget(state, row.id, 120, sec(101));
  S.setRestTarget(state, row.id, 45, sec(102));
  assert.equal(S.checkRestAlert(state, sec(103)), null);

  // Coming back long after the target: no sound.
  S.addRep(state, sec(200));
  S.finishSet(state, sec(201));
  assert.equal(S.checkRestAlert(state, sec(400)), 'late');
});

test('cardio stopwatch with pause', () => {
  const { state, tread } = fresh();
  S.startExercise(state, tread.id, sec(0));
  S.toggleCardio(state, sec(0));
  S.toggleCardio(state, sec(600)); // pause after 10 min
  S.toggleCardio(state, sec(700)); // resume
  assert.equal(S.cardioElapsedMs(state.active, sec(1000)), 900_000);
  const entry = S.finishCardio(state, sec(1000));
  assert.equal(entry.durationSec, 900);
  assert.equal(entry.type, 'cardio');
  assert.equal(entry.reps, null);
});

test('switching machines saves the unfinished set', () => {
  const { state, row, tread } = fresh();
  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.addRep(state, sec(2));
  S.startExercise(state, tread.id, sec(10));
  assert.equal(state.sets.length, 1);
  assert.equal(state.sets[0].reps, 2);
  assert.equal(state.active.machineId, tread.id);
  S.endExercise(state, sec(11));
  assert.equal(state.active, null);
  assert.equal(state.sets.length, 1);
});

test('settings input accepts a comma and rejects junk', () => {
  const { state, row } = fresh();
  const f = row.fields[0];
  assert.equal(S.setFieldValue(state, row.id, f.id, '42,5'), true);
  assert.equal(f.value, 42.5);
  assert.equal(S.setFieldValue(state, row.id, f.id, 'abc'), false);
  assert.equal(f.value, 42.5);
  assert.equal(S.setFieldValue(state, row.id, f.id, ''), true);
  assert.equal(f.value, null);
  S.stepField(state, row.id, f.id, -1);
  assert.equal(f.value, 0);
});

test('editing a machine keeps setting values; deleting keeps history', () => {
  const { state, row } = fresh();
  S.setFieldValue(state, row.id, row.fields[0].id, '50');
  S.saveMachine(state, {
    id: row.id,
    name: ' Wiosłowanie siedząc ',
    type: 'strength',
    fields: [
      { id: row.fields[0].id, label: 'Ciężar', unit: 'kg', step: '2,5' },
      { id: null, label: 'Oparcie', unit: '', step: '1' },
      { id: null, label: '  ', unit: '', step: '1' },
    ],
  }, sec(0));
  assert.equal(row.name, 'Wiosłowanie siedząc');
  assert.deepEqual(row.fields.map((f) => [f.label, f.step, f.value]), [
    ['Ciężar', 2.5, 50],
    ['Oparcie', 1, null],
  ]);

  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.deleteMachine(state, row.id, sec(2));
  assert.equal(state.active, null);
  assert.equal(state.machines.some((m) => m.id === row.id), false);
  assert.equal(state.sets[0].machineName, 'Wiosłowanie siedząc');
});

test('new machine needs a name', () => {
  const { state } = fresh();
  assert.equal(S.saveMachine(state, { name: '  ', fields: [] }, sec(0)), null);
  const m = S.saveMachine(state, { name: 'Prasa nożna', type: 'strength', fields: [] }, sec(0));
  assert.equal(state.machines.at(-1), m);
  assert.equal(m.restTarget, S.DEFAULT_REST);
});

test('body weight: one entry per day, steps from the last known value', () => {
  const { state } = fresh();
  assert.equal(S.setBodyWeight(state, '2026-10-14', '82,4'), true);
  assert.equal(S.setBodyWeight(state, '2026-10-16', 'x'), false);
  assert.equal(S.setBodyWeight(state, '2026-10-16', '-1'), false);
  assert.equal(S.bodyWeightOn(state, '2026-10-16'), null);
  assert.equal(S.latestBodyWeight(state, '2026-10-16').kg, 82.4);
  S.stepBodyWeight(state, '2026-10-16', -1);
  assert.equal(S.bodyWeightOn(state, '2026-10-16'), 82.3);
  S.setBodyWeight(state, '2026-10-16', '82');
  assert.equal(state.bodyWeights.length, 2);
  S.setBodyWeight(state, '2026-10-16', '');
  assert.equal(S.bodyWeightOn(state, '2026-10-16'), null);
});

test('history groups by day and machine, newest day first', () => {
  const { state, row, tread } = fresh();
  const day1 = new Date(2026, 9, 14, 18, 0).getTime();
  S.startExercise(state, row.id, day1);
  S.addRep(state, day1 + 1000);
  S.finishSet(state, day1 + 2000);
  S.endExercise(state, day1 + 3000);

  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.finishSet(state, sec(2));
  S.addRep(state, sec(60));
  S.finishSet(state, sec(61));
  S.startExercise(state, tread.id, sec(100));
  S.toggleCardio(state, sec(100));
  S.finishCardio(state, sec(700));
  S.setBodyWeight(state, '2026-10-15', '82');

  const days = S.historyByDay(state);
  assert.deepEqual(days.map((d) => d.day), ['2026-10-16', '2026-10-15', '2026-10-14']);
  assert.deepEqual(days[0].blocks.map((b) => [b.machineName, b.sets.length]), [
    ['Wiosłowanie', 2],
    ['Taśma', 1],
  ]);
  assert.deepEqual(days[1].blocks, []);
  assert.equal(days[1].bodyWeight, 82);

  assert.equal(S.lastSession(state, row.id).day, '2026-10-16');
  assert.equal(S.lastSession(state, row.id, '2026-10-16').day, '2026-10-14');
  assert.equal(S.lastSession(state, row.id, '2026-10-14'), null);
});

test('save, load and import', () => {
  const { state, row } = fresh();
  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.finishSet(state, sec(2));
  S.setBodyWeight(state, '2026-10-16', '80');

  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(S.saveState(storage, state), true);
  const loaded = S.loadState(storage);
  assert.deepEqual(loaded, state);

  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(S.loadState(broken).machines.length, 8);
  assert.equal(S.saveState(broken, state), false);
  assert.equal(S.saveState(null, state), false);

  assert.equal(S.parseState('not json'), null);
  assert.equal(S.parseState('{"foo": 1}'), null);
  const imported = S.parseState(JSON.stringify({ ...state, active: { machineId: 'gone' } }));
  assert.equal(imported.active, null);
  assert.equal(imported.sets.length, 1);
});
