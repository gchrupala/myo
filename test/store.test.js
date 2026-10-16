import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/store.js';
import { formatField } from '../js/format.js';

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
  const [weight, seat] = row.fields;
  S.setStackPlate(state, row.id, weight.id, 8); // 76 kg, dial at 10 lb
  S.setFieldValue(state, row.id, seat.id, '4');
  S.startExercise(state, row.id, sec(0));
  S.addRep(state, sec(1));
  S.addRep(state, sec(3));
  S.addRep(state, sec(5));
  const first = S.finishSet(state, sec(6));
  assert.equal(first.reps, 3);
  assert.equal(first.startedAt, sec(1));
  assert.equal(first.restBeforeSec, null);
  assert.equal(first.settings[0].value, 80.5);
  assert.deepEqual(first.settings[1], { label: 'Siedzisko', unit: '', value: 4 });
  assert.equal(state.active.phase, 'rest');
  assert.equal(S.restElapsedSec(state.active, sec(36)), 30);

  // Settings changed during the rest apply to the next set only.
  S.stepField(state, row.id, seat.id, 1);
  S.addRep(state, sec(101));
  S.addRep(state, sec(103));
  const second = S.finishSet(state, sec(104));
  assert.equal(second.reps, 2);
  assert.equal(second.restBeforeSec, 95);
  assert.equal(second.settings[1].value, 5);
  assert.equal(first.settings[1].value, 4);
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

test('treadmill: energy in kcal is the first setting', () => {
  const { state, tread } = fresh();
  assert.deepEqual(tread.fields.map((f) => [f.label, f.unit]), [['Energia', 'kcal'], ['Prędkość', 'km/h'], ['Nachylenie', '%']]);
  assert.equal(S.cardioCanFinish(state, tread.id, sec(0)), false);
  S.setFieldValue(state, tread.id, tread.fields[0].id, '320');
  assert.equal(S.energyKcal(tread), 320);
  // Energy alone is enough to save, without the stopwatch.
  assert.equal(S.cardioCanFinish(state, tread.id, sec(0)), true);
  S.startExercise(state, tread.id, sec(0));
  S.endExercise(state, sec(1));
  assert.equal(state.sets.length, 1);
  assert.equal(state.sets[0].durationSec, 0);
  assert.deepEqual(state.sets[0].settings[0], { label: 'Energia', unit: 'kcal', value: 320 });
});

