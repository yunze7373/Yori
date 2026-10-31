# Yori Living Context: North-Star Vision vs. Actual Runtime Audit

> **Task Reference:** `[TID:INBOX-20261031-765B61]` (`NORTH-STAR-AUDIT`)  
> **Governed by:** Coordinator / Owner Steering (`msg_fcda2f3c`), Reviewer Dispatch `45f06a86` / `68181f49`, Review Decision `4939164a`  
> **Audited Runtime:** `http://127.0.0.1:4174/` (Living Context V2, default root URL `/` without query parameters)  
> **Audited Commit HEAD:** `3ec223faee4fda1daa02ac18f222970bd87feee4`  
> **Date:** 2026-10-31  
> **Status:** Submitted for review  

---

## 1. Executive Summary

This audit provides an honest, rigorous, and verifiable assessment of what the **actual runtime** of Yori at `http://127.0.0.1:4174/` does today against the owner's original North-Star vision brief (as captured in XMemo memories `4bd55568`, `ce1f7217`, `bfe456f2`, `4e1aee40`, `c29065b6`, `a72350b8`, `4904dd7e`).

The goal of this audit is to prevent cosmetic distractions and establish an unassailable baseline of truth so that the subsequent implementation slice (**`APP-LIVE-RUNTIME`**) targets genuine architectural and runtime bottlenecks.

### Core Classification Definitions
Every capability is classified into exactly one of four mutually exclusive states:
1. **`REAL`**: Executes end-to-end in the production app path from real runtime sources or verified sovereign client state machines without mocks or fixtures.
2. **`SIMULATED`**: Operates in the live UI, but data is driven by curated deterministic fixtures, mock provider adapters, or scripted model fixtures.
3. **`UNWIRED`**: Code exists in the repository, but is unreachable from the app path, hardcoded to disabled flags, or mismatched in runtime ports/endpoints.
4. **`ABSENT`**: No code exists in the repository.

---

## 2. North-Star Capability Matrix

