import { useEffect, useState } from 'react';
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
  const [now, setNow] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  // Tick every second so the clock stays live
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const lastUpdatedTime = lastRefreshed
    ? new Date(lastRefreshed).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <header className="app-header">
      {/* Fixed clock bar */}
      <div className="app-header__clock-bar">
        <span className="app-header__clock-label">TIME NOW</span>
        <span className="app-header__clock-time">{now}</span>
      </div>

      {/* Route + controls */}
      <div className="app-header__body">
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

        {lastUpdatedTime && (
          <p className="app-header__updated">
            Last updated {lastUpdatedTime}
            {direction === 'reverse' && ' · Return trip'}
          </p>
        )}
      </div>
    </header>
  );
}
