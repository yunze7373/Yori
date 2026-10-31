# UI-HOME-QUIET Visual Evidence & Verification Matrix

Governed by Task `[TID:INBOX-20261031-24FF42-REV-675f669d]` (Rev3 UI Redesign Slice 1 of 3: Quiet Consumer Home and Isolated Presentation Demo Panel, Rework 1).

---

## 1. Reference Mockup Target
- **Target Mockup**: `yori_proactive_life_assistant_mockup.png (owner-supplied, not in repo), sha256 ef4cf701e3fb6bf96325a7c9a6609f3f396f6db439ce972f562e2d63d887c70d`
- **Git Invariant**: External mockup images, personal home paths, and user identities are never committed to git. Privacy scan verification enforces strict zero-leakage policies across all repository files.

---

## 2. Core Deliverables Summary

### A1. Restrained Header & Dedicated Sources View
- **Serif Wordmark**: Newsreader serif "Yori" top-left.
- **Neutral Profile Avatar**: Neutral person SVG icon button (`#btn-header-avatar`) with `aria-label="Profile and settings"`, routing cleanly to the Me view.
- **Honest Dynamic Greeting**: Newsreader title with honest dynamic subheading:
  - `"I've already looked ahead for you."` when an action card or prepared plan exists.
  - `"Nothing needs you right now."` when in a quiet state (e.g. busy-lunch or live runtime with no urgent action).
- **Single Context Status Pill (`#pill-context-status`)**: Under the greeting, exactly one compact status pill shows:
  - Header: `Demo · simulated ›` (Demo) or `Live context ›` (Live).
  - Subline: Active sources only. Demo displays `'Demo · simulated scenes'`. Live displays `'Device clock'` (plus `'Weather'` only if enabled, plus `'Location'` only if granted this session; never Calendar or Memories unless connected).
- **Dedicated Sources & Provenance View**: Clicking `#pill-context-status` opens a dedicated Sources view detailing active runtime feeds:
  - In Live mode: truthful feeds only (Device clock, Weather off/live with fixed demo city, Location not shared/shared this session, Calendar `Not connected`, Memory `Local only`), with ZERO simulated signals or fabricated events.
  - In Demo mode: active scenario fixtures with explicit `SIMULATED` badges.
  - Does **NOT** open demo presentation controls.

### A2. Isolated Presentation Demo Panel
- **Consumer Isolation**: By default, consumer Home shows ZERO demo controls in the DOM (`#scene-select`, `#btn-mode-demo`, `#btn-mode-live`, `#btn-replay-before-you-ask`, `#badge-ui-version` are detached).
- **Developer Affordance**: Gated behind `?dev=1` (or session flag `yori_dev=1`), revealing a discreet developer icon button (`#btn-dev-demo-controls`) in the header.
- **Presentation Sheet (`#demo-panel`)**: Displays `"Demo controls · for presentation"`, housing mode toggles, scenario switcher, replay trigger, and technical status badges.
- **Accessibility & Focus**: Implements full accessible modal focus trap, Escape keyboard dismissal, and restores focus cleanly to `#btn-dev-demo-controls`.

### A4, A8 & P2. Compact Now Card & Progressive Disclosure
- **Compact Now Card Layout**:
  - Category row: icon + `TRAVEL` (or `LUNCH` / `FUEL`) + relative time (`in 40m` / `in 55m` / `nearby · 12:15 PM`) + `SIMULATED` badge.
  - Serif headline: `Piano lesson at 3:00 PM` (Clear & Rain) or candidate name (Lunch).
  - Bold reason line (`#now-title`): `Get ready at 2:05 PM, leave by 2:25 PM · Drive · 30 min` (Clear) or `Get ready at 2:10 PM, leave by 2:30 PM · Drive · 25 min` (Rain).
  - One-line rationale: `Rain forecast · Umbrella needed` (Rain) or `Typical traffic · 5m margin` (Clear).
  - Schematic route map strip: compact map strip <= 140px tall, labelled `Schematic · simulated`.
  - Single row of primary actions: `Accept`, `Adjust`, `Why?` at equal height (>= 44px), `flex: 1`, fitting 390px mobile viewports without line wrapping.
  - Secondary action links: `Details →` (`#btn-view-trip-details`) and `Dismiss` (`#btn-dismiss`) with >= 44px hit targets.
