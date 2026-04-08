import { minutesFromNow } from './time';

/** "Next bus in 4 min" or "Due now" or "Departed" */
export function arrivalLabel(waitMinutes: number): string {
  if (waitMinutes <= 0) return 'Due now';
  if (waitMinutes === 1) return 'in 1 min';
  return `in ${waitMinutes} min`;
}

/** Filter out arrivals that have already departed (waitMinutes < 0). */
export function filterFutureArrivals<T extends { expectedAt: string }>(arrivals: T[]): T[] {
  return arrivals.filter((a) => minutesFromNow(a.expectedAt) >= 0);
}
