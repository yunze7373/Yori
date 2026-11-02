# D1b device log: surface E on the owner's Android phone (op8t)

Device: OnePlus 8T (IN2011), Android 13, Chrome. Reached with `ssh op8t` (Termux, root via `su -c`).
Run: 2026-11-03 06:09–06:20 JST. No coordinates and no venue names are recorded here; the raw
captures stay in gitignored `.yori-runtime/device-evidence/`.

## Setup
- Mac: shipping build (`vite build`), served with `vite preview` on Mac port **4294** with the keyless
  trio at its shipped default (ON) and `DEV_DEVICE_TESTING` unset. Mac port 4174 was held by an
  unrelated older preview (pid 52907, left untouched).
- Forward: `ssh -N -R 4174:localhost:4294 op8t`. The phone opens `http://localhost:4174`, so every
  request carries `Host: localhost:4174` and passes the loopback allowlist (4173/4174/5173).
- Phone actions: wake keyevent, `am start` Chrome at the URL, `input tap`/`swipe`, `screencap`,
  `uiautomator dump` (temp files deleted). No settings changed, no apps installed, no keys on the device.
  Location permission granted **Only this time** (仅此一次), so nothing was remembered.

## Results
| Check | Result |
|---|---|
| `window.isSecureContext` on `http://localhost:4174` (phone Chrome) | **true** (`01-device-secure-context-200s.png`) |
| `'geolocation' in navigator`, permission state before consent | true, `prompt` |
| `/api/weather/status`, `/api/places/status`, `/api/route/status`, `/api/calendar/status`, `/api/xmemo/status` from the phone | **HTTP 200** each (no 403); weather/places/route `enabled=true` |
| `curl http://localhost:4174{/, /api/*/status}` from Termux on the phone | 200 for all 7 paths |
| Header before consent | `Weather unavailable · Location not shared` (no weather request sent) |
| Consent copy on device | lists `overpass-api.de/api/interpreter (nearby places), router.project-osrm.org (driving routes), routing.openstreetmap.de/routed-foot (walking routes), api.open-meteo.com (weather)` |
| Tap **Use My Location** | **native Chrome geolocation prompt appeared** ("http://localhost:4174 想使用您设备的位置信息", precise/approximate) (`02-device-geolocation-prompt.png`) |
| After **Only this time** | `WEATHER NEAR YOU · Cloudy · <temp> · Open-Meteo · near you · as of 6:00 AM`, later refreshed to `as of 6:15 AM`; header `Cloudy · Location shared` (`03-device-weather-near-you.png`). Live Open-Meteo call, free, keyless |
| Tap **Nearby now** | **BLOCKED by provider latency**: the public Overpass flagship answered 502 or exceeded the plan's 8 s timeout on every try. The card now says `Nearby search failed · OpenStreetMap Overpass did not answer · try again` (`04-device-nearby-overpass-failed-honest.png`); a tap inside the 10 s interval says `Searched moments ago · try again in a few seconds`. Zero venues invented |
| After stop | forward and preview stopped; phone `localhost:4174` unreachable |

## Overpass diagnosis (Mac, public Shinjuku fixture point, no owner coordinates)
- Proxy `/api/places`: `HTTP 500 Overpass API responded with HTTP 502` (twice) and `This operation was aborted` at exactly 8.0 s (twice).
- Direct minimal query to `https://overpass-api.de/api/interpreter` (`around:300`, `out 3`): HTTP 200 with time-to-first-byte **28.4 s**.
- Conclusion: reachable but queue-bound far beyond the 8 s cap pinned by the plan (§6(a)). The decision on the timeout or a fallback is with the Reviewer (options sent on the review thread).

Paid calls: none (ledger 22). Google, model and Baseten were not called.
