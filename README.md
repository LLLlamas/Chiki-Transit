# Chiki Transit

Chiki Transit compares live Q32 bus arrivals against live 7 train arrivals for a Queens commute.

## API wiring

- Subway realtime reference docs: https://api.mta.info/#/subwayRealTimeFeeds
- 7 train feed used by the Worker: `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-7`
- Bus realtime endpoint used by the Worker: `https://bustime.mta.info/api/siri/stop-monitoring.json`

## Local Worker secrets

For local Cloudflare Worker development, Wrangler reads `proxy/.dev.vars`.

- `BUS_TIME_API_KEY` has been populated locally in `proxy/.dev.vars`
- `MTA_SUBWAY_API_KEY` still needs a valid subway/developer key if you want live train data through the Worker
