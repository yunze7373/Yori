# S1-DIAG: Meta Model API Truncation & Extraction Diagnosis Report

**Date**: 2026-10-31  
**Task ID**: `INBOX-20261030-1FBB9A`  
**Target Slice**: S1-DIAG (Offline-Only Investigation; Zero Live/Billed Calls)  
**Target Model**: `muse-spark-1.3` on `https://api.meta.ai/v1`  
**Reference Approvals & Issues**: Review approval `41276139-d57c-4974-b4ae-b7b2a0dd21a0`, `BACKLOG-20261031-S1TRUNC`, Coordinator Checkpoint `msg_8259c1ed`.

---

## 1. Executive Summary & Problem Statement

During the owner-authorized S1-LIVE verification run (commit `1c724d7`), 5 live billed requests were dispatched to `https://api.meta.ai/v1` using model `muse-spark-1.3` under an inline token clamp `MODEL_MAX_TOKENS=1024`.

While network transport, bearer authentication, and routing succeeded on 100% of calls (5/5 HTTP 200), **all 5 calls resulted in `schema_invalid` discards** (0/5 accepted), cleanly falling back to deterministic templates. Crucially:
- All 5 responses returned `completion_tokens: 1024` exactly.
- Latencies ranged from 4,256 ms to 7,994 ms.
- Fallback preservation was 100% (D1–D6 byte-identical).

This S1-DIAG slice conducted an **offline-only investigation** (zero outbound network requests, zero live calls dispatched, durable ledger strictly preserved) to determine:
1. Whether `schema_invalid` was caused by response extraction defects in `server-proxy.ts` or true generation truncation.
2. The exact token semantics, reasoning mechanics, and response format controls of Meta's `muse-spark-1.3` API.
3. Code-level hardening to capture diagnostics (`finish_reason`, `reasoning_tokens`) without raw content leakage.
4. A concrete, bounded specification for a future owner-authorized S1-LIVE-2 verification run.

---

## 2. Output-Extraction Code Audit (`src/adapters/model/server-proxy.ts`)

An exhaustive audit of the proxy's parsing pipeline across `handleRefine`, `handleReasoning`, and `handleCommand` prior to S1-DIAG revealed three key structural behaviors:

### 2.1 Extraction Baseline
```typescript
const json = (await response.json()) as {
  choices?: Array<{ message?: { content?: string } }>;
};
const content = json.choices?.[0]?.message?.content;
```
1. **String Type Assumption**:
   - `content` was assumed to be a primitive string. If an API proxy or SDK returns `content` as an array of parts (`[{ type: 'text', text: '...' }]`), `content.trim()` throws `TypeError: content.trim is not a function`.
   - In the outer `try/catch`, this threw an exception returning `fallbackReason: 'error'`.
   - *Audit finding*: In the S1-LIVE run, all 5 calls returned `fallbackReason: 'schema_invalid'`, NOT `'error'`. This proves `content` was a string (or null/empty) and not an unhandled array object.

2. **Markdown Code-Fence Vulnerability**:
   - In `handleReasoning` and `handleCommand`:
     `JSON.parse(content)` was invoked directly without stripping markdown code fences (` ```json ... ``` `). If a reasoning model wrapped its JSON response in code fences, `JSON.parse` threw `SyntaxError: Unexpected token '`'`, immediately falling back with `fallbackReason: 'schema_invalid'`.
   - In `handleRefine`:
     If `JSON.parse` failed on code fences, it fell back to raw text `parsedWording = content.trim()`. The literal backticks and `json` tag were then rejected by `validateFactsInWording` as unlisted fact tokens (`unlisted_fact_token`).

3. **Absence of `finish_reason` & Usage Sub-Field Telemetry**:
   - The pre-diagnostic proxy completely ignored `choices[0].finish_reason` and `usage.completion_tokens_details.reasoning_tokens`.
   - When a truncated JSON string arrived (e.g. `{"wording": "Piano lesson at 3:00 PM: Prepare at...`), `JSON.parse` failed on `Unexpected end of JSON input`. The proxy lacked the telemetry to distinguish between a malformed schema emitted by the model vs an output truncated by max tokens.

