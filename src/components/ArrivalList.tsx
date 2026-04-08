import type { Arrival } from '../types/transit';
import { arrivalLabel, filterFutureArrivals } from '../lib/format';
import { formatTime } from '../lib/time';

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

  const label = mode === 'bus' ? route : `${route} train`;

  return (
    <ul className="arrivals">
      {future.map((a, i) => (
        <li key={a.id} className={`arrivals__item ${i === 0 ? 'arrivals__item--next' : ''}`}>
          <span className="arrivals__badge">{label}</span>
          <span className="arrivals__wait">{arrivalLabel(a.waitMinutes)}</span>
          <span className="arrivals__clock">arrives {formatTime(a.expectedAt)}</span>
        </li>
      ))}
    </ul>
  );
}