- **Progressive Disclosure via Trip Details**:
  - Full 4-step timeline (`.v2-timeline`), transit mode options grid (`.v2-options-grid`), and habit line (`.habit-note`) are placed behind `Details →` in `TripDetail` view.
  - Tapping `Details →` displays the full journey timeline, mode options, habit preference note, and expanded map.
- **Ahead & For You Sections**:
  - Section headers with `.btn-see-all` links (`#link-ahead-see-all` and `#link-foryou-see-all`) featuring design tokens and >= 44px hit targets.
- **Floating Ask Composer (`#ask-bar`)**: Bottom docked for ergonomic thumb-reach on mobile, opening the conversational shell.

---

## 3. The 6 Intentional A9 Truth Differences (Mockup vs. Real Runtime)

1. **Greeting and Profile Avatar**:
   The mockup depicts a personalized `"Good afternoon, Han"` with a personal letter monogram; the real runtime uses a temporal greeting (`"Good afternoon"`) with an honest status subheading (`"I've already looked ahead for you."` / `"Nothing needs you right now."`) and a neutral person SVG avatar button (`#btn-header-avatar`) routing to profile and settings (Me tab), eliminating personal identifier leaks.
2. **Context Status Pill**:
   The mockup omits sensor and source provenance; the real runtime includes a single compact context pill (`#pill-context-status`) displaying truthful active feeds (`Demo · simulated scenes` vs `Device clock`). Tapping the pill opens a dedicated Sources view with truthful live feeds (Device clock, Weather, Location, Calendar `Not connected`, Memory `Local only`) without fabricating events.
3. **Grounded Now Card Hierarchy**:
   The mockup presents ungrounded visual elements; the real runtime enforces strict domain grounding with category badge (`TRAVEL`), relative timing (`in 40m` / `in 55m`), serif appointment headline, bold departure schedule (`#now-title`), one-line rationale, and a compact schematic map strip (<= 140px tall) labelled `Schematic · simulated`.
4. **Action Row & Trip Details Disclosure**:
   The mockup inlines complex multi-step timelines directly on Home; the real runtime provides a compact single row of 3 equal-height primary buttons (`Accept`, `Adjust`, `Why?`) fitting 390px without wrapping, plus secondary text links (`Details →` and `Dismiss`), cleanly moving the full 4-step timeline, mode options, and habit note behind the dedicated `TripDetail` view.
5. **Ergonomic Composer (No Mic Fabrications)**:
   The mockup positions a search bar at the top with a microphone icon; the real runtime implements a bottom-docked Ask bar (`#ask-bar`) for one-handed mobile reach, with text input only (no fabricated microphone/voice input before speech hardware ports exist).
6. **Isolated Presentation Demo Panel**:
   The mockup intermixes presentation elements with consumer UI; the real runtime cleanly detaches presentation demo controls (`#scene-select`, `#btn-mode-demo`, `#btn-mode-live`, etc.) from consumer DOM, providing a discreet developer affordance (`#btn-dev-demo-controls`) gated behind `?dev=1` to host presentation controls in an accessible bottom sheet.

---

## 4. Visual Evidence Manifest (`MANIFEST.sha256`)

All 30 visual evidence captures (14 BEFORE captures from commit `2114176` via git worktree, and 16 AFTER captures from current rework) across dual viewports (`390x844` mobile and `1280x800` desktop):

