# D4 live proof log (Meta Muse Spark, `muse-spark-1.3` via `api.meta.ai`)

> **About the committed PNGs in this folder.** `d4-live-rank-390x844.png`, `d4-live-rank-1280x800.png`,
> `d4-ask-why-390x844.png` and `d4-fallback-390x844.png` are **recorded-response renders** from
> `tests/e2e-live/live-model-reasoning.spec.ts`, which answers `/api/model/*` with recorded responses
> in the proxy's exact shape. They are **not live proof**: no live Muse Spark answer has been
> accepted yet (see below).

## Run 1 (2026-11-03 10:09 JST, authorization "at most 10")

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

## Spend accounting (owner limits: ≤ 200 calls and ≤ USD 20 cumulative, including the first 22)
- Every reservation now pre-charges a worst-case USD estimate (3k prompt + 8,192 completion tokens at
  the documented muse-spark estimate of USD 2.00 per 1M tokens, applied to input and output). The
  real `usage` replaces it when the response arrives. Entries carry `tokens_in`, `tokens_out` and `usd`;
  the ledger carries cumulative `tokens_in`, `tokens_out` and `usd_estimate`. A reservation that could
  reach USD 20 is refused before any fetch (`usd_guard`, labelled `Reasoned locally`).
- The 32 calls made before token recording are backfilled at the worst case: **32/200 calls, ≤ USD 0.72
  estimated cumulative spend** (the true figure is far lower; the one recorded call used 632 tokens).

## Run 2 (2026-11-03 10:36 JST, Reviewer decision 9505c59f: "at most 5 billed calls, cumulative at most 37")

Preconditions, both committed first in `ad8c819`:
- **Finding 1:** a loopback socket-peer guard on all `/api/model/*` routes. A LAN peer with a forged
  `Host: localhost:4173` gets 403 on a real socket, and the ledger was unchanged.
- **Finding 3:** a completion budget of **1024** as the code default for the candidates and
  plan-reasoning paths, which env can only lower.

This is a **plan-parameter deviation**: the plan pinned 300. The Reviewer authorized 1024 in decision
9505c59f.

Setup:
- Separate shipping build in gitignored `.yori-runtime/d4-live2`, on Mac port 4173.
- `MODEL_LIVE` at its default (on). `MODEL_OPERATING_CAP=37`, so the server hard-stops at 37 cumulative
  calls whatever the browser does.
- Headless Chromium at the public Shinjuku fixture point.
- `reasoning_effort` **not set**: the S1 evidence marks it UNVERIFIED for muse-spark-1.3
  (`docs/evidence/s1-live/S1_TRUNCATION_DIAGNOSIS.md`), so the Reviewer's condition for using it is
  not met.

Stop rule: stop if the `rank` answer is not accepted. Ask only "why" and never "closer". One
Ask costs 2 calls (the live command interpreter, then candidates).

| | Value |
|---|---|
| Ledger before | **32** |
| Ledger after | **34** (2 billed calls; the run stopped by rule after the first 2) |
| Call 33 `reason_rank` (plan reasoning) | `tokens_in 427, tokens_out 1024`: the whole budget. The client discarded it at its 2,000 ms timeout. |
| Call 34 `candidates` `rank` | `fallbackReason: truncated` (`finish_reason=length`); `promptTokens 332, completionTokens 1024`, latency 11,155 ms |
| Accepted live outputs | **0**: the UI showed the labelled `Reasoned locally` answer (honest) |
| Ask calls | none (stopped before the Ask, as the decision requires: "if the first 2 calls still truncate or fail, stop and report") |
| Raw evidence | `.yori-runtime/d4-live-proof/live2-rank-RAW.png` (gitignored; not committed) |

### What the evidence says (for the Reviewer's decision; nothing here is changed or spent)
1. **1024 is still below Muse Spark's reasoning-plus-answer need.** Both calls used exactly 1024
   completion tokens, which matches S1. The repo's own S1-LIVE-2 measurement
   (`docs/evidence/s1-live-2/S1_LIVE_2_REPORT.md`) found:
   - at 2048, a command call used 2,046 tokens and truncated;
   - at **4096**, 100% of calls finished with `finish_reason: stop`, and refine and reason were
     accepted.

   **Proposal (needs authorization):** a 4096 code default for the D4 live paths, still lowering-only.
   The worst case per call is about (3k + 4,096) tokens at USD 2.00 per 1M, ≈ **USD 0.014**. That
   leaves 3 calls inside the existing ≤37 authorization: rank, then one Ask (command + candidates).
