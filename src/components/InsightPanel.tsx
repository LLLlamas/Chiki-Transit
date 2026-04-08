import { useState } from 'react';
import type { TransitData } from '../types/transit';
import type { TripConfig } from '../config/commute';
import { recommend, computeScores } from '../lib/recommendation';
import { filterFutureArrivals } from '../lib/format';

interface Props {
  bus: TransitData | null;
  train: TransitData | null;
  cfg: TripConfig;
}

const REC_COPY = {
  bus:         { text: 'Take the Q32 bus — it looks faster right now.', color: 'bus' },
  train:       { text: 'Take the 7 train — it looks faster right now.',  color: 'train' },
  similar:     { text: 'Both options are about the same right now.',       color: 'similar' },
  unavailable: { text: 'Not enough live data to compare right now.',       color: 'unavailable' },
};

export function InsightPanel({ bus, train, cfg }: Props) {
  const [open, setOpen] = useState(false);

  // "Which is arriving sooner" — just compares next arrival wait times
  const busWait  = filterFutureArrivals(bus?.arrivals  ?? [])[0]?.waitMinutes ?? null;
  const trainWait = filterFutureArrivals(train?.arrivals ?? [])[0]?.waitMinutes ?? null;

  let sooner: string;
  if (busWait === null && trainWait === null) {
    sooner = 'No live arrivals available.';
  } else if (busWait === null) {
    sooner = `7 train is next — in ${trainWait} min.`;
  } else if (trainWait === null) {
    sooner = `Q32 bus is next — in ${busWait} min.`;
  } else if (busWait < trainWait) {
    sooner = `Q32 bus arrives sooner — in ${busWait} min vs ${trainWait} min for the 7.`;
  } else if (trainWait < busWait) {
    sooner = `7 train arrives sooner — in ${trainWait} min vs ${busWait} min for the Q32.`;
  } else {
    sooner = `Both arriving in ${busWait} min.`;
  }

  // Full recommendation with travel time estimate
  const rec = recommend(bus, train, cfg);
  const { busScore, trainScore } = computeScores(bus, train, cfg);
  const { text: recText, color: recColor } = REC_COPY[rec];

  return (
    <div className="insight-panel">
      <button
        className="insight-panel__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="insight-panel__toggle-label">
          {open ? '▲ Hide insights' : '▼ Show insights'}
        </span>
      </button>

      {open && (
        <div className="insight-panel__body">
          {/* Which is arriving sooner */}
          <div className="insight-section">
            <p className="insight-section__heading">Which is arriving sooner?</p>
            <p className="insight-section__text">{sooner}</p>
          </div>

          {/* Full recommendation */}
          <div className={`insight-section insight-section--rec insight-section--${recColor}`}>
            <p className="insight-section__heading">Recommendation</p>
            <p className="insight-section__text">{recText}</p>
            {busScore !== null && trainScore !== null && (
              <p className="insight-section__scores">
                Bus est. {busScore} min total · Train est. {trainScore} min total
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
