import type { Recommendation, TransitData } from '../types/transit';
import type { TripConfig } from '../config/commute';
import { computeScores } from '../lib/recommendation';

interface Props {
  recommendation: Recommendation;
  bus: TransitData | null;
  train: TransitData | null;
  cfg: TripConfig;
}

const COPY: Record<Recommendation, { headline: string; detail: string }> = {
  bus: {
    headline: 'Take the bus now',
    detail: 'The Q32 looks faster for this trip.',
  },
  train: {
    headline: 'Take the 7 train now',
    detail: 'The 7 train looks faster for this trip.',
  },
  similar: {
    headline: 'Both options look similar',
    detail: 'Pick whichever you prefer — they are about the same right now.',
  },
  unavailable: {
    headline: 'Check the cards below',
    detail: 'One or more live sources are unavailable.',
  },
};

export function RecommendationCard({ recommendation, bus, train, cfg }: Props) {
  const { headline, detail } = COPY[recommendation];
  const { busScore, trainScore } = computeScores(bus, train, cfg);

  return (
    <div className={`rec-card rec-card--${recommendation}`}>
      <p className="rec-card__headline">{headline}</p>
      <p className="rec-card__detail">{detail}</p>
      {busScore !== null && trainScore !== null && (
        <div className="rec-card__scores">
          <span>Bus est. {busScore} min</span>
          <span className="rec-card__scores-sep">·</span>
          <span>Train est. {trainScore} min</span>
        </div>
      )}
    </div>
  );
}
