# Evidence Index: S5-LIVE-REASON (PT:S5-LIVE-REASON / TID: INBOX-20261102-91CC2B)

**Slice:** `S5-LIVE-REASON` (Model Interpreter live path & honest engine status over real candidates under hard budget & fact gates)  
**Parent Plan:** `docs/architecture/LIVE_FIRST.plan.json` (Rev 4)  
**Task ID:** `INBOX-20261102-91CC2B` (Rework: `INBOX-20261102-91CC2B-REV-f5154ef2`)  
**Core Invariant:** `git diff f43c6c1d HEAD -- src/core` = 0 lines (`AC-EXT-1`)  
**Owner Gates:** Hard budget gate (`MODEL_LIVE_ENABLED=false` default; zero live network calls in automated tests or CI; lifetime cap <= 50; reasoning budget ceiling <= 32 enforced across process restarts; per-run cap <= 10). Zero inspection of `.env.local` credentials. 100% test execution against recorded/mocked responses with honest status indicators.

---

## 1. Visual Proof Index

All screenshots captured at real viewports via automated Playwright tests in `tests/e2e-live/live-reason.spec.ts`.  
*Note: Recorded/mocked responses (no live call); live proof BLOCKED until owner budget approval.*

| # | Artifact | Viewport | Provenance | Description |
|---|---|---|---|---|
| 1 | `live-reason-mobile-390x844-home.png` | 390×844 (Mobile) | Recorded/mocked response (no live call) | Mobile Living Context Home showing lunch recommendation plan with `#model-status-pill` rendered prominently in the ambient header line displaying `Recorded Meta model output · replay` with replay dot and latency indicator. Zero synthetic or demo badges. |
| 2 | `live-reason-mobile-390x844-conversation.png` | 390×844 (Mobile) | Recorded/mocked response (no live call) | Full-page V2 Conversation Shell on mobile showing `#engine-status-chip` (`Recorded Meta model output · replay`) and `#conversation-model-status-pill` in the header, grounded quick-action suggestions, and ask-input bar. |
| 3 | `live-reason-mobile-390x844-decision-log.png` | 390×844 (Mobile) | Recorded/mocked response (no live call) | In-UI Redacted Decision Log viewer in Conversation overlay showing sanitized entries: `templateId: 'reason_rank'`, input signal IDs, confirmed fact keys (`taste_preference_lunch_cuisine`), output reason codes (`matches_confirmed_preference`), engine status (`recorded_model_replay`), latency in milliseconds (`latencyMs`), and zero secret leakage. |
| 4 | `live-reason-desktop-1280x800-home.png` | 1280×800 (Desktop) | Recorded/mocked response (no live call) | Desktop Living Context Home with greeting, Ambient Line displaying honest model status pill (`Recorded Meta model output · replay`), candidate lunch plan, route preview with walking ETA, and connector strip. |
| 5 | `live-reason-desktop-1280x800-conversation.png` | 1280×800 (Desktop) | Recorded/mocked response (no live call) | Full Conversation Shell on 1280×800 desktop showing `#engine-status-chip` with `Recorded Meta model output · replay`, conversational turns, and `#conversation-model-status-pill`. |
| 6 | `live-reason-desktop-1280x800-decision-log.png` | 1280×800 (Desktop) | Recorded/mocked response (no live call) | Expanded Decision Log viewer on desktop showing audit trail of reasoning calls, engine status (`recorded_model_replay`), validated reason codes, latency, and sanitized parameters. |
| 7 | `live-reason-fallback-status.png` | 1280×800 | Fallback (Deterministic Offline) | Fallback invariant proof: when the model endpoint encounters an error, timeout, or cap exhaustion, the UI honestly transitions `#model-status-pill` to `Offline fallback · deterministic` (`data-engine-status="offline_deterministic"`), and preserves deterministic grammar and ranking without interruption. |

---

## 2. Hard Budget Gate & Credential Hygiene Proof

To eliminate any risk of unbounded billing or credential exposure, S5-LIVE-REASON implements four concentric security gates:

