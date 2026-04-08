import type { TripDirection } from '../types/transit';

interface Props {
  direction: TripDirection;
  startAddress: string;
  destinationAddress: string;
  onSwap: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  lastRefreshed: string | null;
}

export function Header({
  direction,
  startAddress,
  destinationAddress,
  onSwap,
  onRefresh,
  isLoading,
  lastRefreshed,
}: Props) {
  const time = lastRefreshed
    ? new Date(lastRefreshed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="app-header">
      <div className="app-header__top">
        <h1 className="app-header__title">Chiki Transit</h1>
        <button
          className={`btn btn--refresh ${isLoading ? 'btn--spinning' : ''}`}
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Refresh arrivals"
        >
          ↻
        </button>
      </div>

      <div className="app-header__route">
        <div className="route-display">
          <span className="route-display__addr route-display__addr--from">{startAddress}</span>
          <button className="btn btn--swap" onClick={onSwap} aria-label="Swap trip direction">
            ⇅ Swap
          </button>
          <span className="route-display__addr route-display__addr--to">{destinationAddress}</span>
        </div>
      </div>

      {time && (
        <p className="app-header__updated">
          Last updated at {time}
          {direction === 'reverse' && ' · Return trip'}
        </p>
      )}
    </header>
  );
}
