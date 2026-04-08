export type TripDirection = 'outbound' | 'reverse';

export interface Arrival {
  id: string;           // vehicleId or tripId
  expectedAt: string;   // ISO 8601
  waitMinutes: number;
}

export interface TransitData {
  mode: 'bus' | 'train';
  route: string;        // e.g. "Q32" or "7"
  stopName: string;
  direction: string;
  updatedAt: string;    // ISO 8601
  arrivals: Arrival[];
  alerts: string[];
  source: string;
}

export type FetchStatus = 'idle' | 'loading' | 'ok' | 'error' | 'stale';

export interface TransitState {
  data: TransitData | null;
  status: FetchStatus;
  lastUpdated: string | null;
  error: string | null;
}

export type Recommendation =
  | 'bus'
  | 'train'
  | 'similar'
  | 'unavailable';
