# Rev3 UI Closeout: Truthfulness & Clean Checkout Audit Report

**Task**: CLOSEOUT_REV3UI (`INBOX-20261101-AA8081`)  
**Plan Reference**: `docs/architecture/REV3_UI_CONNECTORS.plan.json`  
**Execution Date**: 2026-11-01  
**Scope**: Full clean-checkout verification with zero credentials, full test matrix execution, production bundle secret/mock leak analysis, and surface-by-surface truthfulness & provenance audit across mobile (390x844) and desktop (1280x800) viewports.

---

## 1. Surface-by-Surface Rendered Claims & Provenance Audit

Audit verifying that every rendered claim, status, and label at HEAD traces to an honest live read, an approved user preference, a neutral empty state (`NONE`), or an explicitly labelled fixture. Mock and live truth are never blended; Calendar remains honestly unavailable.

| Surface | Rendered Claim / State | Source Class | Evidence Spec & Line Reference | Notes & Invariants |
| :--- | :--- | :--- | :--- | :--- |
| **Home (Live)** | "Nothing needs your attention right now. All caught up." | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:60` | Quiet Now card carrying `data-provenance="none"`. Zero fixture elements rendered. |
| **Home (Live)** | "Live weather is off (owner setting)" | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:65` | Weather notice displays offline default; attribution absent when disabled. |
| **Home (Live)** | "Connect location to enable local departures and recommendations." | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:70` | Honest prompt state with zero fabricated coordinates. |
| **Home (Live)** | Absence of forbidden demo strings (`SIMULATED`, `Demo Place`, `Piano lesson`, etc.) | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:65` | Full inner text sweep confirms zero demo/sample scene string leakage. |
| **Home (Live)** | Zero connector pills claiming `Connected` | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:71` | Truthful representation of disconnected session state. |
| **Home (Live)** | Active sources header pill: "Live context · Device clock" | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:76` | Device clock read with `data-provenance="live"`, `data-source="device_clock"`, valid `data-fetched-at`. |
| **Plans (Live)** | "No upcoming plans scheduled right now. Yori coordinates with your day as plans are confirmed." | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:110` | Honest empty plans view `.v2-empty-plans` carrying `data-provenance="none"`. |
| **Plans (Live)** | Absence of forbidden demo strings | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:105` | Zero unconfirmed/mock plan cards rendered in Live mode. |
| **For You (Live)** | "No pending proposals waiting right now. Yori learns routines calmly as you use the app." | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:137` | Honest empty proposals view `.v2-empty-proposals` carrying `data-provenance="none"`. |
| **For You (Live)** | Absence of sample profile proposals | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:132` | Seed demo proposals strictly filtered out in Live mode. |
| **Me / Memories (Live)** | Proactive Prompt Budget meter: "0 / 3 used today" | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:159` | Backed by local storage daily record; zero unbudgeted model usage. |
| **Me / Memories (Live)** | "No confirmed preferences recorded yet." | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:159` | Honest empty state for unconfirmed user memory facts. |
| **Me / Memories (Live)** | "No pending proposals waiting for your review." | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:159` | Honest empty state; zero unprompted suggestions. |
| **Me / Memories (Live)** | Connectors navigation card | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:172` | Dedicated entry point to Settings > Connectors. |
| **Settings > Connectors (Live)** | Location (GPS): "Permission needed · tap Connect to share location for this session" | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:178` | Read directly from runtime `LocationPort`; zero coordinates leaked. |
| **Settings > Connectors (Live)** | Calendar: "Not available yet" | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:187` | Honest unavailable notice; connect button and toggle strictly absent. |
| **Settings > Connectors (Live)** | Weather: "Owner setting · Live weather is off (owner setting)" | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:178` | Gated by `WEATHER_LIVE_ENABLED` flag; no optimistic connect affordance. |
| **Settings > Connectors (Live)** | XMemo: "Not connected · tap Connect to sign in" | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:178` | Truthful PKCE OAuth status read from runtime storage and adapter. |
| **Settings > Connectors (Live)** | Notifications: "Denied · Notifications blocked in browser settings..." | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:178` | Truthful browser permission query; actionable remediation instructions. |
| **Settings > Connectors (Live)** | Zero connectors showing "Connected" | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:192` | Explicit regex `^Connected$` assertion confirms zero false connected claims. |
| **Sources & Provenance Sheet (Live)** | Modal header: "Sources & Provenance · Live" | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:210` | Truthful derivation subline displaying active sources only. |
| **Sources & Provenance Sheet (Live)** | Calendar item: "Not available yet" | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:222` | Honest unavailable status confirmed inside sources sheet. |
| **Sources & Provenance Sheet (Live)** | Absence of demo signal badges (`SIMULATED`) | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:217` | Zero simulated context signals listed in Live mode sources sheet. |
| **Desktop Right Panel (Live, 1280x800)** | "Live Context · Live Neutral · Nothing selected. Select a card to see details." | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:249` | Purpose-built neutral quiet card (`data-panel-type="quiet"`); device clock source. |
| **Desktop Right Panel (Live, 1280x800)** | Route: "No Route · No route available · no destination set" | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:245` | Fail-closed route card carrying `data-no-route-reason="no_destination"`. |
| **Desktop Right Panel (Live, 1280x800)** | Nearby Places: "Owner Gated · Nearby places · not enabled (owner setting)" | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:245` | Gated notice; zero unconsented or simulated place cards rendered. |
| **Desktop Right Panel (Live, 1280x800)** | Zero fixture elements in right panel | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:240` | Asserted `data-provenance="fixture"` count is exactly 0. |
| **Ask Overlay (Live)** | Quick access dock: "Ask Yori about your day..." | `REAL` | `tests/e2e/closeout-truth-audit.spec.ts:265` | Honest conversational prompt shell without unconfirmed claims. |
| **Ask Overlay (Live)** | Zero fixture elements and zero forbidden demo strings | `NONE` | `tests/e2e/closeout-truth-audit.spec.ts:269` | Initial conversation overlay contains zero simulated demo assertions. |
| **Demo Mode (`?dev=1`)** | Home Now Card: labelled `data-provenance="fixture"` with `SIMULATED` badge | `FIXTURE` | `tests/e2e/closeout-truth-audit.spec.ts:291` | Scene-derived timeline cards explicitly disclaim synthetic provenance. |
| **Demo Mode (`?dev=1`)** | Sources Modal: contains `SIMULATED` signal badges | `FIXTURE` | `tests/e2e/closeout-truth-audit.spec.ts:297` | Derivation text: "Demo fixtures · simulated context". |
| **Demo Mode (`?dev=1`)** | For You: proposals labelled `data-provenance="fixture"` | `FIXTURE` | `tests/e2e/closeout-truth-audit.spec.ts:311` | Basis text: "Derived from sample demo profile". |
| **Demo Mode (`?dev=1`)** | Plans: upcoming plans labelled `data-provenance="fixture"` with `SIMULATED` badge | `FIXTURE` | `tests/e2e/closeout-truth-audit.spec.ts:324` | Evaluated in `multi-candidate` scene with confirmed upcoming plans list. |
| **Desktop Right Panel (Demo, 1280x800)** | Panel contextual route/places elements labelled `data-provenance="fixture"` | `FIXTURE` | `tests/e2e/closeout-truth-audit.spec.ts:333` | Clear/rain scene panels carry fixture provenance and attribution chips. |

---

## 2. Clean-Checkout Verification Suite Results

Executed from an isolated temporary clone outside the repository with:
- Zero credentials or environment variables
- Zero `.env` or `.env.local` files present
- Clean `npm ci` installation
- Self-contained test pipeline: `package.json` specifies `"pretest": "vite build"`, ensuring that `npm test` automatically compiles the distribution bundle into `dist/` before Vitest runs `src/adapters/static-check.test.ts`. This guarantees reproducible, zero-manual-step execution on fresh checkouts.

### Raw Command Summary Outputs

```text
1. TypeScript Typecheck
$ npx tsc --noEmit
Exit Code: 0 (0 errors)

