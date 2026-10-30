# S1-LIVE: Real Billed Meta Model API Verification Report

## 1. Executive Summary

| Parameter | Value |
|---|---|
| **Timestamp** | 2026-10-30T17:55:51.866Z |
| **Provider Host** | `api.meta.ai` |
| **Model** | `muse-spark-1.3` |
| **Authorized Per-Run Cap** | `10` |
| **Pre-Run Ledger Count** | `13` |
| **Lifetime Allowance** | `50` |
| **Lifetime Remaining** | `33` |
| **Total Calls Dispatched** | `4` |
| **Durable Ledger Count** | `17 / 50` |
| **Ledger Delta** | `4` |
| **Ledger Reconciled** | `MATCH (dispatched == ledger delta) ✅` |
| **Durable Ledger File** | `.yori-runtime/model-live-ledger.json` |
| **Execution Status** | `COMPLETED` |
| **Target Host Compliance** | `api.meta.ai ONLY ✅` |
| **D1–D6 Deterministic Parity** | `6/6 BYTE-IDENTICAL ✅` |
| **Key Occurrence Audit** | `0 occurrences in output files ✅` |

## 2. Call-by-Call Breakdown

| # | Endpoint | Description | HTTP Status | Latency (ms) | Usage Tokens (Prompt / Compl / Total) | Reasoning Tokens | Finish Reason | Fallback Used | Reason Code | Fact-Check Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `refine` | Refine depart template (Piano lesson) | 200 | 7074 | 114 / 1045 / 1159 | 996 | `stop` | No | `-` | ACCEPTED ✅ |
| 2 | `reason` | Reasoning plan ranking (rain vs lunch) | 200 | 12216 | 374 / 2136 / 2510 | 1940 | `stop` | No | `-` | ACCEPTED ✅ |
| 3 | `command` | Command interpret ("Can I leave later?") | 200 | 9646 | 228 / 1577 / 1805 | 1531 | `stop` | Yes | `invalid_reason_code` | DISCARDED ❌ |
| 4 | `command` | Command interpret ("Leave 15 minutes earlier") | 200 | 10389 | 221 / 1864 / 2085 | 1818 | `stop` | Yes | `invalid_reason_code` | DISCARDED ❌ |

## 4. Security & Sentinel Scrub Audit

- **Prefix-Free Substring Key Count**: 0 occurrences across generated report files.
- **Host Allowlist**: Dispatched calls strictly restricted to `api.meta.ai`.
- **Durable Ledger Enforcement**: Every call pre-reserved atomic slot in `.yori-runtime/model-live-ledger.json`.
- **Deterministic Output Parity**: Post-live D1–D6 fixture evaluation confirms 100% byte-identical behavior with live disabled.
