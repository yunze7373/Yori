# D3-VISUAL-PASS evidence (DEMO_RESCUE rev11, floor tier)

Produced by `tests/e2e-live/d3-visual-floor.spec.ts` on the test build, Live mode, recorded provider
data (no external calls): Tokyo-Shinjuku fixture fix, a timezone with local time ≈ 18:00, cold user.
`before-*` were captured at `faa3693` (`D3_PHASE=before`), `after-*` at the D3 commit
(`UPDATE_EVIDENCE=1`). Each surface at 390×844 and 1280×800.

| Surface | Files |
|---|---|
| Home / now | `before-home-*`, `after-home-*` |
| Weather | `before-weather-*`, `after-weather-*` |
| Lunch candidates (after **Nearby now**) | `before-lunch-*`, `after-lunch-*` |
| Ask Yori overlay | `before-ask-*`, `after-ask-*` |
| Deny state | `before-deny-*`, `after-deny-*` |
| Nearby failure / empty states | `before-nearby-fail-*`, `after-nearby-fail-*`, `before-nearby-empty-*`, `after-nearby-empty-*` |

## Floor, item by item (asserted by the spec at both viewports; all 8 tests pass)

| Item | Before (`faa3693`) | After |
|---|---|---|
| (a) Ask overlay: one status line; Decision Log, Export and raw JSON only behind `?dev=1` | FAIL: four status elements (Live assistant badge, Live context chip, engine chip, model pill); Decision Log + Export bar always present | PASS: only the engine status pill in consumer Live; badge, chips, log bar and JSON drawer render only with `?dev=1` (or the test build's `?test=1`) or in the dev-only Demo |
| (b) each card carries exactly one provenance chip | FAIL: Now card 0 (plus nested chips), feed Now / Ahead / For You cards 0, map strip unmarked | PASS: one `.provenance-chip` per card (Now card `Live`, quiet card `Live`, feed cards `Live`/`You confirmed`, map strip `Map not available`/`Live map`), counted per nearest card |
| (c) zero fixture/simulated/replay strings on Live surfaces | PASS | PASS (also in the Ask overlay) |
| (d) 390 Ask: composer visible and submittable, no overlap; transcript scrolls; Pin not clipped; composer label ≤ 1 line or hidden | FAIL (visual): the composer label rendered as five visible lines because `.sr-only` was never defined | PASS: `.sr-only` utility added; input, send and Pin are unoccluded and inside the viewport; transcript `overflow-y: auto` |
| (e) touch targets ≥ 44px, AA contrast, CLS ≤ 0.1 on the morph | PASS | PASS (axe color-contrast clean on home and lunch; layout-shift sum ≤ 0.1 across quiet → lunch) |
| (f) lunch card leads with the top candidate above the fold at 390; What-changed and location row folded | FAIL: name, distance, open status, reason and Directions all below the fold; What-changed box and location row expanded | PASS: in Live the top candidate sits directly under the title and is fully visible above the Ask bar; What-changed is a one-line disclosure (`#hero-cause-effect` hidden until opened); the location row is gone (the header already says `Location shared`) |
| (g) deny-state context pill lists only sources delivering data | FAIL: `Device clock · Weather` while the header says `Weather unavailable` | PASS: Location only with an available fix, Weather only with a fresh reading, plus `Nearby places` when venues are shown |
| (h) weather tile and nearby failure/empty are designed states | PARTIAL: weather near you was a component; nearby notes were raw text lines | PASS: `.nearby-state` component (icon, title, one-line guidance) for failure, empty, cooldown and off |

Also fixed while there: the Live Ask greeting no longer talks about a departure plan when nothing is on
Home; the open status is a styled chip (it was unstyled body text); the lunch card no longer shows the
"Up to date" cooldown note next to results.

Rich tier (CLOSEOUT): photo-ready cards arrive with D7; OSM map markers and motion polish are not
claimed here. Discovery logic (D7, rev12 pending) was not touched.
