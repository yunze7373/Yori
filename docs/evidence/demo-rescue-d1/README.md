# D1-LOCATION-WEATHER evidence (DEMO_RESCUE plan)

Produced by `tests/e2e-live/live-weather-fix.spec.ts` with `UPDATE_EVIDENCE=1`, on the test build,
against a recorded `/api/weather/current` response in the exact shape the D1 proxy emits. No external
provider was called. Device shape: Tokyo fix (Shinjuku fixture, 6 decimals), timezone Asia/Tokyo,
real clock.

| File | Viewport | What it shows |
|---|---|---|
| `d1-grant-390x844.png` | 390×844 | After **Use My Location**: quiet Live home with "Weather near you · Cloudy · 14.2°C" and `Open-Meteo · near you · as of <time>`. Header line reads `Cloudy · Location shared`. |
| `d1-grant-1280x800.png` | 1280×800 | Same grant state in the three-zone desktop shell. The Weather chip reads `Open-Meteo`. |
| `d1-deny-390x844.png` | 390×844 | After **Deny**: the guided "Location Access Denied" card with **Try Again**. Zero weather requests were sent and no temperature is rendered. The header reads `Weather unavailable · Location not shared`. |
| `d1-deny-1280x800.png` | 1280×800 | Same deny state on desktop. The Weather chip reads `Unavailable`. |
| `d1-https-lan-mechanics-390x844.png` | 390×844 | `npm run demo:https` surface at `https://<mac-lan-ip>:4443/` (served build, recorded weather) after grant. See the caveat below. |

What the spec asserts (not just the pictures):
- Before consent: zero `/api/weather/current` requests. Live never falls back to the demo city.
- After grant: every request is `?coords=35.689,139.692` (3 decimals). The raw `35.689487` and
  `139.691706` never appear on the wire. The body never contains "San Francisco" or "fixed demo city".
- After deny: zero weather requests even after a focus refresh. No `°C` anywhere in the body, and no
  weather attribution.
- `window.isSecureContext === true` on the served surface.

## Secure-context and prompt check on `demo:https` (agent side)

- Served with `npm run demo:https -- --skip-build`, bound to the LAN address only (a VPN interface was
  refused). A headless Chromium on the same Mac opened `https://<mac-lan-ip>:4443/`:
  `isSecureContext: true`, `'geolocation' in navigator: true`, permission state `prompt` before
  consent, and zero weather requests before consent. After grant there was exactly one request,
  `coords=35.689%2C139.692`, and "Weather near you" rendered.
- Caveat: the agent cannot install a root CA (a system security setting), so this check used a
  throwaway self-signed certificate (deleted afterwards) with the browser's certificate check
  disabled. It verifies the serve mechanics (HTTPS, LAN bind, same-origin `/api`, coords validation),
  **not** the owner's trusted mkcert path.
- **UNVERIFIED:** the native geolocation prompt on a real phone through the mkcert-trusted surface.
  It needs the owner's one-time CA install (`docs/demo/DEMO_HTTPS.md` §A). Until the owner confirms
  it, the Mac fallback `http://localhost:4174` (§C, a secure context by definition) leads the demo
  script.
