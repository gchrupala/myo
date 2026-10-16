// Formatting helpers for times, numbers, dates and summaries, in the
// current interface language (see i18n.js).

import { decimalSeparator, language, locale, nameFor, t } from './i18n.js';

const pad2 = (n) => String(n).padStart(2, '0');

// 65 -> "1:05", 3723 -> "1:02:03"
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

// The rest clock counts down to the target, then shows the time over it:
// 90 s target after 20 s -> "1:10", after 100 s -> "+0:10".
export function restClock(elapsedSec, targetSec) {
  if (elapsedSec < targetSec) return formatDuration(Math.ceil(targetSec - elapsedSec));
  return `+${formatDuration(elapsedSec - targetSec)}`;
}

// 42.5 -> "42,5" in Polish and Spanish, "42.5" in English.
export function formatNumber(value) {
  return String(value).replace('.', decimalSeparator());
}

// "40 kg" when the setting has a unit, "Siedzisko 4" when it does not.
// A weight stack shows what is set on the machine: "24,5 kg + 2 lb".
export function formatField(field) {
  if (field.kind === 'stack') {
    const plate = `${formatNumber(field.plateKg)} kg`;
    return field.dial ? `${plate} + ${formatNumber(field.dial)} ${field.dialUnit}` : plate;
  }
  const v = formatNumber(field.value);
  return field.unit ? `${v} ${field.unit}` : `${nameFor(field.label)} ${v}`;
}

export function formatSettings(settings = []) {
  return settings
    .filter((f) => f.value !== null && f.value !== undefined)
    .map(formatField)
    .join(' · ');
}

// Local calendar day as "YYYY-MM-DD", so keys sort as strings.
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// "Dzisiaj", "Wczoraj", "wt. 13.10"; "Today", "Tue 13 Oct"; "Hoy", "mar, 13 oct".
// midSentence gives "dzisiaj" / "today" for use inside a sentence.
export function formatDay(key, now = Date.now(), midSentence = false) {
  if (key === dayKey(now)) return t(midSentence ? 'day.todayMid' : 'day.today');
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return t(midSentence ? 'day.yesterdayMid' : 'day.yesterday');
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date(now).getFullYear();
  if (language() === 'pl') {
    const weekday = date.toLocaleDateString(locale(), { weekday: 'short' });
    return `${weekday} ${pad2(d)}.${pad2(m)}${sameYear ? '' : `.${y}`}`;
  }
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  if (!sameYear) options.year = 'numeric';
  return date.toLocaleDateString(locale(), options);
}

// The leading text of a saved set and the details after it. Strength sets
// lead with reps; cardio leads with energy in kcal when it was recorded,
// otherwise with the time.
export function setHeadline(set) {
  const settings = set.settings ?? [];
  if (set.type !== 'cardio') return { main: t('set.reps', { n: set.reps }), meta: formatSettings(settings) };
  const kcal = settings.find((f) => f.unit === 'kcal' && f.value !== null && f.value !== undefined);
  const time = set.durationSec > 0 ? formatDuration(set.durationSec) : '';
  if (!kcal) return { main: time, meta: formatSettings(settings) };
  const rest = formatSettings(settings.filter((f) => f !== kcal));
  return { main: `${formatNumber(kcal.value)} kcal`, meta: [time, rest].filter(Boolean).join(' · ') };
}

// One-line summary of a session on one machine.
export function summarizeSets(sets) {
  const strength = sets.filter((s) => s.type !== 'cardio');
  const cardio = sets.filter((s) => s.type === 'cardio');
  const parts = [];
  if (strength.length) {
    parts.push(t('sum.sets', { n: strength.length, reps: strength.map((s) => s.reps).join(', ') }));
  }
  if (cardio.length) {
    parts.push(
      cardio
        .map((s) => {
          const { main } = setHeadline(s);
          const time = s.durationSec > 0 ? formatDuration(s.durationSec) : '';
          return main === time || !time ? main : `${main} (${time})`;
        })
        .join(', '),
    );
  }
  return parts.join(' · ');
}
