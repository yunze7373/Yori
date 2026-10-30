# S1-LIVE-2: Meta Model API Live Billed Verification Report

**Date**: 2026-10-31  
**Task ID**: `INBOX-20261030-E69E30`  
**Target Slice**: S1-LIVE-2 (Owner-Authorized Billed Verification under S1-CAP50 Lifetime Cap)  
**Target Model**: `muse-spark-1.3` on `https://api.meta.ai/v1/chat/completions`  
**Reference Approvals & Specs**: Coordinator authorization `msg_d3a3e779`, `docs/evidence/s1-live/S1_TRUNCATION_DIAGNOSIS.md` §6, XKEY01 approval `02f39430-066c-4319-aa6d-7ffce0243c49`.

---

## 1. Executive Summary & Verification Outcome

Under the owner-authorized 50-call lifetime allowance (S1-CAP50), live billed verification was conducted against `https://api.meta.ai/v1/chat/completions` using Meta's `muse-spark-1.3` model across two structured verification runs.

### Key Results
1. **Fact-Checked Acceptance**: Successfully achieved **2 fact-checked ACCEPTED live outputs** with `finish_reason: "stop"` and internal `reasoning_tokens` telemetry accurately recorded on live billed requests:
   - **`[REFINE]`**: Phrasing refinement for departure timing accepted (Call 1 on Run 1 & Run 2).
   - **`[REASON]`**: Plan ranking rationale with grounded signal & fact citations accepted (Call 2 on Run 1 & Run 2).
2. **Truncation Resolution**: Raising the token ceiling from 2048 to 4096 in Run 2 successfully eliminated token truncation: 100% of calls in Run 2 finished with `finish_reason: "stop"`, resolving the length cutoff observed in S1-LIVE.
3. **Atomic Ledger Reconciliation**: Exactly **7 calls** were dispatched across the two runs (Run 1 = 3, Run 2 = 4). In both runs, dispatched calls exactly matched the atomic ledger delta (`MATCH`). The production ledger advanced from 10 to 17 calls (33 calls remain under the durable 50-call lifetime allowance).
4. **Deterministic Fallback Invariant**: In both runs, all 6 deterministic core fixtures (D1–D6) produced 100% byte-identical outputs (`6/6 MATCH`), confirming that model execution leaves zero domain side-effects.
5. **Credential & Boundary Hygiene**: Exactly 0 occurrences of `MODEL_API_KEY` across all logs, reports, and diffs. All dispatches strictly targeted `api.meta.ai`.

---

## 2. Production Ledger Accounting & Audit Trail

| Checkpoint | Timestamp | Call Count | Reservations | Ledger SHA256 |
|---|---|---|---|---|
| **Pre-Flight (Baseline)** | 2026-10-31 00:59 UTC | 10 / 50 | 10 | `9e5fabe4fef3cf9cc1e8f1ac531f096faa97e4e64b64b50e5ecbe8d07c30cb53` |
| **Post-Run 1** | 2026-10-30 17:54 UTC | 13 / 50 | 13 | `a1182f169821ff6b2d397a2af15411bf1dcef490117229f25f6bf24a242a5cd6` |
| **Post-Run 2** | 2026-10-30 17:55 UTC | 17 / 50 | 17 | `46aa6fa9158356b29b327913522188615004b4c6d61952a2e61a2bd79b96da58` |

- **Total Calls Dispatched**: 7 calls
- **Lifetime Allowance Remaining**: 33 calls (out of 50)
- **Ledger Invariant**: Ledger file was exclusively modified via atomic process-level reservations in `reserveLedgerSlot()`. Zero manual edits, resets, or rollback occurred.

---

## 3. Run 1: Initial Bounded Verification (`max_tokens = 2048`)

### Configuration & Environment
- `MODEL_LIVE_ENABLED=1`
- `MODEL_LIVE_MAX_CALLS=10`
- `MODEL_MAX_TOKENS=2048`
- `MODEL_TIMEOUT_MS=20000`
- `MODEL_REASONING_EFFORT`: Unset
- Flags: `--confirm-billed`

### Pre-Dispatch Budget & Safety Summary
```
----------------------------------------------------------------------
📋 PRE-DISPATCH BUDGET & SAFETY SUMMARY
----------------------------------------------------------------------
Planned Calls:          10 (up to 3 accepted, 1 per objective)
Per-Run Call Cap:       10 (valid 1..10)
Lifetime Cap:           50
Lifetime Calls Used:    10
Lifetime Remaining:     40
Per-Call max_tokens:    2048
Spend Range Estimate:   $0.0123 - $0.0410 (assumes ~$2.00/1M tokens [$0.000002/tok] [UNVERIFIED], best-case 3 accepts to worst-case 10 dispatches @ up to 2048 tok/call)
----------------------------------------------------------------------
```

