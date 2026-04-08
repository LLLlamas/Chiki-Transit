import type { Arrival } from '../types/transit';
import { arrivalLabel, filterFutureArrivals } from '../lib/format';

interface Props {
  arrivals: Arrival[];
  mode: 'bus' | 'train';
  route: string;
}

export function ArrivalList({ arrivals, mode, route }: Props) {
  const future = filterFutureArrivals(arrivals).slice(0, 3);

  if (future.length === 0) {
    return <p className="arrivals__empty">No upcoming arrivals found.</p>;
  }

  return (
    <ul className="arrivals">
      {future.map((a, i) => (
        <li key={a.id} className={`arrivals__item ${i === 0 ? 'arrivals__item--next' : ''}`}>
          <span className="arrivals__badge">{mode === 'bus' ? route : route}</span>
          <span className="arrivals__label">
            {i === 0 ? 'Next ' : ''}
            {mode === 'bus' ? 'bus' : `${route} train`}{' '}
            <strong>{arrivalLabel(a.waitMinutes)}</strong>
          </span>
        </li>
      ))}
    </ul>
  );
}
