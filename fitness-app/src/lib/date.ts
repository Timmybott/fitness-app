/** Local calendar day as `YYYY-MM-DD` (entries are grouped by this key). */
export function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shiftDateKey(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

export function formatDateKey(key: string) {
  const today = toDateKey(new Date());
  if (key === today) return 'Heute';
  if (key === shiftDateKey(today, -1)) return 'Gestern';
  if (key === shiftDateKey(today, 1)) return 'Morgen';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
