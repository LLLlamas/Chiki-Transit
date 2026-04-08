import type { TransitData, Recommendation } from '../types/transit';
import type { TripConfig } from '../config/commute';

// If one option is faster by this many minutes, recommend it.
const THRESHOLD_MINUTES = 4;

interface Scores {
  busScore: number | null;
  trainScore: number | null;
}

export function computeScores(
  bus: TransitData | null,
  train: TransitData | null,
  cfg: TripConfig,
): Scores {
  const busWait = bus?.arrivals[0]?.waitMinutes ?? null;
  const trainWait = train?.arrivals[0]?.waitMinutes ?? null;

  const busScore =
    busWait !== null
      ? cfg.walkingMinutes.toBusOrigin +
        busWait +
        cfg.baselineRideMinutes.bus +
        cfg.walkingMinutes.fromBusDestination
      : null;

  const trainScore =
    trainWait !== null
      ? cfg.walkingMinutes.toTrainOrigin +
        trainWait +
        cfg.baselineRideMinutes.train +
        cfg.walkingMinutes.fromTrainDestination
      : null;

  return { busScore, trainScore };
}

export function recommend(
  bus: TransitData | null,
  train: TransitData | null,
  cfg: TripConfig,
): Recommendation {
  const { busScore, trainScore } = computeScores(bus, train, cfg);

  if (busScore === null && trainScore === null) return 'unavailable';
  if (busScore === null) return 'train';
  if (trainScore === null) return 'bus';

  const diff = busScore - trainScore;
  if (diff >= THRESHOLD_MINUTES) return 'train';
  if (diff <= -THRESHOLD_MINUTES) return 'bus';
  return 'similar';
}
