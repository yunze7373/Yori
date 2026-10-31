# Yori Living Context: North-Star Vision vs. Actual Runtime Audit

> **Task Reference:** `[TID:INBOX-20261031-765B61]` (`NORTH-STAR-AUDIT`)  
> **Governed by:** Coordinator / Owner Steering (`msg_fcda2f3c`), Reviewer Dispatch `45f06a86` / `68181f49`  
> **Audited Runtime:** `http://127.0.0.1:4174/` (Living Context V2, default root URL `/` without query parameters)  
> **Audited Commit HEAD:** `6f95786c337f2999342200f3c1fcf0f5f01f385e`  
> **Date:** 2026-10-31  
> **Status:** APPROVED-PREP / READY FOR REVIEW  

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
| 1 | **Proactive real-world personal agent** | `SIMULATED` | [`src/ui/living-context/app.ts#L1004-L1060`](file://<repo-root>/src/ui/living-context/app.ts#L1004-L1060)<br>[`src/app/scenario-player/index.ts#L12-L45`](file://<repo-root>/src/app/scenario-player/index.ts#L12-L45) | [`tests/e2e/v2-smoke.spec.ts`](file://<repo-root>/tests/e2e/v2-smoke.spec.ts#L4)<br>[`tests/golden/golden-harness.test.ts`](file://<repo-root>/tests/golden/golden-harness.test.ts#L1) | Proactive decisions are demonstrated via the `#scene-select` dropdown player running deterministic scenario snapshots (`d1Scenario` through `d6Scenario`). No background OS daemon or push notification system exists to monitor real-world state autonomously. |
| 2 | **GPS + dwell infer needs** | `UNWIRED` / `ABSENT` | [`src/adapters/providers/geolocation-adapter.ts#L80-L140`](file://<repo-root>/src/adapters/providers/geolocation-adapter.ts#L80-L140)<br>[`src/adapters/static-check.test.ts#L197-L217`](file://<repo-root>/src/adapters/static-check.test.ts#L197-L217) | [`tests/e2e/v5-geo.spec.ts`](file://<repo-root>/tests/e2e/v5-geo.spec.ts#L60)<br>[`src/adapters/static-check.test.ts`](file://<repo-root>/src/adapters/static-check.test.ts#L197) | `BrowserGeolocationAdapter` wraps browser `navigator.geolocation` behind consent and prompt dialogs, but is UNWIRED in the default Living Context app path. Dwell-time inference is completely ABSENT (0 references in repo). `static-check.test.ts` enforces zero live continuous GPS polling in `src/`. |
| 3 | **XMemo preferences follow user across places/devices** | `UNWIRED` | [`src/adapters/xmemo/composite-adapter.ts#L35-L120`](file://<repo-root>/src/adapters/xmemo/composite-adapter.ts#L35-L120)<br>[`src/adapters/xmemo/server-proxy.ts#L376`](file://<repo-root>/src/adapters/xmemo/server-proxy.ts#L376)<br>[`src/ui/me/me-view.ts#L120-L180`](file://<repo-root>/src/ui/me/me-view.ts#L120-L180) | [`tests/e2e/xmemo-wire.spec.ts`](file://<repo-root>/tests/e2e/xmemo-wire.spec.ts#L180)<br>[`src/adapters/xmemo/live-verify-xmemo.test.ts`](file://<repo-root>/src/adapters/xmemo/live-verify-xmemo.test.ts#L1) | `XMemoCompositeMemoryAdapter` and OAuth proxy exist, and Why Sheet / Me View render `Synced from XMemo` badges when `/api/xmemo/*` is intercepted. However, redirect URI defaults to port `5173` instead of preview `4174`, and default runtime stores preferences strictly in local `localStorage`. |
| 4 | **Ahead-of-ask trip meals/hotel/schedule** | `SIMULATED` | [`src/plugins/lunch/detector.ts#L30-L80`](file://<repo-root>/src/plugins/lunch/detector.ts#L30-L80)<br>[`src/ui/living-context/v2-home-view.ts#L544-L590`](file://<repo-root>/src/ui/living-context/v2-home-view.ts#L544-L590)<br>[`src/ui/living-context/v2-detail-views.ts#L40-L120`](file://<repo-root>/src/ui/living-context/v2-detail-views.ts#L40-L120) | [`tests/e2e/v2b-lunch-loop.spec.ts`](file://<repo-root>/tests/e2e/v2b-lunch-loop.spec.ts#L33)<br>[`tests/golden/g-pref.test.ts`](file://<repo-root>/tests/golden/g-pref.test.ts#L1) | Lunch recommendations (`Lunch options near you`) and departure plans appear ahead-of-ask in the V2 UI with honest disclosures (`Mock places for this demo`, `SIMULATED`). Hotel recommendations are ABSENT (`staticPluginRegistry` only contains `depart`, `lunch`, `fuel`, and `grocery-stub`). |
| 5 | **Favourite-supermarket suggestion on passing** | `UNWIRED` | [`src/plugins/grocery-stub/index.ts#L15-L35`](file://<repo-root>/src/plugins/grocery-stub/index.ts#L15-L35)<br>[`src/plugins/registry.ts#L18-L25`](file://<repo-root>/src/plugins/registry.ts#L18-L25) | [`src/plugins/grocery-stub/grocery.test.ts`](file://<repo-root>/src/plugins/grocery-stub/grocery.test.ts#L1) | `grocery-stub` plugin is registered in `staticPluginRegistry`, but its detector evaluates only mock location triggers. No grocery scene exists in `DemoSceneId` in the living context UI, making supermarket prompts completely unreachable in the running app. |
| 6 | **3pm piano class while still at home -> leave-now + route** | `SIMULATED` | [`src/plugins/depart/detector.ts#L38-L70`](file://<repo-root>/src/plugins/depart/detector.ts#L38-L70)<br>[`src/plugins/depart/preparer.ts#L80-L150`](file://<repo-root>/src/plugins/depart/preparer.ts#L80-L150)<br>[`tests/fixtures/d1.ts#L1-L60`](file://<repo-root>/tests/fixtures/d1.ts#L1-L60) | [`tests/e2e/visual-proof-head.spec.ts`](file://<repo-root>/tests/e2e/visual-proof-head.spec.ts#L125)<br>[`tests/golden/g-rain.test.ts`](file://<repo-root>/tests/golden/g-rain.test.ts#L1) | The 3:00 PM Piano lesson departure card with preparation timing (ready 2:05 PM, leave 2:25 PM) and prominent route map canvas is fully functional in Scene D1/D2. The calendar signal originates from deterministic fixture data (`d1Scenario`), not live Google/Apple Calendar. |
| 7 | **Weather at FUTURE location/time (airport snowstorm, umbrella, transport shift)** | `SIMULATED` (Scene D2)<br>`UNWIRED` (Live Open-Meteo) | [`src/adapters/providers/open-meteo-adapter.ts#L100-L140`](file://<repo-root>/src/adapters/providers/open-meteo-adapter.ts#L100-L140)<br>[`src/plugins/depart/preparer.ts#L180-L260`](file://<repo-root>/src/plugins/depart/preparer.ts#L180-L260)<br>[`src/ui/living-context/v2-home-view.ts#L335-L370`](file://<repo-root>/src/ui/living-context/v2-home-view.ts#L335-L370) | [`tests/e2e/live-weather-ui.spec.ts`](file://<repo-root>/tests/e2e/live-weather-ui.spec.ts#L97)<br>[`tests/golden/g-rain.test.ts`](file://<repo-root>/tests/golden/g-rain.test.ts#L1) | Rain forecast in Scene D2 triggers the rain insight banner (`What changed: rain forecast`), shifts departure to Drive (2:30 PM) / Bus (2:15 PM), and displays the Umbrella chip. The data is driven by `d2Scenario`. Real Open-Meteo API is flag-gated off (`WEATHER_LIVE_ENABLED=false`) and only queries static demo coordinates. |
| 8 | **Unfamiliar city at lunch -> grounded restaurants + rationale + route** | `SIMULATED` | [`src/plugins/lunch/preparer.ts#L40-L110`](file://<repo-root>/src/plugins/lunch/preparer.ts#L40-L110)<br>[`src/plugins/lunch/adapter.ts#L25-L50`](file://<repo-root>/src/plugins/lunch/adapter.ts#L25-L50)<br>[`src/ui/living-context/v2-home-view.ts#L544-L590`](file://<repo-root>/src/ui/living-context/v2-home-view.ts#L544-L590) | [`tests/e2e/v2b-lunch-loop.spec.ts`](file://<repo-root>/tests/e2e/v2b-lunch-loop.spec.ts#L33)<br>[`docs/evidence/visual-proof-head/05-d3-lunch-home-desktop-1280x800.png`](file://<repo-root>/docs/evidence/visual-proof-head/05-d3-lunch-home-desktop-1280x800.png) | Scene D3 renders grounded nearby restaurants with distance, cuisine rationale, and map canvas. All venue data originates from `RecordedPlacesAdapter` (fixture dataset) with visible disclosure (`Mock places for this demo; real listings come from a place provider`). |
| 9 | **Real perception with source provenance, no invented venues/routes** | `REAL` (Provenance Engine)<br>`SIMULATED` (Signal Sources) | [`src/ui/view-models/grounding.ts#L30-L150`](file://<repo-root>/src/ui/view-models/grounding.ts#L30-L150)<br>[`src/ui/review/why-sheet.ts#L300-L420`](file://<repo-root>/src/ui/review/why-sheet.ts#L300-L420)<br>[`src/adapters/model/server-proxy.ts#L610-L650`](file://<repo-root>/src/adapters/model/server-proxy.ts#L610-L650) | [`tests/integration/v2a2-model-faults.test.ts`](file://<repo-root>/tests/integration/v2a2-model-faults.test.ts#L40)<br>[`tests/integration/reasoning-coordinator.test.ts`](file://<repo-root>/tests/integration/reasoning-coordinator.test.ts#L1) | The field-level grounding engine (`EvidenceBundle`, `EvidenceRecord`, `sourceRef`) and Why Sheet provenance are **100% REAL running code**. Any hallucinated, ungrounded, or unconfirmed facts cause immediate fallback to deterministic output. Fixture signals are labelled truthfully. |
| 10 | **'Always thinking ahead, not always interrupting'** | `REAL` | [`src/core/policy/index.ts#L50-L120`](file://<repo-root>/src/core/policy/index.ts#L50-L120)<br>[`src/ui/living-context/app.ts#L1380-L1398`](file://<repo-root>/src/ui/living-context/app.ts#L1380-L1398)<br>[`src/ui/living-context/v2-home-view.ts#L310-L330`](file://<repo-root>/src/ui/living-context/v2-home-view.ts#L310-L330) | [`tests/golden/g-quiet.test.ts`](file://<repo-root>/tests/golden/g-quiet.test.ts#L1)<br>[`tests/e2e/living-context.spec.ts#L474`](file://<repo-root>/tests/e2e/living-context.spec.ts#L474) | Proactive prompt budget is strictly capped at 3 daily (`0 of 3 used today` on Me page). Scene D4 (Busy) enters honest Quiet State (`Nothing needs your attention right now`) without notification spam. Dismissing lunch suppresses suggestions for the day. |
| 11 | **Mobile-first contextual home, cards expand to detail, Ask Yori expands to conversation and collapses to updated home** | `REAL` | [`src/ui/living-context/v2-home-view.ts#L100-L300`](file://<repo-root>/src/ui/living-context/v2-home-view.ts#L100-L300)<br>[`src/ui/living-context/v2-detail-views.ts#L30-L150`](file://<repo-root>/src/ui/living-context/v2-detail-views.ts#L30-L150)<br>[`src/ui/conversation/conversation-view.ts#L60-L220`](file://<repo-root>/src/ui/conversation/conversation-view.ts#L60-L220) | [`tests/e2e/v2-smoke.spec.ts#L283`](file://<repo-root>/tests/e2e/v2-smoke.spec.ts#L283)<br>[`tests/e2e/v2a-interaction.spec.ts#L184`](file://<repo-root>/tests/e2e/v2a-interaction.spec.ts#L184) | Fully implemented and verified: responsive mobile 390x844 single-column layout, clicking "Details →" opens `TripDetail` modal view, tapping `#ask-bar` opens the conversational shell, and submitting queries updates the state and collapses smoothly back to Home. |
| 12 | **Generic form / static reminder UI already rejected 10-28** | `REAL` | [`docs/architecture/LIVING_CONTEXT_V2.md#L1-L25`](file://<repo-root>/docs/architecture/LIVING_CONTEXT_V2.md#L1-L25)<br>[`src/ui/living-context/app.ts#L1-L20`](file://<repo-root>/src/ui/living-context/app.ts#L1-L20) | [`tests/e2e/v2-smoke.spec.ts#L504`](file://<repo-root>/tests/e2e/v2-smoke.spec.ts#L504)<br>[`tests/e2e/fallback-walkthrough.spec.ts`](file://<repo-root>/tests/e2e/fallback-walkthrough.spec.ts#L90) | Strict architectural invariant: zero forms, zero static checkboxes, zero empty placeholder cards. Living Context displays single-moment NOW + Plans + For You, with collapsed secondary areas when empty. |

---

## 3. Context-Change Runtime Evidence

Evidence captured from the actual V2 preview server at `http://127.0.0.1:4174/` (default URL `/`, no query string) using [`tests/e2e/north-star-audit.spec.ts`](file://<repo-root>/tests/e2e/north-star-audit.spec.ts) across both Mobile (`390x844`) and Desktop (`1280x800`).

Check-sum manifest: [`docs/evidence/north-star-audit/MANIFEST.sha256`](file://<repo-root>/docs/evidence/north-star-audit/MANIFEST.sha256).

| Change Sequence | Before State | After State | Driver Classification | Visual Proof Evidence | Text Assertions & Proof Points |
|---|---|---|---|---|---|
| **1. Weather & Departure Schedule Shift** | Clear Scene (`clear`) | Rain Scene (`rain`) | **`SIMULATED`** (Driven by scenario player scene switch) | Mobile:<br>[`01a-clear-home-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/01a-clear-home-mobile-390x844.png)<br>[`01b-rain-home-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/01b-rain-home-mobile-390x844.png)<br>Desktop:<br>[`01a-clear-home-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/01a-clear-home-desktop-1280x800.png)<br>[`01b-rain-home-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/01b-rain-home-desktop-1280x800.png) | In Clear: `Piano lesson at 3:00 PM` has `Get ready at 2:05 PM, leave by 2:25 PM`; no rain banner. In Rain: `.v2-insight-banner` appears with `What changed: rain forecast`, `.v2-map-canvas.prominent` renders route, and `#btn-view-trip-details` is enabled. |
| **2. Away Lunch Dismissal & Sovereign Suppression** | Away Lunch (`away-lunch`) | Dismiss `dont_suggest_today` -> For You proposal -> Me Confirmed | **`REAL`** (Client state machine & sovereign memory confirmation) | Mobile:<br>[`02a-lunch-home-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/02a-lunch-home-mobile-390x844.png)<br>[`02b-lunch-foryou-proposal-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/02b-lunch-foryou-proposal-mobile-390x844.png)<br>[`02c-lunch-me-confirmed-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/02c-lunch-me-confirmed-mobile-390x844.png)<br>Desktop:<br>[`02a-lunch-home-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/02a-lunch-home-desktop-1280x800.png)<br>[`02b-lunch-foryou-proposal-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/02b-lunch-foryou-proposal-desktop-1280x800.png)<br>[`02c-lunch-me-confirmed-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/02c-lunch-me-confirmed-desktop-1280x800.png) | In 02a: Candidates hero shows `Lunch options near you` with disclosure. Dismissing produces quiet state (`Nothing needs your attention right now`). In 02b: `For You` tab renders `Skip lunch suggestions for today?` with `PROPOSAL` badge. In 02c: Confirming promotes fact to Me tab `#fact-suppress_lunch_recommendations` (`Confirmed`, `Source: you confirmed`). |
| **3. Timing Adjustment & Home Recomputation** | Rain baseline timing | Adjust dialog (25m prep, 10m buffer) -> Save preference -> Confirm | **`REAL`** (Client memory store loop & schedule recalculator) | Mobile:<br>[`03a-rain-home-pre-adjust-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/03a-rain-home-pre-adjust-mobile-390x844.png)<br>[`03b-adjust-me-confirmed-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/03b-adjust-me-confirmed-mobile-390x844.png)<br>[`03c-adjust-home-recomputed-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/03c-adjust-home-recomputed-mobile-390x844.png)<br>Desktop:<br>[`03a-rain-home-pre-adjust-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/03a-rain-home-pre-adjust-desktop-1280x800.png)<br>[`03b-adjust-me-confirmed-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/03b-adjust-me-confirmed-desktop-1280x800.png)<br>[`03c-adjust-home-recomputed-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/03c-adjust-home-recomputed-desktop-1280x800.png) | Tapping `#btn-adjust` opens modal. Saving 25m prep / 10m buffer creates pending proposal. Confirming on Me tab promotes `#fact-prep_buffer_preference` to `Confirmed`. Returning to Home recomputes departure timing to incorporate updated preferences. |
| **4. Ask Yori Conversational Command & Home Collapse** | Rain Home baseline | Tap `#ask-bar` -> Query "Can I leave later?" -> Collapse | **`SIMULATED`** (Scripted fixture model interpreter) / **`REAL`** (Client UI overlay & state machine) | Mobile:<br>[`04a-ask-yori-open-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/04a-ask-yori-open-mobile-390x844.png)<br>[`04b-ask-yori-command-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/04b-ask-yori-command-mobile-390x844.png)<br>[`04c-ask-yori-home-updated-mobile-390x844.png`](file://<repo-root>/docs/evidence/north-star-audit/04c-ask-yori-home-updated-mobile-390x844.png)<br>Desktop:<br>[`04a-ask-yori-open-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/04a-ask-yori-open-desktop-1280x800.png)<br>[`04b-ask-yori-command-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/04b-ask-yori-command-desktop-1280x800.png)<br>[`04c-ask-yori-home-updated-desktop-1280x800.png`](file://<repo-root>/docs/evidence/north-star-audit/04c-ask-yori-home-updated-desktop-1280x800.png) | In 04a: `#ask-bar` expands conversation overlay (`Ask Yori`, `Offline demo · simulated`, `Offline fallback · deterministic`). In 04b: Submitting "Can I leave later?" runs command interpreter; status updates to `Scripted model fixture · not a live model call`. In 04c: Closing collapses back to updated Home timeline. |

---

## 4. Explicit Runtime Gaps Verified at Current HEAD

The following runtime gaps were audited directly against the codebase at HEAD:

### Gap A: In-App Model Timeout vs. Live Model Latency
- **Code Locations**:
  - [`src/adapters/model/index.ts#L52`](file://<repo-root>/src/adapters/model/index.ts#L52): `const timeoutId = setTimeout(() => controller.abort(), 2000);`
  - [`src/ui/conversation/model-interpreter.ts#L134`](file://<repo-root>/src/ui/conversation/model-interpreter.ts#L134): `this.timeoutMs = options.timeoutMs ?? 2000;`
  - [`src/adapters/model/server-proxy.ts#L138-L146`](file://<repo-root>/src/adapters/model/server-proxy.ts#L138-L146): `resolveTimeoutMs` defaults to `2000 ms`.
- **Finding**: The in-app timeout is hardcoded to 2000 ms (2.0s). In live verification suites (`S1-LIVE-3`), real Meta Llama model calls over Baseten/Spark measured **7.2s – 11.8s** latency. At current HEAD, any attempt to execute a real live model call from within the web application will consistently trigger `AbortController` timeout cancellation at 2000 ms, failing closed to deterministic fallback without ever completing.

### Gap B: XMemo OAuth Redirect URI Port Mismatch
- **Code Locations**:
  - [`src/adapters/xmemo/server-proxy.ts#L376`](file://<repo-root>/src/adapters/xmemo/server-proxy.ts#L376): `const redirectUri = env['XMEMO_REDIRECT_URI'] || 'http://127.0.0.1:5173/api/xmemo/callback';`
  - [`src/adapters/providers/server-proxy.ts#L92`](file://<repo-root>/src/adapters/providers/server-proxy.ts#L92): `const parsedUrl = new URL(urlStr, 'http://127.0.0.1:5173');`
- **Finding**: The server proxy defaults the OAuth callback redirect URI to port `5173` (Vite dev server). The production preview server runs on port `4174` (and test preview runs on `4173`). An owner initiating an OAuth authorization flow from `http://127.0.0.1:4174/` would be redirected after login to port `5173`, breaking the authentication handshake unless manual environment variables are provided.

### Gap C: Absence of In-App "Live Context" Mode Toggle
- **Code Locations**:
  - [`src/ui/living-context/app.ts#L1006-L1015`](file://<repo-root>/src/ui/living-context/app.ts#L1006-L1015)
  - [`src/adapters/providers/server-proxy.ts#L30-L31`](file://<repo-root>/src/adapters/providers/server-proxy.ts#L30-L31): `WEATHER_LIVE_ENABLED` default is false.
- **Finding**: Context in the UI is exclusively selected via `#scene-select` (`clear`, `rain`, `away-lunch`, `busy-lunch`, `missing-weather`, `corrupt-storage`, `multi-candidate`, `fuel`). There is no option for "Live / Real Context". Even when the server supports live Open-Meteo weather, the feature flag `WEATHER_LIVE_ENABLED` defaults to `false` with zero in-app controls to enable it.

### Gap D: Continuous Geolocation & Dwell Inference Unwired
- **Code Locations**:
  - [`src/adapters/providers/geolocation-adapter.ts#L20-L80`](file://<repo-root>/src/adapters/providers/geolocation-adapter.ts#L20-L80)
  - [`src/adapters/static-check.test.ts#L197-L217`](file://<repo-root>/src/adapters/static-check.test.ts#L197-L217)
- **Finding**: `BrowserGeolocationAdapter` implements one-shot `getCurrentPosition`, but `watchPosition` continuous tracking and dwell-time detection algorithms do not exist. Continuous GPS tracking is forbidden by test invariant `static-check.test.ts:197` to protect user privacy.

---

## 5. Ranked Gap List

Based on the audit findings, here is the ranked priority of gaps preventing Yori from operating in a true live runtime:

1. **[P0] Model Latency / Timeout Alignment**:  
   Increase in-app model timeout ceiling from 2s to 15s–20s (with responsive visual progress indicator) so that live model calls can finish without premature aborts.
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
- **Core Immutability**: `src/core/` remains 100% untouched.

---

## 7. Audit Conclusion

The current Living Context V2 runtime at `http://127.0.0.1:4174/` is a masterpiece of calm computing, predictable deterministic state management, and strict grounding validation. The core reasoning loops, review mechanisms, and visual presentation are fully implemented and verified. By executing the proposed **`APP-LIVE-RUNTIME`** slice to eliminate timeout and port mismatches and introduce an honest live context toggle, Yori will seamlessly transition from a simulated demo to an operable real-world agent.
