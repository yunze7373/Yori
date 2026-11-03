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
| **S0-LIVE-CONTRACTS** | **ACCEPTED** | `70bf95aa` @ `61b3b9e` | Schema contracts for live signals, envelope validation, engine status (`meta_model_live`, `recorded_model_replay`, `offline_deterministic`), provenance tagging, and connection blocks. |
| **S1-LIVE-PIPELINE-CORE** | **ACCEPTED** | `874cc7c1` @ `c2ed098` | Loopback server proxy architecture (`/api/model`, `/api/places`, `/api/route`, `/api/weather`, `/api/calendar`, `/api/xmemo`). Zero browser-side outbound calls. Host allowlist & fail-closed error handling. |
| **S2-LIVE-DEFAULT** | **ACCEPTED** | `1cc34ee7` @ `000ef33` | Live mode set as default first open (`contextMode = 'live'`). Truthful consent gate (`Location Needed` / `Use My Location`), honest zero-fixture baseline, dual-viewport verification at 390×844 and 1280×800. |
| **S3-LIVE-LUNCH** | **ACCEPTED** (Implementation)<br>**BLOCKED-accepted** (Live proof) | `0579ea09` @ `01abccb` | Nearby lunch candidate pipeline with distance math, verified open-now and cuisine tagging from recorded Overpass OSM fixtures. Live proof gated behind owner decision (b) (`PLACES_LIVE_ENABLED=1`). Honest empty/denied/gated fallback states. |
| **S4-LIVE-DEPART** | **ACCEPTED-NARROWED** (Implementation)<br>**BLOCKED-accepted** (Live proof) | `5adb5ea1` @ `d3647b5` | Live departure planning adapter with honest single-mode rain differential (`Rain now · take an umbrella`, leave-by time unchanged), verified on recorded Open-Meteo and OSRM fixtures. **Narrowed**: multimodal transit is deferred (D6). Target-time forecast and the user-confirmed rain buffer were delivered later in **D5-LIVE-FORECAST** (see §3, items 1–2). Live proof gated behind `WEATHER_LIVE_ENABLED=1`, `ROUTE_LIVE_ENABLED=1`, and `CALENDAR_ICS_URL`. |
| **S4c-RAIN-BUFFER-OPT** | **DELIVERED in D5** (rule) | D5-LIVE-FORECAST (DEMO_RESCUE rev12) | A user-confirmed `rain_buffer_minutes` fact (`user_confirmed` provenance, integer 1–60) moves leave-by earlier by exactly those minutes, and only when the trip-window forecast expects rain. There is **no in-app control to set the rain buffer yet** (BACKLOG). In this build the rule reads only an existing confirmed memory fact; it never creates one. |
| **S5-LIVE-REASON** | **ACCEPTED** (Implementation)<br>**BLOCKED-accepted** (Live proof) | `bfb39ded` @ `b956132` | Model interpreter live path with runtime fact check, session budget enforcement (hard ceiling 32 lowering-only, persistent call ledger at 22/32), honest engine status pill across viewports, responsive header wrap at 390×844. Live proof gated on explicit owner budget approval ($\le 10$ calls, ledger $\le 32/50$). |
| **S6-OWNER-SMOKE (agent-prep)** | **READY-FOR-SMOKE** | Bound to HEAD | Release blocker resolved: zero dead Settings controls (`#desktop-nav-settings` and mobile avatar `#btn-header-avatar` route cleanly to Settings > Connectors). Honest evidence index, deferred gap disclosures, and owner smoke checklist prepared. |

---

## 2. Live Module Evidence Index & Terminal Gate Mapping

Every live capability in Yori is classified under the **BLOCKED-terminal rule**: each module is either **ACCEPTED** with real device/browser API evidence (Geolocation consent, Settings navigation), or **BLOCKED-accepted** pending a named owner gate whose failure/unavailability is verified via shipped, fail-closed connection-block UX with recorded/mocked evidence.

