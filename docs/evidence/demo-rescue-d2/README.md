# D2-LUNCH-DEFAULT-ON evidence (DEMO_RESCUE plan)

Produced by `tests/e2e-live/live-nearby-now.spec.ts` with `UPDATE_EVIDENCE=1` on the test build.
**Recorded provider data:** `/api/places` answers with candidates in the exact shape the real
`/api/places` middleware + `OverpassPlacesAdapter` produce from a recorded Overpass response.
`tests/proxy-boundary/places-trio-proxy.test.ts` runs that recorded response through the real
middleware and adapter. No external provider was called. Device shape: Tokyo-Shinjuku fixture fix
(6 decimals), a timezone chosen at run time so local time is about 18:00 (outside the 11:00–14:30
meal window), real clock, cold user (no confirmed taste).

| File | Viewport | Gate | What it shows |
|---|---|---|---|
| `d2-lunch-card-390x844.png` | 390×844 | A+B | After **Use My Location** → **Nearby now**: "Shinjuku Soba Tei · Soba · 56 m (straight-line) · Open now", reason "Open now · from OpenStreetMap opening hours", Directions, "+1 more options", ODbL attribution. |
| `d2-lunch-card-1280x800.png` | 1280×800 | A+B | Same, three-zone shell. Right panel lists both venues ("Open now · 56 m", "Hours unknown / Closest dining option · 136 m"). |
| `d2-detail-390x844.png`, `d2-detail-1280x800.png` | both | A+B | Restaurant detail with OSM attribution. Ratings and photos stay absent (D7). |
| `d2-handoff-390x844.png`, `d2-handoff-1280x800.png` | both | A+B | Verified navigate handoff to the candidate's OSM coordinates (Apple Maps URL preview). |
| `d2-deny-390x844.png`, `d2-deny-1280x800.png` | both | A | **Deny**: guided "Location Access Denied" card, zero venues, zero `/api/places` requests. |
| `d2-places-off-390x844.png` | 390×844 | A | Places provider off (owner setting): "Nearby restaurants are off (owner setting)", zero venues, zero `/api/places`. Consent copy says the location is not sent to any provider. |

Asserted by the spec, beyond the pictures:
- Every `/api/places` query carries only `lat=35.689&lng=139.692` (3 decimals). The raw fix never leaves the page.
- Outside the meal window, a grant alone shows no lunch card (proactive rule unchanged). The explicit tap/ask is what lifts the meal window.
- A tap within the provider's 10 s interval reuses the results just fetched (no second request). A tap after a provider error fires a new request.
- An Ask "附近吃什么" while a search is in flight joins it: exactly one `/api/places` request, and the lunch card appears.
- Zero `data-provenance="fixture"`. No "simulated", "Demo profile", "Based on taste" (cold user) or "· walk" claims.

Default-on switch: implemented as `KEYLESS_TRIO_DEFAULT_ON` in `src/adapters/providers/server-proxy.ts`
and **shipped OFF**, because no §9 owner confirmation ("同意") was recorded before submission.
Flipping it is a one-line change once the owner confirms. An explicit env value always wins.