1. **Gate 1: Zero Unapproved Billed Network Calls (`MODEL_LIVE_ENABLED=false` default)**:
   - Server proxy (`src/adapters/model/server-proxy.ts`) gates all upstream model requests behind `MODEL_LIVE_ENABLED`.
   - Default value is strictly `false`.
   - Automated tests run against recorded fixtures and proxy boundary mocks; zero external network requests are dispatched during CI or automated test suites.
2. **Gate 2: Call Cap & Slice Budget Ceiling Enforcement**:
   - Initial ledger state had 22 calls used.
   - S5 active slice permits at most 10 further calls, establishing a hard ceiling of 32 calls total (`MODEL_REASONING_BUDGET_CEILING = 32`).
   - Lifetime hard cap is 50 calls in ledger state (`MODEL_LIFETIME_MAX_CALLS = 50`).
   - **Cross-Process Restart Enforcement**: The 32 ceiling is enforced strictly across process restarts via `effectiveCeiling = Math.min(lifetimeMaxCalls, reasoningBudgetCeiling ?? 32)`. Even if the in-memory per-run count resets upon restart, once the persisted ledger reaches 32, all further reasoning and decision commands fall back immediately to deterministic grammar (`engineStatus: 'offline_deterministic'`).
3. **Gate 3: Zero Credential Inspection**:
   - Zero agent inspection of `.env.local` files or API secrets.
   - Proxy handler reads `process.env.META_MODEL_API_KEY` solely at runtime in memory without logging, echoing, or embedding in responses.
4. **Gate 4: Labelled Deterministic Fallback**:
   - If upstream returns HTTP 4xx/5xx, timeouts (>2000ms), network errors, or if the budget ceiling is reached, the coordinator falls back to deterministic grammar ranking.
   - Engine status transitions from `meta_model_live` to `offline_deterministic` with human-readable label `Offline fallback · deterministic`.
   - Client reasoning coordinator defaults missing or unasserted statuses strictly to `'offline_deterministic'` (fail-closed, never fail-open).

---

## 3. Fact Post-Check & Citation Discipline Proof

Every candidate ranking and reason explanation emitted by the model is strictly verified by `validateReasoningOutput` before reaching the UI:

1. **Strict Context Snapshot Grounding**:
   - Output must reference exclusively signal IDs present in `ReasoningInput.availableSignalIds` (e.g. `places:2026-11-02T12:00:00Z`, `location_status:2026-11-02T12:15:00.000Z`).
   - Output must cite exclusively fact keys present in `ReasoningInput.confirmedFactKeys` (e.g. `taste_preference_lunch_cuisine`, `favorite_cuisine`).
2. **Post-Check Discard on Violation**:
   - Any citation of unsupplied signal IDs, unconfirmed fact keys, or invented times/places causes instantaneous rejection (`valid: false`, `reason: 'unknown_signal_id' | 'unknown_fact_key' | 'missing_citation'`).
   - The coordinator discards the output and reverts to deterministic grammar ordering.
   - The decision logger logs the violation reason (e.g. `unknown_signal_id`) with `engineStatus: 'offline_deterministic'`.
3. **Defense-in-Depth Rationale Mapping**:
   - UI never renders free, ungrounded model text directly into user-facing copy.
   - Only validated enumerated reason codes (`matches_confirmed_preference`, `closest_distance`, `quickest_eta`) map to externalized strings.

---

## 4. Honest Engine Status Surfaces

Honest engine status is surfaced consistently across all application surfaces:

| Surface | Selector | Live Status Label (`meta_model_live`) | Replay Status Label (`recorded_model_replay`) | Fallback Status Label (`offline_deterministic`) |
|---|---|---|---|---|
| Ambient Header Line | `#model-status-pill` | `Meta model · live` | `Recorded Meta model output · replay` | `Offline fallback · deterministic` |
| Conversation Shell Header | `#engine-status-chip` | `Meta model · live` | `Recorded Meta model output · replay` | `Offline fallback · deterministic` |
| Conversation Header Pill | `#conversation-model-status-pill` | `Meta model · live` | `Recorded Meta model output · replay` | `Offline fallback · deterministic` |
| Sources Sheet Modal | `#source-item-model` | `Meta model · live` | `Recorded Meta model output · replay` | `Offline fallback · deterministic` |
| Redacted Decision Log | `#decision-log-content` | `meta_model_live` | `recorded_model_replay` | `offline_deterministic` |

