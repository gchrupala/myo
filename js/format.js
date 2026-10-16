// Formatting helpers for times, numbers, dates and Polish plurals.

const pad2 = (n) => String(n).padStart(2, '0');

// 65 -> "1:05", 3723 -> "1:02:03"
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${m}:${pad2(sec)}`;
}

// Polish plural forms: 1 seria, 2 serie, 5 serii, 22 serie.
export function plural(n, one, few, many) {
  if (n === 1) return one;
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

// Polish decimal comma: 42.5 -> "42,5"
export function formatNumber(value) {
  return String(value).replace('.', ',');
}

// "40 kg" when the setting has a unit, "Siedzisko 4" when it does not.
// A weight stack shows what is set on the machine: "24,5 kg + 2 lb".
export function formatField(field) {
  if (field.kind === 'stack') {
    const plate = `${formatNumber(field.plateKg)} kg`;
    return field.dial ? `${plate} + ${formatNumber(field.dial)} ${field.dialUnit}` : plate;
  }
  const v = formatNumber(field.value);
  return field.unit ? `${v} ${field.unit}` : `${field.label} ${v}`;
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

export function formatDay(key, now = Date.now()) {
  if (key === dayKey(now)) return 'Dzisiaj';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return 'Wczoraj';
  const [y, m, d] = key.split('-').map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString('pl-PL', { weekday: 'short' });
  const year = y === new Date(now).getFullYear() ? '' : `.${y}`;
  return `${weekday} ${pad2(d)}.${pad2(m)}${year}`;
}

// One-line summary of a session on one machine.
export function summarizeSets(sets) {
  const strength = sets.filter((s) => s.type !== 'cardio');
  const cardio = sets.filter((s) => s.type === 'cardio');
  const parts = [];
  if (strength.length) {
    const n = strength.length;
    parts.push(`${n} ${plural(n, 'seria', 'serie', 'serii')}: ${strength.map((s) => s.reps).join(', ')} powt.`);
  }
  if (cardio.length) parts.push(cardio.map((s) => formatDuration(s.durationSec)).join(', '));
  return parts.join(' · ');
}
