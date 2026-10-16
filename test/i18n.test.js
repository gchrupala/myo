import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysOf, LANGUAGES, nameFor, resolveLanguage, setLanguage, t } from '../js/i18n.js';
import { formatDay, formatNumber, formatSettings, setHeadline, summarizeSets } from '../js/format.js';

const NOW = new Date(2026, 9, 16, 18, 0).getTime();

test('every language has every text', () => {
  const pl = keysOf('pl').sort();
  for (const code of Object.keys(LANGUAGES)) assert.deepEqual(keysOf(code).sort(), pl, code);
});

test('system language: first supported one, otherwise English', () => {
  assert.equal(resolveLanguage('system', ['pl-PL', 'en']), 'pl');
  assert.equal(resolveLanguage('system', ['de-DE', 'es-MX', 'en']), 'es');
  assert.equal(resolveLanguage('system', ['de-DE']), 'en');
  assert.equal(resolveLanguage('system', []), 'en');
  assert.equal(resolveLanguage('es', ['pl-PL']), 'es');
});

test('Polish plural forms', () => {
  setLanguage('pl');
  const sets = (n) => t('sum.sets', { n, reps: '' }).split(':')[0];
  assert.deepEqual([1, 2, 4, 5, 12, 22, 25].map(sets), [
    '1 seria', '2 serie', '4 serie', '5 serii', '12 serii', '22 serie', '25 serii',
  ]);
  assert.equal(t('plate.reps', { n: 0 }), 'powtórzeń');
  assert.equal(t('data.confirm', { machines: 1, sets: 3 }).split('.')[0], 'Plik zawiera 1 maszynę i 3 serie');
});

test('English', () => {
  setLanguage('en');
  assert.equal(formatNumber(42.5), '42.5');
  assert.equal(formatDay('2026-10-16', NOW), 'Today');
  assert.equal(formatDay('2026-10-15', NOW, true), 'yesterday');
  assert.equal(formatDay('2026-10-13', NOW), 'Tue 13 Oct');
  assert.equal(summarizeSets([{ type: 'strength', reps: 12 }]), '1 set: 12 reps');
  assert.equal(summarizeSets([{ type: 'strength', reps: 12 }, { type: 'strength', reps: 10 }]), '2 sets: 12, 10 reps');
  assert.deepEqual(setHeadline({ type: 'strength', reps: 1, settings: [{ label: 'Siedzisko', unit: '', value: 3.5 }] }), {
    main: '1 rep',
    meta: 'Seat 3.5',
  });
  assert.equal(nameFor('Wiosłowanie'), 'Row');
  assert.equal(nameFor('Moja maszyna'), 'Moja maszyna');
  assert.equal(t('hint.rest', { target: '1:30' }), 'Rest target: 1:30.');
  assert.equal(t('ex.startSet', { n: 2 }), 'Start set 2');
});

test('Spanish', () => {
  setLanguage('es');
  assert.equal(formatNumber(42.5), '42,5');
  assert.equal(formatDay('2026-10-16', NOW), 'Hoy');
  assert.match(formatDay('2026-10-13', NOW), /^mar,? 13 oct/);
  assert.equal(summarizeSets([{ type: 'strength', reps: 8 }]), '1 serie: 8 rep.');
  assert.equal(formatSettings([{ label: 'Siedzisko', unit: '', value: 2 }, { label: 'Energia', unit: 'kcal', value: 300 }]), 'Asiento 2 · 300 kcal');
  assert.equal(nameFor('Taśma'), 'Cinta');
});

test('Polish names stay as stored', () => {
  setLanguage('pl');
  assert.equal(nameFor('Wiosłowanie'), 'Wiosłowanie');
  assert.equal(formatDay('2026-10-13', NOW), 'wt. 13.10');
});
