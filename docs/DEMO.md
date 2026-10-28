# Yori Living Context Demo Guide (Phase 2 PH-002)

Welcome to Yori, the calm, proactive context-aware assistant. This guide details how to run the application, explore simulated demo scenes, understand review and memory mechanics, and inspect the optional AI reasoning and cloud memory integrations.

---

## 🚀 How to Run

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start development server (loopback-only on 127.0.0.1:5173)
npm run dev

# 3. Or build and run production preview
npm run build
npm run preview
```
Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)** in your browser (mobile-friendly at 390×844 or desktop at 1280×800).

### Running Tests
```bash
# Run type checks
npm run typecheck

# Run unit & integration test suites (231 tests)
npm test

# Run golden acceptance harness (D1–D6 + AC-EXT-1)
npm run test:golden

# Run degradation drills (NFR-102/103 fault-injection invariance)
npm run test:drills

# Run Playwright E2E verification (38 tests)
npm run test:e2e
```

---

## 🎬 Demo Scene Script

Use the **Demo Scenes** selector at the top-right of the navigation bar to test different context scenarios:

1. **Clear Departure (D1)**
   - **Context**: Calendar appointment "Piano lesson" at 3:00 PM, travel time 30 min, buffer 5 min, prep 20 min under clear skies.
   - **NOW Card**: Shows "Get ready at 2:05 PM, leave by 2:25 PM".
   - **Actions**: Tap **Why** to inspect evidence citations and local derivation; tap **Accept** to confirm departure (with **Undo** affordance).

2. **Rain Re-Plan (D2)**
   - **Context**: Sudden rain forecast issued at 1:35 PM valid for the departure window.
   - **NOW Card**: Dynamically includes an **Umbrella** checklist chip and two ranked transit tiles: Drive (2:30 PM, ranked first by confirmed habit) and Bus (2:15 PM).
   - **Memory**: Personal habit fact explains why driving is prioritized over transit.

3. **Away Lunch (D3)**
   - **Context**: User is away from home at 12:10 PM with an adequate free schedule window and has not eaten lunch.
   - **NOW Card**: Recommends up to 3 dining options within walking distance matching confirmed taste memories (`Japanese`, `Salad`).

4. **Busy Lunch (D4)**
   - **Context**: User has back-to-back meetings or already logged lunch.
   - **Living Context**: Surfaces an honest, calm quiet state: "Nothing needs your attention right now." Shared core policy records `user_busy` or `already_done` suppression.

5. **Missing / Stale Weather (D6)**
   - **Context**: Weather forecast signal is missing or expired.
   - **Fail-Closed Notice**: System displays a calm degraded notice without inventing synthetic forecasts (INV-103).

6. **Storage Corruption Error (INV-110)**
   - **Context**: Simulated corrupted or invalid storage envelope.
   - **Affordance**: Surfaces explicit error box with **Export Raw Data** and **Reset Storage** (with a 2-step confirmation) to ensure zero silent data loss.

---

## 🧠 Review Loop & Me Page

### Interactive Review Actions
- **Accept**: Marks plan as accepted and persisted to local storage. An **Undo** button remains available.
- **Adjust**: Modify preparation or buffer minutes. Choose **For this time only** or **Remember as preference**. Remembering creates a pending `MemoryFact` proposal; it **never** directly mutates confirmed memory without user confirmation (INV-107).
- **Dismiss**: Choose a dismissal reason. Dismissing suppresses the intent for the remainder of today and creates a pending proposal in **FOR YOU** and the **Me** tab.

### The Me Page (`/me`)
- **Proactive Budget Meter**: Tracks daily proactive prompt consumption (`0 of 3 used today`).
- **Confirmed Preferences**: Lists confirmed user habits and dining tastes with timestamps and provenance.
- **Pending Proposals**: Surfaces unconfirmed proposals with **Confirm** and **Not true** actions.
- **Rejected Audit Trail**: Declined proposals are kept queryable for transparency and are never re-applied.
- **Data Controls**: Export your data as JSON or perform a verified two-step storage reset.
- **XMemo Sync Card**: When `XMEMO_OAUTH_ENABLED=true`, surfaces the "Connect XMemo" section to synchronize confirmed facts.

---

## 🛡️ What is Simulated (INV-102)

To protect user privacy and guarantee deterministic testing:
- All calendar events, weather readings, location coords, route durations, and dining venues are **simulated mock fixtures**.
- Every simulated card displays an explicit **Demo · simulated context** chip and **SIMULATED** badge.
- No ambient system clocks (`Date.now()` or `new Date()`) are accessed within domain logic; all calculations derive from injected snapshot timestamps.

---

## 🔍 Fallback Path Labelling Audit (Zero-Credential Verification)

Governed by Plan `YORI_SUBMIT` (Task `FALLBACK-VERIFY`, AC-205-2). When running in the default fallback mode with all flags OFF (`WEATHER_LIVE_ENABLED=false`, `MODEL_API_KEY` unset, `XMEMO_OAUTH_ENABLED=false`), every surface used in the video demonstration script was rigorously audited to guarantee honest simulated labelling:

| Surface / Screen | Visual Element | Displayed Label / Copy | Live Weather Present? | Verification Method |
|---|---|---|---|---|
| **Global App Header** | Top-left demo chip | `Demo · simulated context` | **NO** (`#chip-live-weather` count = 0) | E2E DOM assertion & visual render |
| **Global App Header** | Weather attribution | *Omitted from DOM* | **NO** (`#weather-attribution` count = 0) | E2E DOM assertion & visual render |
| **Scene D1 (Clear)** | NOW card | Badge: `SIMULATED` | **NO** (Simulated calendar & weather) | E2E data-plan-id & visual render |
| **Scene D2 (Rain Re-Plan)** | NOW card | Badge: `SIMULATED` | **NO** (Simulated rain forecast at 1:35 PM) | E2E DOM assertion & visual render |
| **Scene D2 (Rain Re-Plan)** | Umbrella checklist chip | `Grab umbrella · rain in forecast` | **NO** (Checklist item derived from mock signal) | E2E checklist item text match |
| **Scene D2 (Rain Re-Plan)** | Ranked transit tiles | Drive (2:30 PM) / Bus (2:15 PM) `SIMULATED` | **NO** (Ranked by confirmed memory habit) | E2E transit option tile match |
| **Why Sheet (Rain D2)** | Evidence signal row | `Weather · Rain starting at 1:35 PM (Simulated data)` | **NO** (Explicit simulated data qualifier) | E2E `#why-signals-list` inspection |
| **Scene D3 (Away Lunch)** | NOW card options | Badges: `SIMULATED` + mock venue disclosure | **NO** (Mock place adapter) | E2E mock disclosure chip check |
| **Scene D4 (Busy Lunch)** | Quiet state | `Nothing needs your attention right now.` | **NO** (Suppressed by core policy) | E2E quiet box visible check |
| **Scene D6 (Missing Weather)**| Fail-closed notice | `The weather forecast isn't available right now, so I won't guess.` | **NO** (Fail-closed notice without guessing) | E2E notice-box text match |
| **Reasoning Demo (Model Off)**| NOW & AHEAD cards | Badges: `SIMULATED` (Piano lesson NOW, Lunch AHEAD) | **NO** (Deterministic pipeline order) | E2E deterministic order check |
| **Me Tab (`/me`)** | Memory facts & budget | Sovereign local storage envelope | **NO** (Zero external telemetry) | E2E storage inspection |

