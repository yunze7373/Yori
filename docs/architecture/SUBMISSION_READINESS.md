# Yori — Submission Readiness & Evidence Index (LIVE_FIRST Chapter Closeout)

> **Governing Document**: `docs/architecture/LIVE_FIRST.plan.json` (rev 4) & `SUBMISSION_READINESS.md`  
> **Target Date**: External Hackathon Submission **2026-11-05 11:00 JST** (Internal Freeze: 2026-11-04)  
> **Status at HEAD**: Implementation complete for S0 through S5; S6 agent-prep complete; pending Owner Smoke.  
> **Core Invariant**: `git diff f43c6c1d HEAD -- src/core` strictly **0 lines** (`AC-EXT-1`).  
> **Zero Credential Invariant**: Zero API keys or secrets in repository, bundle, git history, or chat transcripts.  
> **Zero Billed Call Invariant**: Model live calls default `MODEL_LIVE_ENABLED=false`; ledger remains at 22 calls used (`MODEL_REASONING_BUDGET_CEILING=32`).

---

## 1. Capability Status & Architecture Slice Matrix

| Plan Slice | Status | Dual-Gate Review Decision / Commit | Scope & Verification Summary |
|---|:---:|---|---|
| **S0-LIVE-CONTRACTS** | **ACCEPTED** | `4df33068` @ `dcf32ce` | Schema contracts for live signals, engine status (`meta_model_live`, `recorded_model_replay`, `offline_deterministic`), provenance tagging, and connection blocks. |
| **S1-LIVE-PIPELINE-CORE** | **ACCEPTED** | `321b0e91` @ `483faec` | Loopback server proxy architecture (`/api/model`, `/api/places`, `/api/route`, `/api/weather`, `/api/calendar`, `/api/xmemo`). Zero browser-side outbound calls. Host allowlist & fail-closed error handling. |
| **S2-LIVE-DEFAULT** | **ACCEPTED** | `000ef33` @ `c8d8b60` | Live mode set as default first open (`contextMode = 'live'`). Truthful consent gate (`Location Needed` / `Share Location`), honest zero-fixture baseline, dual-viewport verification at 390×844 and 1280×800. |
| **S3-LIVE-LUNCH** | **ACCEPTED** | `01abccb` @ `242cf1c` | Real nearby lunch candidates from Overpass records with distance math, verified open-now and cuisine tagging. Fallback to honest empty/denied/gated states when location or provider is unavailable. |
| **S4-LIVE-DEPART** | **ACCEPTED-NARROWED** | `d3647b5` @ `5adb5ea1` | Live departure planning with real current-conditions Open-Meteo weather and OSRM routing. **Narrowed**: Current-conditions weather only (target-time forecast, multimodal transit, and rain-driven earlier departure are deferred). |
| **S4c-RAIN-BUFFER-OPT** | **NOT-APPLICABLE** | Plan rev 4 conditional | User-confirmed conditional rain buffer rule. Conditional only if explicitly requested by owner; not required for chapter closeout. |
| **S5-LIVE-REASON** | **ACCEPTED** | `bfb39ded` @ `b956132` | Model interpreter live path with runtime fact check, session budget enforcement (hard ceiling 32 lowering-only), honest engine status pill across all viewports, responsive 2-line header wrap at 390×844, and unoccluded action row on first paint. |
| **S6-OWNER-SMOKE (agent-prep)** | **READY-FOR-SMOKE** | Bound to current commit | Release blocker resolved: zero dead Settings controls (desktop left nav and mobile header avatar route cleanly to Settings > Connectors). Honest evidence index, deferred gap disclosures, and owner smoke checklist prepared. |

---

## 2. Live Module Evidence Index & Terminal Gate Mapping

Every live capability in Yori is classified under the **BLOCKED-terminal rule**: each module is either **ACCEPTED** with verified real-provider evidence, or **BLOCKED** pending a named owner gate whose failure/unavailability is verified via shipped, fail-closed connection-block UX.

