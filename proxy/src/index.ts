/**
 * Chiki Transit — Cloudflare Worker Proxy
 *
 * Endpoints:
 *   GET /api/bus?trip=outbound   → normalized bus arrivals JSON
 *   GET /api/bus?trip=reverse
 *   GET /api/train?trip=outbound → normalized train arrivals JSON
 *   GET /api/train?trip=reverse
 *
 * Secrets (set via `wrangler secret put`):
 *   BUS_TIME_API_KEY   — MTA Bus Time developer key
 *   MTA_SUBWAY_API_KEY — MTA developer portal key (for GTFS-RT feeds)
 */

// ─── Stop / station config ──────────────────────────────────────────────────
// Mirror of src/config/commute.ts. Keep in sync.

// Stop IDs resolved via MTA Bus Time stops-for-location API on 2026-04-08.
// Q32 is operated by MTABC (MTA Bus Company), not MTA NYCT.
const CONFIG = {
  outbound: {
    bus: {
      route: 'MTABC_Q32',
      stopId: 'MTA_503300',   // QUEENS BLVD/46 ST, eastbound
      stopName: 'Queens Blvd / 46 St',
      directionLabel: 'toward Jackson Heights',
    },
    train: {
      stopId: '714S',         // 46 St-Bliss St, Flushing-bound
      stationName: '46 St–Bliss St',
      directionLabel: 'Flushing-bound / eastbound',
    },
  },
  reverse: {
    bus: {
      route: 'MTABC_Q32',
      stopId: 'MTA_700925',   // 81 ST/35 AV, northbound (toward Penn Station)
      stopName: '81 St / 35 Av',
      directionLabel: 'toward Penn Station / westbound',
    },
    train: {
      stopId: '709N',         // 82 St-Jackson Hts, Manhattan-bound
      stationName: '82 St–Jackson Hts',
      directionLabel: 'Manhattan-bound / westbound',
    },
  },
} as const;

type Trip = 'outbound' | 'reverse';

// ─── Env interface ──────────────────────────────────────────────────────────

interface Env {
  BUS_TIME_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

// ─── GTFS-RT protobuf parser ─────────────────────────────────────────────────
//
// Proto field reference (gtfs-realtime.proto):
//   FeedMessage
//     entity (field 2, repeated message)
//       FeedEntity
//         trip_update (field 3, message)
//           TripUpdate
//             stop_time_update (field 2, repeated message)
//               StopTimeUpdate
//                 arrival   (field 2, message) → StopTimeEvent.time (field 2, int64)
//                 departure (field 3, message) → StopTimeEvent.time (field 2, int64)
//                 stop_id   (field 4, string)

function decodeVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0, shift = 0;
  while (pos < buf.length) {
    const b = buf[pos++];
    result |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) break;
  }
  return [result, pos];
}