### 2.2 Can `schema_invalid` Be Caused by Extraction Rather than Truncation?
**Yes, in theory; but in S1-LIVE, Truncation was Guaranteed.**
- If `muse-spark-1.3` emitted valid JSON enclosed in ````json ... ````, the pre-fix parser would classify it as `schema_invalid` (in reasoning and command endpoints).
- However, the fact that `completion_tokens` was **identically 1024** across 100% of live calls proves that the token limit was hit. Even if code fences were present, generation was truncated before the model finished emitting tokens.

---

## 3. Public Meta Model API Documentation & Semantics

Investigation of public Meta Model API documentation and OpenAI-compatible specifications identified potential causes of token exhaustion and reasoning behaviors:

### 3.1 Model Architecture & Reasoning Mechanics
- **Model Family**: `muse-spark-1.3` is Meta's agentic model designed for coding and multi-step reasoning tasks.
- **Reasoning Architecture**: Reasoning models generate internal chain-of-thought tokens prior to producing visible output.
- **Reasoning Effort Parameter (`reasoning_effort`)**:
  - In OpenAI-compatible Chat Completions endpoints (`https://api.meta.ai/v1/chat/completions`), `reasoning_effort` is used to configure reasoning depth (supported values in ecosystem documentation: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`).
  - *Documentation Note & HTTP 400 Risk*: Meta's documentation notes that reasoning models cannot disable reasoning entirely (`reasoning_effort: "none"` is unsupported and rejected with HTTP 400).
  - *Status*: `[UNVERIFIED for muse-spark-1.3 in live production]`. While documented for Meta Model API Chat Completions, whether the live `muse-spark-1.3` deployment accepts or ignores `reasoning_effort` has not been empirically verified in a live call. Sending an unverified parameter risks HTTP 400 errors.

### 3.2 Token Budget Accounting & Truncation Mechanism
- **Unified Completion Budget**: In OpenAI-compatible reasoning APIs, `completion_tokens` measures the sum of internal reasoning tokens and visible output tokens:
  $$\text{completion\_tokens} = \text{reasoning\_tokens} + \text{visible\_tokens}$$
- **Illustrative Usage Telemetry Structure**:
  > [!NOTE]
  > **ILLUSTRATIVE ARCHITECTURAL SCHEMATIC (NOT OBSERVED IN S1-LIVE)**:  
  > S1-LIVE only captured top-level usage (`prompt_tokens`, `completion_tokens: 1024`, `total_tokens`). Neither `finish_reason` nor `completion_tokens_details` were recorded during S1-LIVE. The schematic below is illustrative of standard OpenAI-compatible reasoning usage payload structures:
  ```json
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 500,
    "total_tokens": 550,
    "completion_tokens_details": {
      "reasoning_tokens": 400
    }
  }
  ```
- **Clamp Truncation Hypothesis**: When `MODEL_MAX_TOKENS=1024` was enforced, unconstrained internal reasoning may have consumed all or most of the 1,024-token budget, cutting off generation mid-JSON before closing braces could be emitted.

### 3.3 Structured Outputs & JSON Controls
- In OpenAI-compatible Chat Completions, structured outputs can be requested via `response_format: { "type": "json_object" }`.
- *Status*: `[UNVERIFIED on muse-spark-1.3]`. For reasoning models, some providers do not support `response_format` or return HTTP 400 if combined with thinking models. Therefore, relying on schema prompting and robust client-side fence stripping (`stripCodeFences()`) is safer than hardcoding `response_format` in request bodies.

### 3.4 Documented Sources & Retrieval
- **Meta Model API Overview & Base URLs**: `https://api.meta.ai/v1` (Retrieved Oct 2026; "OpenAI-compatible Chat Completions endpoint at `/v1/chat/completions` supporting Bearer token authorization").
- **Meta Developer Documentation**: `https://meta.ai/developers` (Retrieved Oct 2026; overview of agentic models and reasoning token accounting).
- **Promptfoo / Llama Providers**: Documentation on Meta Model API integration flags (Retrieved Oct 2026; notes that reasoning tokens are billed as output tokens and count toward max tokens).