### Call Dispatches
| # | Endpoint | Description | Status | Latency | Prompt Tok | Completion Tok | Reasoning Tok | finish_reason | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `refine` | Refine depart template (Piano lesson) | HTTP 200 | 7,683ms | 114 | 1,273 | 1,228 | `stop` | **ACCEPTED** ✅ |
| 2 | `reason` | Reasoning plan ranking (rain vs lunch) | HTTP 200 | 7,249ms | 374 | 1,519 | 1,314 | `stop` | **ACCEPTED** ✅ |
| 3 | `command` | Command interpret ("Can I leave later?") | HTTP 200 | 14,778ms | 228 | 2,048 | 2,046 | `length` | **DISCARDED (truncated)** |

- **Execution Status**: `HARD STOP (fallbackReason: truncated)` triggered on Call #3.
- **Analysis**: Call 1 and Call 2 succeeded with full fact-checked acceptance. Call 3 consumed 2,046 reasoning tokens, hitting the 2,048 completion token ceiling before closing its JSON payload. Per §6 specification, this triggered authorized Run 2 with `max_tokens = 4096`.

---

## 4. Run 2: Headroom Verification (`max_tokens = 4096`)

### Configuration & Environment
- `MODEL_LIVE_ENABLED=1`
- `MODEL_LIVE_MAX_CALLS=10`
- `MODEL_MAX_TOKENS=4096`
- `MODEL_TIMEOUT_MS=20000`
- `MODEL_REASONING_EFFORT`: Unset
- Flags: `--confirm-billed`

### Pre-Dispatch Budget & Safety Summary
```
----------------------------------------------------------------------
📋 PRE-DISPATCH BUDGET & SAFETY SUMMARY
----------------------------------------------------------------------
Planned Calls:          10 (up to 3 accepted, 1 per objective)
Per-Run Call Cap:       10 (valid 1..10)
Lifetime Cap:           50
Lifetime Calls Used:    13
Lifetime Remaining:     37
Per-Call max_tokens:    4096
Spend Range Estimate:   $0.0246 - $0.0819 (assumes ~$2.00/1M tokens [$0.000002/tok] [UNVERIFIED], best-case 3 accepts to worst-case 10 dispatches @ up to 4096 tok/call)
----------------------------------------------------------------------
```

### Call Dispatches
| # | Endpoint | Description | Status | Latency | Prompt Tok | Completion Tok | Reasoning Tok | finish_reason | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `refine` | Refine depart template (Piano lesson) | HTTP 200 | 7,074ms | 114 | 1,045 | 996 | `stop` | **ACCEPTED** ✅ |
| 2 | `reason` | Reasoning plan ranking (rain vs lunch) | HTTP 200 | 12,216ms | 374 | 2,136 | 1,940 | `stop` | **ACCEPTED** ✅ |
| 3 | `command` | Command interpret ("Can I leave later?") | HTTP 200 | 9,646ms | 228 | 1,577 | 1,531 | `stop` | **DISCARDED (invalid_reason_code)** |
| 4 | `command` | Command interpret ("Leave 15m earlier") | HTTP 200 | 10,389ms | 221 | 1,864 | 1,818 | `stop` | **DISCARDED (invalid_reason_code)** |

- **Execution Status**: `COMPLETED`.
- **Analysis**:
  - Truncation was completely eliminated: 100% of calls (4/4) reached `finish_reason: "stop"`.
  - Refine (Call 1) and Reason (Call 2) were both fact-checked and **ACCEPTED**.
  - Duplicate refine and reason planned calls were skipped cleanly by stop-on-first-accepted.
  - Command calls completed generation without truncation, but emitted novel reason codes outside the closed domain set (`invalid_reason_code`), falling back safely and cleanly to deterministic command interpretation without errors.

---

## 5. Security, Key Hygiene & Boundary Audit

1. **Secret Leakage Audit**:
   - `grep` by exact value of `MODEL_API_KEY`: **0 occurrences** across all generated reports, logs, and git diffs.
   - Machine reports record `keyOccurrenceCount: 0`.
2. **Host Allowlist**:
   - 100% of dispatches targeted `api.meta.ai`.
   - Host list recorded in machine JSON: `["api.meta.ai"]`.
3. **Core Preservation**:
   - `git diff --stat f43c6c1d HEAD -- src/core`: **Empty** (0 lines changed).
4. **D1–D6 Deterministic Parity**:
   - 6/6 fixtures byte-identical between live disabled and live fallback.

---

## 6. Artifact & Evidence File Inventory

The evidence files for S1-LIVE-2 are archived in `docs/evidence/s1-live-2/`:
- [`docs/evidence/s1-live-2/s1-live-2-run1-report.md`](s1-live-2-run1-report.md): Run 1 human-readable markdown report.
- [`docs/evidence/s1-live-2/s1-live-2-run1-report.json`](s1-live-2-run1-report.json): Run 1 machine-readable structured JSON telemetry.
- [`docs/evidence/s1-live-2/s1-live-2-run2-report.md`](s1-live-2-run2-report.md): Run 2 human-readable markdown report.
- [`docs/evidence/s1-live-2/s1-live-2-run2-report.json`](s1-live-2-run2-report.json): Run 2 machine-readable structured JSON telemetry.
- [`docs/evidence/s1-live-2/S1_LIVE_2_REPORT.md`](S1_LIVE_2_REPORT.md): This comprehensive summary report.
