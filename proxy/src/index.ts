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

// ─── GTFS-RT protobuf helpers ─────────────────────────────────────────────────
//
// Proto field reference (gtfs-realtime.proto + NYCT extensions):
//
// FeedMessage
//   entity (field 2, repeated) → FeedEntity
//     FeedEntity
//       trip_update (field 3) → TripUpdate
//       alert       (field 5) → Alert
//     TripUpdate
//       trip             (field 1) → TripDescriptor
//       stop_time_update (field 2, repeated) → StopTimeUpdate
//     TripDescriptor
//       schedule_relationship (field 4, varint): 0=SCHEDULED, 3=CANCELED
//     StopTimeUpdate
//       arrival               (field 2) → StopTimeEvent
//       departure             (field 3) → StopTimeEvent
//       stop_id               (field 4, string)
//       schedule_relationship (field 5, varint): 0=SCHEDULED, 1=SKIPPED
//     StopTimeEvent
//       time (field 2, int64/varint)
//     Alert
//       informed_entity (field 5, repeated) → EntitySelector
//       header_text     (field 10)          → TranslatedString
//     EntitySelector
//       route_id (field 5, string)
//     TranslatedString
//       translation (field 1, repeated) → Translation
//     Translation
//       text     (field 1, string)
//       language (field 2, string)

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

/** Advance pos past a field with the given wire type. */
function skipField(buf: Uint8Array, pos: number, wt: number): number {
  if (wt === 0) { const [, p] = decodeVarint(buf, pos); return p; }
  if (wt === 2) { const [l, p] = decodeVarint(buf, pos); return p + l; }
  if (wt === 5) return pos + 4;
  if (wt === 1) return pos + 8;
  return buf.length; // unknown wire type — bail out
}

/**
 * Read a length-delimited field at pos.
 * Returns [contentBytes, newPos].
 */
function readLenDelim(buf: Uint8Array, pos: number): [Uint8Array, number] {
  const [l, p] = decodeVarint(buf, pos);
  return [buf.slice(p, p + l), p + l];
}