| Live Module | Status | Named Owner Gate | Shipped Connection-Block UX (Offline / Fallback) | Evidence Stills (390×844 Mobile & 1280×800 Desktop) |
|---|:---:|---|---|---|
| **Geolocation / Device GPS** | **ACCEPTED** | `Browser Location Consent` (User Allow prompt) | Renders `Location Needed` quiet state with `Share Location` button; `Location access blocked` with settings instructions if denied. | `docs/evidence/live-default/01-default-live-first-open-390.png`<br>`docs/evidence/live-default/02-default-live-first-open-1280.png`<br>`docs/evidence/s2-connectors/06-connectors-location-denied-mobile.png` |
| **Open-Meteo Weather** | **ACCEPTED** | `GATE-W1` (Terms qualification: keyless non-commercial) | Dynamic city weather reading from Open-Meteo with CC BY 4.0 attribution; fail-closed `Weather unavailable` banner on error/offline. | `docs/evidence/live-depart/01-live-depart-connection-block-390x844.png`<br>`docs/evidence/live-depart/02-live-depart-connection-block-1280x800.png`<br>`docs/evidence/s2-connectors/03-connectors-weather-live-mobile.png` |
| **Overpass Nearby Places** | **BLOCKED-accepted** | `PLACES_LIVE_ENABLED=1` (Owner decision b) | Displays `Nearby places · not enabled (owner setting)`. Renders candidate tiles only when provider returns valid OSM tags. | `docs/evidence/live-lunch/01-live-lunch-390x844.png`<br>`docs/evidence/live-lunch/02-live-lunch-1280x800.png`<br>`docs/evidence/l3-real-places/` |
| **OSRM Route & Map** | **BLOCKED-accepted** | `ROUTING_LIVE_ENABLED=1` (Owner decision a) with FOSSGIS | Displays `Walking route · not enabled (owner setting)`; falls back gracefully to straight-line distance without schematic SVG lines. | `docs/evidence/live-depart/01-live-depart-connection-block-390x844.png`<br>`docs/evidence/live-depart/02-live-depart-connection-block-1280x800.png` |
| **Live Calendar (iCal)** | **BLOCKED-accepted** | `CALENDAR_ICS_URL=<url>` (Owner personal feed) | Displays `Calendar · not configured (owner setting)`; Connectors view shows honest `Not available yet` pill. | `docs/evidence/live-depart/01-live-depart-connection-block-390x844.png`<br>`docs/evidence/s2-connectors/02-connectors-default-mobile.png` |
| **Meta Model Reasoning** | **BLOCKED-accepted** | `MODEL_LIVE_ENABLED=1` + Budget Approval ($\le 10$ calls, ledger $\le 32/50$) | Displays `Offline fallback · deterministic` (or `Recorded Meta model output · replay` during test fixtures); falls back instantly to grammar on budget ceiling (32). | `docs/evidence/live-reason/live-reason-mobile-390x844-home.png`<br>`docs/evidence/live-reason/live-reason-desktop-1280x800-home.png`<br>`docs/evidence/live-reason/live-reason-fallback-status.png` |
| **XMemo Cloud Memory** | **BLOCKED-accepted** | `XMemo PKCE Login` (Browser consent on personal vault) | Connectors view shows `Not connected · tap Connect to sign in via PKCE`; local storage fallback remains active source of truth. | `docs/evidence/s2-connectors/08-connectors-xmemo-connected-mobile.png`<br>`docs/evidence/s2-connectors/08-connectors-xmemo-connected-desktop.png` |
| **Settings Navigation** | **ACCEPTED** | *None (Release Blocker Resolved)* | `#desktop-nav-settings` and mobile avatar `#btn-header-avatar` route directly to interactive Settings > Connectors screen with focus restoration. | Verified via `tests/e2e/s2-connectors.spec.ts` Gate 11. |

---

## 3. Explicit Disclosure of Deferred North-Star Gaps

In adherence to Yori's core principle of **ruthless engineering truthfulness**, the following capabilities are explicitly disclosed as **NOT delivered** in this submission (governed by `BACKLOG S4DEPART-P3(e)` and Architect Feasibility Note `docs/architecture/TARGET_TIME_FORECAST_NOTE.md`):

1. **Target-Time Weather Forecast for Departure Window**:
   - **Status**: **NOT DELIVERED** (Architect feasibility note delivered; implementation deferred).
   - **Current Implementation**: The departure plan displays *current-conditions weather* at the user's location (`Rain now · take an umbrella` or `Clear now`).
   - **No Claim**: We make **no claim** that the system queries or acts upon hourly forecast bins for future departure/arrival times.

2. **Rain-Driven Earlier Departure Calculation**:
   - **Status**: **NOT DELIVERED**.
   - **Current Implementation**: Departure calculation uses fixed single-mode driving duration math from OSRM. Core duration logic is unmodified (`AC-EXT-1` core diff remains 0 lines).
   - **No Claim**: We make **no claim** that rainy conditions automatically move departure time earlier without confirmed user buffer rules (S4c).

3. **Multimodal Transit Re-ranking**:
   - **Status**: **NOT DELIVERED**.
   - **Current Implementation**: The application supports single-mode road routing. Transit options (train, subway, bus) are not connected to live public transit GTFS/APIs.
   - **No Claim**: We make **no claim** of full multimodal travel re-planning.

---

## 4. One-Page Owner Smoke Checklist

> [!IMPORTANT]
> **Owner Execution Only**: This smoke run must be conducted by the human owner on their personal device. Agents are forbidden from reading, handling, or entering API credentials, billing tokens, or OAuth secrets.

