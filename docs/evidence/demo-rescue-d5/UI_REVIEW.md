# D5-LIVE-FORECAST UI review pack

All renders come from `tests/e2e-live/live-forecast.spec.ts`. They are **recorded** hourly-bin
responses in the D5 proxy's exact shape, not a live Open-Meteo call. The scenario is a 3:00 PM
"Product Review", a 15-minute drive, and a confirmed 10-minute buffer, so leave-by is 2:35 PM. The
fix is the public San Francisco test point, rounded to 3 decimals.

| File | What it shows |
|---|---|
| `d5-rain-no-buffer-390x844.png`, `d5-rain-no-buffer-1280x800.png` | Rain expected in the trip window with **no rain buffer**: umbrella chip, `Rain expected 2:00–3:00 PM`, the change moment `Rain expected 2:00–3:00 PM · take an umbrella; leave time unchanged (2:35).`, **leave by 2:35 PM (unchanged)**, and the one status line `Forecast · leave-by unchanged, no rain buffer set` |
| `d5-rain-with-buffer-390x844.png`, `d5-rain-with-buffer-1280x800.png` | The same forecast with the user's **confirmed 10-minute rain buffer**: **leave by 2:25 PM** (exactly 10 minutes earlier). Change moment `Rain expected 2:00–3:00 PM · take an umbrella; leaving 10 min earlier (2:35 → 2:25).` The moved time is folded into this line, with no separate strike-through row. Status `Forecast · leaving 10 min earlier (your rain buffer)` |
| `d5-forecast-unavailable-390x844.png`, `d5-forecast-unavailable-1280x800.png` | Forecast bins missing: current conditions are used (`Rain now`, umbrella, leave-by unchanged). Status `Forecast unavailable · using current conditions` |
| `d5-forecast-expired-390x844.png` | The forecast passed its `validFor` (clock advanced 61 minutes): it is dropped, current rain takes over (`Rain now`, umbrella), status `Forecast expired · using current conditions`, and exactly one bounded re-request is made |

## Review notes

- **One status:** each state has a single weather-basis line (`#forecast-status`) under the
  rationale. Attribution stays visible above the fold through the header link *Weather data by
  Open-Meteo.com*.
- **D3 floor at 390:** the rationale and the status are one line each. Accept and Not now stay
  unoccluded by the docked ask bar at **first paint**. The spec scrolls to the top and waits two
  frames before hit-testing, in every D5 state at 390 and 1280 (rework of Reviewer 48aae24c: the
  first version hit-tested at the app's scroll position). To get there:
  - the time span is compact (`2:00–3:00 PM`);
  - the cause marker is one line (`What changed: Rain expected`);
  - the buffer move is folded into the hero line;
  - the "why" of the leave-by lives only on the status line.
- **Honest wording:** the forecast speaks about the trip window (`Rain expected …`, `What changed:
  Rain expected`), never "now". Current-conditions rain keeps the existing
  `Rain now` copy.
- **Pre-existing, not D5:** the header pill `Offline fallback · deterministic` comes from the
  e2e server's model route (model pinned off).
