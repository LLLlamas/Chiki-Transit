# Queens Commute Checker — Coding Prompt / Instruction MD

Use this file as the implementation prompt for Cursor, Claude, or another coding assistant.

---

## Role

You are a senior frontend engineer building a very small, reliable, **mobile-first commute checker** for Queens.

Build a web app that compares **live bus arrivals** versus **live 7 train arrivals** for one regular trip, with a simple **Swap** control so the user can reverse the route.

The frontend should be deployable to **GitHub Pages**.

---

## Product goal

Help a user answer this question quickly:

> Which option should I take right now: the bus or the 7 train?

The app should show the next live arrivals for both options, compare them using a simple transparent heuristic, and recommend the better choice.

---

## Trip configuration for MVP

### Default outbound trip
- **Start:** `44-07 Greenpoint Avenue, Queens, NY`
- **Destination:** `34-05 80th St, Queens, NY`

### Required reverse trip
Add a **Swap** button that flips:
- start and destination addresses
- train origin/destination station pair
- bus origin/destination stop pair
- direction labels
- recommendation logic inputs

Do **not** build full free-form routing in MVP.
The app only needs:
1. the default outbound trip, and
2. the same trip reversed.

---

## Official live data sources to use

Use **official MTA data only**.

### Subway / 7 train
Use the official **MTA GTFS-Realtime subway feed** for the **7 line**, plus official static GTFS / station metadata as needed.

Use the current official MTA developer resources page to get the latest subway realtime feed URL and any related GTFS references.

### Bus
Use official **MTA Bus Time** data.

For realtime arrivals, use:
- **SIRI StopMonitoring**

For stop discovery / metadata, use:
- **MTA Bus Time OneBusAway-style discovery API**

Important:
- Bus Time requires an **API key**.
- Do **not** expose that key in GitHub Pages frontend code.
- Put Bus Time requests behind a tiny proxy/serverless function.

---

## Best default route assumptions for this MVP

These are the default route assumptions to implement first.
Structure the code so they are easy to change from one config file.

### Train option
Use the **7 train**.

#### Outbound default
- Origin station: **46 St–Bliss St**
- Destination station: **82 St–Jackson Hts**

#### Reverse default
- Origin station: **82 St–Jackson Hts**
- Destination station: **46 St–Bliss St**

Note:
- Keep support for an alternate destination station such as **90 St–Elmhurst Av** in config, but default to **82 St–Jackson Hts** for this trip.

### Bus option
Use **Q32** as the primary bus option for this address pair.

Suggested default stop pairs to validate and then lock into config:

#### Outbound default
- Bus route: **Q32**
- Origin-side stop candidate: **Queens Blvd / 46 St**
- Destination-side stop candidate: **81 St / 34 Av**

#### Reverse default
- Bus route: **Q32**
- Origin-side stop candidate: **82 St / 34 Av** or nearest valid westbound stop
- Destination-side stop candidate: **Queens Blvd / 45 St** or nearest valid westbound stop

Important:
- Resolve and store the **real stop IDs** using the official Bus Time discovery API before finalizing the app.
- Stop names above are working assumptions for MVP, not final truth.
- Keep everything config-driven so stop IDs and stop names can be corrected without rewriting the app.

---

## Why Q32 should be the default bus for this version

For the updated destination, Q32 is a better default than Q60 because it serves:
- the origin corridor near **Queens Blvd / 45–46 St**, and
- the destination corridor near **81–82 St / 34 Av / Northern Blvd**.

Keep the bus implementation generic enough that another route like **Q60** could be added later as an alternate comparison, but MVP should focus on **Q32 vs 7 train**.

---

## Core MVP features

### Main screen
Show a simple phone-friendly screen with:
- app title
- the active start and destination addresses
- a **Swap** button
- a **Refresh** button
- last updated timestamp
- two comparison cards:
  - **Bus**
  - **7 Train**
- a recommendation panel at the top

### Bus card
Show:
- route name, for example `Q32`
- direction text
- origin stop name
- next 2 or 3 live arrivals
- wait minutes for each arrival
- service alert summary if available
- loading / error / stale-data state

### Train card
Show:
- line name, for example `7`
- direction text
- origin station name
- next 2 or 3 live arrivals
- wait minutes for each arrival
- service alert summary if available
- loading / error / stale-data state

### Recommendation panel
Display one of:
- **Take the bus now**
- **Take the 7 now**
- **They are about the same right now**
- **One source is unavailable — check the card details**

---

## Required behavior

