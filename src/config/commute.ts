// ─── Chiki Transit — trip configuration ────────────────────────────────────
//
// All stop IDs and walk/ride estimates live here.
// To fix a stop ID, change it in this one file — nothing else needs to change.
//
// 7 train GTFS stop IDs (from MTA static GTFS stops.txt):
//   714  = 46 St-Bliss St
//   709  = 82 St-Jackson Hts
//   708  = 90 St-Elmhurst Av  (alternate destination, not used in MVP)
//
//   GTFS-RT direction suffix: N = Manhattan-bound, S = Flushing-bound
//   So "714S" = 46 St-Bliss St platform toward Flushing
//      "709N" = 82 St-Jackson Hts platform toward Manhattan
//
// Q32 bus stop IDs (MTA Bus Time format — agency: MTABC, not MTA NYCT):
//   Resolved via stops-for-location API on 2026-04-08.
//   Outbound origin:      MTA_503300  QUEENS BLVD/46 ST      dir: E
//   Outbound destination: MTA_503576  82 ST/35 AV            dir: S
//   Reverse origin:       MTA_700925  81 ST/35 AV            dir: N
//   Reverse destination:  MTA_503331  QUEENS BLVD/45 ST      dir: W
//
// Proxy endpoint (Cloudflare Worker — set after deploying proxy):
//   Update PROXY_BASE_URL below with your deployed worker URL.

export const PROXY_BASE_URL: string =
  import.meta.env.VITE_PROXY_URL || 'https://chiki-transit-proxy.lorenzoleollamas.workers.dev';

export const COMMUTE_CONFIG = {
  refreshMs: 30_000,

  outbound: {
    startAddress: '44-07 Greenpoint Avenue, Queens, NY',
    destinationAddress: '34-05 80th St, Queens, NY',

    bus: {
      route: 'Q32',
      originStopName: 'Queens Blvd / 46 St',
      originStopId: 'MTA_503300',
      destinationStopName: '82 St / 35 Av',
      destinationStopId: 'MTA_503576',
      directionLabel: 'toward Jackson Heights',
    },

    train: {
      line: '7',
      originStationName: '46 St–Bliss St',
      // GTFS stop ID 714 + direction suffix S (Flushing-bound)
      originStopId: '714S',
      destinationStationName: '82 St–Jackson Hts',
      destinationStopId: '709S',
      directionLabel: 'Flushing-bound / eastbound',
    },

    walkingMinutes: {
      toBusOrigin: 6,
      fromBusDestination: 2,
      toTrainOrigin: 7,
      fromTrainDestination: 4,
    },

    baselineRideMinutes: {
      bus: 21,
      train: 11,
    },
  },

  reverse: {
    startAddress: '34-05 80th St, Queens, NY',
    destinationAddress: '44-07 Greenpoint Avenue, Queens, NY',

    bus: {
      route: 'Q32',
      originStopName: '81 St / 35 Av',
      originStopId: 'MTA_700925',
      destinationStopName: 'Queens Blvd / 45 St',
      destinationStopId: 'MTA_503331',
      directionLabel: 'toward Penn Station / westbound',
    },

    train: {
      line: '7',
      originStationName: '82 St–Jackson Hts',
      // GTFS stop ID 709 + direction suffix N (Manhattan-bound)
      originStopId: '709N',
      destinationStationName: '46 St–Bliss St',
      destinationStopId: '714N',
      directionLabel: 'Manhattan-bound / westbound',
    },

    walkingMinutes: {
      toBusOrigin: 2,
      fromBusDestination: 6,
      toTrainOrigin: 4,
      fromTrainDestination: 7,
    },

    baselineRideMinutes: {
      bus: 21,
      train: 11,
    },
  },
} as const;

export interface TripConfig {
  startAddress: string;
  destinationAddress: string;
  bus: {
    route: string;
    originStopName: string;
    originStopId: string;
    destinationStopName: string;
    destinationStopId: string;
    directionLabel: string;
  };
  train: {
    line: string;
    originStationName: string;
    originStopId: string;
    destinationStationName: string;
    destinationStopId: string;
    directionLabel: string;
  };
  walkingMinutes: {
    toBusOrigin: number;
    fromBusDestination: number;
    toTrainOrigin: number;
    fromTrainDestination: number;
  };
  baselineRideMinutes: {
    bus: number;
    train: number;
  };
}
