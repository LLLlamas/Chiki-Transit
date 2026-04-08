/** Returns minutes from now to an ISO 8601 timestamp. Negative = in the past. */
export function minutesFromNow(isoString: string): number {
  const diff = new Date(isoString).getTime() - Date.now();
  return Math.round(diff / 60_000);
}

/** Format an ISO timestamp as a short HH:MM time string. */
export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Human-readable "X min ago" or "X min" relative label. */
export function relativeLabel(isoString: string | null): string {
  if (!isoString) return 'never';
  const mins = minutesFromNow(isoString);
  if (mins >= 0) return `in ${mins} min`;
  if (mins === -1) return '1 min ago';
  return `${Math.abs(mins)} min ago`;
}

/** Returns true if the timestamp is older than thresholdMs milliseconds. */
export function isStale(isoString: string | null, thresholdMs = 90_000): boolean {
  if (!isoString) return false;
  return Date.now() - new Date(isoString).getTime() > thresholdMs;
}