### 1) Auto refresh
- Poll every **30 seconds**.
- Also support manual refresh.

### 2) Swap trip direction
The **Swap** button must instantly flip the route assumptions:
- outbound config <-> reverse config
- card labels
- direction text
- recommendation inputs

The swap action should not require a page reload.

### 3) Simple recommendation logic
Use a transparent heuristic, not a black box.

For MVP, compute:

```text
bus_score = walk_to_bus_origin + next_bus_wait + bus_in_vehicle_baseline + walk_from_bus_stop
train_score = walk_to_train_origin + next_train_wait + train_in_vehicle_baseline + walk_from_station
```

Recommended default heuristics:

```text
bus_in_vehicle_baseline = 18 to 24 minutes
train_in_vehicle_baseline = 9 to 14 minutes
```

Use fixed constants for MVP.

Recommendation rule:
- if one option is ahead by **4 or more minutes**, recommend it
- otherwise say they are about the same

### 4) Clear status handling
Handle these states cleanly:
- loading
- partial data available
- realtime source unavailable
- zero arrivals returned
- stale data timestamp

### 5) Persist UI state
Use `localStorage` for:
- current trip direction (outbound or reverse)
- optional last successful data snapshot timestamp

---

## Architecture requirements

### Frontend
Use:
- **React**
- **Vite**
- **TypeScript**
- simple CSS or CSS modules
- no heavy UI framework unless absolutely necessary

Keep the frontend static so it can deploy cleanly to **GitHub Pages**.

### Realtime proxy
Use a tiny backend only where necessary.

Recommended:
- **Cloudflare Worker**, **Netlify Function**, or **Vercel Function**

The proxy should:
- hold the Bus Time API key securely
- request realtime bus arrivals from **SIRI StopMonitoring**
- optionally normalize subway GTFS-RT into simpler JSON
- return only the small JSON payload the app needs

---

## Strong recommendation on implementation shape

### Preferred split
#### Frontend responsibilities
- render UI
- poll proxy endpoints
- run recommendation logic
- handle swap state
- handle loading/error/stale states

#### Proxy responsibilities
- bus API key handling
- bus realtime fetch + normalization
- optional subway feed fetch + normalization
- service alert extraction when available
- cache responses briefly, for example 10–15 seconds

---

## Suggested project structure

```text
/src
  /components
    Header.tsx
    RecommendationCard.tsx
    TransitCard.tsx
    ArrivalList.tsx
    StatusPill.tsx
  /lib
    api.ts
    recommendation.ts
    time.ts
    format.ts
  /config
    commute.ts
  /types
    transit.ts
  App.tsx
  main.tsx
```

If you also build a proxy in the same repo, add:

```text
/proxy
  bus.ts
  train.ts
  utils.ts
```

---

## Config-first design

Create one config file that controls the whole trip.

Example shape:

```ts
export const COMMUTE_CONFIG = {
  refreshMs: 30000,

  outbound: {
    startAddress: '44-07 Greenpoint Avenue, Queens, NY',
    destinationAddress: '34-05 80th St, Queens, NY',

    bus: {
      route: 'Q32',
      originStopName: 'Queens Blvd / 46 St',
      originStopId: 'FILL_ME_FROM_OFFICIAL_DISCOVERY_API',
      destinationStopName: '81 St / 34 Av',
      destinationStopId: 'FILL_ME_FROM_OFFICIAL_DISCOVERY_API',
      directionLabel: 'toward Jackson Heights',
    },

    train: {
      line: '7',
      originStationName: '46 St–Bliss St',
      originStopId: 'FILL_ME_FROM_GTFS',
      destinationStationName: '82 St–Jackson Hts',
      destinationStopId: 'FILL_ME_FROM_GTFS',
      directionLabel: 'Flushing-bound / eastbound',
    },

    walkingAssumptionsMinutes: {
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
      originStopName: '82 St / 34 Av',
      originStopId: 'FILL_ME_FROM_OFFICIAL_DISCOVERY_API',
      destinationStopName: 'Queens Blvd / 45 St',
      destinationStopId: 'FILL_ME_FROM_OFFICIAL_DISCOVERY_API',
      directionLabel: 'toward Penn Station / westbound Queens segment',
    },

    train: {
      line: '7',
      originStationName: '82 St–Jackson Hts',
      originStopId: 'FILL_ME_FROM_GTFS',
      destinationStationName: '46 St–Bliss St',
      destinationStopId: 'FILL_ME_FROM_GTFS',
      directionLabel: 'Manhattan-bound / westbound',
    },

    walkingAssumptionsMinutes: {
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
};
```