| Live Module | Status | Named Owner Gate | Shipped Connection-Block UX (Offline / Fallback) | Evidence Stills (390×844 Mobile & 1280×800 Desktop) |
|---|:---:|---|---|---|
| **Geolocation / Device GPS** | **ACCEPTED** | `Browser Location Consent` (User tap `Use My Location` and browser Allow prompt) | Renders `Location Needed` first-open state with `Use My Location` button (`#btn-request-location`). If denied by user, renders `Location Denied` with headline `Location access denied by user` and notice `Location access was denied. Grant permission to discover nearby dining.`. | `docs/evidence/live-default/01-default-live-first-open-390.png`<br>`docs/evidence/live-default/02-default-live-first-open-1280.png`<br>`docs/evidence/s2-connectors/06-connectors-location-denied-mobile.png` (Real browser geolocation API verified in Playwright) |
| **Open-Meteo Weather** | **ACCEPTED** (D1 device-fix weather @`87c917a`; default ON since D2 after the owner §9 confirmation) | `WEATHER_LIVE_ENABLED` (default ON; `false` switches it off) + `GATE-W1` (keyless non-commercial). Queried at the consented fix rounded to 3 decimals; `DEMO_CITY_*` is dev-only (`?dev=1`) | Before consent: no weather request and the header reads `Weather unavailable`. After **Use My Location**: `Weather near you` with `Open-Meteo · near you · as of <time>`. With the flag set to `false`: `Off (owner setting)` and Connectors reads `Live weather is off (owner setting)`. | `docs/evidence/live-depart/01-live-depart-connection-block-390x844.png` (connection-block capture)<br>`docs/evidence/live-depart/02-live-depart-connection-block-1280x800.png` (connection-block capture)<br>`docs/evidence/s2-connectors/03-connectors-weather-live-mobile.png` (mocked/recorded fixture capture) |
| **Overpass Nearby Places** | **ACCEPTED** on recorded provider data (D2); default ON after the owner §9 confirmation | `PLACES_LIVE_ENABLED` (default ON; `false` switches it off) | After consent: **Nearby now** (any hour) or the meal window shows candidates with straight-line distance, open status from OSM opening_hours only (`Open now` / `Hours unknown`) and a reason (confirmed taste, open now, or nearest), ODbL attribution. With the flag `false`: `Nearby restaurants are off (owner setting)`. | `docs/evidence/live-lunch/01-live-lunch-390x844.png` (connection-block capture)<br>`docs/evidence/live-lunch/02-live-lunch-1280x800.png` (connection-block capture)<br>`docs/evidence/l3-real-places/` (recorded ODbL fixture captures) |
| **OSRM Route & Map** | **ACCEPTED** (Implementation); default ON after the owner §9 confirmation | `ROUTE_LIVE_ENABLED` (default ON; `false` switches it off) + `OSRM_FOOT_BASE_URL` (FOSSGIS foot server) | Displays route unavailable notice with `provider disabled` label; falls back to straight-line distance (`Walking time unavailable · straight-line <d>`). Real OSM tiles rendered via Leaflet only with location consent and active destination. | `docs/evidence/live-depart/01-live-depart-connection-block-390x844.png` (connection-block capture)<br>`docs/evidence/live-depart/02-live-depart-connection-block-1280x800.png` (connection-block capture) |
| **Live Calendar (iCal)** | **BLOCKED-accepted** (Implementation ACCEPTED; live proof gated on owner secret) | `CALENDAR_LIVE_ENABLED=1` + `CALENDAR_ICS_URL=<url>` (Owner personal secret iCal feed; agents never read or handle) | Displays `No calendar source · paste secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat`; Connectors view displays honest `Not available yet` pill. | `docs/evidence/live-depart/01-live-depart-connection-block-390x844.png` (connection-block capture)<br>`docs/evidence/s2-connectors/02-connectors-default-mobile.png` (offline/default capture) |
| **Meta Model Reasoning** | **BLOCKED-accepted** (Implementation ACCEPTED; live proof gated on owner budget) | `MODEL_LIVE_ENABLED=1` + explicit owner budget approval ($\le 10$ calls, ledger cap $\le 32/50$; API key `MODEL_API_KEY` or `META_API_KEY` already present in `.env.local`) | Displays `Offline fallback · deterministic` (or `Recorded Meta model output · replay` during test fixtures); falls back instantly to deterministic grammar on budget ceiling (32) or error. | `docs/evidence/live-reason/live-reason-mobile-390x844-home.png` (recorded replay capture)<br>`docs/evidence/live-reason/live-reason-desktop-1280x800-home.png` (recorded replay capture)<br>`docs/evidence/live-reason/live-reason-fallback-status.png` (fallback state capture) |
| **XMemo Cloud Memory** | **BLOCKED-accepted** (Implementation ACCEPTED; live proof gated on owner login) | `XMemo PKCE Login` (Browser consent on personal vault) | Connectors view shows `Not connected · tap Connect to sign in`; local storage fallback remains active source of truth. | `docs/evidence/s2-connectors/08-connectors-xmemo-connected-mobile.png` (offline/stub capture)<br>`docs/evidence/s2-connectors/08-connectors-xmemo-connected-desktop.png` (offline/stub capture) |
| **Settings Navigation** | **ACCEPTED** (Implementation & UI verified) | *None (Release Blocker Resolved)* | `#desktop-nav-settings` and mobile avatar `#btn-header-avatar` route directly to interactive Settings > Connectors screen with focus restoration on Escape/Back. | Verified via `tests/e2e/s2-connectors.spec.ts` Gate 11. |