### Prerequisites (3 minutes)
1. **Pull Clean Repository**:
   ```bash
   git checkout main && git status
   ```
2. **Build Shipping Distribution**:
   ```bash
   npm install && npm run build
   ```
3. **Configure Optional Local Gates** (in `.env.local` — NEVER commit):
   - Location: Granted directly via browser permission dialog.
   - Live Weather: Enabled by default (keyless Open-Meteo).
   - Places (Overpass): Set `PLACES_LIVE_ENABLED=1` in `.env.local` if testing live Tokyo/SF dining places.
   - Routing (OSRM): Set `ROUTING_LIVE_ENABLED=1` in `.env.local` if testing live foot routing.
   - Calendar: Set `CALENDAR_ICS_URL=https://...` with your public or unlisted iCal feed if testing live calendar events.
   - Model Reasoning: Set `META_MODEL_API_KEY=<key>` and `MODEL_LIVE_ENABLED=1` ONLY if approving up to 10 live calls (budget cap $\le 32$ total; current ledger is 22).

### Smoke Steps (5 minutes)
1. **Launch Shipping Server**:
   ```bash
   npm run preview
   ```
   Open `http://localhost:4174/` in your browser (Chrome or Safari).

2. **Verify First-Open Truthfulness**:
   - Confirm `#quiet-title` displays **Location Needed** with the **Share Location** button.
   - Confirm `#living-header-chip` displays `live`.
   - Confirm `#model-status-pill` displays `Offline fallback · deterministic` (zero phantom live claims).
   - Confirm zero fixture/simulated badges are present.

3. **Verify Settings Navigation (Release Blocker Verification)**:
   - **Desktop (>=1024px)**: Click **Settings** in the left sidebar nav (`#desktop-nav-settings`).
     - Confirm the **Settings > Connectors** screen renders in the center column.
     - Press `Escape` or click `<` (Back) — confirm focus returns to the Settings sidebar button.
   - **Mobile (390px)**: Tap the header avatar button (`#btn-header-avatar`).
     - Confirm the **Me** tab opens. Tap **Manage Connectors**.
     - Confirm the Connectors list appears with truthful status pills for Location, Calendar, Weather, XMemo, and Notifications.

4. **Test Location Consent**:
   - Tap **Share Location** on the Home screen.
   - In your browser's site permissions prompt, choose **Allow**.
   - Confirm the home card updates with your local weather and coordinates (rounded to 3 decimal places for privacy; no raw coordinates logged).

5. **Test Provider Responses (Gated vs Enabled)**:
   - If `PLACES_LIVE_ENABLED` is off: confirm the card reads `Nearby places · not enabled (owner setting)`.
   - If `CALENDAR_ICS_URL` is unset: confirm the calendar row reads `Calendar · not configured (owner setting)`.
   - If `MODEL_LIVE_ENABLED` is on: ask a conversational re-rank query (e.g. "somewhere quiet with vegetarian options") and confirm the engine pill transitions to `Meta model · live` with measured latency.
   - Check the call ledger:
     ```bash
     cat src/adapters/model/.model-ledger.json
     ```
     Confirm `lifetimeCallsUsed` $\le 32$.

---

## 5. Chapter Closeout Verification Matrix

Executed from a clean worktree at HEAD (`b956132`):

| Test Suite / Gate | Command | Result | Pass Bar |
|---|---|:---:|:---:|
| **TypeScript Typecheck** | `npm run typecheck` | **0 errors** | 0 errors |
| **Unit & Boundary Tests** | `npm test` | **52 files, 1,030 passed** | 100% pass |
| **Model Boundary Suite** | `npx vitest run tests/proxy-boundary/model-proxy.test.ts` | **12 passed** | 100% pass |
| **Golden Acceptance & Drills** | `npx vitest run src/core/golden-master.test.ts src/core/degradation-drills.test.ts` | **74 passed** | 100% pass |
| **Production Build Audit** | `npm run verify:production` | **0 violations** | 0 `__YORI_*` hooks, 0 external font hosts |
| **Full Playwright E2E Suite** | `npx playwright test` | **554 passed, 2 skipped, 0 failed** | Zero unhandled failures |
| **Settings Blocker Verification** | `npx playwright test tests/e2e/s2-connectors.spec.ts -g "Release Blocker"` | **2 passed (mobile + desktop)** | Touch target $\ge 44\text{px}$, Escape/Back restore focus |
| **Core Invariant Check** | `git diff f43c6c1d HEAD -- src/core` | **0 lines changed** | Strictly 0 diff (`AC-EXT-1`) |

*Known Test Flakes (Environment/Network Tile Dependent)*:
- `real-map.spec.ts:157`: Relies on live OpenStreetMap tile download speed over external internet; falls back gracefully.
- `ui-polish.spec.ts:249`: Timing race on hidden duplicate weather callout; passes in isolated runs.