*Note on Mobile 390 Header Layout:* `#model-status-pill` is rendered in `#living-header-ambient` only in live context mode (`contextMode === 'live'`). Ambient header styling enforces `flex-wrap: nowrap; max-width: 100%`, preventing any header expansion or occlusion of touch targets at 390×844.

---

## 5. Redacted Decision Log Sample

Below is a redacted decision log record generated during candidate ranking:

```json
{
  "id": "dlog-1798934520000-a7b2c9",
  "timestamp": "2026-11-02T12:15:01.230Z",
  "templateId": "reason_rank",
  "inputSignalIds": [
    "location_status:2026-11-02T12:15:00.000Z",
    "places:2026-11-02T12:00:00Z"
  ],
  "inputFactKeys": [
    "taste_preference_lunch_cuisine",
    "favorite_cuisine"
  ],
  "outputReasonCodes": [
    "matches_confirmed_preference"
  ],
  "outputIntent": "lunch",
  "validationResult": {
    "valid": true
  },
  "engineStatus": "recorded_model_replay",
  "latencyMs": 142
}
```

*(When live calls are approved and active, `engineStatus` reports `meta_model_live`; when falling back, `engineStatus` reports `offline_deterministic`.)*

Key security attributes verified:
- `apiKey`, `sk-*`, and authorization headers are 100% stripped.
- Input signals and fact keys are bounded identifiers only.
- Output reason codes are strictly validated enumerations.
- `latencyMs` and `engineStatus` provide truthful telemetry.

---

## 6. Automated Verification Matrix

| Verification Tier | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | 0 errors |
| Core Invariant | `git diff f43c6c1d HEAD -- src/core` | 0 lines changed (`AC-EXT-1`) |
| Model Proxy Boundary Unit Suite | `npx vitest run tests/proxy-boundary/model-proxy.test.ts` | 12/12 passed (including 32 ceiling restart test) |
| Reasoning Unit Tests | `npx vitest run src/adapters/model/reasoning.test.ts src/app/reasoning-coordinator.test.ts` | 27/27 passed |
| Full Vitest Suite | `npm test` | 96 files, 1029 tests passed |
| Production Gating Checks | `npm run verify:production` | 0 violations |
| Playwright Test Discovery | `npx playwright test --list \| tail -1` | Total: 554 tests in 38 files |
| Playwright Context Timeline (Hit Tests & 390 Layout) | `npx playwright test tests/e2e/context-timeline.spec.ts` | 12/12 passed |
| Playwright Live Reason Dual Gate | `npx playwright test tests/e2e-live/live-reason.spec.ts` | 8/8 passed (4 mobile + 4 desktop) |
| Playwright Live Default Env | `npx playwright test tests/env/live-default-env.spec.ts` | 24/24 passed |
| Playwright Production Gating | `npx playwright test tests/e2e/production-gating.spec.ts` | 12/12 passed |
| Playwright Live Lunch Dual Gate | `npx playwright test tests/e2e-live/live-lunch.spec.ts` | 10/10 passed |

---

## 7. BLOCKED-Accepted Declaration

Slice `S5-LIVE-REASON` implementation, boundary guards, client-side coordination, honest UI telemetry, redacted decision logging, 32/50 ceiling enforcement, and Playwright verification suites are **100% complete and green**.

As specified in `LIVE_FIRST.plan.json` rev 4:
- Automated tests run against recorded fixtures and proxy mocks with zero network spend.
- The live endpoint path remains in **BLOCKED-accepted** status awaiting the owner's manual one-line chat instruction:
  > `"approve model budget (<=10 calls, ledger <=32/50) in chat"`

Upon receipt of the owner's explicit budget approval in chat, the live model connection can be toggled without any code changes.