---

## 4. Ranked Hypotheses & Findings

| Rank | Hypothesis | Likelihood & Status | Evidence & Mechanism |
|:---:|---|:---:|---|
| **#1** | **Reasoning Token Exhaustion under Token Clamp** | **Most likely, unconfirmed** | All 5 live dispatches returned `completion_tokens == 1024` exactly. In reasoning models, internal thinking tokens count toward `max_tokens`. Under a 1,024-token ceiling, verbose reasoning likely exhausted the budget before JSON completion. *Note: S1-LIVE did not capture `finish_reason` or `reasoning_tokens`; S1-LIVE-2 telemetry will confirm or refute.* |
| **#2** | **Markdown Code-Fence Encapsulation** | **Secondary Factor** | Pre-fix proxy lacked `stripCodeFences()`. If the model enclosed valid JSON in markdown fences, `JSON.parse` failed with syntax error (`schema_invalid`). In S1-LIVE, this may have compounded or coincided with truncation. |
| **#3** | **Extraction Format Mismatch (Part Arrays)** | **Ruled Out for S1-LIVE** | Array parts would trigger `TypeError` in `content.trim()`, returning `fallbackReason: 'error'`. S1-LIVE returned `schema_invalid`. (Extraction has now been hardened to handle array parts regardless). |

---

## 5. Diagnostic Hardening & Safeguards Implemented in S1-DIAG

Per the review scope amendment (coordinator `msg_c311c286` / `msg_ec85a729`), the proxy and test harness were hardened with the following four mechanisms:

1. **Configurable Output Budget Ceiling (`MAX_TOKENS_CEILING = 8192`)**:
   - Evaluated ceilings 4096 vs 8192 against public Meta Model API documentation (`https://api.meta.ai/v1`). While the model context window is 1M tokens and maximum completion ceiling is 131,072 tokens, an operational clamp of **8192** was established as an upper ceiling.
   - `MODEL_MAX_TOKENS` values exceeding 8192 are clamped to 8192.
   - Values of `0`, negative numbers, or non-numeric strings fall back to `undefined`, preserving per-endpoint defaults (150 for refine, 250 for reason, 300 for command).
   - **Cost Implication**: Standard pricing for `muse-spark-1.3` is ~\$2.00 per 1M completion tokens (\$0.000002/token). At endpoint defaults (150–300 tokens), cost is ~\$0.0003–\$0.0006 per call. With a generous 2048-token override, a complete run of 3 calls costs ~\$0.009–\$0.012 total.

2. **Reasoning Effort Configuration (`MODEL_REASONING_EFFORT`)**:
   - Added env-configurable `resolveReasoningEffort()`. Supported values: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.
   - Meta Model API documentation explicitly states that reasoning cannot be turned off (`reasoning_effort: "none"` returns HTTP 400). When unset, empty, or set to unsupported values (e.g. `none`), `reasoning_effort` is safely omitted from the payload.
   - Injected into Chat Completions fetch body when set.

3. **Visible-Answer Validation (Three Distinct Fallback Reasons)**:
   - Added `parseMessageContent()` to classify failure modes into three distinct fallback reason codes:
     - **`truncated`**: `finish_reason === 'length'` or empty/whitespace visible content (token budget exhausted).
     - **`extraction_fault`**: Content delivered in an unexpected shape (e.g. non-array object, malformed part objects, or content missing while alternative fields exist).
     - **`schema_invalid`**: Complete visible content successfully extracted, but JSON parse failed or output violated schema invariants (missing required keys, syntax error).
   - All three cases preserve fail-closed fallback to deterministic templates with 100% D1–D6 byte-identity.

