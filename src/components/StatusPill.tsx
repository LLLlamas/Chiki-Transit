import type { FetchStatus } from '../types/transit';

interface Props {
  status: FetchStatus;
  lastUpdated: string | null;
}

const LABELS: Record<FetchStatus, string> = {
  idle: 'Waiting',
  loading: 'Updating...',
  ok: 'Live',
  error: 'Unavailable',
  stale: 'Stale data',
};

export function StatusPill({ status }: Props) {
  return (
    <span className={`status-pill status-pill--${status}`}>
      {status === 'loading' && <span className="status-pill__dot status-pill__dot--pulse" />}
      {status === 'ok' && <span className="status-pill__dot status-pill__dot--live" />}
      {LABELS[status]}
    </span>
  );
}
