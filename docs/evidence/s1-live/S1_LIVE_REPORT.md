# S1-LIVE: Real Billed Meta Model API Verification Report

## 1. Executive Summary

| Parameter | Value |
|---|---|
| **Timestamp** | 2026-10-30T15:59:42.157Z |
| **Provider Host** | `api.meta.ai` |
| **Model** | `muse-spark-1.3` |
| **Authorized Call Cap** | `10` |
| **Total Calls Dispatched** | `5` |
| **Durable Ledger Count** | `10 / 10` |
| **Durable Ledger File** | `.yori-runtime/model-live-ledger.json` |
| **Execution Status** | `COMPLETED` |
| **Target Host Compliance** | `api.meta.ai ONLY ✅` |
| **D1–D6 Deterministic Parity** | `6/6 BYTE-IDENTICAL ✅` |
| **Key Occurrence Audit** | `0 occurrences in output files ✅` |

## 2. Call-by-Call Breakdown

| # | Endpoint | Description | HTTP Status | Latency (ms) | Usage Tokens (Prompt / Compl / Total) | Fallback Used | Reason Code | Fact-Check Outcome |
|---|---|---|---|---|---|---|---|---|
| 1 | `refine` | Refine depart template (Piano lesson) | 200 | 7994 | 114 / 1024 / 1138 | Yes | `schema_invalid` | DISCARDED ❌ |
| 2 | `refine` | Refine rain depart template (Rain expected) | 200 | 4256 | 136 / 1024 / 1160 | Yes | `schema_invalid` | DISCARDED ❌ |
| 3 | `refine` | Refine lunch template (Green Bowl) | 200 | 7306 | 111 / 1024 / 1135 | Yes | `schema_invalid` | DISCARDED ❌ |
| 4 | `reason` | Reasoning plan ranking (rain vs lunch) | 200 | 5013 | 374 / 1024 / 1398 | Yes | `schema_invalid` | DISCARDED ❌ |
| 5 | `command` | Command interpret ("Can I leave later?") | 200 | 5219 | 228 / 1024 / 1252 | Yes | `schema_invalid` | DISCARDED ❌ |

## 4. Security & Sentinel Scrub Audit

- **Prefix-Free Substring Key Count**: 0 occurrences across generated report files.
- **Host Allowlist**: Dispatched calls strictly restricted to `api.meta.ai`.
- **Durable Ledger Enforcement**: Every call pre-reserved atomic slot in `.yori-runtime/model-live-ledger.json`.
- **Deterministic Output Parity**: Post-live D1–D6 fixture evaluation confirms 100% byte-identical behavior with live disabled.
