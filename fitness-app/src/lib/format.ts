export function formatDuration(ms: number) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** mm:ss (or h:mm:ss) for running clocks. */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatKg(n: number) {
  return n >= 10000 ? `${(n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} t` : `${Math.round(n).toLocaleString('de-DE')} kg`;
}

export function formatNumber(n: number, digits = 1) {
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits });
}
