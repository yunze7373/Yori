# S1-LIVE-3: Owner Gate Clearance & Live Verification Runbook

**Date**: 2026-10-31  
**Task ID**: `INBOX-20261031-713D79`  
**Target Slice**: `S1-LIVE-3` (`decision_command` live model verification)  
**Target Model**: `muse-spark-1.3` on `https://api.meta.ai/v1/chat/completions`  
**Current Real Ledger State**: 17 / 50 calls used (33 remaining); SHA256 `46aa6fa9158356b29b327913522188615004b4c6d61952a2e61a2bd79b96da58`  

---

## 1. Executive Summary & Gate Purpose

This document establishes the owner authorization requirements, budget limits, and hard safety boundaries for conducting live billed verification of the **`decision_command`** endpoint against Meta's `muse-spark-1.3` model.

In `S1-LIVE-2`, live verification successfully validated the `refine` and `reason` endpoints (Run 1 & Run 2, 7 calls dispatched total). `S1-LIVE-3` targets the remaining model interaction surface: **command interpretation and situation attribution**.

As of `S1-LIVE-3-PREP`, the offline test harness, code-acceptance evaluator, mock sink, and ledger isolation layers are fully implemented and verified green. **ZERO live calls have been made.**

---

## 2. Exact Live Verification Command

When cleared by the owner, live verification must be executed using the exact command line below:

```bash
MODEL_LIVE_ENABLED=1 MODEL_LIVE_MAX_CALLS=6 npm run verify:live:spark -- --only command --confirm-billed
```

> [!IMPORTANT]
> The verification script enforces fail-closed gates:
> 1. Strictly refuses execution without `MODEL_LIVE_ENABLED=1`.
> 2. Strictly refuses execution without explicit `--confirm-billed` flag.
> 3. Clamps and refuses any per-run call count $> 6$ in command mode (`COMMAND_PER_RUN_MAX_CALLS = 6`).
> 4. Strictly refuses execution if `MODEL_API_KEY` or `META_API_KEY` is missing from the environment.
> 5. Strictly aborts if destination host is not `api.meta.ai`.

---

## 3. Two Required Owner Authorizations

Before live billed execution can commence, the owner must provide two explicit authorizations:

### Authorization 1: Scope & Budget Cap Coverage (S1-CAP50 Extension)
- **Statement**: Confirmation that the existing S1-CAP50 durable 50-call lifetime budget authorization covers live verification of the `decision_command` endpoint under a strict per-run cap $\le 6$ calls.
- **Budget State**:
  - Lifetime cap: 50 calls
  - Pre-run ledger count: 17 calls
  - Planned calls: $\le 6$ calls
  - Projected post-run ledger count: $\le 23 / 50$ calls (at least 27 calls remaining).

### Authorization 2: Funding Source & Credentials Authorization
- **Statement**: Confirmation that the owner has provided valid Meta API credentials in `.env.local` (`MODEL_API_KEY` or `META_API_KEY`) and authorizes the micro-spend charged by Meta for up to 6 inference requests.

---

## 4. Spend Bounds & Cost Analysis

Pricing is estimated at \$0.000002 / token (\$2.00 / 1,000,000 tokens) based on published provider rates:

| Scenario | Calls | Max Tokens / Call | Total Tokens | Spend Estimate |
|---|---|---|---|---|
| **Best Case** (all pass) | 6 | ~250 tokens | ~1,500 tokens | **\$0.0030** |
| **Worst Case** (all cap) | 6 | 300 tokens (hard cap) | ~1,800 tokens | **\$0.0036** |
| **Upper Bound Limit** | 6 | 500 prompt+completion | ~3,000 tokens | **\$0.0060** |

The maximum possible spend for this run is strictly bounded below **\$0.006 USD**.

---

## 5. Planned Command Prompts (S1-CMD-RC / S1CMD-P2)

The 6 planned calls systematically evaluate all operational facets of `decision_command`:

1. **Valid Shift Command**:
   - Utterance: `"Can I leave later?"`
   - Evaluation: `intent: "LEAVE_LATER"`, grounded against rain transit signals and prep buffer facts.
2. **Valid Earlier Shift Command**:
   - Utterance: `"Leave 15 minutes earlier"`
   - Evaluation: `intent: "LEAVE_LATER"`, `slots: { deltaMinutes: 15 }`.
3. **Suppression Command**:
   - Utterance: `"I already ate lunch today, don't suggest lunch"`
   - Evaluation: Suppression honoured; model must not propose `FIND_LUNCH`.
4. **Mode Switch Command**:
   - Utterance: `"Take the bus instead"`
   - Evaluation: `intent: "CHANGE_ROUTE"`, `slots: { mode: "bus" }`.
5. **Out-of-Scope / Adversarial Command**:
   - Utterance: `"Book a flight to Hawaii for next weekend"`
   - Evaluation: Fail-closed refusal (`intent: "UNSUPPORTED"`).
6. **Citation Discipline Probe**:
   - Utterance: `"Why did you suggest this departure time?"`
   - Evaluation: Fact-key parity against confirmed facts (zero invented/unconfirmed memory citations).

---

## 6. Acceptance Criteria (Evaluated Strictly by Code)

Each call is evaluated by `evaluateCommandAcceptance()` against deterministic invariants:

1. **Closed Intent Set**: Must be one of `LEAVE_LATER`, `CHANGE_ROUTE`, `FIND_LUNCH`, `FIND_FUEL`, `WHY`, `ACCEPT`, `UNDO`, `UNSUPPORTED`.
2. **Valid Reason Codes**: Every cited reason code must belong to `VALID_REASON_CODES` (`weather_adjusted`, `matches_confirmed_preference`, `free_window_fit`, `shorter_trip`, `time_critical`).
3. **Fact-Key Parity**: All cited fact keys must exist in `context.confirmedFactKeys` (zero invented fact keys).
4. **Finish Reason**: Must be `"stop"`. Any `"length"` (truncation) fails closed.
5. **Suppression Honoured**: No positive recommendations generated for actively suppressed intents.
6. **Deterministic Fallback Invariant**: Core D1–D6 fixtures must remain 100% byte-identical (`6/6 MATCH`).

---

## 7. Hard Stop Conditions

The verification runner will immediately abort execution and halt further dispatches if any of the following occur:

- **HTTP Non-200**: Any HTTP 401, 403, 429, or 5xx response from `api.meta.ai`.
- **Non-Allowlisted Host**: Any dispatch directed to a host other than `api.meta.ai`.
- **Token Truncation**: Any response with `finish_reason === "length"` or `fallbackReason === "truncated"`.
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
  - `.yori-runtime/model-live-ledger.json` (Untouched at SHA256 `46aa6fa9...`)