---

## 3. Explicit Disclosure of Deferred North-Star Gaps

In adherence to Yori's core principle of **ruthless engineering truthfulness**, the following capabilities are explicitly disclosed as **NOT delivered** in this submission (governed by `BACKLOG S4DEPART-P3(e)` and Architect Feasibility Note `docs/architecture/TARGET_TIME_FORECAST_NOTE.md`):

1. **Target-Time Weather Forecast for Departure Window**:
   - **Status**: **DELIVERED in D5-LIVE-FORECAST** (No-Claim retired).
   - **What happens:**
     - **Request:** for the next real Live depart plan, the app requests Open-Meteo hourly bins (`/api/weather/forecast`) for the `[leave-by, appointment]` window. It uses only the consented, 3-decimal fix; without consent there is no request.
     - **Signal:** a forecast signal carries `issuedAt`, `validFor`, a `validAt` window, confidence 0.8 (below 1.0) and `provenance: open_meteo_forecast`.
     - **Rain:** rain in the window adds the umbrella and a forward-looking rationale (`Rain expected 2:00–3:00 PM`).
     - **Fallback:** missing bins fall back to current conditions, labelled *Forecast unavailable · using current conditions*. A forecast older than its `validFor` is never used: current conditions take over, labelled *Forecast expired · using current conditions*, and the forecast is re-requested at most once per `validFor` window per event. If current conditions are missing as well, the label says so (*… no current conditions either*).
   - **Evidence:**
     - `tests/proxy-boundary/weather-forecast-proxy.test.ts`: validation without echo, fields mask, timeout, fail-closed.
     - `src/plugins/depart/forecast.test.ts`.
     - `tests/e2e-live/live-forecast.spec.ts`: recorded bins at 390×844 and 1280×800; no request before consent.
     - `docs/evidence/demo-rescue-d5/`.
   - **Remaining limits:** the forecast is for the device fix's area, not a geocoded destination. No background tracking.

2. **Rain-Driven Earlier Departure Calculation**:
   - **Status**: **DELIVERED in D5, via the user-confirmed buffer only** (No-Claim retired).
   - **What happens:**
     - **Rain expected:** leave-by moves earlier by exactly the user's confirmed `rain_buffer_minutes`. The fact must have `user_confirmed` provenance; it is cited in the plan's Why. A sample, pending or out-of-range value is never applied.
     - **No buffer set:** the leave-by stays unchanged, and the Now card says *Forecast · leave-by unchanged, no rain buffer set*.
     - **Travel time:** no travel durations are invented. Core duration logic is unmodified (`AC-EXT-1` core diff 0 lines).
   - **Still no claim:** rain never changes the mode or the travel time by itself (mode switch = D6).