| # | North-Star Brief Item | Classification | Code Path (`file:line`) | Verification & Test Evidence | Gap Analysis vs. North-Star Vision |
|---|---|---|---|---|---|
| 1 | **Proactive real-world personal agent** | `SIMULATED` | [`src/ui/living-context/app.ts#L1004-L1060`](../../src/ui/living-context/app.ts#L1004-L1060)<br>[`src/app/scenario-player/index.ts#L12-L45`](../../src/app/scenario-player/index.ts#L12-L45) | [`tests/e2e/v2-smoke.spec.ts`](../../tests/e2e/v2-smoke.spec.ts#L4)<br>[`tests/golden/golden-harness.test.ts`](../../tests/golden/golden-harness.test.ts#L1) | Proactive decisions are demonstrated via the `#scene-select` dropdown player running deterministic scenario snapshots (`d1Scenario` through `d6Scenario`). No background OS daemon or push notification system exists to monitor real-world state autonomously. |
| 2a | **GPS device positioning** | `UNWIRED` | [`src/adapters/providers/geolocation-adapter.ts#L80-L140`](../../src/adapters/providers/geolocation-adapter.ts#L80-L140) | [`tests/e2e/v5-geo.spec.ts`](../../tests/e2e/v5-geo.spec.ts#L60) | `BrowserGeolocationAdapter` wraps browser `navigator.geolocation.getCurrentPosition` behind consent and prompt dialogs, but is not imported or wired into the default Living Context app path. |
| 2b | **Continuous GPS tracking & dwell-time inference** | `ABSENT` | [`src/adapters/static-check.test.ts#L197-L217`](../../src/adapters/static-check.test.ts#L197-L217) | [`src/adapters/static-check.test.ts`](../../src/adapters/static-check.test.ts#L197) | Dwell-time inference algorithms and location history models are completely absent (0 references in repository). Continuous GPS tracking (`watchPosition`) is actively forbidden by test invariant `static-check.test.ts:197`. |
| 3 | **XMemo preferences follow user across places/devices** | `UNWIRED` | [`src/adapters/xmemo/composite-adapter.ts#L35-L120`](../../src/adapters/xmemo/composite-adapter.ts#L35-L120)<br>[`src/adapters/xmemo/server-proxy.ts#L376`](../../src/adapters/xmemo/server-proxy.ts#L376)<br>[`src/ui/me/me-view.ts#L120-L180`](../../src/ui/me/me-view.ts#L120-L180) | [`tests/e2e/xmemo-wire.spec.ts`](../../tests/e2e/xmemo-wire.spec.ts#L180)<br>[`src/adapters/xmemo/live-verify-xmemo.test.ts`](../../src/adapters/xmemo/live-verify-xmemo.test.ts#L1) | `XMemoCompositeMemoryAdapter` and OAuth proxy exist, and Why Sheet / Me View render `Synced from XMemo` badges when `/api/xmemo/*` is intercepted. However, redirect URI defaults to port `5173` instead of preview `4174`, and default runtime stores preferences strictly in local browser `localStorage`. |
| 4 | **Ahead-of-ask trip meals/hotel/schedule** | `SIMULATED` | [`src/plugins/lunch/detector.ts#L30-L80`](../../src/plugins/lunch/detector.ts#L30-L80)<br>[`src/ui/living-context/v2-home-view.ts#L544-L590`](../../src/ui/living-context/v2-home-view.ts#L544-L590)<br>[`src/ui/living-context/v2-detail-views.ts#L40-L120`](../../src/ui/living-context/v2-detail-views.ts#L40-L120) | [`tests/e2e/v2b-lunch-loop.spec.ts`](../../tests/e2e/v2b-lunch-loop.spec.ts#L33)<br>[`tests/golden/g-pref.test.ts`](../../tests/golden/g-pref.test.ts#L1) | Lunch recommendations (`Lunch options near you`) and departure plans appear ahead-of-ask in the V2 UI with honest disclosures (`Mock places for this demo`, `SIMULATED`). Hotel recommendations are ABSENT (`staticPluginRegistry` only contains `depart`, `lunch`, `fuel`, and `grocery-stub`). |
| 5 | **Favourite-supermarket suggestion on passing** | `UNWIRED` | [`src/plugins/grocery-stub/index.ts#L1-L30`](../../src/plugins/grocery-stub/index.ts#L1-L30)<br>[`src/plugins/registry.ts#L18-L25`](../../src/plugins/registry.ts#L18-L25) | [`src/plugins/grocery-stub/grocery.test.ts`](../../src/plugins/grocery-stub/grocery.test.ts#L1) | `grocery-stub` plugin is registered in `staticPluginRegistry`, but its detector evaluates only mock location triggers. No grocery scene exists in `DemoSceneId` in the living context UI, making supermarket prompts completely unreachable in the running app. |
| 6 | **3pm piano class while still at home -> leave-now + route** | `SIMULATED` | [`src/plugins/depart/detector.ts#L38-L70`](../../src/plugins/depart/detector.ts#L38-L70)<br>[`src/plugins/depart/preparer.ts#L80-L150`](../../src/plugins/depart/preparer.ts#L80-L150)<br>[`tests/fixtures/d1.ts#L1-L60`](../../tests/fixtures/d1.ts#L1-L60) | [`tests/e2e/visual-proof-head.spec.ts`](../../tests/e2e/visual-proof-head.spec.ts#L125)<br>[`tests/golden/g-rain.test.ts`](../../tests/golden/g-rain.test.ts#L1) | The 3:00 PM Piano lesson departure card with preparation timing (ready 2:05 PM, leave 2:25 PM in Scene D1 Clear; adjusted to ready 2:10 PM, leave 2:30 PM in Scene D2 Rain) and prominent route map canvas is fully functional in Scene D1/D2. The calendar signal originates from deterministic fixture data (`d1Scenario`), not live Google/Apple Calendar. |
| 7a | **Weather changes to rain -> earlier departure + buffer shift (Scene D2)** | `SIMULATED` | [`src/plugins/depart/preparer.ts#L180-L260`](../../src/plugins/depart/preparer.ts#L180-L260)<br>[`src/ui/living-context/v2-home-view.ts#L335-L370`](../../src/ui/living-context/v2-home-view.ts#L335-L370) | [`tests/e2e/north-star-audit.spec.ts#L100`](../../tests/e2e/north-star-audit.spec.ts#L100)<br>[`tests/golden/g-rain.test.ts`](../../tests/golden/g-rain.test.ts#L1) | Rain forecast in Scene D2 triggers the rain insight banner (`What changed: rain forecast`), shifts departure timing earlier (+5 min prep, +5 min buffer), and displays the Umbrella chip. The data is driven by `d2Scenario` fixture. |
| 7b | **Live Open-Meteo weather perception** | `UNWIRED` | [`src/adapters/providers/open-meteo-adapter.ts#L100-L140`](../../src/adapters/providers/open-meteo-adapter.ts#L100-L140)<br>[`src/adapters/providers/server-proxy.ts#L30-L31`](../../src/adapters/providers/server-proxy.ts#L30-L31) | [`tests/e2e/live-weather-ui.spec.ts`](../../tests/e2e/live-weather-ui.spec.ts#L97) | `OpenMeteoWeatherAdapter` can fetch real live weather data from open-meteo.com, but `WEATHER_LIVE_ENABLED` defaults to `false` in the server proxy, and no toggle exists in the default Living Context app path. |
| 8 | **Unfamiliar city at lunch -> grounded restaurants + rationale + route** | `SIMULATED` | [`src/plugins/lunch/preparer.ts#L40-L110`](../../src/plugins/lunch/preparer.ts#L40-L110)<br>[`src/plugins/lunch/adapter.ts#L25-L50`](../../src/plugins/lunch/adapter.ts#L25-L50)<br>[`src/ui/living-context/v2-home-view.ts#L544-L590`](../../src/ui/living-context/v2-home-view.ts#L544-L590) | [`tests/e2e/v2b-lunch-loop.spec.ts`](../../tests/e2e/v2b-lunch-loop.spec.ts#L33)<br>[`docs/evidence/visual-proof-head/05-d3-lunch-home-desktop-1280x800.png`](../../docs/evidence/visual-proof-head/05-d3-lunch-home-desktop-1280x800.png) | Scene D3 renders grounded nearby restaurants with distance, cuisine rationale, and map canvas. All venue data originates from `LunchPlacesAdapter` using fixture dataset with visible disclosure (`Mock places for this demo; real listings come from a place provider`). |
| 9a | **Grounding & source provenance validation engine** | `REAL` | [`src/ui/view-models/grounding.ts#L30-L150`](../../src/ui/view-models/grounding.ts#L30-L150)<br>[`src/ui/review/why-sheet.ts#L300-L420`](../../src/ui/review/why-sheet.ts#L300-L420)<br>[`src/adapters/model/server-proxy.ts#L610-L650`](../../src/adapters/model/server-proxy.ts#L610-L650) | [`tests/integration/v2a2-model-faults.test.ts`](../../tests/integration/v2a2-model-faults.test.ts#L40)<br>[`tests/integration/reasoning-coordinator.test.ts`](../../tests/integration/reasoning-coordinator.test.ts#L1) | The field-level grounding engine (`EvidenceBundle`, `EvidenceRecord`, `sourceRef`) and Why Sheet provenance are genuine running code. Any hallucinated, ungrounded, or unconfirmed facts cause immediate fallback to deterministic output. |
| 9b | **Signal perception sources (places, calendar, weather)** | `SIMULATED` | [`src/adapters/providers/simulated-places-provider.ts#L1-L40`](../../src/adapters/providers/simulated-places-provider.ts#L1-L40)<br>[`tests/fixtures/d1.ts#L1-L60`](../../tests/fixtures/d1.ts#L1-L60) | [`tests/fixtures/weather-fixtures.ts`](../../tests/fixtures/weather-fixtures.ts#L1)<br>[`tests/e2e/v2-smoke.spec.ts`](../../tests/e2e/v2-smoke.spec.ts#L110) | Signals feeding the grounding engine in the default runtime originate from fixture datasets (`d1` through `d6` scenarios, simulated places provider). Signals are labelled truthfully in UI disclosures. |
| 10 | **'Always thinking ahead, not always interrupting'** | `REAL` | [`src/core/policy/index.ts#L50-L120`](../../src/core/policy/index.ts#L50-L120)<br>[`src/ui/living-context/app.ts#L1380-L1398`](../../src/ui/living-context/app.ts#L1380-L1398)<br>[`src/ui/living-context/v2-home-view.ts#L310-L330`](../../src/ui/living-context/v2-home-view.ts#L310-L330) | [`tests/golden/g-quiet.test.ts`](../../tests/golden/g-quiet.test.ts#L1)<br>[`tests/e2e/living-context.spec.ts#L474`](../../tests/e2e/living-context.spec.ts#L474) | Proactive prompt budget is strictly capped at 3 daily (`0 of 3 used today` on Me page). Scene D4 (Busy) enters honest Quiet State (`Nothing needs your attention right now`) without notification spam. Dismissing lunch suppresses suggestions for the day. |
| 11a | **Mobile-first contextual shell & card expansion to modal details** | `REAL` | [`src/ui/living-context/v2-home-view.ts#L100-L300`](../../src/ui/living-context/v2-home-view.ts#L100-L300)<br>[`src/ui/living-context/v2-detail-views.ts#L30-L150`](../../src/ui/living-context/v2-detail-views.ts#L30-L150) | [`tests/e2e/v2-smoke.spec.ts#L283`](../../tests/e2e/v2-smoke.spec.ts#L283) | Fully implemented and verified: responsive mobile 390x844 single-column layout, clicking "Details →" opens `TripDetail` modal view without page reload. |
| 11b | **Ask Yori conversational overlay open/close** | `REAL` | [`src/ui/conversation/conversation-view.ts#L60-L220`](../../src/ui/conversation/conversation-view.ts#L60-L220)<br>[`src/ui/conversation/ask-bar.ts#L1-L50`](../../src/ui/conversation/ask-bar.ts#L1-L50) | [`tests/e2e/north-star-audit.spec.ts#L320`](../../tests/e2e/north-star-audit.spec.ts#L320)<br>[`tests/e2e/v2a-interaction.spec.ts#L184`](../../tests/e2e/v2a-interaction.spec.ts#L184) | Tapping `#ask-bar` expands the conversational overlay with focus management, accessible close controls, and history navigation. |
| 11c | **Ask Yori command selection auto-collapse & Home recomputation** | `SIMULATED` | [`src/ui/conversation/model-interpreter.ts#L100-L180`](../../src/ui/conversation/model-interpreter.ts#L100-L180)<br>[`src/ui/conversation/conversation-view.ts#L304-L328`](../../src/ui/conversation/conversation-view.ts#L304-L328) | [`tests/e2e/north-star-audit.spec.ts#L346`](../../tests/e2e/north-star-audit.spec.ts#L346) | Selecting an option (e.g. Leave 5 minutes later) auto-collapses overlay to Home and updates the departure plan timing from 2:30 PM to 2:35 PM. While the UI transition is real, the command parsing and comparison options are backed by scripted model fixtures. |
| 12 | **Generic form / static reminder UI already rejected 10-28** | `REAL` (Architectural Invariant) | [`docs/architecture/LIVING_CONTEXT_V2.md#L1-L25`](../../docs/architecture/LIVING_CONTEXT_V2.md#L1-L25)<br>[`src/ui/living-context/app.ts#L1-L20`](../../src/ui/living-context/app.ts#L1-L20) | [`tests/e2e/v2-smoke.spec.ts#L504`](../../tests/e2e/v2-smoke.spec.ts#L504)<br>[`tests/e2e/fallback-walkthrough.spec.ts#L90`](../../tests/e2e/fallback-walkthrough.spec.ts#L90) | Strict architectural invariant: zero forms, zero static checkboxes, zero empty placeholder cards. Living Context displays single-moment NOW + Plans + For You, with collapsed secondary areas when empty. |

---

## 3. Context-Change Runtime Evidence

Evidence captured from the actual V2 preview server at `http://127.0.0.1:4174/` (default URL `/`, no query string) using [`tests/e2e/north-star-audit.spec.ts`](../../tests/e2e/north-star-audit.spec.ts) across both Mobile (`390x844`) and Desktop (`1280x800`).

Check-sum manifest: [`docs/evidence/north-star-audit/MANIFEST.sha256`](../../docs/evidence/north-star-audit/MANIFEST.sha256).

| Change Sequence | Before State | After State | Driver Classification | Visual Proof Evidence | Text Assertions & Proof Points |
|---|---|---|---|---|---|
| **1. Weather & Departure Schedule Shift** | Clear Scene (`clear`) | Rain Scene (`rain`) | **`SIMULATED`** (Driven by scenario player scene switch) | Mobile:<br>[`01a-clear-home-mobile-390x844.png`](../../docs/evidence/north-star-audit/01a-clear-home-mobile-390x844.png)<br>[`01b-rain-home-mobile-390x844.png`](../../docs/evidence/north-star-audit/01b-rain-home-mobile-390x844.png)<br>Desktop:<br>[`01a-clear-home-desktop-1280x800.png`](../../docs/evidence/north-star-audit/01a-clear-home-desktop-1280x800.png)<br>[`01b-rain-home-desktop-1280x800.png`](../../docs/evidence/north-star-audit/01b-rain-home-desktop-1280x800.png) | In Clear: `Piano lesson at 3:00 PM` asserts timing `Get ready at 2:05 PM, leave by 2:25 PM`; no rain banner. In Rain: `now-title` shifts to `Get ready at 2:10 PM, leave by 2:30 PM`, `.v2-insight-banner` appears with `What changed: rain forecast`, `.v2-map-canvas.prominent` renders route, and `#btn-view-trip-details` is enabled. |
| **2. Away Lunch Dismissal & Sovereign Suppression** | Away Lunch (`away-lunch`) | Dismiss `dont_suggest_today` -> For You proposal -> Me Confirmed | **`SIMULATED`** (Scene D3) / **`REAL`** (Client state machine & sovereign memory confirmation) | Mobile:<br>[`02a-lunch-home-mobile-390x844.png`](../../docs/evidence/north-star-audit/02a-lunch-home-mobile-390x844.png)<br>[`02b-lunch-foryou-proposal-mobile-390x844.png`](../../docs/evidence/north-star-audit/02b-lunch-foryou-proposal-mobile-390x844.png)<br>[`02c-lunch-me-confirmed-mobile-390x844.png`](../../docs/evidence/north-star-audit/02c-lunch-me-confirmed-mobile-390x844.png)<br>Desktop:<br>[`02a-lunch-home-desktop-1280x800.png`](../../docs/evidence/north-star-audit/02a-lunch-home-desktop-1280x800.png)<br>[`02b-lunch-foryou-proposal-desktop-1280x800.png`](../../docs/evidence/north-star-audit/02b-lunch-foryou-proposal-desktop-1280x800.png)<br>[`02c-lunch-me-confirmed-desktop-1280x800.png`](../../docs/evidence/north-star-audit/02c-lunch-me-confirmed-desktop-1280x800.png) | In 02a: Candidates hero shows `Lunch options near you` with disclosure. Dismissing produces quiet state (`Nothing needs your attention right now`). In 02b: `For You` tab renders `Skip lunch suggestions for today?` with `PROPOSAL` badge. In 02c: Confirming promotes fact to Me tab `#fact-suppress_lunch_recommendations` (`Confirmed`, `Source: you confirmed`). |
| **3. Timing Adjustment & Home Recomputation** | Rain baseline timing | Adjust dialog (25m prep, 10m buffer) -> Save preference -> Confirm | **`REAL`** (Client memory store loop & schedule recalculator) | Mobile:<br>[`03a-rain-home-pre-adjust-mobile-390x844.png`](../../docs/evidence/north-star-audit/03a-rain-home-pre-adjust-mobile-390x844.png)<br>[`03b-adjust-me-confirmed-mobile-390x844.png`](../../docs/evidence/north-star-audit/03b-adjust-me-confirmed-mobile-390x844.png)<br>[`03c-adjust-home-recomputed-mobile-390x844.png`](../../docs/evidence/north-star-audit/03c-adjust-home-recomputed-mobile-390x844.png)<br>Desktop:<br>[`03a-rain-home-pre-adjust-desktop-1280x800.png`](../../docs/evidence/north-star-audit/03a-rain-home-pre-adjust-desktop-1280x800.png)<br>[`03b-adjust-me-confirmed-desktop-1280x800.png`](../../docs/evidence/north-star-audit/03b-adjust-me-confirmed-desktop-1280x800.png)<br>[`03c-adjust-home-recomputed-desktop-1280x800.png`](../../docs/evidence/north-star-audit/03c-adjust-home-recomputed-desktop-1280x800.png) | Pre-adjust timing on Rain Home is `Get ready at 2:10 PM, leave by 2:30 PM`. Tapping `#btn-adjust` opens modal. Saving 25m prep / 10m buffer creates pending proposal. Confirming on Me tab promotes `#fact-prep_buffer_preference` to `Confirmed`. Returning to Home asserts updated timing `Get ready at 2:00 PM, leave by 2:25 PM`. |
| **4. Ask Yori Conversational Command & Home Collapse** | Rain Home baseline | Tap `#ask-bar` -> Query "Can I leave later?" -> Select recommended safe option (+5m) -> Auto-collapse | **`SIMULATED`** (Scripted model fixture for comparison options) / **`REAL`** (Client UI overlay, state machine, and timeline update) | Mobile:<br>[`04a-ask-yori-open-mobile-390x844.png`](../../docs/evidence/north-star-audit/04a-ask-yori-open-mobile-390x844.png)<br>[`04b-ask-yori-command-mobile-390x844.png`](../../docs/evidence/north-star-audit/04b-ask-yori-command-mobile-390x844.png)<br>[`04c-ask-yori-home-updated-mobile-390x844.png`](../../docs/evidence/north-star-audit/04c-ask-yori-home-updated-mobile-390x844.png)<br>Desktop:<br>[`04a-ask-yori-open-desktop-1280x800.png`](../../docs/evidence/north-star-audit/04a-ask-yori-open-desktop-1280x800.png)<br>[`04b-ask-yori-command-desktop-1280x800.png`](../../docs/evidence/north-star-audit/04b-ask-yori-command-desktop-1280x800.png)<br>[`04c-ask-yori-home-updated-desktop-1280x800.png`](../../docs/evidence/north-star-audit/04c-ask-yori-home-updated-desktop-1280x800.png) | In 04a: `#ask-bar` expands conversation overlay (`Ask Yori`, `Offline demo · simulated`, `Offline fallback · deterministic`). In 04b: Submitting "Can I leave later?" renders comparison box (`You can leave up to 5 minutes later`) with `Recommended` badge. In 04c: Clicking `.btn-select-comparison[data-delta="5"]` auto-collapses to Home; `now-title` updates to include `2:35 PM` (differentiating from 01b and 03a baseline 2:30 PM). |

---

## 4. Explicit Runtime Gaps Verified at Current HEAD

The following runtime gaps were audited directly against the codebase at HEAD:

### Gap A: In-App Model Timeout vs. Live Model Latency
- **Code Locations**:
  - [`src/adapters/model/index.ts#L52`](../../src/adapters/model/index.ts#L52): `const timeoutId = setTimeout(() => controller.abort(), 2000);`
  - [`src/ui/conversation/model-interpreter.ts#L134`](../../src/ui/conversation/model-interpreter.ts#L134): `this.timeoutMs = options.timeoutMs ?? 2000;`
  - [`src/adapters/model/server-proxy.ts#L138-L146`](../../src/adapters/model/server-proxy.ts#L138-L146): `resolveTimeoutMs` defaults to `2000 ms`.
- **Measured Evidence**:
  - Report file: [`docs/evidence/s1-live-3/s1-live-3-command-report.json`](../../docs/evidence/s1-live-3/s1-live-3-command-report.json).
  - Target model: `muse-spark-1.3` (providerHost `api.meta.ai`).
  - Successful live model calls measured:
    - **6,850 ms** (Command valid explicit shift: "Leave 15 minutes later")
    - **8,692 ms** (Command suppression: "I already ate lunch today, don't suggest lunch")
    - **9,378 ms** (Command valid shift: "Can I leave later?")
  - Timeout abort events recorded:
    - **2,005 ms** (Run 1 Call 1 aborted by in-app 2,000 ms timeout ceiling)
    - **20,008 ms** (Run 2 Call 4 aborted by test harness 20,000 ms hard stop ceiling)
- **Finding**: The in-app timeout is hardcoded to 2,000 ms. Real live model responses require 6.8s – 9.4s. Any in-app attempt to execute a real live model call at current HEAD will abort at 2,000 ms, failing closed to deterministic fallback. The timeout ceiling must be increased to at least 15,000 ms with intermediate progress indicators.

### Gap B: XMemo OAuth Redirect URI Port Mismatch
- **Code Locations**:
  - [`src/adapters/xmemo/server-proxy.ts#L376`](../../src/adapters/xmemo/server-proxy.ts#L376): `const redirectUri = env['XMEMO_REDIRECT_URI'] || 'http://127.0.0.1:5173/api/xmemo/callback';`
  - [`src/adapters/providers/server-proxy.ts#L92`](../../src/adapters/providers/server-proxy.ts#L92): `const parsedUrl = new URL(urlStr, 'http://127.0.0.1:5173');`
- **Finding**: The server proxy defaults the OAuth callback redirect URI to port `5173` (Vite dev server). The production preview server runs on port `4174` (and test preview runs on `4173`). An owner initiating an OAuth authorization flow from `http://127.0.0.1:4174/` would be redirected after login to port `5173`, breaking the authentication handshake unless manual environment variables are provided.

### Gap C: Absence of In-App "Live Context" Mode Toggle
- **Code Locations**:
  - [`src/ui/living-context/app.ts#L1006-L1015`](../../src/ui/living-context/app.ts#L1006-L1015)
  - [`src/adapters/providers/server-proxy.ts#L30-L31`](../../src/adapters/providers/server-proxy.ts#L30-L31): `WEATHER_LIVE_ENABLED` default is false.
- **Finding**: Context in the UI is exclusively selected via `#scene-select` (`clear`, `rain`, `away-lunch`, `busy-lunch`, `missing-weather`, `corrupt-storage`, `multi-candidate`, `fuel`). There is no option for "Live / Real Context". Even when the server supports live Open-Meteo weather, the feature flag `WEATHER_LIVE_ENABLED` defaults to `false` with zero in-app controls to enable it.

### Gap D: Continuous Geolocation & Dwell Inference Unwired
- **Code Locations**:
  - [`src/adapters/providers/geolocation-adapter.ts#L20-L80`](../../src/adapters/providers/geolocation-adapter.ts#L20-L80)
  - [`src/adapters/static-check.test.ts#L197-L217`](../../src/adapters/static-check.test.ts#L197-L217)
- **Finding**: `BrowserGeolocationAdapter` implements one-shot `getCurrentPosition`, but `watchPosition` continuous tracking and dwell-time detection algorithms do not exist. Continuous GPS tracking is forbidden by test invariant `static-check.test.ts:197` to protect user privacy.

---

## 5. Ranked Gap List

Based on the audit findings, here is the ranked priority of gaps preventing Yori from operating in a true live runtime:

1. **[P0] Model Latency / Timeout Alignment**:  
   Increase in-app model timeout ceiling from 2s to 15s (with responsive visual progress indicator) so that live model calls can finish without premature aborts.
2. **[P0] In-App Live Context Mode & Provider Wiring**:  
   Introduce an explicit in-app mode switch: **Demo Scenes** (simulated fixtures) vs. **Live Context** (real weather via Open-Meteo, real device location via consented geolocation, real device clock).
3. **[P1] Dynamic XMemo OAuth Redirect URI**:  
   Resolve OAuth redirect URI dynamically from the active request host (`window.location.origin` / `req.headers.host`), allowing seamless OAuth handshakes on `4174`, `4173`, or `5173`.
4. **[P2] Dynamic Weather Destination Routing**:  
   Extend weather provider adapter from static `DEFAULT_DEMO_CITY` (SF) to query the destination city coordinates extracted from upcoming plans.
5. **[P3] Calendar Provider Integration**:  
   Connect read-only calendar signals from device or local standard `.ics` exports rather than purely hardcoded scenario fixtures.

---

## 6. Proposed `APP-LIVE-RUNTIME` Implementation Slice (Bounded & Safe)

To bridge these gaps without risking test regressions, token exhaustion, or privacy leaks, the following bounded implementation slice is proposed:

### 1. Scope & Capabilities
1. **Dynamic Timeout Configuration**:
   - Update `src/adapters/model/index.ts` and `src/ui/conversation/model-interpreter.ts` to allow an adaptive timeout (e.g., 15000 ms when in live model mode, 2000 ms in fixture mode).
2. **Dynamic OAuth Redirect Resolution**:
   - In `src/adapters/xmemo/server-proxy.ts`, default `redirectUri` to `${req.protocol}://${req.headers.host}/api/xmemo/callback` when `XMEMO_REDIRECT_URI` is not explicitly set.
3. **In-App Live Mode Toggle**:
   - Add a clean switch in the living-context header: `[Demo Fixtures] | [Live Runtime]`.
   - In Live Runtime mode:
     - Real Clock: Current device local time drives greeting and urgency.
     - Real Weather: Calls local `/api/weather/current` (Open-Meteo).
     - Consented Location: Queries browser geolocation if user grants permission.
     - Honest Fallback: If weather or location is unavailable, display honest calm notice (`Location not shared`, `Weather unavailable`) without breaking the app layout.

### 2. Owner-Gated Boundaries (Strictly Preserved)
- **Zero Live Billed Model Calls by Default**: Live model calls remain strictly gated behind `--confirm-billed` and explicit user command submission; lifetime 50-call ledger ceiling remains inviolate.
- **Zero Real XMemo Account Writes without Owner Login**: Local memory remains primary; cloud synchronization requires explicit OAuth button press.
- **Privacy & Loopback Preservation**: Zero public exposure; preview remains loopback-only (`127.0.0.1:4174`).
- **Core Immutability**: `src/core/` remains untouched (`git diff --stat f43c6c1d HEAD -- src/core` empty).

---

## 7. Audit Conclusion

Audit summary across the 16 evaluated capability items and constraints:
- **`REAL` (5 items)**: Grounding & source provenance validation engine; Proactive prompt budgeting (3/day) and quiet suppression; Mobile-first contextual shell; Conversational overlay open/close; Invariant against generic forms and static checklists.
- **`SIMULATED` (4 items)**: Proactive agent scenario playback; Ahead-of-ask departure and lunch planning; Piano departure schedule with rain buffer; Unfamiliar city lunch venue recommendations; Ask Yori comparison generation and Home timeline recomputation.
- **`UNWIRED` (4 items)**: Browser geolocation adapter; XMemo cross-device sync & OAuth proxy; Live Open-Meteo weather adapter; Grocery stub plugin.
- **`ABSENT` (3 items)**: Continuous GPS tracking & dwell-time inference; Live Google/Apple calendar integration; Hotel recommendations.

The primary architectural blockers preventing live runtime execution are:
1. In-app model timeout ceiling (2,000 ms) vs. measured live model latency (6.8s – 9.4s for `muse-spark-1.3`).
2. XMemo OAuth callback redirect URI port mismatch (defaults to 5173 instead of preview 4174).
3. Absence of an in-app Live Context toggle (weather flag defaults to off, location not requested in Living Context view).

Resolving these three specific gaps in the proposed **`APP-LIVE-RUNTIME`** slice provides the shortest and safest path to genuine live operation without violating core immutability or compromising sovereign user privacy.
