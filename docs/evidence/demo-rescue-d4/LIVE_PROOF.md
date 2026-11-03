# D4 live proof log (Meta Muse Spark, `muse-spark-1.3` via `api.meta.ai`)

Run: 2026-11-03 10:09 JST. Shipping build on Mac port 4173 (loopback, allowlisted), MODEL_LIVE at its
D4 default (ON), owner key loaded server-side from `.env.local` (never read, printed or committed).
Headless Chromium at the public Shinjuku fixture point (not the owner's location). Raw screenshots in
gitignored `.yori-runtime/d4-live-proof/`; nothing with venue names is committed.

| | Value |
|---|---|
| Ledger before (`.yori-runtime/model-live-ledger.json` `call_count`) | **22** |
| Ledger after | **32** (10 billed calls = the per-run cap; the authorization was "at most 10") |
| Calls by endpoint | 9 × `reason_rank` (S5 plan reasoning), 1 × `candidates` |
| `candidates` result | `fallbackReason: truncated`; usage log `promptTokens 332, completionTokens 300`, latency 4,465 ms |
| Accepted live outputs | **0**: the UI showed the labelled `Reasoned locally` answer every time (honest) |
| Key material in page / bundle | none (`sk-` hits are the `ask-bar` class name) |

## Root causes (both fixed or escalated in this slice)
1. **Repeated plan reasoning**: the Live coordination key embedded `plan.id`, which embeds the snapshot
   time in milliseconds, so every render looked like a new plan set and re-ran `/api/model/reason`
   (harmless while MODEL_LIVE defaulted off; D4 turned it on). **Fixed**: the key is now intent plus the
   real option ids, single-flight; e2e asserts exactly one plan-reasoning call per plan set across many
   renders (it was 9 in this run).
2. **`max_tokens` 300 truncates Muse Spark**: the one candidates call used all 300 completion tokens
   and returned no visible JSON (`finish_reason=length`; the model spends tokens on reasoning first,
   as S1-LIVE-3 already showed). The plan pins 300, so this is **escalated**, not changed: proposal is
   `MODEL_MAX_TOKENS` 1024 for app calls (still ≈ cents for the whole demo), then a new ≤5-call live
   proof.

The caps and the hard stop worked as designed: the 11th call never left the server.