/** Read a StopTimeEvent message and return its time field (field 2). */
function readStopTimeEventTime(buf: Uint8Array): number | null {
  let pos = 0, time: number | null = null;
  while (pos < buf.length) {
    const [tag, p1] = decodeVarint(buf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (wt === 0) {
      const [v, p2] = decodeVarint(buf, pos); pos = p2;
      if (fn === 2) time = v; // time field
    } else if (wt === 2) {
      const [l, p2] = decodeVarint(buf, pos); pos = p2 + l;
    } else if (wt === 5) { pos += 4; }
    else if (wt === 1) { pos += 8; }
    else break;
  }
  return time;
}

interface StopArrival { stopId: string; timeSeconds: number; }

/** Extract all stop arrivals from the GTFS-RT binary feed. */
function parseGtfsRt(feedBuf: Uint8Array): StopArrival[] {
  const arrivals: StopArrival[] = [];
  let pos = 0;

  function skipField(wt: number) {
    if (wt === 0) { const [, p] = decodeVarint(feedBuf, pos); pos = p; }
    else if (wt === 2) { const [l, p] = decodeVarint(feedBuf, pos); pos = p + l; }
    else if (wt === 5) { pos += 4; }
    else if (wt === 1) { pos += 8; }
  }

  // FeedMessage top-level
  while (pos < feedBuf.length) {
    const [tag, p1] = decodeVarint(feedBuf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (fn !== 2 || wt !== 2) { skipField(wt); continue; } // only entity (field 2)

    const [entityLen, p2] = decodeVarint(feedBuf, pos); pos = p2;
    const entityEnd = pos + entityLen;

    // FeedEntity — scan for trip_update (field 3)
    while (pos < entityEnd) {
      const [etag, ep1] = decodeVarint(feedBuf, pos); pos = ep1;
      const efn = etag >> 3, ewt = etag & 7;
      if (efn !== 3 || ewt !== 2) {
        if (ewt === 2) { const [l, p] = decodeVarint(feedBuf, pos); pos = p + l; }
        else if (ewt === 0) { const [, p] = decodeVarint(feedBuf, pos); pos = p; }
        else if (ewt === 5) pos += 4;
        else if (ewt === 1) pos += 8;
        continue;
      }

      const [tuLen, tp1] = decodeVarint(feedBuf, pos); pos = tp1;
      const tuEnd = pos + tuLen;

      // TripUpdate — scan for stop_time_update (field 2)
      while (pos < tuEnd) {
        const [ttag, tp2] = decodeVarint(feedBuf, pos); pos = tp2;
        const tfn = ttag >> 3, twt = ttag & 7;
        if (tfn !== 2 || twt !== 2) {
          if (twt === 2) { const [l, p] = decodeVarint(feedBuf, pos); pos = p + l; }
          else if (twt === 0) { const [, p] = decodeVarint(feedBuf, pos); pos = p; }
          else if (twt === 5) pos += 4;
          else if (twt === 1) pos += 8;
          continue;
        }

        const [stuLen, sp1] = decodeVarint(feedBuf, pos); pos = sp1;
        const stuEnd = pos + stuLen;
        const stuBuf = feedBuf.slice(pos, stuEnd);
        pos = stuEnd;

        // StopTimeUpdate — read arrival (field 2), departure (field 3), stop_id (field 4)
        let stopId = '';
        let timeSeconds: number | null = null;
        let sp = 0;

        while (sp < stuBuf.length) {
          const [stag, sp2] = decodeVarint(stuBuf, sp); sp = sp2;
          const sfn = stag >> 3, swt = stag & 7;
          if (swt === 2) {
            const [sl, sp3] = decodeVarint(stuBuf, sp); sp = sp3;
            const sub = stuBuf.slice(sp, sp + sl); sp += sl;
            if (sfn === 4) {
              stopId = new TextDecoder().decode(sub);
            } else if ((sfn === 2 || sfn === 3) && timeSeconds === null) {
              // arrival (2) or departure (3) — read StopTimeEvent.time (field 2)
              timeSeconds = readStopTimeEventTime(sub);
            }
          } else if (swt === 0) { const [, sp3] = decodeVarint(stuBuf, sp); sp = sp3; }
          else if (swt === 5) sp += 4;
          else if (swt === 1) sp += 8;
          else break;
        }

        if (stopId && timeSeconds !== null) arrivals.push({ stopId, timeSeconds });
      }

      pos = tuEnd;
    }

    pos = entityEnd;
  }

  return arrivals;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data: unknown, origin: string, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ─── Bus handler ─────────────────────────────────────────────────────────────

async function handleBus(trip: Trip, env: Env, origin: string): Promise<Response> {
  const cfg = CONFIG[trip].bus;

  const url =
    `https://bustime.mta.info/api/siri/stop-monitoring.json` +
    `?key=${env.BUS_TIME_API_KEY}` +
    `&MonitoringRef=${encodeURIComponent(cfg.stopId)}` +
    `&LineRef=${encodeURIComponent(cfg.route)}` +
    `&MaximumStopVisits=3`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bus Time API error: ${res.status}`);

  const raw = (await res.json()) as {
    Siri?: {
      ServiceDelivery?: {
        StopMonitoringDelivery?: Array<{
          MonitoredStopVisit?: Array<{
            MonitoredVehicleJourney?: {
              VehicleRef?: string;
              MonitoredCall?: {
                ExpectedArrivalTime?: string;
              };
            };
          }>;
        }>;
        SituationExchangeDelivery?: Array<{
          Situations?: {
            PtSituationElement?: Array<{ Summary?: string[] }>;
          };
        }>;
      };
    };
  };

  const visits =
    raw?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];

  const now = Date.now();
  const arrivals = visits
    .map((v) => {
      const expectedAt = v.MonitoredVehicleJourney?.MonitoredCall?.ExpectedArrivalTime ?? '';
      const vehicleId = v.MonitoredVehicleJourney?.VehicleRef ?? 'unknown';
      const waitMinutes = expectedAt
        ? Math.round((new Date(expectedAt).getTime() - now) / 60_000)
        : -999;
      return { vehicleId, expectedAt, waitMinutes };
    })
    .filter((a) => a.waitMinutes >= 0)
    .slice(0, 3);

  const situations =
    raw?.Siri?.ServiceDelivery?.SituationExchangeDelivery?.[0]?.Situations?.PtSituationElement ??
    [];
  const alerts = situations.flatMap((s) => s.Summary ?? []).slice(0, 2);

  return json(
    {
      mode: 'bus',
      route: 'Q32',
      stopName: cfg.stopName,
      direction: cfg.directionLabel,
      updatedAt: new Date().toISOString(),
      arrivals: arrivals.map((a) => ({ id: a.vehicleId, expectedAt: a.expectedAt, waitMinutes: a.waitMinutes })),
      alerts,
      source: 'MTA Bus Time SIRI StopMonitoring',
    },
    origin,
  );
}

// ─── Train handler ────────────────────────────────────────────────────────────

async function handleTrain(trip: Trip, env: Env, origin: string): Promise<Response> {
  const cfg = CONFIG[trip].train;

  // Feed list: https://api.mta.info/#/subwayRealTimeFeeds
  // The 7 train is in the combined BDFM/NQRW/1-7 feed (nyct/gtfs).
  // No API key required as of 2026.
  const feedUrl =
    'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs';

  const res = await fetch(feedUrl);
  if (!res.ok) throw new Error(`MTA subway feed error: ${res.status}`);

  const buf = new Uint8Array(await res.arrayBuffer());
  const allArrivals = parseGtfsRt(buf);

  const now = Date.now();
  const targetStopId = cfg.stopId; // e.g. "714S"

  const arrivals = allArrivals
    .filter((a) => a.stopId === targetStopId)
    .map((a) => {
      const ms = a.timeSeconds * 1_000;
      return {
        id: String(a.timeSeconds),
        expectedAt: new Date(ms).toISOString(),
        waitMinutes: Math.round((ms - now) / 60_000),
      };
    })
    .filter((a) => a.waitMinutes >= 0)
    .sort((a, b) => a.waitMinutes - b.waitMinutes)
    .slice(0, 3);

  return json(
    {
      mode: 'train',
      line: '7',
      stationName: cfg.stationName,
      direction: cfg.directionLabel,
      updatedAt: new Date().toISOString(),
      arrivals,
      alerts: [],
      source: 'MTA Subway GTFS-Realtime',
    },
    origin,
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN ?? '*';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const trip = (url.searchParams.get('trip') ?? 'outbound') as Trip;
    if (trip !== 'outbound' && trip !== 'reverse') {
      return json({ error: 'trip must be outbound or reverse' }, origin, 400);
    }

    try {
      if (url.pathname === '/api/bus') return await handleBus(trip, env, origin);
      if (url.pathname === '/api/train') return await handleTrain(trip, env, origin);
      return json({ error: 'Not found' }, origin, 404);
    } catch (err) {
      console.error(err);
      return json({ error: String(err) }, origin, 502);
    }
  },
};