2. **The plan-reasoning call is billed but can never be used live.** `coordinateReasoning` aborts on
   the client at 2,000 ms, while live latency is about 11 s (the candidates path allows 20 s). Every
   live plan-reasoning call is therefore paid for and then discarded.

   **Options (Reviewer's call; out of this rework's bounded scope):**
   - (a) skip `/api/model/reason` for a Live lunch plan that the candidate reasoner already covers;
   - (b) raise its live timeout to match the candidates path.

   Either way, a later proof would cost 1 call less, or 1 call more usefully.

## Run 3 (2026-11-03 11:06 JST, Reviewer decision ae9b0e30: "at most 3 billed calls, cumulative at most 37")

Preconditions, all committed first in `05840b8`:
- **Completion budget:** 4096 tokens as the code default for the candidates and plan-reasoning paths,
  lowering-only. This is a plan-parameter deviation from the pinned 300; the Reviewer authorized it.
- **Wait times:** `/api/model/candidates` waits up to 30 s on the server. The app waits 31 s and
  declares that wait in `x-yori-client-wait-ms`. The server refuses to bill a call whose declared wait
  is shorter than its own timeout.
- **No plan reasoning for Live lunch:** a Live lunch plan set sends no `/api/model/reason` call.

Setup:
- Separate shipping build in gitignored `.yori-runtime/d4-live3`, on Mac port 4173.
- `MODEL_LIVE` at its default (on), `MODEL_OPERATING_CAP=37`, `MODEL_TIMEOUT_MS` unset (so the
  candidates timeout is 30 s).
- Headless Chromium at the public Shinjuku fixture point. `reasoning_effort` not set.

| | Value |
|---|---|
| Ledger before | **34** |
| Ledger after | **36** (2 billed calls; 1 of the 3 authorized calls is unused) |
| Plan-reasoning calls (`/api/model/reason`) | **0** (Live lunch set; as required) |
| Call 35 `candidates` `rank` | **ACCEPTED live**: `engineStatus meta_model_live`; tokens 336 in / 1,984 out (`finish_reason` stop; the post-check passed); latency 23,054 ms, inside the 30 s wait. The card showed `Meta Muse Spark · live` with the model's one-sentence reason citing only in-data facts (open now, straight-line metres, rating). The visible text is clamped to 2 lines at 390; the full text is in the title. |
| Ask "why this restaurant?" | `/api/model/command` returned **400** (not billed; see below). The app fell back to the deterministic grammar, which routed `WHY` to the candidate reasoner: **call 36 `candidates` `why`**. |
| Call 36 result | **Not captured (executor error).** The probe judged "done" too early: it waited for the wrong "thinking" text. The server was then stopped 3 s later, while call 36 was still in flight upstream. Call 36 is therefore counted as billed, at the worst-case pre-charge (USD 0.0224), because no usage came back. |
| Raw evidence | `.yori-runtime/d4-live-proof/live3-rank-RAW.png`, `live3-why-RAW.png` (gitignored). The committed text names no venue. |
| Key material | none in page or bundle (the `sk-` hits are the `ask-bar` class names; no `Bearer`) |

The `/api/model/command` 400 was reproduced afterwards with live off and zero billed calls. The live
command interpreter sends more than 20 `availableSignalIds` (duplicates plus `mock-place-*` ids), so
the proxy rejects the payload before any upstream call (`Invalid facts: property
'availableSignalIds' exceeds maximum of 20 items`). This predates D4 and is unbilled; it is filed in
BACKLOG.

**Status of the D4 live acceptance:**
- **Live `rank`: met** (1 accepted live answer over real candidates).
- **Live Ask answer: not met**, because call 36's result was lost to the executor's own teardown error.
- One authorized call remains within cumulative ≤37. Re-running the Ask needs the Reviewer's decision:
  it would be a second Ask attempt. The probe fix is to wait for the `candidates` `why` response
  itself and keep the server up until it lands.

## Final spend (cumulative, all D4 and earlier calls)
- **Calls: 36 / 200** (owner limit), operating cap 100.
- **Estimated USD: ≤ 0.75 cumulative** (`usd_estimate` 0.7489 in the ledger). This is conservative:
  - the 32 calls made before token recording are charged at the per-call worst case (3,000 prompt +
    8,192 completion tokens);
  - call 36 is also charged at the worst case, because its response never came back;
  - calls 33, 34 and 35 are charged at real usage: ≈ USD 0.0029, 0.0027 and 0.0046 (35 = 2,320 tokens).
- **Rate source:** USD 2.00 per 1M tokens, applied to input and output. It is the muse-spark estimate
  documented in `src/adapters/model/server-proxy.ts` (`MAX_TOKENS_CEILING` note) and in the S1
  reports. **UNVERIFIED** (not checked against a published Meta price list). If the true rate were
  higher, the estimate would scale linearly. The operating cap keeps total spend far below USD 20
  unless the rate exceeds about USD 18 per 1M tokens.
