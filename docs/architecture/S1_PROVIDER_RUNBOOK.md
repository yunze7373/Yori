# S1 Provider Runbook: Baseten & Meta Model Proxy Hardening

Governed by Architecture Rev3 Section 9.1, `S1-PROVIDER-BASETEN-PLAN-20261030.md` §2-§3, and coordinator approval `msg_66a30bed0c174767`.

---

## 1. Overview & Objective

Yori utilizes the **Meta Muse Spark** series (either via direct Meta Model API or hosted open-weights providers such as Baseten) strictly for wording refinement, structured candidate plan reordering, and decision command interpretation. Under zero-drift architecture:
- Model output is strictly constrained to supplied facts (no invented times, places, or facts).
- When model is disabled, times out, errors, or returns non-conforming schema, deterministic engine fallbacks are used.
- Scenarios D1–D6 produce byte-identical outputs with live model disabled.

This runbook establishes operational safeguards, environment variables, clamping rules, durable ledger behavior, and provider run instructions.

---

## 2. Configuration Parameters & Bounds

All configuration is resolved server-side in `src/adapters/model/server-proxy.ts`. No secret keys or live flags are bundled into client code.

| Variable | Type / Format | Default | Clamping / Validation Rules | Purpose |
|---|---|---|---|---|
| `MODEL_API_KEY` | String (Secret) | Unset | Read from `.env.local` or process env. Alias: `META_API_KEY`. Never logged or stored. | Authentication bearer token. |
| `MODEL_LIVE_ENABLED` | String (`"0"` / `"1"`) | Unset (`"0"`) | Outbound network calls dispatch **only** when set to `"1"`. Left unset during standard development and CI. | Explicit live network circuit breaker. |
| `MODEL_BASE_URL` | URL String | `https://api.meta.ai/v1` | Baseten endpoint: `https://inference.baseten.co/v1`. Path `/chat/completions` appended. | Upstream provider endpoint. |
| `MODEL_NAME` | String | `muse-spark-1.3` | Baseten slug: e.g. `meta-models/muse-spark-open-1026`. | Target model slug. |
| `MODEL_LIVE_MAX_CALLS` | Integer String | `10` | Clamped to `min(MODEL_LIVE_MAX_CALLS, 10)`. Values `> 10` clamp to `10`. `NaN` / empty -> `10`. | Hard call cap per process and across restarts. |
| `MODEL_TIMEOUT_MS` | Integer String | `2000` | Clamped to `[500, 20000]`. Below 500 -> `500`; above 20000 -> `20000`. `NaN` / negative / empty -> `2000`. | Outbound HTTP fetch timeout. |
| `MODEL_MAX_TOKENS` | Integer String | Unset (path defaults) | Clamped to `[1, 1024]`. Below 1 -> `1`; above 1024 -> `1024`. Unset / empty / `NaN` -> path defaults (150 refine, 250 reason, 300 command). | Completion token budget cap override. |
| `MODEL_LIVE_LEDGER_PATH` | Path String | `.yori-runtime/model-live-ledger.json` | Relative paths resolved to `process.cwd()`. Gitignored via `/.yori-runtime/`. | Persistent cross-process pre-fetch ledger file. |

---

## 3. Two-Fence Safety Architecture

To prevent accidental credit spend or runaways across restarts:

### Fence 1: Provider Enforced Budget (Out-of-Process)
- Owner configures an **enforced workspace budget** in the provider dashboard (e.g. Baseten dashboard budget set to \$5 with hard rejection enabled).
- Requests beyond the budget are rejected with 402/429 at the provider edge.

### Fence 2: Durable Atomic Pre-Fetch Ledger (In-Process)
- Pre-fetch slot reservation occurs **before** any HTTP request is dispatched.
- Reservation uses an atomic lock file (`.lock` via `O_CREAT | O_EXCL`) with automated stale lock recovery.
- If concurrent processes or repeated restarts attempt to make calls, the ledger counts all attempts up to `maxCalls` (cap 10).
- **Fail-Closed Guarantees**:
  - Corrupt or malformed ledger JSON -> fails closed (`fallbackReason: 'disabled'`, 0 network calls).
  - Unwritable ledger directory or lock error -> fails closed (`fallbackReason: 'disabled'`, 0 network calls).
  - Cap reached -> fails closed (`fallbackReason: 'disabled'`, 0 network calls).
  - Network timeout -> aborted via `AbortController`, returns `fallbackReason: 'timeout'`.
  - HTTP 401 or 429 -> immediately returns `fallbackReason: 'error'` with **0 retries**.

### Sentinel & Secret Hygiene
- Ledger stores **only**:
  - `version`: schema version (`1`)
  - `call_count`: total calls reserved
  - `reservations`: array of `{ id, timestamp, endpoint, callIndex }`
- **NEVER** stores API keys, Authorization headers, user prompts, input facts, or response payloads.
- Diagnostics report `providerHost = new URL(baseUrl).hostname` only (e.g. `inference.baseten.co`), omitting URL queries or authorization tokens.

---

## 4. Operational Procedures

### A. Offline Dry-Run (Default / Zero Spend)
Runs full mock pipeline, verifies preconditions (G3-PARITY, PRE-S1-A, PRE-S1-B), runs 10 simulated calls with fact-check validation, exercises call cap exhaustion (probe 11), and verifies D1–D6 byte-identity:

```bash
npm run verify:live:spark -- --dry-run
```

### B. Provider Configuration for Baseten (Owner-Gated)
When authorized for live verification:
1. Place secret in `.env.local`:
   ```bash
   MODEL_API_KEY="your-baseten-api-key"
   ```
2. Run with explicit bounded inline parameters:
   ```bash
   MODEL_LIVE_ENABLED=1 \
   MODEL_LIVE_MAX_CALLS=10 \
   MODEL_BASE_URL="https://inference.baseten.co/v1" \
   MODEL_NAME="meta-models/muse-spark-open-1026" \
   MODEL_TIMEOUT_MS=5000 \
   npm run verify:live:spark -- --confirm-billed
   ```

### C. Resetting Local Runtime Ledger
During normal development, tests and dry runs automatically isolate or clean up the ledger. To manually reset:
```bash
rm -rf .yori-runtime/model-live-ledger.json*
```