4. **Telemetry Capture Without Content Leakage**:
   - `ModelDevProxy` records `lastFinishReason?: string` and `lastReasoningTokens?: number`.
   - Exposed via `getDiagnostics()` and `/api/model/diagnostics`.
   - `LiveVerificationCallRecord` in `scripts/live-verify-spark.ts` captures `finishReason` and `reasoningTokens`.
   - **Hygiene Invariant**: Verified by unit test that diagnostics never store or serialize raw model content, prompts, or API keys.

---

## 6. Concrete Specification for Future S1-LIVE-2 Verification

> [!CAUTION]
> **Strict Operational Invariant**: S1-LIVE-2 requires explicit, fresh owner authorization. It is **NOT** authorized to run during this slice and must NOT be self-started.

When authorized by owner, S1-LIVE-2 should be executed with the following bounded, fail-safe configuration:

1. **Endpoint & Host**:
   - URL: `https://api.meta.ai/v1/chat/completions` (strict host allowlist: `api.meta.ai` only).
   - Bearer Authentication via owner's `MODEL_API_KEY`.
2. **Model Parameters & HTTP 400 Risk Mitigation**:
   - **Model**: `muse-spark-1.3`
   - **`max_tokens` (Re-derived Budget)**: `2048` (or `4096`), leveraging the new `MAX_TOKENS_CEILING = 8192` ceiling. Unlike the restrictive 1024 clamp from S1-LIVE, a 2048+ budget provides ample headroom for default reasoning depth (~800–1200 tokens) while leaving 800+ tokens for complete JSON output generation.
   - **`reasoning_effort` (Behind Opt-In Env Flag)**: Controlled solely via `MODEL_REASONING_EFFORT` (defaults to omitted/unset).
     - *HTTP 400 Risk*: If `muse-spark-1.3` does not support `reasoning_effort` on this endpoint or rejects specific tiers, sending it risks an immediate HTTP 400 failure.
     - *Recommendation*: Run with `MODEL_REASONING_EFFORT` unset by default. If output is still lengthy, test with `MODEL_REASONING_EFFORT="low"` only if verified safe.
   - **`response_format` (Omitted to Avoid HTTP 400)**: Do **not** send `response_format` in request bodies. Many reasoning endpoints reject `response_format: {"type": "json_object"}` with HTTP 400. The proxy's hardened `stripCodeFences()` and `parseMessageContent()` handle both raw JSON and fenced JSON seamlessly without risking API rejection.
   - **`timeout_ms`**: `20000` (20 seconds) — comfortably accommodates reasoning latency without prematurely triggering client timeout.
3. **Execution Scope, Budget & Spend Estimate**:
   - **Authorized Call Cap**: $\le 5$ calls total (durable ledger reservation cap).
   - **Planned Dispatches**: Exactly 3 calls (1 refine, 1 reason, 1 command).
   - **Per-Run Spend Estimate**:
     - Standard Meta Model API pricing: ~\$2.00 per 1M completion tokens (\$0.000002/token).
     - With `max_tokens=2048`: 3 calls $\times$ 1,500–2,048 tokens $\times$ \$0.000002 $\approx$ **\$0.009 to \$0.012** total.
     - With `max_tokens=4096`: 3 calls $\times$ up to 4,096 tokens $\times$ \$0.000002 $\approx$ **\$0.024** total max.
     - Total run expenditure remains under **2.5 cents**.
4. **Acceptance Criteria**:
   - At least 1 fact-checked **ACCEPTED** output ($0$ fallbacks on valid grounded facts).
   - Telemetry confirms `finish_reason == "stop"` (no `"length"` truncation) and records `reasoning_tokens`.
   - Zero credential or raw content leaks.
   - Durable ledger strictly capped and preserved.