---

## Proxy response contracts

Keep the frontend simple by normalizing data server-side.

### `/api/bus?trip=outbound`
Return JSON like:

```json
{
  "mode": "bus",
  "route": "Q32",
  "stopName": "Queens Blvd / 46 St",
  "direction": "toward Jackson Heights",
  "updatedAt": "2026-04-08T12:00:00Z",
  "arrivals": [
    {
      "vehicleId": "1234",
      "expectedAt": "2026-04-08T12:04:00Z",
      "waitMinutes": 4
    },
    {
      "vehicleId": "5678",
      "expectedAt": "2026-04-08T12:12:00Z",
      "waitMinutes": 12
    }
  ],
  "alerts": [],
  "source": "MTA Bus Time SIRI StopMonitoring"
}
```

### `/api/train?trip=outbound`
Return JSON like:

```json
{
  "mode": "train",
  "line": "7",
  "stationName": "46 St–Bliss St",
  "direction": "Flushing-bound / eastbound",
  "updatedAt": "2026-04-08T12:00:00Z",
  "arrivals": [
    {
      "tripId": "abc",
      "expectedAt": "2026-04-08T12:03:00Z",
      "waitMinutes": 3
    },
    {
      "tripId": "def",
      "expectedAt": "2026-04-08T12:08:00Z",
      "waitMinutes": 8
    }
  ],
  "alerts": [],
  "source": "MTA Subway GTFS-Realtime"
}
```

---

## UI/UX rules

- mobile-first
- clean card layout
- large readable arrival countdowns
- strong visual hierarchy
- avoid clutter
- do not over-engineer animations
- one-screen experience first
- make the **Swap** button prominent

### Nice UI copy examples
- `Next bus in 4 min`
- `Next 7 train in 3 min`
- `Bus is slightly better right now`
- `7 train is faster right now`
- `Both options look similar`
- `Live bus data temporarily unavailable`

---

## Error handling requirements

If the bus source fails:
- still render the train card
- show a warning on the bus card
- do not crash recommendation logic

If the train source fails:
- still render the bus card
- show a warning on the train card

If both fail:
- show a clean retry state
- show last successful update time if available

---

## Build priorities

### Phase 1
- scaffold React + Vite + TypeScript app
- create config-driven outbound/reverse trip model
- build swap behavior
- build static UI shell

### Phase 2
- build proxy endpoint for bus realtime
- normalize SIRI StopMonitoring into simple JSON
- render bus arrivals

### Phase 3
- build subway realtime adapter for the 7 train
- normalize GTFS-RT into simple JSON
- render train arrivals

### Phase 4
- add recommendation logic
- add stale/error states
- polish for phone screens
- deploy frontend to GitHub Pages

---

## Acceptance criteria

The app is done when all of the following are true:

1. The user opens the app on a phone and immediately sees:
   - start address
   - destination address
   - bus card
   - train card
   - recommendation

2. The app can switch between:
   - `44-07 Greenpoint Avenue -> 34-05 80th St`
   - `34-05 80th St -> 44-07 Greenpoint Avenue`

3. The app shows live arrivals from official MTA sources for:
   - **Q32** bus
   - **7** train

4. The app refreshes automatically every 30 seconds.

5. The app is safe to deploy with GitHub Pages because the Bus Time API key is not exposed in the browser bundle.

6. All stop IDs and station IDs are defined in config and easy to replace.

---

## Important implementation notes

- Use **official current MTA developer docs**, not old blog posts or unofficial wrappers.
- Validate all stop IDs before shipping.
- Keep stop/station logic data-driven.
- Prefer simple code over clever code.
- Do not add account systems, maps, or databases in MVP.
- Do not add arbitrary origin/destination search in MVP.
- The only route change feature required now is **Swap**.

---

## Official references to consult during implementation

Use these official MTA resources while coding:

- MTA Developer Resources
- MTA Subway GTFS-Realtime feeds
- MTA static GTFS data
- MTA Bus Time SIRI StopMonitoring docs
- MTA Bus Time OneBusAway discovery API docs
- Official 7 line map / station list
- Official Q32 route / stop documentation

---

## Final instruction to the coding assistant

Build the smallest reliable version first.

Start with:
1. config
2. swap behavior
3. UI shell
4. normalized mock data
5. real proxy integration
6. deployment polish

Return production-ready code with clean file structure, strongly typed interfaces, and concise comments only where necessary.