| File | SHA-256 | Description |
| :--- | :--- | :--- |
| `before-demo-clear-390x844.png` | `b25e3f5960f512d8c4ab111380c0773a0d376c634cb36455352da92a88f15e71` | Baseline commit 2114176 Clear scene (mobile 390x844) |
| `before-demo-clear-1280x800.png` | `579b20618c24f51b89d229c2db3d82cffff871274a0bbdb6ae686d7da88316ab` | Baseline commit 2114176 Clear scene (desktop 1280x800) |
| `after-demo-clear-390x844.png` | `3e484320d56aff2ffb7b8f82fd5dd8c5c0f1f80e7508e78d8ac4c1d07f803735` | Rework 1 Clear scene with compact Now card (mobile 390x844) |
| `after-demo-clear-1280x800.png` | `469c3d1eb141fb386c68b2430b3b4a268a7763183117b542f9a0dd6f0e51cad7` | Rework 1 Clear scene with compact Now card (desktop 1280x800) |
| `before-demo-rain-390x844.png` | `d179c85b158154c47792a72640a79299554f399f3cbbbee08cca9ade2d5f414a` | Baseline commit 2114176 Rain scene (mobile 390x844) |
| `before-demo-rain-1280x800.png` | `0d8f3b705d7dc09d8c5bf4810ab136dd15db01fab926ded5c0a2b62c68365f40` | Baseline commit 2114176 Rain scene (desktop 1280x800) |
| `after-demo-rain-390x844.png` | `70d7c8032bc14409ced28803d541d0710864b89fd5d4f3126ac3c4d4de94c4d9` | Rework 1 Rain scene with compact Now card & map strip (mobile 390x844) |
| `after-demo-rain-1280x800.png` | `464bf08f44b504cd7f77752418d6520bfe213a26823d38e7ea69e572c3fd3bf6` | Rework 1 Rain scene with compact Now card & map strip (desktop 1280x800) |
| `before-demo-away-lunch-390x844.png` | `c77bf7c2a00103e0a8b7faf45d57903adf9d972228ce7c2902720d1e18a55e94` | Baseline commit 2114176 Away Lunch scene (mobile 390x844) |
| `before-demo-away-lunch-1280x800.png` | `42e816f7bdd67c1653d9ee987ba3b93180af766d64afabdf2e20f3916baea306` | Baseline commit 2114176 Away Lunch scene (desktop 1280x800) |
| `after-demo-away-lunch-390x844.png` | `b7c1e37d7aaf07223376b121dde1fd26deadb494266682281dce8c6f23f7de61` | Rework 1 Away Lunch scene with compact category row (mobile 390x844) |
| `after-demo-away-lunch-1280x800.png` | `2ffdaaca26a5da55ab688fbc7c0b9666398de144e1a9b7ba6ee8f621a83a1bf6` | Rework 1 Away Lunch scene with compact category row (desktop 1280x800) |
| `before-live-weather-off-390x844.png` | `df8727dabd7e6ac8712393e1e77df499fc45d327d629fe9237bd5cff6abf9463` | Baseline commit 2114176 Live runtime with weather off (mobile 390x844) |
| `before-live-weather-off-1280x800.png` | `c937c203d235b74f6637290678ff90f536781e905e03a830fe321ec0d022351a` | Baseline commit 2114176 Live runtime with weather off (desktop 1280x800) |
| `after-live-weather-off-390x844.png` | `13c2ed47f3bc5dc2c6fd9de8726421c460d9bf7bb53c4b98c5ac31996900f0d3` | Rework 1 Live runtime with weather off & quiet Home (mobile 390x844) |
| `after-live-weather-off-1280x800.png` | `955db5a5ce5fa95d43e92b1b519ac2ea1a2fbf62f4f04394239ed02fd3c0eae4` | Rework 1 Live runtime with weather off & quiet Home (desktop 1280x800) |
| `before-live-empty-390x844.png` | `df8727dabd7e6ac8712393e1e77df499fc45d327d629fe9237bd5cff6abf9463` | Baseline commit 2114176 Live empty quiet state (mobile 390x844) |
| `before-live-empty-1280x800.png` | `c937c203d235b74f6637290678ff90f536781e905e03a830fe321ec0d022351a` | Baseline commit 2114176 Live empty quiet state (desktop 1280x800) |
| `after-live-empty-390x844.png` | `13c2ed47f3bc5dc2c6fd9de8726421c460d9bf7bb53c4b98c5ac31996900f0d3` | Rework 1 Live empty state ("Nothing needs you right now.") (mobile 390x844) |
| `after-live-empty-1280x800.png` | `955db5a5ce5fa95d43e92b1b519ac2ea1a2fbf62f4f04394239ed02fd3c0eae4` | Rework 1 Live empty state ("Nothing needs you right now.") (desktop 1280x800) |
| `before-sources-open-demo-390x844.png` | `4be305a961faf216210739ff652c8b8740254a930603c695d8e85038a8981188` | Baseline commit 2114176 Demo Why sheet opened (mobile 390x844) |
| `before-sources-open-demo-1280x800.png` | `9cba5040eb45019b1eacae179c21fcf934cade638e230cca4e659e612e0d370c` | Baseline commit 2114176 Demo Why sheet opened (desktop 1280x800) |
| `after-sources-open-demo-390x844.png` | `1f4e9f97073e1e3aea857e1b997066ce54b5c9c4de588b20f1a98d2c2074de5d` | Rework 1 Dedicated Demo Sources view with SIMULATED badges (mobile 390x844) |
| `after-sources-open-demo-1280x800.png` | `2f39d57d8cc9d43adba73622e17b82a9b90fe5c56187bf160b7b6ec87fcd4909` | Rework 1 Dedicated Demo Sources view with SIMULATED badges (desktop 1280x800) |
| `before-sources-open-live-390x844.png` | `df8727dabd7e6ac8712393e1e77df499fc45d327d629fe9237bd5cff6abf9463` | Baseline commit 2114176 Live runtime sources on Home (mobile 390x844) |
| `before-sources-open-live-1280x800.png` | `c937c203d235b74f6637290678ff90f536781e905e03a830fe321ec0d022351a` | Baseline commit 2114176 Live runtime sources on Home (desktop 1280x800) |
| `after-sources-open-live-390x844.png` | `0568103385c9d96225456fcf396dcdda652a31db0b1a5c92e5c7145eccb3b1b4` | Rework 1 Dedicated Live Sources view (truthful feeds only) (mobile 390x844) |
| `after-sources-open-live-1280x800.png` | `c4cf476709f8bcd38515390944f59e6543bafb791b3b52e03b1278de1373a0cf` | Rework 1 Dedicated Live Sources view (truthful feeds only) (desktop 1280x800) |
| `after-demo-panel-open-390x844.png` | `3ffdc2d63ca2319b9f1cb4d62eb9be823e926dbbbac7a587c95cb99956b631c7` | Rework 1 Developer Presentation Demo Panel open (mobile 390x844) |
| `after-demo-panel-open-1280x800.png` | `f0906ce84c56f5b47816aa1cbb6b4844d26a6a3664669b538783ba91a998e4ef` | Rework 1 Developer Presentation Demo Panel open (desktop 1280x800) |

*(Note: Prefers-reduced-motion accessibility is verified programmatically via test assertion `computed transition-duration: 0s` on animated components rather than duplicate static PNGs.)*

---

## 5. Verification Check Results
- **TypeScript Typecheck**: 0 errors (`npm run typecheck`).
- **Unit Test Suite**: 34 files, 817 unit tests all PASSING (`npm test`).
- **Golden Tests**: 4 files, 18 golden tests all PASSING (`npm run test:golden`).
- **Drill Tests**: 4 files, 56 drills all PASSING (`npm run test:drills`).
- **E2E Playwright Suite**: 12 passed, 2 skipped (`npx playwright test tests/e2e/ui-home-quiet.spec.ts`).
- **Privacy Scan**: Overall PASS: ✅ PASS (`npx tsx scripts/publish/privacy-scan.ts`).
- **Core Diff**: 0 lines changed (`git diff --stat f43c6c1d HEAD -- src/core` = 0 lines).
- **Model Billed Calls**: 22/50 lifetime used, 0 calls dispatched during this slice (untouched ledger).
