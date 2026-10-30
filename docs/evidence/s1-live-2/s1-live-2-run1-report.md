# S1-LIVE: Real Billed Meta Model API Verification Report

## 1. Executive Summary

| Parameter | Value |
|---|---|
| **Timestamp** | 2026-10-30T17:54:30.606Z |
| **Provider Host** | `api.meta.ai` |
| **Model** | `muse-spark-1.3` |
| **Authorized Per-Run Cap** | `10` |
| **Pre-Run Ledger Count** | `10` |
| **Lifetime Allowance** | `50` |
| **Lifetime Remaining** | `37` |
| **Total Calls Dispatched** | `3` |
| **Durable Ledger Count** | `13 / 50` |
| **Ledger Delta** | `3` |
| **Ledger Reconciled** | `MATCH (dispatched == ledger delta) ✅` |
| **Durable Ledger File** | `.yori-runtime/model-live-ledger.json` |
| **Execution Status** | `HARD STOP (fallbackReason: truncated)` |
| **Target Host Compliance** | `api.meta.ai ONLY ✅` |
| **D1–D6 Deterministic Parity** | `6/6 BYTE-IDENTICAL ✅` |
| **Key Occurrence Audit** | `0 occurrences in output files ✅` |

## 2. Call-by-Call Breakdown

| # | Endpoint | Description | HTTP Status | Latency (ms) | Usage Tokens (Prompt / Compl / Total) | Reasoning Tokens | Finish Reason | Fallback Used | Reason Code | Fact-Check Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `refine` | Refine depart template (Piano lesson) | 200 | 7683 | 114 / 1273 / 1387 | 1228 | `stop` | No | `-` | ACCEPTED ✅ |
| 2 | `reason` | Reasoning plan ranking (rain vs lunch) | 200 | 7249 | 374 / 1519 / 1893 | 1314 | `stop` | No | `-` | ACCEPTED ✅ |
| 3 | `command` | Command interpret ("Can I leave later?") | 200 | 14778 | 228 / 2048 / 2276 | 2046 | `length` | Yes | `truncated` | DISCARDED ❌ |

## 3. Hard Stop / Availability Note

> [!WARNING]
> Execution stopped: fallbackReason: truncated

## 4. Security & Sentinel Scrub Audit

- **Prefix-Free Substring Key Count**: 0 occurrences across generated report files.
- **Host Allowlist**: Dispatched calls strictly restricted to `api.meta.ai`.
- **Durable Ledger Enforcement**: Every call pre-reserved atomic slot in `.yori-runtime/model-live-ledger.json`.
- **Deterministic Output Parity**: Post-live D1–D6 fixture evaluation confirms 100% byte-identical behavior with live disabled.
