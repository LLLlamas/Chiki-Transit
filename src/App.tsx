import { useCallback, useEffect, useRef, useState } from 'react';
import type { TripDirection, TransitState } from './types/transit';
import { COMMUTE_CONFIG } from './config/commute';
import { fetchBus, fetchTrain } from './lib/api';
import { recommend } from './lib/recommendation';
import { isStale } from './lib/time';
import { Header } from './components/Header';
import { TransitCard } from './components/TransitCard';
import { RecommendationCard } from './components/RecommendationCard';

const DIRECTION_KEY = 'chiki_direction';

function makeIdle(): TransitState {
  return { data: null, status: 'idle', lastUpdated: null, error: null };
}

export default function App() {
  const [direction, setDirection] = useState<TripDirection>(() => {
    const saved = localStorage.getItem(DIRECTION_KEY);
    return saved === 'reverse' ? 'reverse' : 'outbound';
  });

  const [bus, setBus] = useState<TransitState>(makeIdle());
  const [train, setTrain] = useState<TransitState>(makeIdle());
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cfg = COMMUTE_CONFIG[direction];

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setBus((prev) => ({ ...prev, status: prev.data ? 'loading' : 'loading' }));
    setTrain((prev) => ({ ...prev, status: prev.data ? 'loading' : 'loading' }));

    const [busResult, trainResult] = await Promise.allSettled([
      fetchBus(direction),
      fetchTrain(direction),
    ]);

    const now = new Date().toISOString();

    if (busResult.status === 'fulfilled') {
      setBus({
        data: busResult.value,
        status: 'ok',
        lastUpdated: now,
        error: null,
      });
    } else {
      setBus((prev) => ({
        data: prev.data,
        status: prev.data && !isStale(prev.lastUpdated) ? 'stale' : 'error',
        lastUpdated: prev.lastUpdated,
        error: String(busResult.reason),
      }));
    }

    if (trainResult.status === 'fulfilled') {
      setTrain({
        data: trainResult.value,
        status: 'ok',
        lastUpdated: now,
        error: null,
      });
    } else {
      setTrain((prev) => ({
        data: prev.data,
        status: prev.data && !isStale(prev.lastUpdated) ? 'stale' : 'error',
        lastUpdated: prev.lastUpdated,
        error: String(trainResult.reason),
      }));
    }

    setLastRefreshed(now);
    setIsLoading(false);
  }, [direction]);

  // Refresh on mount and whenever direction changes.
  useEffect(() => {
    setBus(makeIdle());
    setTrain(makeIdle());
    refresh();
  }, [direction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 s.
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(refresh, COMMUTE_CONFIG.refreshMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  function swap() {
    const next: TripDirection = direction === 'outbound' ? 'reverse' : 'outbound';
    localStorage.setItem(DIRECTION_KEY, next);
    setDirection(next);
  }

  const recommendation = recommend(bus.data, train.data, cfg);

  return (
    <div className="app">
      <Header
        direction={direction}
        startAddress={cfg.startAddress}
        destinationAddress={cfg.destinationAddress}
        onSwap={swap}
        onRefresh={refresh}
        isLoading={isLoading}
        lastRefreshed={lastRefreshed}
      />

      <main className="app__main">
        <RecommendationCard
          recommendation={recommendation}
          bus={bus.data}
          train={train.data}
          cfg={cfg}
        />

        <div className="cards">
          <TransitCard
            mode="bus"
            route={cfg.bus.route}
            stopName={cfg.bus.originStopName}
            destinationStopName={cfg.bus.destinationStopName}
            directionLabel={cfg.bus.directionLabel}
            state={bus}
          />
          <TransitCard
            mode="train"
            route={cfg.train.line}
            stopName={cfg.train.originStationName}
            destinationStopName={cfg.train.destinationStationName}
            directionLabel={cfg.train.directionLabel}
            state={train}
          />
        </div>
      </main>
    </div>
  );
}
