import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey,
  formatDay,
  formatDuration,
  formatNumber,
  formatSettings,
  plural,
  summarizeSets,
} from '../js/format.js';

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(5.9), '0:05');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(600), '10:00');
  assert.equal(formatDuration(3723), '1:02:03');
  assert.equal(formatDuration(-3), '0:00');
});

test('plural follows Polish rules', () => {
  const p = (n) => plural(n, 'seria', 'serie', 'serii');
  assert.deepEqual([0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112].map(p), [
    'serii', 'seria', 'serie', 'serie', 'serii', 'serii', 'serii', 'serii', 'serii', 'serie', 'serii', 'serii',
  ]);
});

test('formatNumber uses a decimal comma', () => {
  assert.equal(formatNumber(42.5), '42,5');
  assert.equal(formatNumber(40), '40');
});

test('formatSettings skips empty values and labels unitless ones', () => {
  const settings = [
    { label: 'Ciężar', unit: 'kg', value: 42.5 },
    { label: 'Siedzisko', unit: '', value: 4 },
    { label: 'Oparcie', unit: '', value: null },
  ];
  assert.equal(formatSettings(settings), '42,5 kg · Siedzisko 4');
  assert.equal(formatSettings([]), '');
  const stack = { label: 'Ciężar', kind: 'stack', unit: 'kg', value: 25.4, plateKg: 24.5, plateLb: 52.5, dial: 2, dialUnit: 'lb' };
  assert.equal(formatSettings([stack]), '24,5 kg + 2 lb');
  assert.equal(formatSettings([{ ...stack, dial: 0 }]), '24,5 kg');
  assert.equal(formatSettings([{ label: 'Ciężar', kind: 'stack', unit: 'kg', value: null }]), '');
});

test('dayKey and formatDay use the local calendar', () => {
  const now = new Date(2026, 9, 16, 18, 0).getTime();
  assert.equal(dayKey(now), '2026-10-16');
  assert.equal(formatDay('2026-10-16', now), 'Dzisiaj');
  assert.equal(formatDay('2026-10-15', now), 'Wczoraj');
  assert.match(formatDay('2026-10-13', now), /^\S+ 13\.10$/);
  assert.match(formatDay('2025-12-31', now), /31\.12\.2025$/);
});

test('summarizeSets', () => {
  const sets = [
    { type: 'strength', reps: 12 },
    { type: 'strength', reps: 10 },
    { type: 'strength', reps: 8 },
  ];
  assert.equal(summarizeSets(sets), '3 serie: 12, 10, 8 powt.');
  assert.equal(summarizeSets([{ type: 'cardio', durationSec: 1500 }]), '25:00');
});