test('version 3 data: the treadmill gets an energy setting', () => {
  const v3 = {
    schema: 3,
    machines: [
      { id: 'm1', name: 'Taśma', type: 'cardio', restTarget: 90, fields: [
        { id: 'f1', kind: 'number', label: 'Prędkość', unit: 'km/h', step: 0.5, value: 6 },
      ] },
      { id: 'm2', name: 'Rower', type: 'cardio', restTarget: 90, fields: [] },
    ],
    sets: [],
  };
  const state = S.parseState(v3);
  assert.deepEqual(state.machines[0].fields.map((f) => [f.label, f.unit, f.value]), [['Energia', 'kcal', null], ['Prędkość', 'km/h', 6]]);
  assert.deepEqual(state.machines[1].fields, []);
  assert.deepEqual(S.parseState(JSON.stringify(state)), state);
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
  const { state, tread } = fresh();
  const row = tread;
  const f = tread.fields[0];
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
  S.setFieldValue(state, row.id, row.fields[1].id, '5');
  S.saveMachine(state, {
    id: row.id,
    name: ' Wiosłowanie siedząc ',
    type: 'strength',
    fields: [
      { id: row.fields[1].id, kind: 'number', label: 'Siedzisko', unit: '', step: '0,5' },
      { id: null, kind: 'number', label: 'Oparcie', unit: '', step: '1' },
      { id: null, kind: 'number', label: '  ', unit: '', step: '1' },
    ],
  }, sec(0));
  assert.equal(row.name, 'Wiosłowanie siedząc');
  assert.deepEqual(row.fields.map((f) => [f.label, f.step, f.value]), [
    ['Siedzisko', 0.5, 5],
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

test('weight stack: labels, pin, dial and total', () => {
  const { state } = fresh();
  const row = state.machines.find((m) => m.name === 'Podciąganie');
  const f = row.fields[0];
  assert.equal(f.kind, 'stack');
  // The labels on the photographed Cybex panel.
  const labels = Array.from({ length: f.plates.count }, (_, i) => S.plateWeights(f, i));
  assert.deepEqual(labels.map((w) => w.lb), [10, 18.5, 27, 35.5, 44, 52.5, 61, 69.5, 78, 86.5, 95, 103.5, 112]);
  assert.deepEqual(labels.map((w) => w.kg), [4.5, 8.5, 12.5, 16.5, 20.5, 24.5, 28.5, 32.5, 36.5, 40.5, 44.5, 48.5, 52.5]);

  f.value = null;
  assert.equal(S.stackTotalKg(f), null);
  assert.deepEqual(S.fieldSnapshot(f), { label: 'Ciężar', kind: 'stack', unit: 'kg', value: null });

  S.setStackPlate(state, row.id, f.id, 5);
  assert.equal(S.stackTotalKg(f), 24.5);
  S.stepDial(state, row.id, f.id, 1);
  assert.equal(S.dialValue(f), 5);
  assert.equal(S.stackTotalKg(f), 26.8); // 24,5 kg + 5 lb
  S.stepDial(state, row.id, f.id, 5);
  assert.equal(f.dialPos, 3);
  S.stepDial(state, row.id, f.id, -9);
  assert.equal(f.dialPos, 0);
  S.setStackPlate(state, row.id, f.id, 99);
  assert.equal(f.value, 12);
  // Number inputs do not apply to a stack.
  assert.equal(S.setFieldValue(state, row.id, f.id, '40'), false);

  S.setStackPlate(state, row.id, f.id, 2);
  S.stepDial(state, row.id, f.id, 2);
  assert.deepEqual(S.fieldSnapshot(f), {
    label: 'Ciężar', kind: 'stack', unit: 'kg', value: 17,
    plate: 3, plateKg: 12.5, plateLb: 27, dial: 10, dialUnit: 'lb',
  });
});

test('weight stack settings from the edit form', () => {
  const { state, row } = fresh();
  const f = row.fields[0];
  S.setStackPlate(state, row.id, f.id, 10);
  S.stepDial(state, row.id, f.id, 3);
  S.saveMachine(state, {
    id: row.id,
    name: row.name,
    type: 'strength',
    fields: [{
      id: f.id, kind: 'stack', label: 'Ciężar',
      plates: { count: '8', kgFirst: '5', kgStep: '5', lbFirst: '10', lbStep: '10' },
      dial: { count: '2', step: '2,5', unit: 'kg' },
    }],
  }, sec(0));
  const g = row.fields[0];
  assert.deepEqual(g.plates, { count: 8, kgFirst: 5, kgStep: 5, lbFirst: 10, lbStep: 10 });
  assert.deepEqual(g.dial, { count: 2, step: 2.5, unit: 'kg' });
  assert.equal(g.value, 7); // clamped to the last plate
  assert.equal(g.dialPos, 1);

  // No dial, and bad numbers fall back to defaults.
  S.saveMachine(state, {
    id: row.id, name: row.name, type: 'strength',
    fields: [{ id: g.id, kind: 'stack', label: 'Ciężar', plates: { count: 'x' }, dial: { count: '0' } }],
  }, sec(0));
  assert.equal(row.fields[0].plates.count, S.DEFAULT_PLATES.count);
  assert.equal(row.fields[0].dial, null);
  assert.equal(S.dialValue(row.fields[0]), 0);

  // Switching a number setting to a stack picks the nearest plate, and back.
  const m = S.saveMachine(state, { name: 'Prasa', type: 'strength', fields: [{ kind: 'number', label: 'Ciężar', unit: 'kg', step: '5' }] }, sec(0));
  S.setFieldValue(state, m.id, m.fields[0].id, '30');
  S.saveMachine(state, { id: m.id, name: 'Prasa', type: 'strength', fields: [{ id: m.fields[0].id, kind: 'stack', label: 'Ciężar' }] }, sec(0));
  assert.equal(S.plateWeights(m.fields[0], m.fields[0].value).kg, 28.5);
  S.saveMachine(state, { id: m.id, name: 'Prasa', type: 'strength', fields: [{ id: m.fields[0].id, kind: 'number', label: 'Ciężar', unit: 'kg', step: '5' }] }, sec(0));
  assert.equal(m.fields[0].value, 28.5);
});

test('version 1 data: the default weight setting becomes a stack', () => {
  const v1 = {
    schema: 1,
    machines: [{
      id: 'm1', name: 'Prasa nożna', type: 'strength', restTarget: 90,
      fields: [
        { id: 'f1', label: 'Ciężar', unit: 'kg', step: 5, value: 40 },
        { id: 'f2', label: 'Siedzisko', unit: '', step: 1, value: 3 },
      ],
    }],
    sets: [{ id: 's1', machineId: 'm1', machineName: 'Wiosłowanie', type: 'strength', endedAt: T0, reps: 10,
      settings: [{ label: 'Ciężar', unit: 'kg', value: 40 }] }],
    bodyWeights: [],
  };
  const state = S.parseState(JSON.stringify(v1));
  const [weight, seat] = state.machines[0].fields;
  assert.equal(weight.kind, 'stack');
  assert.equal(weight.id, 'f1');
  assert.equal(S.plateWeights(weight, weight.value).kg, 40.5);
  assert.deepEqual(weight.dial, { count: 4, step: 5, unit: 'lb' });
  assert.deepEqual(seat, { id: 'f2', kind: 'number', label: 'Siedzisko', unit: '', step: 1, value: 3 });
  assert.deepEqual(state.sets[0].settings, [{ label: 'Ciężar', unit: 'kg', value: 40 }]);
  assert.equal(state.schema, S.SCHEMA);
  // Saved again and reloaded, it stays as it is.
  assert.deepEqual(S.parseState(JSON.stringify(state)), state);
});

test('version 2 data: the guessed 0/2/4/6 lb dial becomes 0/5/10/15 lb', () => {
  const stack = (id, dial) => ({
    id, kind: 'stack', label: 'Ciężar', value: 3, dialPos: 1,
    plates: { count: 13, kgFirst: 4.5, kgStep: 4, lbFirst: 10, lbStep: 8.5 }, dial,
  });
  const v2 = {
    schema: 2,
    machines: [{
      id: 'm1', name: 'Prasa nożna', type: 'strength', restTarget: 90,
      fields: [stack('f1', { count: 4, step: 2, unit: 'lb' }), stack('f2', { count: 3, step: 1, unit: 'kg' })],
    }],
    sets: [],
  };
  const [guessed, custom] = S.parseState(v2).machines[0].fields;
  assert.deepEqual(guessed.dial, { count: 4, step: 5, unit: 'lb' });
  assert.equal(guessed.dialPos, 1);
  assert.equal(S.dialValue(guessed), 5);
  assert.deepEqual(custom.dial, { count: 3, step: 1, unit: 'kg' });
});

const SESSION = [
  ['Podciąganie', '16,5 kg'],
  ['Pompki na poręczach', '8,5 kg'],
  ['Brzuch', '67 kg + 10 lb'],
  ['Wyciskanie nad głowę', '31,5 kg + 15 lb'],
  ['Wiosłowanie', '67 kg + 10 lb'],
  ['Wyciskanie na klatkę', '49,5 kg + 5 lb'],
];
const weightText = (m) => formatField(S.fieldSnapshot(m.fields.find((f) => f.kind === 'stack')));

test('machines start from the settings of the 16 Oct session', () => {
  const { state } = fresh();
  for (const [name, text] of SESSION) assert.equal(weightText(state.machines.find((m) => m.name === name)), text, name);
  const press = state.machines.find((m) => m.name === 'Wyciskanie na klatkę').fields[0];
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => S.plateWeights(press, i).kg), [4.5, 13.5, 22.5, 31.5, 40.5, 49.5]);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => S.plateWeights(press, i).lb), [10, 30, 50, 70, 90, 110]);
});

