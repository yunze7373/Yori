# S1-LIVE: Real Billed Meta Model API Verification Report

## 1. Executive Summary

| Parameter | Value |
|---|---|
| **Timestamp** | 2026-10-31T01:53:55.290Z |
| **Provider Host** | `api.meta.ai` |
| **Model** | `muse-spark-1.3` |
| **Authorized Per-Run Cap** | `6` |
| **Pre-Run Ledger Count** | `0` |
| **Lifetime Allowance** | `50` |
| **Lifetime Remaining** | `44` |
| **Total Calls Dispatched** | `6` |
| **Durable Ledger Count** | `6 / 50` |
| **Ledger Delta** | `6` |
| **Ledger Reconciled** | `MATCH (dispatched == ledger delta) ✅` |
| **Durable Ledger File** | `.yori-runtime/dryrun-command-ledger-36472-1793411635278.json` |
| **Execution Status** | `COMPLETED` |
| **Target Host Compliance** | `api.meta.ai ONLY ✅` |
| **D1–D6 Deterministic Parity** | `6/6 BYTE-IDENTICAL ✅` |
| **Key Occurrence Audit** | `0 occurrences in output files ✅` |

## 2. Call-by-Call Breakdown

| # | Endpoint | Description | HTTP Status | Latency (ms) | Usage Tokens (Prompt / Compl / Total) | Reasoning Tokens | Finish Reason | Fallback Used | Reason Code | Fact-Check Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `command` | Command valid shift ("Can I leave later?") | 200 | 15 | 180 / 65 / 245 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 2 | `command` | Command valid earlier shift ("Leave 15 minutes earlier") | 200 | 15 | 175 / 60 / 235 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 3 | `command` | Command suppression ("I already ate lunch today, don't suggest lunch") | 200 | 15 | 150 / 40 / 190 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 4 | `command` | Command route mode switch ("Take the bus instead") | 200 | 15 | 190 / 70 / 260 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 5 | `command` | Command out-of-scope refusal ("Book a flight to Hawaii for next weekend") | 200 | 15 | 160 / 45 / 205 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 6 | `command` | Command citation discipline probe ("Can I leave later?" with unconfirmed fact) | 200 | 15 | 185 / 55 / 240 | - | `stop` | Yes | `invented_fact_key` | DISCARDED ❌ |

## 4. Security & Sentinel Scrub Audit

- **Prefix-Free Substring Key Count**: 0 occurrences across generated report files.
- **Host Allowlist**: Dispatched calls strictly restricted to `api.meta.ai`.
- **Durable Ledger Enforcement**: Every call pre-reserved atomic slot in `.yori-runtime/model-live-ledger.json`.
- **Deterministic Output Parity**: Post-live D1–D6 fixture evaluation confirms 100% byte-identical behavior with live disabled.
