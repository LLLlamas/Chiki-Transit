import type { TransitState } from '../types/transit';
import { ArrivalList } from './ArrivalList';
import { StatusPill } from './StatusPill';
import { relativeLabel } from '../lib/time';

interface Props {
  mode: 'bus' | 'train';
  route: string;
  stopName: string;
  directionLabel: string;
  state: TransitState;
}

export function TransitCard({ mode, route, stopName, directionLabel, state }: Props) {
  const { data, status, lastUpdated, error } = state;
  const isBus = mode === 'bus';
  const icon = isBus ? '🚌' : '🚇';
  const title = isBus ? `Q${route.replace('Q', '')} Bus` : `${route} Train`;

  return (
    <div className={`transit-card transit-card--${mode}`}>
      <div className="transit-card__header">
        <span className="transit-card__icon">{icon}</span>
        <div>
          <h2 className="transit-card__title">{title}</h2>
          <p className="transit-card__stop">{stopName}</p>
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
                {' '}Last seen {relativeLabel(lastUpdated)}.
              </span>
            )}
          </p>
        )}

        {data && (
          <>
            <ArrivalList arrivals={data.arrivals} mode={mode} route={route} />
            {data.alerts.length > 0 && (
              <div className="transit-card__alerts">
                {data.alerts.map((a, i) => (
                  <p key={i} className="transit-card__alert">
                    ⚠ {a}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {lastUpdated && status === 'ok' && (
        <p className="transit-card__footer">Updated {relativeLabel(lastUpdated)}</p>
      )}
    </div>
  );
}