3. **Multimodal Transit Re-ranking**:
   - **Status**: **NOT DELIVERED**.
   - **Current Implementation**: The application supports single-mode road routing. Transit options (train, subway, bus) are not connected to live public transit GTFS/APIs.
   - **No Claim**: We make **no claim** of full multimodal travel re-planning.
   - **D6-MULTIMODAL-TRANSIT: CUT** (2026-11-03).
     - **Spike:** Google Routes `TRANSIT` returned **no routes** for two public Tokyo pairs (HTTP 200,
       2 billed calls, ledgered). Evidence: `docs/evidence/demo-rescue-d6/SPIKE.md`.
     - **What remains:** no transit, walk or mode-switch options are offered. Rain re-ranking by real
       durations is not claimed. Leave-by moves earlier only through the user-confirmed rain buffer
       (D5 / S4c).

4. **Device-Location Dynamic Weather**:
   - **Status**: **DELIVERED in D1** (`87c917a`): current conditions at the consented fix.
   - **Current Implementation**: `/api/weather/current?coords=lat,lng` (validated, re-rounded to 3 decimals, never logged) queries Open-Meteo at the device fix. Without consent Live sends no weather request at all. `DEMO_CITY_*` applies only to the dev demo (`?dev=1`) and recorded tests.
   - **No Claim**: no background tracking (the fix is per session and refreshed only while the app is open). The target-time forecast for a depart plan is delivered in D5 (item 1).

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
3. **Configure Optional Local Gates** (in `.env.local` — NEVER commit; agents never read or paste secrets):
   - **Location**: Granted directly via browser permission dialog upon clicking **Use My Location**. Consent is per session: every new session asks again, and no provider is called before it.
   - **Phone demo surface (E, primary)**: serve on Mac port 4174 (`npm run preview -- --port 4174`), forward it with `ssh -N -R 4174:localhost:4174 op8t`, and open `http://localhost:4174` in phone Chrome (a secure context, no certificate). The proxies accept only Host ports 4173/4174/5173, so the phone must use port 4174. Exact steps and the mkcert / USB / Mac fallbacks: `docs/demo/DEMO_HTTPS.md`.
   - **Keyless trio (default ON since your §9 confirmation)**: `WEATHER_LIVE_ENABLED`, `PLACES_LIVE_ENABLED` and `ROUTE_LIVE_ENABLED` need no setting. Set any of them to `false` to switch that provider off. Weather follows your shared location; the `DEMO_CITY_NAME` / `DEMO_CITY_LAT` / `DEMO_CITY_LON` / `DEMO_CITY_TIMEZONE` variables only affect the dev demo (`?dev=1`).
   - **Places (Overpass)**: on by default; live dining queries via OpenStreetMap Overpass (ODbL) after location consent.
   - **Routing (OSRM)**: on by default; live road routing via OSRM demo. For walking routes, `OSRM_FOOT_BASE_URL` defaults to FOSSGIS (`https://routing.openstreetmap.de/routed-foot`).
   - **Calendar (iCal)**: Default is `false`. Set `CALENDAR_LIVE_ENABLED=true` (or `1`) and set `CALENDAR_ICS_URL=<your-secret-url>` with your personal iCal feed URL.
   - **Geocoder (Nominatim)**: Default is `false`. Set `GEOCODE_LIVE_ENABLED=true` (or `1`) to enable Nominatim address resolution (rate-limited to 1 req/s).
   - **Model Reasoning**: `MODEL_API_KEY` (or alias `META_API_KEY`) is already present in `.env.local`. Default is `MODEL_LIVE_ENABLED=false` (or `'0'`). Set `MODEL_LIVE_ENABLED=1` ONLY if explicitly approving up to 10 live calls ($\le 32$ total ceiling; current ledger is 22).

### Smoke Steps (5 minutes)
1. **Launch Shipping Server**:
   ```bash
   npm run build && npx vite preview --port 4174
   ```
   Open `http://localhost:4174/` in your browser (Chrome or Safari).

2. **Verify First-Open Truthfulness (Offline Baseline)**:
   - Confirm `#quiet-title` displays `Location Needed` with the `Use My Location` button (`#btn-request-location`).
   - Confirm `#living-header-chip` displays `live`.
   - Confirm `#model-status-pill` displays `Offline fallback · deterministic` (zero phantom live claims).
   - Confirm the living header displays `Weather unavailable` before location consent (no weather request is sent), or `Weather: Off` when `WEATHER_LIVE_ENABLED=false`.
   - Confirm zero fixture/simulated badges are present.

