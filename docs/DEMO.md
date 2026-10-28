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

# Run unit & integration test suites (418 tests across 23 test files)
npm test

# Run golden acceptance harness (18 tests across 4 test files)
npm run test:golden

# Run degradation drills (53 fault-injection invariance tests)
npm run test:drills

# Run Playwright E2E verification (118 tests across full suite, mobile 390x844 & desktop 1280x800)
npm run test:e2e

# Run reproducible token pixel sampler (10/10 PASS)
node scripts/sample-tokens.mjs
```

### Recording Candidate Build (`V2 Living Context`)
The V2 Living Context UI is the official recording candidate for video submission:
```bash
# 1. Build and preview V2 UI directly (or run npm run dev and append ?ui=v2)
VITE_YORI_UI=v2 npm run build
npm run preview
```
Visit **`http://127.0.0.1:5173/?ui=v2`** to inspect the full V2 recording experience (docked bottom Ask Bar, Route Map with organic weather callouts, candidate dining cards with local SVG artwork, and conversational shell).

### Running the Approved Fallback UI from Tag (`yori-approved-ui`)
The submission-approved fallback UI (commit `908abee`) is permanently anchored by the local annotated git tag `yori-approved-ui`. You can build and preview it independently at any time without disturbing ongoing work on `main`:

```bash
# 1. Create a worktree pointing to the approved baseline tag
git worktree add ../yori-approved-ui yori-approved-ui
ln -s "$(pwd)/node_modules" ../yori-approved-ui/node_modules

# 2. Build and preview on loopback (e.g. port 5181)
cd ../yori-approved-ui
npm run build
npx vite preview --host 127.0.0.1 --port 5181 --strictPort

# 3. Clean up worktree when done
cd -
git worktree remove ../yori-approved-ui
```

### UI Version Build Flag (`VITE_YORI_UI`)
By default, the application builds and serves the approved baseline UI (`v1`), with `v2` selectable via build environment or URL parameter:

```bash
# Build approved baseline UI (fails closed to v1 on unknown values)
VITE_YORI_UI=v1 npm run build

# Build V2 shell preview (recording candidate)
VITE_YORI_UI=v2 npm run build
```
For local preview and testing convenience, `?ui=v1` or `?ui=v2` query parameters may also be supplied in the URL.

---

## 🎬 Demo Scene Script

Use the **Demo Scenes** selector at the top-right of the navigation bar to test different context scenarios:

1. **Clear Departure (D1)**
   - **Context**: Calendar appointment "Piano lesson" at 3:00 PM, travel time 30 min, buffer 5 min, prep 20 min under clear skies.
   - **NOW Card**: Shows "Get ready at 2:05 PM, leave by 2:25 PM".
   - **Actions**: Tap **Why** to inspect evidence citations and local derivation; tap **Accept** to confirm departure (with **Undo** affordance).

2. **Rain Re-Plan (D2)**
   - **Context**: Sudden rain forecast issued at 1:35 PM valid for the departure window.
   - **NOW Card**: Dynamically includes an **Umbrella** checklist chip and two ranked transit tiles: Drive (2:30 PM, ranked first by rain habit) and Bus (2:15 PM).
   - **Memory**: Demo-profile habit fact explains why driving is prioritized over transit.

3. **Away Lunch (D3)**
   - **Context**: User is away from home at 12:10 PM with an adequate free schedule window and has not eaten lunch.
   - **NOW Card**: Recommends up to 3 dining options within walking distance matching taste preferences (`Japanese`, `Salad`).

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

