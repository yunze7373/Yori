# S1-LIVE-3: Owner Gate Clearance & Live Verification Runbook

**Date**: 2026-10-31  
**Task ID**: `INBOX-20261031-713D79` / `INBOX-20261031-EA3AFB` / `INBOX-20261031-DA6678`  
**Target Slice**: `S1-LIVE-3` (`decision_command` live model verification completion)  
**Target Model**: `muse-spark-1.3` on `https://api.meta.ai/v1/chat/completions`  
**Current Real Ledger State**: 22 / 50 calls used (28 remaining); SHA256 `5a65c5fcbc53874e2bd27c2f64cb4c875aa05f0fb61b8b10069752451f7203a5`  

---

## 1. Executive Summary & Gate Purpose

This document establishes the owner authorization requirements, budget limits, and hard safety boundaries for conducting live billed verification of the **`decision_command`** endpoint against Meta's `muse-spark-1.3` model.

In `S1-LIVE-2`, live verification successfully validated the `refine` and `reason` endpoints (Run 1 & Run 2, 7 calls dispatched total). `S1-LIVE-3` targets the remaining model interaction surface: **command interpretation and situation attribution**.

As of `S1-LIVE-3-COMPLETE-PREP`, the offline test harness, code-acceptance evaluator, timeout ceiling (up to 60,000 ms verification-only), structured evidence schema, prompt filter (`--prompts route,refusal,why`), and ledger isolation layers are fully implemented and verified green. **ZERO live calls have been made in this prep slice.**

---

## 2. Live Verification History & Execution Runbooks

### 2.1. Run 1 & Run 2 Records

- **Run 1 Execution (2026-10-31)**: Exactly 1 call was dispatched (`Can I leave later?`) under owner authorization `msg_91396bb0`. The call aborted at 2005 ms due to unset `MODEL_TIMEOUT_MS` (falling back to server proxy default ~2s instead of the required 20000 ms).
  - **Hard Stop Honoured**: The fail-closed network error HARD STOP immediately halted further dispatches, preserving remaining budget.
  - **Ledger Progression**: Real ledger atomically incremented 17 $\rightarrow$ 18 / 50 calls (SHA256 `8f42a1d445e9f8ba864c0d4f354bf4494daf912e7b02498fe9e3584688558175`).

- **Run 2 Execution (2026-10-31)**: Under owner authorization `msg_91396bb0` (with 5 calls remaining), 4 calls were dispatched:
  - Call #1: `"Can I leave later?"` $\rightarrow$ `LEAVE_LATER` (ACCEPTED ✅)
  - Call #2: `"Leave 15 minutes later"` $\rightarrow$ `LEAVE_LATER` (slots: `deltaMinutes=15`) (ACCEPTED ✅)
  - Call #3: `"I already ate lunch today, don't suggest lunch"` $\rightarrow$ `UNSUPPORTED` (suppression honoured) (ACCEPTED ✅)
  - Call #4: `"Take the bus instead"` $\rightarrow$ Aborted at 20,008 ms due to the 20s proxy timeout ceiling.
  - **Hard Stop Honoured**: Timed out call halted the run cleanly.
  - **Ledger Progression**: Real ledger atomically incremented 18 $\rightarrow$ 22 / 50 calls (SHA256 `5a65c5fcbc53874e2bd27c2f64cb4c875aa05f0fb61b8b10069752451f7203a5`). 0 key leaks.
  - **Remaining Calls from `msg_91396bb0`**: Exactly 1 call was left unused. **The 1 call remaining from prior authorization is NOT enough on its own** to verify the 3 remaining unverified prompts (`route`, `refusal`, `why`).

---

## 2.2. Completion Run (Owner-Gated)

To complete the live verification of `decision_command` without risking timeouts or wasting calls:
1. The verification timeout ceiling is raised to 45,000 ms (`MODEL_TIMEOUT_MS=45000`, verification script path accepts $\le 60000$ ms while runtime app remains clamped to 20,000 ms).
2. The run is filtered via `--prompts route,refusal,why` to execute only the 3 unverified prompts:
   - `route`: `"Take the bus instead"` (`CHANGE_ROUTE`, mode: bus)
   - `refusal`: `"Book a flight to Hawaii for next weekend"` (`UNSUPPORTED`)
   - `why`: `"Why did you suggest this departure time?"` (`WHY`)
3. The run is strictly capped at 4 calls (3 planned prompts + 1 spare for a single timeout).
4. Per-call structured evidence (`expectedIntent`, `expectedSlots`, `intent`, `slots`, `reasonCodes`, `citedFactKeys`, `citedSignalIds`, `situationAttribution.reasonCode`) is captured and persisted in the report, strictly excluding free-text explanations.

