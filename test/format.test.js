import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey,
  formatDay,
  formatDuration,
  formatNumber,
  formatSettings,
  restClock,
  setHeadline,
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

test('restClock counts down to the target, then shows the time over it', () => {
  assert.equal(restClock(0, 90), '1:30');
  assert.equal(restClock(0.4, 90), '1:30');
  assert.equal(restClock(20, 90), '1:10');
  assert.equal(restClock(89.2, 90), '0:01');
  assert.equal(restClock(90, 90), '+0:00');
  assert.equal(restClock(102.7, 90), '+0:12');
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
  assert.equal(formatSettings([{ ...stack, value: -25.4, assist: true }]), 'asysta 24,5 kg + 2 lb');
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

test('setHeadline: reps for strength, kcal first for cardio', () => {
  const strength = { type: 'strength', reps: 12, settings: [{ label: 'Siedzisko', unit: '', value: 3 }] };
  assert.deepEqual(setHeadline(strength), { main: '12 powt.', meta: 'Siedzisko 3' });
  const settings = [
    { label: 'Energia', unit: 'kcal', value: 320 },
    { label: 'Prędkość', unit: 'km/h', value: 6.5 },
    { label: 'Nachylenie', unit: '%', value: null },
  ];
  assert.deepEqual(setHeadline({ type: 'cardio', durationSec: 1500, settings }), { main: '320 kcal', meta: '25:00 · 6,5 km/h' });
  assert.deepEqual(setHeadline({ type: 'cardio', durationSec: 0, settings }), { main: '320 kcal', meta: '6,5 km/h' });
  const noEnergy = [{ ...settings[0], value: null }, settings[1]];
  assert.deepEqual(setHeadline({ type: 'cardio', durationSec: 1500, settings: noEnergy }), { main: '25:00', meta: '6,5 km/h' });
  assert.equal(summarizeSets([{ type: 'cardio', durationSec: 1500, settings }]), '320 kcal (25:00)');
  assert.equal(summarizeSets([{ type: 'cardio', durationSec: 0, settings }]), '320 kcal');
});
