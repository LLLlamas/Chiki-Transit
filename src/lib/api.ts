import type { TransitData } from '../types/transit';
import type { TripDirection } from '../types/transit';
import { PROXY_BASE_URL } from '../config/commute';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchBus(direction: TripDirection): Promise<TransitData> {
  return fetchJson<TransitData>(`${PROXY_BASE_URL}/api/bus?trip=${direction}`);
}

export async function fetchTrain(direction: TripDirection): Promise<TransitData> {
  return fetchJson<TransitData>(`${PROXY_BASE_URL}/api/train?trip=${direction}`);
}