/** Read a StopTimeEvent message and return its time field (field 2, varint). */
function readStopTimeEventTime(buf: Uint8Array): number | null {
  let pos = 0, time: number | null = null;
  while (pos < buf.length) {
    const [tag, p1] = decodeVarint(buf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (wt === 0) {
      const [v, p2] = decodeVarint(buf, pos); pos = p2;
      if (fn === 2) time = v; // time field
    } else {
      pos = skipField(buf, pos, wt);
    }
  }
  return time;
}

/** Read TripDescriptor and return schedule_relationship (field 4). 0=SCHEDULED, 3=CANCELED. */
function readTripScheduleRelationship(buf: Uint8Array): number {
  let pos = 0, rel = 0;
  while (pos < buf.length) {
    const [tag, p1] = decodeVarint(buf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (wt === 0) {
      const [v, p2] = decodeVarint(buf, pos); pos = p2;
      if (fn === 4) rel = v; // schedule_relationship
    } else {
      pos = skipField(buf, pos, wt);
    }
  }
  return rel;
}

interface StopArrival { stopId: string; timeSeconds: number; }

/**
 * Parse a GTFS-RT trip-updates feed.
 * Skips entirely canceled trips (TripDescriptor.schedule_relationship === CANCELED = 3).
 * Skips individual skipped stops (StopTimeUpdate.schedule_relationship === SKIPPED = 1).
 */
function parseGtfsRt(feedBuf: Uint8Array): StopArrival[] {
  const arrivals: StopArrival[] = [];
  let pos = 0;

  // FeedMessage top-level
  while (pos < feedBuf.length) {
    const [tag, p1] = decodeVarint(feedBuf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (fn !== 2 || wt !== 2) { pos = skipField(feedBuf, pos, wt); continue; } // only entity (field 2)

    // FeedEntity
    const [entityBuf, entityEnd] = readLenDelim(feedBuf, pos);
    pos = entityEnd;

    let epos = 0;
    while (epos < entityBuf.length) {
      const [etag, ep1] = decodeVarint(entityBuf, epos); epos = ep1;
      const efn = etag >> 3, ewt = etag & 7;
      if (efn !== 3 || ewt !== 2) { epos = skipField(entityBuf, epos, ewt); continue; } // only trip_update (field 3)

      // TripUpdate
      const [tuBuf, tuEnd] = readLenDelim(entityBuf, epos);
      epos = tuEnd;

      let tupos = 0;
      let tripCanceled = false;

      while (tupos < tuBuf.length) {
        const [ttag, tp1] = decodeVarint(tuBuf, tupos); tupos = tp1;
        const tfn = ttag >> 3, twt = ttag & 7;

        if (tfn === 1 && twt === 2) {
          // TripDescriptor (field 1) — check if this whole trip is canceled
          const [tripBuf, tp2] = readLenDelim(tuBuf, tupos); tupos = tp2;
          if (readTripScheduleRelationship(tripBuf) === 3) tripCanceled = true;

        } else if (tfn === 2 && twt === 2) {
          // stop_time_update (field 2, repeated)
          const [stuBuf, sp1] = readLenDelim(tuBuf, tupos); tupos = sp1;
          if (tripCanceled) continue; // skip all stops for canceled trips

          let stopId = '';
          let timeSeconds: number | null = null;
          let stuSchedRel = 0; // default SCHEDULED
          let sp = 0;

          while (sp < stuBuf.length) {
            const [stag, sp2] = decodeVarint(stuBuf, sp); sp = sp2;
            const sfn = stag >> 3, swt = stag & 7;
            if (swt === 2) {
              const [sub, sp3] = readLenDelim(stuBuf, sp); sp = sp3;
              if (sfn === 4) {
                stopId = new TextDecoder().decode(sub);
              } else if ((sfn === 2 || sfn === 3) && timeSeconds === null) {
                // arrival (2) or departure (3) — read StopTimeEvent.time (field 2)
                timeSeconds = readStopTimeEventTime(sub);
              }
            } else if (swt === 0) {
              const [v, sp3] = decodeVarint(stuBuf, sp); sp = sp3;
              if (sfn === 5) stuSchedRel = v; // schedule_relationship: SKIPPED = 1
            } else if (swt === 5) { sp += 4; }
            else if (swt === 1) { sp += 8; }
            else break;
          }

          // Only add if stop is not being skipped
          if (stuSchedRel !== 1 && stopId && timeSeconds !== null) {
            arrivals.push({ stopId, timeSeconds });
          }

        } else {
          tupos = skipField(tuBuf, tupos, twt);
        }
      }
    }
  }

  return arrivals;
}

// ─── Alert feed parser ────────────────────────────────────────────────────────

/** Check if an EntitySelector (field 5 of Alert) has route_id "7" or "7X". */
function entitySelectorMatchesRoute7(buf: Uint8Array): boolean {
  let pos = 0;
  while (pos < buf.length) {
    const [tag, p1] = decodeVarint(buf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (wt === 2) {
      const [sub, p2] = readLenDelim(buf, pos); pos = p2;
      if (fn === 5) { // route_id
        const routeId = new TextDecoder().decode(sub);
        if (routeId === '7' || routeId === '7X') return true;
      }
    } else {
      pos = skipField(buf, pos, wt);
    }
  }
  return false;
}

/** Read the first text string from a Translation message (text = field 1). */
function readTranslationText(buf: Uint8Array): string | null {
  let pos = 0;
  while (pos < buf.length) {
    const [tag, p1] = decodeVarint(buf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (wt === 2) {
      const [sub, p2] = readLenDelim(buf, pos); pos = p2;
      if (fn === 1) return new TextDecoder().decode(sub); // text field
    } else {
      pos = skipField(buf, pos, wt);
    }
  }
  return null;
}

/** Read the first text string from a TranslatedString message (translation = field 1). */
function readTranslatedStringText(buf: Uint8Array): string | null {
  let pos = 0;
  while (pos < buf.length) {
    const [tag, p1] = decodeVarint(buf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (wt === 2) {
      const [sub, p2] = readLenDelim(buf, pos); pos = p2;
      if (fn === 1) { // translation (repeated Translation)
        const text = readTranslationText(sub);
        if (text !== null) return text;
      }
    } else {
      pos = skipField(buf, pos, wt);
    }
  }
  return null;
}

/**
 * Parse the MTA subway-alerts GTFS-RT feed.
 * Returns human-readable header strings for alerts affecting the 7 / 7X route.
 */
function parseAlerts(feedBuf: Uint8Array): string[] {
  const alerts: string[] = [];
  let pos = 0;

  // FeedMessage top-level
  while (pos < feedBuf.length) {
    const [tag, p1] = decodeVarint(feedBuf, pos); pos = p1;
    const fn = tag >> 3, wt = tag & 7;
    if (fn !== 2 || wt !== 2) { pos = skipField(feedBuf, pos, wt); continue; } // entity (field 2)

    // FeedEntity
    const [entityBuf, entityEnd] = readLenDelim(feedBuf, pos);
    pos = entityEnd;

    let epos = 0;
    while (epos < entityBuf.length) {
      const [etag, ep1] = decodeVarint(entityBuf, epos); epos = ep1;
      const efn = etag >> 3, ewt = etag & 7;
      if (efn !== 5 || ewt !== 2) { epos = skipField(entityBuf, epos, ewt); continue; } // alert (field 5)

      // Alert
      const [alertBuf, alertEnd] = readLenDelim(entityBuf, epos);
      epos = alertEnd;

      let apos = 0;
      let affectsRoute7 = false;
      let headerText: string | null = null;

      while (apos < alertBuf.length) {
        const [atag, ap1] = decodeVarint(alertBuf, apos); apos = ap1;
        const afn = atag >> 3, awt = atag & 7;
        if (awt === 2) {
          const [sub, ap2] = readLenDelim(alertBuf, apos); apos = ap2;
          if (afn === 5) { // informed_entity (repeated EntitySelector)
            if (entitySelectorMatchesRoute7(sub)) affectsRoute7 = true;
          } else if (afn === 10 && headerText === null) { // header_text (TranslatedString)
            headerText = readTranslatedStringText(sub);
          }
        } else {
          apos = skipField(alertBuf, apos, awt);
        }
      }

      if (affectsRoute7 && headerText) {
        alerts.push(headerText);
      }
    }
  }

  return alerts;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Bus handler ──────────────────────────────────────────────────────────────

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
    raw?.Siri?.ServiceDelivery?.SituationExchangeDelivery?.[0]?.Situations?.PtSituationElement ?? [];
  const alerts = situations.flatMap((s) => s.Summary ?? []).slice(0, 2);

  return json(
    {
      mode: 'bus',
      route: 'Q32',
      stopName: cfg.stopName,
      direction: cfg.directionLabel,
      updatedAt: new Date().toISOString(),
      arrivals: arrivals.map((a) => ({
        id: a.vehicleId,
        expectedAt: a.expectedAt,
        waitMinutes: a.waitMinutes,
      })),
      alerts,
      source: 'MTA Bus Time SIRI StopMonitoring',
    },
    origin,
  );
}

// ─── Train handler ────────────────────────────────────────────────────────────

async function handleTrain(trip: Trip, env: Env, origin: string): Promise<Response> {
  const cfg = CONFIG[trip].train;

  // Fetch trip updates and service alerts in parallel.
  // The 7 train is in the combined nyct/gtfs feed (no key required as of 2026).
  // Alerts live in a separate camsys/subway-alerts feed (no key required).
  const [tripRes, alertsRes] = await Promise.all([
    fetch('https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs'),
    fetch('https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts'),
  ]);

  if (!tripRes.ok) throw new Error(`MTA subway feed error: ${tripRes.status}`);

  const buf = new Uint8Array(await tripRes.arrayBuffer());
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

  // Parse alerts — best-effort, don't fail the whole request if unavailable
  let alerts: string[] = [];
  if (alertsRes.ok) {
    try {
      const alertsBuf = new Uint8Array(await alertsRes.arrayBuffer());
      // Deduplicate and cap at 3 alerts
      const seen = new Set<string>();
      for (const a of parseAlerts(alertsBuf)) {
        if (!seen.has(a)) { seen.add(a); alerts.push(a); }
        if (alerts.length >= 3) break;
      }
    } catch {
      // Non-fatal — alerts unavailable but arrivals still returned
    }
  }

  return json(
    {
      mode: 'train',
      line: '7',
      stationName: cfg.stationName,
      direction: cfg.directionLabel,
      updatedAt: new Date().toISOString(),
      arrivals,
      alerts,
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