3. **Verify Settings Navigation (Release Blocker Verification)**:
   - **Desktop ($\ge 1024\text{px}$)**: Click **Settings** in the left sidebar nav (`#desktop-nav-settings`).
     - Confirm the **Settings > Connectors** screen renders in the center column (`#connectors-page`), and the Settings nav item shows active (`aria-current="page"`).
     - Press `Escape` or click `<` (Back) — confirm focus returns to `#desktop-nav-settings`.
   - **Mobile ($390\text{px}$)**: Tap the header avatar button (`#btn-header-avatar`).
     - Confirm the **Me** tab opens. Tap **Manage Connectors** (`#btn-me-connectors`).
     - Confirm the Connectors list appears with truthful status messages (e.g. weather `Open-Meteo · follows your shared location (rounded ~100 m)`, or `Live weather is off (owner setting)` when switched off, and `Not connected · tap Connect to sign in` for XMemo).

4. **Test Location Consent**:
   - Tap `Use My Location` (`#btn-request-location`) on the Home screen.
   - In your browser's site permissions prompt:
     - If you choose **Block** / **Deny**: confirm the card renders `Location Denied` with headline `Location access denied by user`.
     - If you choose **Allow**: confirm the card updates with your local coordinates (rounded to 3 decimal places for privacy; no raw coordinates logged). Weather and nearby dining both use that rounded fix: confirm `Weather near you` appears, then tap **Nearby now** for restaurants around you.

5. **Test Provider Responses (Gated vs Enabled)**:
   - If `PLACES_LIVE_ENABLED=false`: confirm the quiet home displays `Nearby restaurants are off (owner setting)` (with a confirmed taste fact the card headline also reads `Nearby places · not enabled (owner setting)`).
   - If `CALENDAR_LIVE_ENABLED` or `CALENDAR_ICS_URL` is unset: confirm calendar displays `No calendar source · paste secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat` (or Connectors view shows `Not available yet`).
   - If `ROUTE_LIVE_ENABLED=false`: confirm routing displays route unavailable notice with `provider disabled` label.
   - If `MODEL_LIVE_ENABLED=1`: ask a conversational query in the Ask bar and confirm the engine pill transitions to `Meta model · live` with measured latency.
   - Check the call ledger:
     ```bash
     cat .yori-runtime/model-live-ledger.json
     ```
     Confirm the `call_count` field is $\le 32$ (current value: 22).

---

## 5. Chapter Closeout Verification Matrix

Executed across chapter closeout commits (`c7e0924` / `59785fb`):

| Test Suite / Gate | Command | Result | Pass Bar |
|---|---|:---:|:---:|
| **TypeScript Typecheck** | `npm run typecheck` | **0 errors** | 0 errors |
| **Unit & Boundary Tests** | `npm test` | **53 files, 1,035 passed** | 100% pass |
| **Model Boundary Suite** | `npx vitest run tests/proxy-boundary/model-proxy.test.ts` | **12 passed** | 100% pass |
| **Checklist Drift Guard** | `npx vitest run src/adapters/smoke-checklist-drift.test.ts` | **5 passed** | 100% pass |
| **Golden Acceptance & Drills** | `npx vitest run tests/golden tests/integration` | **8 files, 74 passed (18 golden + 56 drills)** | 100% pass |
| **Production Build Audit** | `npm run verify:production` | **0 violations** | 0 `__YORI_*` hooks, 0 external font hosts |
| **Full Playwright E2E Suite** | `npx playwright test` | **555 passed, 2 skipped, 1 failed (`real-map:157` known flake)** | Zero unhandled failures |
| **Settings Blocker Verification** | `npx playwright test tests/e2e/s2-connectors.spec.ts -g "Release Blocker"` | **2 passed (mobile + desktop)** | Touch target $\ge 44\text{px}$, Escape/Back restore focus |
| **Core Invariant Check** | `git diff f43c6c1d HEAD -- src/core` | **0 lines changed** | Strictly 0 diff (`AC-EXT-1`) |

*Known Test Flakes (Environment/Network Tile Dependent)*:
- `real-map.spec.ts:157`: Relies on live OpenStreetMap tile download timing over external internet; falls back gracefully.
- `ui-polish.spec.ts:249`: Timing race on hidden duplicate weather callout; passes in isolated runs.
