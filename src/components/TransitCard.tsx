import { useState } from 'react';
import type { TransitState } from '../types/transit';
import { ArrivalList } from './ArrivalList';
import { StatusPill } from './StatusPill';
import { formatTime } from '../lib/time';

interface Props {
  mode: 'bus' | 'train';
  route: string;
  stopName: string;
  destinationStopName: string;
  directionLabel: string;
  state: TransitState;
}

export function TransitCard({ mode, route, stopName, destinationStopName, directionLabel, state }: Props) {
  const { data, status, lastUpdated, error } = state;
  const [alertsOpen, setAlertsOpen] = useState(false);
  const isBus = mode === 'bus';
  const icon = isBus ? '🚌' : '🚇';
  const title = isBus ? `Q${route.replace('Q', '')} Bus` : `${route} Train`;
  const alerts = data?.alerts ?? [];

  return (
    <div className={`transit-card transit-card--${mode}`}>
      <div className="transit-card__header">
        <span className="transit-card__icon">{icon}</span>
        <div className="transit-card__meta">
          <h2 className="transit-card__title">{title}</h2>
          <div className="transit-card__stops">
            <span className="transit-card__stop-row">
              <span className="transit-card__stop-dot transit-card__stop-dot--from" />
              <span className="transit-card__stop-name">{stopName}</span>
            </span>
            <span className="transit-card__stop-row">
              <span className="transit-card__stop-dot transit-card__stop-dot--to" />
              <span className="transit-card__stop-name transit-card__stop-name--dim">{destinationStopName}</span>
            </span>
          </div>
          <p className="transit-card__direction">{directionLabel}</p>
        </div>
        <div className="transit-card__status">
          <StatusPill status={status} lastUpdated={lastUpdated} />
        </div>
      </div>

      <div className="transit-card__body">
        {status === 'loading' && !data && (
          <div className="transit-card__skeleton">
            <div className="skeleton-line skeleton-line--wide" />
            <div className="skeleton-line" />
          </div>
        )}

        {(status === 'error' || status === 'stale') && !data && (
          <p className="transit-card__error">
            {error ?? 'Live data temporarily unavailable.'}
            {lastUpdated && (
              <span className="transit-card__last-seen">
                {' '}Last seen at {formatTime(lastUpdated)}.
              </span>
            )}
          </p>
        )}

        {data && (
          <>
            <ArrivalList arrivals={data.arrivals} mode={mode} route={route} />

            {alerts.length > 0 && (
              <div className="transit-card__alerts-section">
                <button
                  className="transit-card__alerts-toggle"
                  onClick={() => setAlertsOpen((o) => !o)}
                  aria-expanded={alertsOpen}
                >
                  ⚠ {alerts.length} service alert{alerts.length > 1 ? 's' : ''}
                  <span className="transit-card__alerts-chevron">{alertsOpen ? '▲' : '▼'}</span>
                </button>
                {alertsOpen && (
                  <div className="transit-card__alerts">
                    {alerts.map((a, i) => (
                      <p key={i} className="transit-card__alert">{a}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {lastUpdated && status === 'ok' && (
        <p className="transit-card__footer">Updated at {formatTime(lastUpdated)}</p>
      )}
    </div>
  );
}