| Surface / Screen | Visual Element | Verbatim Displayed Label / Copy | Live Weather Present? | Verification Method |
|---|---|---|---|---|
| **Global App Header** | Top-left demo chip | `Demo · simulated context` | **NO** (`#chip-live-weather` count = 0) | E2E DOM assertion & visual render |
| **Global App Header** | Weather attribution | *Omitted from DOM* | **NO** (`#weather-attribution` count = 0) | E2E DOM assertion & visual render |
| **Scene D1 (Clear)** | NOW card | Subject: `Piano lesson at 3:00 PM`<br>Timing: `Get ready at 2:05 PM, leave by 2:25 PM`<br>Badge: `SIMULATED` | **NO** (Simulated calendar & weather signals) | E2E text match & visual render |
| **Scene D2 (Rain Re-Plan)** | NOW card | Rain banner: `What changed: rain forecast`<br>Badge: `SIMULATED` | **NO** (Simulated rain forecast at 1:35 PM) | E2E DOM assertion & visual render |
| **Scene D2 (Rain Re-Plan)** | Checklist chip | `Umbrella` | **NO** (Checklist item derived from mock rain signal) | E2E `#chip-umbrella` exact text match |
| **Scene D2 (Rain Re-Plan)** | Ranked transit tiles | Option 1: `Drive · leave 2:30 PM` (25m drive)<br>Option 2: `Bus · leave 2:15 PM` (40m bus)<br>Habit note: `You usually prefer driving when it rains.` | **NO** (Ranked by demo-profile rain habit) | E2E `.option-tile` & `.habit-note` text match |
| **Why Sheet (Rain D2)** | Weather evidence row | Label: `Weather forecast`<br>Description: `Forecast conditions`<br>Time: `Recorded at 1:35 PM`<br>Badge: `SIMULATED` | **NO** (Explicit simulated qualifier & badge) | E2E `.why-section` row inspection |
| **Why Sheet (Rain D2)** | Memory facts section | Heading: `Memory & Habits`<br>Sample facts: `Buffer before leaving` (5 min), `Time to get ready` (20 min), `Rain travel habit` (Prefers driving when it rains)<br>Badge: `Demo profile · sample preference` | **NO** (Explicit sample-profile simulation badges) | E2E `.why-section` row inspection |
| **Scene D3 (Away Lunch)** | NOW card | Subject: `Lunch options near you`<br>Headline: `Places matching what you like, within walking distance`<br>Notice: `Mock places for this demo; real listings come from a place provider.`<br>Badge: `SIMULATED` | **NO** (Mock place adapter) | E2E `.mock-places-notice` check |
| **Scene D4 (Busy Lunch)** | Quiet state | Title: `Nothing needs your attention right now.`<br>Subtitle: `You're all caught up. We'll let you know when something comes up.` | **NO** (Suppressed by core policy) | E2E `.quiet-title` text match |
| **Scene D6 (Missing Weather)**| Fail-closed notice | Notice: `Notice: The weather forecast isn't available right now, so I won't guess.`<br>Badge: *Omitted* (0 SIMULATED badges rendered; notice + quiet state only) | **NO** (Fail-closed notice without guessing) | E2E `.notice-box` & badge count check |
| **Reasoning Demo (Model Off)**| NOW & AHEAD cards | NOW: `Piano lesson at 3:00 PM` (Get ready at 2:05 PM, leave by 2:25 PM)<br>AHEAD: `Lunch options near you`<br>Badge: `SIMULATED` | **NO** (Deterministic pipeline order) | E2E deterministic order check |
| **Me Tab (`/me`)** | Memory facts & budget | Budget badge: `0 of 3 used today`<br>Empty state: `No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.`<br>Confirmed fact: `Preparation buffer habit` (Get ready 25 min · Leave a 10 min buffer) with badge `Confirmed`<br>Sovereign local storage envelope | **NO** (Zero external telemetry) | E2E storage & badge inspection |

**Audit Conclusion:** Across all script steps and test viewports, **zero** simulated or recorded weather data is ever presented as live weather. The live weather chip and Open-Meteo attribution only appear when `WEATHER_LIVE_ENABLED=true` is explicitly configured.

---

## ⚠️ Status & Known Limitations (Submission Readiness Alignment)

Every integration's status matches [`docs/architecture/SUBMISSION_READINESS.md`](architecture/SUBMISSION_READINESS.md) exactly:
- **Meta Muse Spark Reasoning (`IMPLEMENTED-BUT-OFF`)**: `MODEL_API_KEY` unset (diagnostics `disabled`, keySource `none`). G3-PARITY approved as precondition; zero live calls run. Model interpreter runs strictly against verified offline fixtures with engine status `'Scripted model fixture · not a live model call'`.
- **XMemo Memory Integration (`IMPLEMENTED-BUT-OFF`)**: `XMEMO_OAUTH_ENABLED=false`. Code marks MCP proxy mapping `UNVERIFIED_XMEMO_MCP_MAPPING`. Sovereign local browser storage is the active and sole truth; confirm-only memory (INV-107) strictly enforced.
- **Live Weather Integration (`IMPLEMENTED-BUT-OFF`)**: `WEATHER_LIVE_ENABLED=false`. All scenes run on recorded, labelled fixtures with fixed city coordinates. Zero device geolocation or GPS calls anywhere.
- **Simulated Providers**: Calendar, weather, location coordinates, routes, places, and grocery items are simulated mock fixtures with no real third-party service provider integrations.
- **Proactive Prompts**: Proactive prompt evaluation and budget enforcement occur during Living Context composition; OS-level system push notifications are deferred to native platform wrappers.

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