2. Unit Test Suite (Vitest)
$ npm test
Test Files: 40 passed (40)
Tests:      914 passed (914)
Duration:   1.83s

3. Golden Scenario Pipeline Harness
$ npm run test:golden
Test Files: 4 passed (4)
Tests:      18 passed (18)
Duration:   352ms

4. Degraded Mode & Integration Drills
$ npm run test:drills
Test Files: 4 passed (4)
Tests:      56 passed (56)
Duration:   449ms

5. End-to-End Test Suite (Playwright)
$ npx playwright test
Total Tests: 444
Passed:      441 passed
Skipped:     3 skipped (multi-project dual-viewport screenshot deduplication)
Failed:      0 failed
Duration:    7.9m

6. Privacy Scan
$ npx tsx scripts/publish/privacy-scan.ts
=== Privacy Scan Results ===
Total Tracked Files: 798
Total Tracked Images: 424
Emails Scan: [PASS] Disallowed Count: 0
Local Paths Scan: [PASS] Path Count: 0
Personal Names Scan: [PASS] Name Count: 0
Secret Keys Scan: [PASS] Keys Scanned: 2, Leak Count: 0
Coordinates Scan: [PASS] Non-Fixture Count: 0
Image Metadata Scan: [PASS] Images with Chunks: 0
Overall Pass: ✅ PASS

