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
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const lastUpdatedTime = lastRefreshed
    ? new Date(lastRefreshed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="app-header">
      <div className="app-header__top">
        <div>
          <h1 className="app-header__title">Chiki Transit</h1>
          <p className="app-header__now">Now {now}</p>
        </div>
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
          <div className="route-display__row">
            <span className="route-display__label">Starting Point</span>
            <span className="route-display__addr">{startAddress}</span>
          </div>

          <div className="route-display__divider">
            <div className="route-display__line" />
            <button className="btn btn--swap" onClick={onSwap} aria-label="Swap trip direction">
              ⇅ Swap
            </button>
            <div className="route-display__line" />
          </div>

          <div className="route-display__row">
            <span className="route-display__label route-display__label--end">End Point</span>
            <span className="route-display__addr">{destinationAddress}</span>
          </div>
        </div>
      </div>

      {lastUpdatedTime && (
        <p className="app-header__updated">
          Last updated {lastUpdatedTime}
          {direction === 'reverse' && ' · Return trip'}
        </p>
      )}
    </header>
  );
}
