# D5-LIVE-FORECAST UI review pack

All renders come from `tests/e2e-live/live-forecast.spec.ts`. They are **recorded** hourly-bin
responses in the D5 proxy's exact shape, not a live Open-Meteo call. The scenario is a 3:00 PM
"Product Review", a 15-minute drive, and a confirmed 10-minute buffer, so leave-by is 2:35 PM. The
fix is the public San Francisco test point, rounded to 3 decimals.

| File | What it shows |
|---|---|
| `d5-rain-no-buffer-390x844.png`, `d5-rain-no-buffer-1280x800.png` | Rain expected in the trip window with **no rain buffer**: umbrella chip, `Rain expected 2:00–3:00 PM`, the change moment `Rain expected 2:00–3:00 PM · take an umbrella; leave time unchanged (2:35).`, **leave by 2:35 PM (unchanged)**, and the one status line `Forecast · leave-by unchanged, no rain buffer set` |
| `d5-rain-with-buffer-390x844.png`, `d5-rain-with-buffer-1280x800.png` | The same forecast with the user's **confirmed 10-minute rain buffer**: **leave by 2:25 PM** (exactly 10 minutes earlier), change moment `2:35 PM → 2:25 PM`, and status `Forecast · leaving 10 min earlier (your rain buffer)` |
| `d5-forecast-unavailable-390x844.png` | Forecast bins missing: current conditions are used (`Rain now`, umbrella, leave-by unchanged). Status `Forecast unavailable · using current conditions` |

## Review notes

- **One status:** each state has a single weather-basis line (`#forecast-status`) under the
  rationale. Attribution stays visible above the fold through the header link *Weather data by
  Open-Meteo.com*.
- **D3 floor at 390:** the rationale and the status are one line each. Accept and Not now stay
  unoccluded by the docked ask bar on first paint; the spec asserts this for every rain state at
  390 and 1280. To get there, the time span is compact (`2:00–3:00 PM`), and the "why" of the
  leave-by lives only on the status line, not repeated in the change moment.
- **Honest wording:** the forecast speaks about the trip window (`Rain expected …`, `What changed:
  Rain expected during your trip`), never "now". Current-conditions rain keeps the existing
  `Rain now` copy.
- **Pre-existing, not D5:** the header pill `Offline fallback · deterministic` comes from the
  e2e server's model route (model pinned off).
