# Yori Living Context Demo Guide (Phase 1 PH-001)

Welcome to Yori, the calm, proactive context-aware assistant. This guide details how to run the application, explore simulated demo scenes, understand review and memory mechanics, and safely configure the optional AI model.

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

# Run unit & integration test suites
npm test

# Run golden acceptance harness (D1–D6 + AC-EXT-1)
npm run test:golden

# Run degradation drills (NFR-102/103)
npm run test:drills

# Run Playwright E2E verification
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

---

## 🛡️ What is Simulated (INV-102)

To protect user privacy and guarantee deterministic testing:
- All calendar events, weather readings, location coords, route durations, and dining venues are **simulated mock fixtures**.
- Every simulated card displays an explicit **Demo · simulated context** chip and **SIMULATED** badge.
- No ambient system clocks (`Date.now()` or `new Date()`) are accessed within domain logic; all calculations derive from injected snapshot timestamps.

---

## ⚠️ Status & Known Limitations (PH-001 & PH-002)

As part of the project evolution, Yori operates as a deterministic, local-first foundation with the following known architectural boundaries:
- **ModelPort Live Status (OWNER_GATE_1)**: `disabled` (status: `disabled`, keySource: `none`). OWNER_GATE_1 unmet, B proceeds fixture-only.
- **Muse Spark is wording-only (PH-001)**: The model port refines natural language phrasing over supplied facts only; it does not perform unconstrained autonomous reasoning or decision-making. Any time or place token not present in the supplied fact set causes the output to be discarded for the deterministic template.
- **XMemo live sync: implemented, disabled pending owner authorization; local memory is the source of truth**: The server-side OAuth 2.0 PKCE and MCP proxy plumbing is implemented behind the `XMEMO_OAUTH_ENABLED` feature flag (disabled by default). Local storage serves as the source of truth; confirmed facts are persisted locally in versioned envelopes. Remote synchronization remains disabled until explicit owner authorization.
- **Simulated providers**: Calendar, weather, location coordinates, routes, places, and grocery items are simulated mock fixtures with no real third-party service provider integrations.
- **Proactive prompts not delivered as notifications**: Proactive prompt evaluation and budget enforcement occur during Living Context composition; OS-level system push notifications are not delivered in PH-001.

These unfinished North Star capabilities are deferred to **Phase 2 (PH-002)**, which introduces real model reasoning, end-user authenticated XMemo integration, real provider adapters, and OS push notification channels.

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
