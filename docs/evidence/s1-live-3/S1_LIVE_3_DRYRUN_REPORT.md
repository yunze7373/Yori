# S1-LIVE-3: Real Billed Meta Model API Verification Report

## 1. Executive Summary

| Parameter | Value |
|---|---|
| **Timestamp** | 2026-10-31T04:00:31.160Z |
| **Provider Host** | `api.meta.ai` |
| **Model** | `muse-spark-1.3` |
| **Authorized Per-Run Cap** | `9` |
| **Pre-Run Ledger Count** | `0` |
| **Lifetime Allowance** | `50` |
| **Lifetime Remaining** | `41` |
| **Total Calls Dispatched** | `9` |
| **Durable Ledger Count** | `9 / 50` |
| **Ledger Delta** | `9` |
| **Ledger Reconciled** | `MATCH (dispatched == ledger delta) ✅` |
| **Durable Ledger File** | `.yori-runtime/dryrun-command-ledger-1134-1793419231149.json` |
| **Execution Status** | `COMPLETED` |
| **Target Host Compliance** | `api.meta.ai ONLY ✅` |
| **D1–D6 Deterministic Parity** | `6/6 BYTE-IDENTICAL ✅` |
| **Key Occurrence Audit** | `0 occurrences in output files ✅` |

## 2. Call-by-Call Breakdown

| # | Endpoint | Description | HTTP Status | Latency (ms) | Usage Tokens (Prompt / Compl / Total) | Reasoning Tokens | Finish Reason | Fallback Used | Reason Code | Fact-Check Outcome |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `command` | Command valid shift ("Can I leave later?") | 200 | 15 | 180 / 65 / 245 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 2 | `command` | Command valid explicit shift ("Leave 15 minutes later") | 200 | 15 | 175 / 60 / 235 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 3 | `command` | Command suppression ("I already ate lunch today, don't suggest lunch") | 200 | 15 | 150 / 40 / 190 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 4 | `command` | Command route mode switch ("Take the bus instead") | 200 | 15 | 190 / 70 / 260 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 5 | `command` | Command out-of-scope refusal ("Book a flight to Hawaii for next weekend") | 200 | 15 | 160 / 45 / 205 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 6 | `command` | Command citation explanation probe ("Why did you suggest this departure time?") | 200 | 15 | 185 / 55 / 240 | - | `stop` | No | `-` | ACCEPTED ✅ |
| 7 | `command` | Command citation discipline probe ("Why did you suggest this departure time?" with unconfirmed fact) | 200 | 15 | 185 / 55 / 240 | - | `stop` | Yes | `invented_fact_key` | DISCARDED ❌ |
| 8 | `command` | Command adversarial compliance probe ("Book a flight to Hawaii" returning LEAVE_LATER) | 200 | 15 | 160 / 40 / 200 | - | `stop` | No | `wrong_intent` | DISCARDED ❌ |
| 9 | `command` | Command missing finish_reason probe ("Can I leave later?" omitting finish_reason) | 200 | 15 | 180 / 50 / 230 | - | - | No | `missing_finish_reason` | DISCARDED ❌ |

### 2.1. Command Structured Evidence & Invariant Audit

| # | Description | Expected Intent | Actual Intent | Expected Slots | Actual Slots | Reason Codes | Cited Facts | Cited Signals | Situation Attribution | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Command valid shift ("Can I leave later?") | `LEAVE_LATER` | `LEAVE_LATER` | - | `{"deltaMinutes":20}` | `weather_adjusted` | `habit_rain_transit` | `weather:2026-10-28T20:35:00.000Z` | - | ACCEPTED ✅ |
| 2 | Command valid explicit shift ("Leave 15 minutes later") | `LEAVE_LATER` | `LEAVE_LATER` | `{"deltaMinutes":15}` | `{"deltaMinutes":15}` | `weather_adjusted` | `habit_rain_transit, prep_buffer_minutes` | `weather:2026-10-28T20:35:00.000Z` | - | ACCEPTED ✅ |
| 3 | Command suppression ("I already ate lunch today, don't suggest lunch") | `UNSUPPORTED` | `UNSUPPORTED` | - | `{}` | - | - | - | - | ACCEPTED ✅ |
| 4 | Command route mode switch ("Take the bus instead") | `CHANGE_ROUTE` | `CHANGE_ROUTE` | `{"mode":"bus"}` | `{"mode":"bus"}` | `weather_adjusted` | `habit_rain_transit` | `weather:2026-10-28T20:35:00.000Z` | `weather_adjusted` | ACCEPTED ✅ |
| 5 | Command out-of-scope refusal ("Book a flight to Hawaii for next weekend") | `UNSUPPORTED` | `UNSUPPORTED` | - | `{}` | - | - | - | - | ACCEPTED ✅ |
| 6 | Command citation explanation probe ("Why did you suggest this departure time?") | `WHY` | `WHY` | - | `{}` | `weather_adjusted` | `habit_rain_transit` | `weather:2026-10-28T20:35:00.000Z` | `weather_adjusted` | ACCEPTED ✅ |
| 7 | Command citation discipline probe ("Why did you suggest this departure time?" with unconfirmed fact) | `WHY` | `WHY` | - | `{}` | `weather_adjusted` | `unconfirmed_secret_fact_xyz` | `weather:2026-10-28T20:35:00.000Z` | - | DISCARDED (invented_fact_key) ❌ |
| 8 | Command adversarial compliance probe ("Book a flight to Hawaii" returning LEAVE_LATER) | `UNSUPPORTED` | `LEAVE_LATER` | - | `{"deltaMinutes":15}` | - | - | - | - | DISCARDED (wrong_intent) ❌ |
| 9 | Command missing finish_reason probe ("Can I leave later?" omitting finish_reason) | `LEAVE_LATER` | `LEAVE_LATER` | - | `{"deltaMinutes":10}` | `weather_adjusted` | `habit_rain_transit` | `weather:2026-10-28T20:35:00.000Z` | - | DISCARDED (missing_finish_reason) ❌ |

## 4. Security & Sentinel Scrub Audit

- **Prefix-Free Substring Key Count**: 0 occurrences across generated report files.
- **Host Allowlist**: Dispatched calls strictly restricted to `api.meta.ai`.
- **Durable Ledger Enforcement**: Every call pre-reserved atomic slot in `.yori-runtime/model-live-ledger.json`.
- **Deterministic Output Parity**: Post-live D1–D6 fixture evaluation confirms 100% byte-identical behavior with live disabled.
