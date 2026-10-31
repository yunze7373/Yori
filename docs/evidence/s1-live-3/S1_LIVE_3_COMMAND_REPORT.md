# S1-LIVE-3: Real Billed Meta Model API Verification Report

## 1. Executive Summary

| Parameter | Value |
|---|---|
| **Timestamp** | 2026-10-31T03:07:55.313Z |
| **Provider Host** | `api.meta.ai` |
| **Model** | `muse-spark-1.3` |
| **Authorized Per-Run Cap** | `6` |
| **Pre-Run Ledger Count** | `17` |
| **Lifetime Allowance** | `50` |
| **Lifetime Remaining** | `32` |
| **Total Calls Dispatched** | `1` |
| **Durable Ledger Count** | `18 / 50` |
| **Ledger Delta** | `1` |
| **Ledger Reconciled** | `MATCH (dispatched == ledger delta) ✅` |
| **Durable Ledger File** | `.yori-runtime/model-live-ledger.json` |
| **Execution Status** | `HARD STOP (Network error: This operation was aborted)` |
| **Target Host Compliance** | `api.meta.ai ONLY ✅` |
| **D1–D6 Deterministic Parity** | `6/6 BYTE-IDENTICAL ✅` |
| **Key Occurrence Audit** | `0 occurrences in output files ✅` |

## 2. Call-by-Call Breakdown

| # | Endpoint | Description | HTTP Status | Latency (ms) | Usage Tokens (Prompt / Compl / Total) | Reasoning Tokens | Finish Reason | Fallback Used | Reason Code | Fact-Check Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `command` | Command valid shift ("Can I leave later?") | 0 | 2005 | N/A | - | - | Yes | `timeout` | DISCARDED ❌ |

## 3. Hard Stop / Availability Note

> [!WARNING]
> Execution stopped: Network error: This operation was aborted

## 4. Security & Sentinel Scrub Audit

- **Prefix-Free Substring Key Count**: 0 occurrences across generated report files.
- **Host Allowlist**: Dispatched calls strictly restricted to `api.meta.ai`.
- **Durable Ledger Enforcement**: Every call pre-reserved atomic slot in `.yori-runtime/model-live-ledger.json`.
- **Deterministic Output Parity**: Post-live D1–D6 fixture evaluation confirms 100% byte-identical behavior with live disabled.