### Exact Completion Run Command

```bash
MODEL_LIVE_ENABLED=1 MODEL_LIVE_MAX_CALLS=4 MODEL_MAX_TOKENS=4096 MODEL_TIMEOUT_MS=45000 npm run verify:live:spark -- --only command --prompts route,refusal,why --confirm-billed
```

### Ledger Projection
- Pre-run ledger count: **22 / 50 calls** (SHA256 `5a65c5fcbc53874e2bd27c2f64cb4c875aa05f0fb61b8b10069752451f7203a5`)
- Planned calls: **$\le 4$ calls** (3 prompts + 1 spare for a single timeout)
- Projected post-run ledger count: **$22 \rightarrow \le 26 / 50$ calls** (at least **24 lifetime calls remaining** in durable ledger).

### Required Owner Sentence
To authorize this completion run, the owner must provide the following exact sentence:

> **"I authorize up to 4 live calls for S1-LIVE-3 completion with MODEL_MAX_TOKENS=4096, MODEL_TIMEOUT_MS=45000 on prompts route, refusal, why from funding source Meta API."**

---

## 3. Two Required Owner Authorizations

Before live billed execution can commence, the owner must provide two explicit authorizations:

### Authorization 1: Scope & Budget Cap Coverage (S1-CAP50 Extension)
- **Statement**: Confirmation that the existing S1-CAP50 durable 50-call lifetime budget authorization covers live verification of the `decision_command` endpoint under a strict per-run cap $\le 5$ calls (accounting for the 1 call consumed in Run 1).
- **Budget State**:
  - Lifetime cap: 50 calls
  - Pre-run ledger count: 18 calls (post-Run 1)
  - Planned calls: $\le 5$ calls
  - Projected post-run ledger count: $\le 23 / 50$ calls (at least 27 calls remaining).

### Authorization 2: Funding Source & Credentials Authorization
- **Statement**: Confirmation that the owner has provided valid Meta API credentials in `.env.local` (`MODEL_API_KEY` or `META_API_KEY`) and authorizes the micro-spend charged by Meta for up to 5 inference requests.

---

## 4. Spend Bounds & Cost Analysis

Pricing is estimated at \$0.000002 / token (\$2.00 / 1,000,000 tokens) `[UNVERIFIED - estimated from Meta provider pricing tiers]`.

Evidence from `S1-LIVE-2` (`S1_LIVE_2_REPORT.md` and `S1_TRUNCATION_DIAGNOSIS.md`) demonstrates that Meta's `muse-spark-1.3` model generates between 1,000 and 2,100 internal reasoning tokens before emitting JSON, truncating calls when capped at 2,048 tokens and finishing cleanly with `"stop"` at 4,096 tokens. The live command verification run is therefore budgeted at `MODEL_MAX_TOKENS=4096`.

Prompt tokens are estimated at ~200–500 tokens per call.

| Scenario | Calls | Tokens / Call (Prompt + Completion) | Total Tokens | Spend Estimate |
|---|---|---|---|---|
| **Best Case** (all finish early @ ~1,250 tok) | 5 | ~250 prompt + ~1,000 completion | ~6,250 tokens | **\$0.0125** |
| **Expected Bounded** (~2,500 tok / call) | 5 | ~400 prompt + ~2,100 completion | ~12,500 tokens | **\$0.0250** |
| **Worst Case Bound** (all exhaust 4,096 cap) | 5 | ~400 prompt + 4,096 completion (~4,500 tok) | ~22,500 tokens | **\$0.0450** |
| **Upper Bound Limit** (conservative @ 5,000 tok) | 5 | ~5,000 tokens max | ~25,000 tokens | **\$0.0500** |

Token consumption for Run 2 is bounded at ~25,000 total tokens (5 calls $\times$ up to 4,096 completion tokens + prompt allowance). At the unverified provider rate of \$2.00 / 1M tokens (\$0.000002 / token) `[UNVERIFIED - estimated from Meta provider pricing tiers]`, the estimated spend is approximately **\$0.050 USD** (dollar estimate at an UNVERIFIED rate).

> [!IMPORTANT]
> **Hard Stop on First Truncation**: If any response returns `finish_reason === "length"` or `fallbackReason === "truncated"`, execution terminates immediately and no further calls will be dispatched, halting token consumption.

---

## 5. Planned Command Prompts (S1-CMD-RC / S1CMD-P2)

The 6 planned calls systematically evaluate all operational facets of `decision_command` against `CANONICAL_COMMAND_PROMPTS` defined in `scripts/live-verify-spark.ts`:

1. **Valid Shift Command**:
   - Utterance: `"Can I leave later?"`
   - Evaluation: `expectedIntent: "LEAVE_LATER"`, grounded against rain transit signals and prep buffer facts.
