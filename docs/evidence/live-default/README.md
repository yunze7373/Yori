# S2-LIVE-DEFAULT Verification Evidence

## Summary
Implementation and verification of `S2-LIVE-DEFAULT` (TID: `INBOX-20261102-EABD4D`, Plan: `LIVE_FIRST rev2` `docs/architecture/LIVE_FIRST.plan.json`).

Production default mode is flipped to **Live** with honest empty/gated states. Mode overrides (`?mode`, `?default_mode`, `window.__YORI_DEFAULT_MODE__`) are strictly dev-gated and cannot leak in shipping production builds. Demo mode is reachable strictly behind `?dev=1`, with visible `SIMULATED` labels across all fixture provenance renders.

---

## 1. Acceptance Criteria Verification Matrix

| # | Acceptance Requirement | Implementation / Gating | Verification |
|---|---|---|---|
| **1** | Production mode overrides cannot leak | In `src/ui/living-context/app.ts` (`getEffectiveDefaultMode`), production builds (`!testHooksEnabled`) ignore `?mode`, `?default_mode`, and `window.__YORI_DEFAULT_MODE__`. Default mode is strictly `live`. | `tests/env/live-default-env.spec.ts` (Case 2: 10/10 passing) & `tests/e2e/production-gating.spec.ts` |
| **2** | Production default mode is Live with honest empty/gated states | Navigating to clean root `/` renders `data-context-mode="live"`, living header chip `live`, honest quiet state (`#quiet-title` "Location Needed", `#btn-request-location` "Use My Location"), and 0 fixture elements. Zero synthetic demo copy (`Piano lesson`, `Fiore Caffe`, `fuel station`). | `tests/env/live-default-env.spec.ts` (Case 1: mobile & desktop) |
| **3** | Demo reachable only behind `?dev=1` with SIMULATED labels | Navigating to `/?dev=1` switches context mode to `demo`, activates demo timeline pill ("Demo timeline · simulated time"), header chip displays `simulated`, and sources sheet displays `SIMULATED` badges for all fixture feeds. | `tests/env/live-default-env.spec.ts` (Case 3) |
| **4** | Label audit finds zero unlabelled simulated renders | In Demo mode (`?dev=1`), 100% of fixture elements carry explicit simulated attribution/badges. In Live mode, exactly 0 fixture elements and 0 simulated badges exist. | `tests/env/live-default-env.spec.ts` (Case 4) |
| **5** | Dev/test build on port 4173 honours mode overrides | Test build respects `?mode=demo` and `?mode=live`. | `tests/env/live-default-env.spec.ts` (Case 5) |
| **6** | Single-flight counter in `tests/e2e-live/live-pipeline.spec.ts:790` | Fixed vacuous counter by registering `page.on('request')` listener tracking `/api/places` calls and asserting exact coalescing to 1 places fetch. | `tests/e2e-live/live-pipeline.spec.ts` |
| **7** | 4 Legacy Live suites retired | `tests/e2e/l1-live-truth.spec.ts`, `tests/e2e/l2-route-map.spec.ts`, `tests/e2e/l3-real-places.spec.ts`, and `tests/e2e/live-context-mode.spec.ts` deleted, retirement index in `docs/evidence/live-pipeline/README.md`; non-live 'Demo Mode Map remains Schematic' case preserved in `tests/e2e/ui-home-quiet.spec.ts` test 8. | 4 suites deleted (-2142 lines) |
| **8** | Core diff 0 lines (`AC-EXT-1`) | `git diff f43c6c1d HEAD -- src/core` = 0 lines. | `git diff f43c6c1d HEAD -- src/core` output empty |
| **9** | Production build hygiene (`verify:production`) | `npm run verify:production` asserts 0 occurrences of `__YORI_*` hooks, forcing keys, and external font hosts in `dist/`. | `npm run verify:production` passed with 0 hits |

---

## 2. Visual Evidence

Default-Live first open without `?mode` against clean shipping production preview (`http://localhost:4174/`):

- **Mobile Viewport (390×844)**:
  `docs/evidence/live-default/01-default-live-first-open-390.png`
  - Honest location consent prompt ("Location Needed" / "Location permission needed to find nearby lunch places").
  - Header line shows truthful live device clock, weather status, and live context chip.
  - Zero demo copy or simulated fixtures.

- **Desktop Viewport (1280×800)**:
  `docs/evidence/live-default/02-default-live-first-open-1280.png`
  - Clean two-column desktop layout with quiet state in left living column and honest live notices in right panel.
  - Zero fixture provenance.