**Audit Conclusion:** Across all script steps and test viewports, **zero** simulated or recorded weather data is ever presented as live weather. The live weather chip and Open-Meteo attribution only appear when `WEATHER_LIVE_ENABLED=true` is explicitly configured.

---

## ⚠️ Status & Known Limitations (PH-002)

As part of the project evolution, Yori operates as a deterministic, local-first foundation with the following known architectural boundaries:
- **ModelPort Live Status (OWNER_GATE_1)**: `disabled` (status: `disabled`, keySource: `none`). OWNER_GATE_1 unmet, B proceeds fixture-only.
- **Muse Spark is wording & ranking only**: The model port refines natural language phrasing over supplied facts and reorders candidates within constrained schemas; it does not perform unconstrained autonomous execution. Any time, place, or citation token not present in the supplied signal set causes the output to be discarded for the deterministic baseline.
- **XMemo live sync: implemented, disabled pending owner authorization; local memory is the source of truth**: The server-side OAuth 2.0 PKCE and MCP proxy plumbing is implemented behind the `XMEMO_OAUTH_ENABLED` feature flag (disabled by default). Local storage serves as the source of truth; confirmed facts are persisted locally in versioned envelopes. Remote synchronization remains disabled until explicit owner authorization.
- **Simulated providers**: Calendar, weather, location coordinates, routes, places, and grocery items are simulated mock fixtures with no real third-party service provider integrations.
- **Proactive prompts not delivered as notifications**: Proactive prompt evaluation and budget enforcement occur during Living Context composition; OS-level system push notifications are deferred to native platform wrappers.

---

## 🔒 Enabling the Model Safely (ModelPort)

By default, Yori runs **100% deterministically with the external model disabled**.

If you wish to test live AI phrasing refinement via Meta Muse Spark:

1. Create a `.env.local` file in the project root:
   ```bash
   MODEL_API_KEY=your_meta_api_key_here
   # Optional overrides:
   # MODEL_NAME=muse-spark-1.3
   # MODEL_BASE_URL=https://api.meta.ai/v1
   ```

2. **Security & Anti-Relay Safeguards**:
   - The Vite dev proxy strictly binds to **`127.0.0.1` (loopback only)**. It is never exposed over LAN or Tailscale.
   - Cross-origin requests (`Origin` or `Referer` from external domains) and cross-site requests are rejected with **HTTP 403 Forbidden**.
   - Non-JSON content types (e.g. `text/plain` CORS bypasses) are rejected with **HTTP 415 Unsupported Media Type**.
   - Request bodies are capped at **8 KB (HTTP 413)**.
   - Rate limiting is enforced at **30 requests/minute (HTTP 429)**.
   - All model outputs undergo rigorous **fact-checking**: any hallucinated time or place token not present in the supplied fact set is discarded for the deterministic template.

---

## 🔗 Submission Documents

For hackathon judges and evaluators:
- **[3-Minute Video Script](submission/VIDEO_SCRIPT.md)**: Timed demonstration script walking the North Star loop.
- **[Project Description](submission/PROJECT_DESCRIPTION.md)**: Problem statement, technical architecture, and privacy model.
- **[Submission Checklist](submission/SUBMISSION_CHECKLIST.md)**: Owner-gated release checklist.