7. Architecture Invariant AC-EXT-1 Core Diff
$ git diff --stat f43c6c1d HEAD -- src/core
Output: (empty - 0 files changed, 0 insertions, 0 deletions)
```

---

## 3. Production Bundle Leak & Secret Grep Analysis

Production client distribution bundle was compiled via `npm run build` into `dist/assets/*.js` and scanned for forbidden strings, test fixtures, external endpoints, and credential leak patterns.

| Target String / Pattern | Semantic Target | Clean Checkout Hits | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `test_destination` | Test destination hook | 0 | PASS | Excluded from client distribution bundle. |
| `test_no_route_reason` | Test routing hook | 0 | PASS | Excluded from client distribution bundle. |
| `Mission Dolores` | Synthetic test place | 0 | PASS | Fixture data excluded from client distribution bundle. |
| `overpass-api.de` | External Overpass host | 0 | PASS | Client calls loopback proxy seam (`/api/places`) only. |
| `router.project-osrm.org` | External OSRM host | 0 | PASS | Client calls loopback proxy seam (`/api/route`) only. |
| `ORS_API_KEY` | OpenRouteService API key | 0 | PASS | Server proxy environment variable only; never in client bundle. |
| `MODEL_API_KEY` | Model provider API key | 0 | PASS | Server proxy environment variable only; never in client bundle. |
| `META_API_KEY` | Meta model API key | 0 | PASS | Server proxy environment variable only; never in client bundle. |
| `XMEMO` (key names) | Remote memory API keys | 0 | PASS | Zero API keys or secrets in bundle. Literal `XMEMO` substring occurs once in an HTML comment (`XMEMO_OAUTH_ENABLED`). |
| `'sk-'` prefixes | Model/OAuth secret key prefix | 0 | PASS | Zero API key prefixes matching `['"]sk-[a-zA-Z0-9_-]+`. Literal `sk-` substring occurs 11 times as part of CSS class name tokens (`ask-bar`, `ask-mobile`, `ask-desktop`, `ask-bar-dock`, `ask-bar-container`). |

---

## 4. Remaining Owner-Gated Items & Technical Blockers

The following functional capabilities are intentionally offline, gated, or stubbed at Rev3 closeout, pending explicit owner authorization and provider decisions:

- **(a) G-ROUTE**: Provider choice (OSRM / OpenRouteService / GraphHopper). Real in-session route computation remains offline with recorded fixture fallback until the owner selects an external routing provider regarding rate limits, API keys, and privacy terms. The client seam correctly proxies through `/api/route` and falls back truthfully to recorded geometries or fail-closed "No Route" notices.
- **(b) Places / Overpass**: Overpass instance selection / rate policy. Client uses loopback proxy seam (`/api/places`) with rate-limiting and coordinate rounding. Selecting a live Overpass instance and configuring its rate policy requires owner infrastructure decisions.
- **(c) Tile policy**: Vector tile host (Mapbox / Protomaps / OSM raster). Selecting a production vector tile host or raster tile server requires owner infrastructure decisions.
- **(d) Live-default ack**: Live-default flip acknowledgment + precondition: gate `?mode` query param overrides behind dev mode, and unit-test `VITE_YORI_DEFAULT_MODE`. The application currently defaults to Demo mode unless `?mode=live` or `VITE_YORI_DEFAULT_MODE=live` is provided. Preconditions before flipping default to Live: gate all `?mode` query parameter overrides behind dev mode, and add unit tests validating `VITE_YORI_DEFAULT_MODE` fallback behavior in production mode.
- **(e) GATE-LIVE-RUN**: Consented real-run session (authorized location + live providers, independent e2e on REAL provider evidence).
- **(f) S1-LIVE-3**: Completion of ≤4 billed calls per runbook §2.2 (prep approved @`aef3b4e`), lifetime ledger 22 → ≤26. Live outbound model reasoning calls during runtime sessions remain gated behind owner authorization to prevent unexpected billing. Lifetime model ledger is strictly locked at 22/50 calls.
- **(g) S2-LIVE**: Owner's own XMemo login through the existing real PKCE flow (one labelled test fact). Calendar is NOT part of it and has no adapter (out of hackathon scope). Real PKCE OAuth against the owner's personal XMemo account requires owner interactive login. Calendar is not part of this and has no adapter.
- **(h) Desktop pixel parity UNVERIFIED**: Image reference sha `667f1ff2…` (not a commit sha; no local pixels in repository). Verified against responsive IA specifications (three-zone IA contract: sidebar nav 240px, center column max 680px, contextual right panel 380px) and Axe accessibility rules; no automated pixel-by-pixel image diff is possible because the reference is an image reference sha rather than a commit sha or local bitmap file.

---

## 5. Architectural Invariant Audit Verification Summary

All invariant definitions are quoted verbatim from `docs/architecture/ARCHITECTURE.md` (§8) and `docs/architecture/LIVING_CONTEXT_V2.md` (§10.6):

| ID | Invariant Definition | Audit Status | Evidence & Assertion Line Reference |
| :--- | :--- | :--- | :--- |
| **INV-101** | Every signal is sourced (`simulated`/`real`), timestamped (`issuedAt`), and validity-bounded (`validFor`); snapshots are immutable | Verified | `tests/e2e/closeout-truth-audit.spec.ts:76-88` (Live header verifies `data-provenance="live"`, `data-source="device_clock"`, valid `data-fetched-at` timestamp); `tests/e2e/closeout-truth-audit.spec.ts:285-300` (fixture signals carry explicit simulation source and timestamps); `src/core/contracts/contracts.test.ts` (signal envelope schema, validity bounding, and frozen snapshot immutability). |
| **INV-102** | Mock/simulated data is labelled everywhere it appears; simulated and real data are never indistinguishable | Verified | `tests/e2e/closeout-truth-audit.spec.ts:58-95` (Live mode renders 0 `SIMULATED` badges and 0 fixture cards); `tests/e2e/closeout-truth-audit.spec.ts:285-339` (Demo mode labels cards with `data-provenance="fixture"` and visible `SIMULATED` badges on Home, Plans, Sources, and Desktop Right Panel). |
| **INV-103** | No fabricated real-world data: times from the deterministic engine, weather/places only from signals/adapters. The LLM invents nothing (Section 9) | Verified | `tests/e2e/closeout-truth-audit.spec.ts:63-74, 185-189, 243-248` (In Live mode, when weather is off, displays "Live weather is off (owner setting)"; unconfigured route displays fail-closed "No Route"; places displays "Owner Gated"; Calendar displays "Not available yet"; zero fabricated forecasts, coordinates, or routes); `src/adapters/model/model.test.ts` (LLM output post-check against supplied facts; rejects invented times/places). |
| **INV-104** | Booking, payment, or itinerary change requires explicit user confirmation | Not exercised by this audit spec | Not exercised by this audit spec (audit verifies read-only live/demo provenance, connectors, navigation, and empty states; no booking or payment workflows are executed in this audit). |
| **INV-105** | The daily proactive prompt cap (default 3) is enforced by shared policy and measurable in tests and in Me | Verified | `tests/e2e/closeout-truth-audit.spec.ts:154-159` (Me surface verifies Proactive Prompt Budget meter reads "0 / 3 used today" with `data-provenance="live"`); `src/core/policy/policy.test.ts` (enforces shared prompt budget policy). |
| **INV-106** | Stale or missing signals degrade fail-closed with a visible notice (D6) | Verified | `tests/e2e/closeout-truth-audit.spec.ts:63-74, 243-248` (Missing weather signal shows visible notice "Live weather is off (owner setting)"; unconfigured destination in desktop right panel displays fail-closed notice "No Route · no destination set" with `data-no-route-reason="no_destination"`); `tests/integration/degradation-drills.test.ts` (stale/missing signal degradation). |
| **INV-107** | Memory writes only on user confirm; feedback creates pending proposals, never direct mutation | Not exercised by this audit spec; covered by unit and golden suites | Not exercised directly by `closeout-truth-audit.spec.ts` (which validates neutral empty states in read-only mode). Fully exercised by `src/ui/living-context/confirm-ux.test.ts` (verifies pending proposals require explicit user confirmation, and remote writeback failures keep proposal pending without mutation) and `tests/golden/golden-harness.test.ts` (verifies "don't suggest" user feedback creates pending proposal, never direct memory mutation). |
| **INV-108** | Suppression always records its reason; a user's "don't suggest" is honoured for its scope without a memory write | Not exercised by this audit spec; covered by drill and golden suites | Not exercised by `closeout-truth-audit.spec.ts`. Covered by `tests/integration/degradation-drills.test.ts` and `tests/golden/golden-harness.test.ts` (suppression records reason; "don't suggest" honored for scope without memory write). |
| **INV-109** | Scenario plugins touch only detector/preparer/adapter; core pipeline files are closed to plugin changes (AC-EXT-1) | Verified | Verified by clean-checkout command `git diff --stat f43c6c1d HEAD -- src/core` returning 0 lines changed (see Section 2.7); plugin isolation proven by `tests/golden/golden-harness.test.ts` (AC-EXT-1 grocery-stub plugin test). |
| **INV-110** | Persistence is owned solely by `src/core/storage` (versioned envelope, write-read-back verify). Corrupt or unknown-version data surfaces an explicit error with export/reset — never a silent wipe or default. Memory facts, proposals, same-day suppressions, and the daily prompt-budget counter survive reload. No plugin or UI module persists state privately | Covered by unit suite | Fully exercised by `src/core/storage/storage.test.ts` (versioned envelope, corruption error surfacing, export/reset, write-read-back verification). `tests/e2e/closeout-truth-audit.spec.ts:154-159` exercises UI display of daily prompt-budget counter backed by the storage envelope. |
| **INV-111** | Device coordinates are obtained only through the single consent-gated adapter, one-shot, budgeted, and leave the device only to the P-LOC-approved provider; the demo's simulated switch disables the whole real chain | Not exercised by this audit spec; covered by static-check and adapter suites | Not exercised by `closeout-truth-audit.spec.ts` (which checks UI permission prompt label in Settings). Fully exercised by `src/adapters/static-check.test.ts:141` (static guard verifies `navigator.geolocation` and `getCurrentPosition` are confined strictly to `geolocation-adapter.ts`, with `watchPosition` absent repo-wide) and `src/adapters/providers/geolocation-adapter.test.ts` (verifies consent requirement, single one-shot request, request budget cap of 5 per session, 2000ms debounce guard, and zero provider calls when simulated or unconsented). |

### Additional Architecture Invariants & Budget Limits

- **AC-EXT-1 (Core Diff Immutability)**: Verified. `git diff --stat f43c6c1d HEAD -- src/core` returns 0 files changed, 0 insertions, 0 deletions.
- **Lifetime Billed Ledger**: Preserved. Strictly 22/50 model calls consumed across the entire project lifecycle.