test('version 4 data: stacks and settings updated to the 16 Oct session', () => {
  const v4 = S.createState();
  for (const m of v4.machines) {
    for (const f of m.fields) {
      if (f.kind !== 'stack') continue;
      f.plates = { ...S.DEFAULT_PLATES };
      f.value = 1;
      f.dialPos = 2;
    }
  }
  const pull = v4.machines.find((m) => m.name === 'Pośladki').fields[0];
  v4.schema = 4;
  const state = S.parseState(JSON.stringify(v4));
  for (const [name, text] of SESSION) assert.equal(weightText(state.machines.find((m) => m.name === name)), text, name);
  // A machine with no reading from the session keeps its setting.
  const glute = state.machines.find((m) => m.name === 'Pośladki').fields[0];
  assert.deepEqual([glute.value, glute.dialPos, glute.plates], [pull.value, pull.dialPos, pull.plates]);
});

test('language preference is saved and checked', () => {
  const state = S.createState();
  assert.equal(state.prefs.lang, 'system');
  assert.equal(S.parseState(JSON.stringify({ ...state, prefs: { sound: true, lang: 'es' } })).prefs.lang, 'es');
  assert.equal(S.parseState(JSON.stringify({ ...state, prefs: { sound: true, lang: 'xx' } })).prefs.lang, 'system');
  assert.equal(S.parseState(JSON.stringify({ ...state, prefs: { sound: false } })).prefs.lang, 'system');
});