2. **Valid Explicit Shift Command**:
   - Utterance: `"Leave 15 minutes later"`
   - Evaluation: `expectedIntent: "LEAVE_LATER"`, `expectedSlots: { deltaMinutes: 15 }`.
3. **Suppression Command**:
   - Utterance: `"I already ate lunch today, don't suggest lunch"`
   - Evaluation: `expectedIntent: "UNSUPPORTED"`, `disallowedIntents: ["FIND_LUNCH"]`; suppression honoured (model must not propose `FIND_LUNCH`).
4. **Mode Switch Command**:
   - Utterance: `"Take the bus instead"`
   - Evaluation: `expectedIntent: "CHANGE_ROUTE"`, `expectedSlots: { mode: "bus" }`.
5. **Out-of-Scope / Adversarial Command**:
   - Utterance: `"Book a flight to Hawaii for next weekend"`
   - Evaluation: Fail-closed refusal (`expectedIntent: "UNSUPPORTED"`). Adversarial compliance fails evaluator with `wrong_intent`.
6. **Citation Explanation Probe**:
   - Utterance: `"Why did you suggest this departure time?"`
   - Evaluation: `expectedIntent: "WHY"`. Fact-key parity against confirmed facts (zero invented/unconfirmed memory citations).

---

## 6. Acceptance Criteria (Evaluated Strictly by Code)

Each call is evaluated by `evaluateCommandAcceptance()` against deterministic invariants:

1. **Closed Intent Set**: Must be one of `LEAVE_LATER`, `CHANGE_ROUTE`, `FIND_LUNCH`, `FIND_FUEL`, `WHY`, `ACCEPT`, `UNDO`, `UNSUPPORTED`.
2. **Intent Correspondence**: Intent must match per-prompt expectation (`expectedIntent`, `allowedIntents`, `disallowedIntents`). E.g., Hawaii prompt returning `LEAVE_LATER` fails closed with `wrong_intent`.
3. **Slot Constraints**: Returned slots must match per-prompt constraints (`expectedSlots: { mode, deltaMinutes, filters }`). Mismatches fail closed with `wrong_slots`.
4. **Valid Reason Codes**: Every cited reason code must belong to `VALID_REASON_CODES` (`weather_adjusted`, `matches_confirmed_preference`, `free_window_fit`, `shorter_trip`, `time_critical`).
5. **Fact-Key Parity**: All cited fact keys must exist in `context.confirmedFactKeys` (zero invented fact keys; fails with `invented_fact_key`).
6. **Finish Reason**: Must be `"stop"`. Any missing finish reason fails closed (`missing_finish_reason`). Any `"length"` (truncation) fails closed (`truncated`).
7. **Suppression Honoured**: No positive recommendations generated for actively suppressed intents (`suppression_violated`).
8. **Deterministic Fallback Invariant**: Core D1–D6 fixtures must remain 100% byte-identical (`6/6 MATCH`).

---

## 7. Hard Stop Conditions

The verification runner will immediately abort execution and halt further dispatches if any of the following occur:

- **HTTP Non-200**: Any HTTP 401, 403, 429, or 5xx response from `api.meta.ai`.
- **Non-Allowlisted Host**: Any dispatch directed to a host other than `api.meta.ai`.
- **Token Truncation**: Any response with `finish_reason === "length"` or `fallbackReason === "truncated"` (halts execution immediately).
- **Ledger Desynchronization**: Any delta mismatch between dispatched calls and durable ledger increments (`dispatched !== ledger delta`).
- **Lifetime Cap Exceeded**: Pre-flight or mid-flight ledger count reaches $\ge 50$.

---

## 8. Artifact Locations

- Dry-Run Reports (Mocked Upstream):
  - `test-results/s1-live-3/S1_LIVE_3_DRYRUN_REPORT.md`
  - `test-results/s1-live-3/s1-live-3-dryrun-report.json`
  - `docs/evidence/s1-live-3/S1_LIVE_3_DRYRUN_REPORT.md` (via `UPDATE_EVIDENCE=1`)
  - `docs/evidence/s1-live-3/s1-live-3-dryrun-report.json` (via `UPDATE_EVIDENCE=1`)
- Live Verification Reports (When Authorized):
  - `docs/evidence/s1-live-3/S1_LIVE_3_COMMAND_REPORT.md`
  - `docs/evidence/s1-live-3/s1-live-3-command-report.json`
- Production Ledger:
  - `.yori-runtime/model-live-ledger.json` (Untouched at SHA256 `5a65c5fcbc53874e2bd27c2f64cb4c875aa05f0fb61b8b10069752451f7203a5`, 22 / 50 calls)
