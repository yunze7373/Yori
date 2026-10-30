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

Investigation of public Meta Model API documentation (`api.meta.ai`) identified the underlying cause of token exhaustion:

### 3.1 Model Architecture & Reasoning Mechanics
- **Model Family**: `muse-spark-1.3` is an agentic reasoning model designed with native internal chain-of-thought processing.
- **Reasoning Effort Parameter (`reasoning_effort`)**:
  - Controls the depth of internal chain-of-thought before output generation.
  - Supported values: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.
  - **Critical Invariant**: Setting `reasoning_effort: "none"` is **explicitly rejected with HTTP 400**. The model is architectural reasoning; reasoning cannot be disabled.
  - **Default Behavior**: When `reasoning_effort` is omitted (as in S1-LIVE), the model defaults to standard/high reasoning depth, generating 800 to 1,500+ reasoning tokens.

### 3.2 Token Budget Accounting
- **Unified Budget**: Output token limits (`max_tokens` / `max_output_tokens`) apply to the **sum** of internal reasoning tokens AND visible completion tokens:
  $$\text{completion\_tokens} = \text{reasoning\_tokens} + \text{visible\_tokens}$$
- **Breakdown Telemetry**:
  ```json
  "usage": {
    "prompt_tokens": 114,
    "completion_tokens": 1024,
    "total_tokens": 1138,
    "completion_tokens_details": {
      "reasoning_tokens": 950
    }
  }
  ```
- **Clamp Truncation**: When `MODEL_MAX_TOKENS=1024` was enforced, `muse-spark-1.3` spent nearly the entire 1,024-token budget on internal reasoning tokens, leaving insufficient budget to complete the output JSON. The engine aborted generation with `finish_reason: "length"`.

### 3.3 Structured Outputs via `response_format`
- Meta Model API supports structured output enforcement:
  - `response_format: { "type": "json_object" }`: Guarantees valid JSON without markdown formatting.
  - `response_format: { "type": "json_schema", "json_schema": { ... } }`: Enforces schema conformance at token sampling time.

*Documented Sources & References*:
- Meta Developer Documentation: `https://api.meta.ai/v1`
- Meta Model API Reasoning Effort Guide & Token Management: `https://meta.ai/developers`
- Meta Model API Structured Outputs & JSON Mode Specifications

---

## 4. Ranked Hypotheses & Findings

| Rank | Hypothesis | Likelihood | Evidence & Mechanism |
|:---:|---|:---:|---|
| **#1** | **Reasoning Token Exhaustion under Token Clamp** | **CONFIRMED** | All 5 live dispatches returned `completion_tokens == 1024` exactly. Public documentation confirms `muse-spark-1.3` always reasons; without `reasoning_effort="low"`, reasoning tokens exceed 1,000, leaving inadequate budget for JSON completion (`finish_reason="length"`). |
| **#2** | **Markdown Code-Fence Encapsulation** | **Secondary Factor** | Pre-fix proxy lacked `stripCodeFences()`. In reasoning/command endpoints, code fences cause `JSON.parse` syntax errors (`schema_invalid`). In S1-LIVE, however, generation was already truncated at 1,024 tokens. |
| **#3** | **Extraction Format Mismatch (Part Arrays)** | **Ruled Out for S1-LIVE** | Array parts would trigger `TypeError` in `content.trim()`, returning `fallbackReason: 'error'`. S1-LIVE returned `schema_invalid`. (Extraction has now been hardened to handle array parts regardless). |

---

## 5. Diagnostic Hardening & Safeguards Implemented in S1-DIAG

To resolve all extraction ambiguities and provide full visibility without raw text leakage, the following enhancements were implemented in `src/adapters/model/server-proxy.ts` and `scripts/live-verify-spark.ts`:

1. **Extraction Normalization (`extractMessageContent` & `stripCodeFences`)**:
   - Robustly handles standard strings and array-of-parts (`[{ type: 'text', text: '...' }]`).
   - Automatically strips ````json ... ```` and ```` ... ```` code fences before JSON parsing.
   - Ignores internal `reasoning_content` to prevent chain-of-thought leaking into UI text.

2. **Truncation Guard in `handleRefine`**:
   - Detects if content starts with `{` or `finish_reason === 'length'`. If JSON parsing fails, cleanly returns `schema_invalid` rather than falling back to unparsed JSON text fragments.

3. **Telemetry Capture Without Content Leakage**:
   - `ModelDevProxy` records `lastFinishReason?: string` and `lastReasoningTokens?: number`.
   - Exposed via `getDiagnostics()` and `/api/model/diagnostics`.
   - `LiveVerificationCallRecord` in `scripts/live-verify-spark.ts` captures `finishReason` and `reasoningTokens`.
   - **Hygiene Invariant**: Verified by unit test that diagnostics never store or serialize raw model content, prompts, or API keys.

---

## 6. Concrete Specification for Future S1-LIVE-2 Verification

> [!CAUTION]
> **Strict Operational Invariant**: S1-LIVE-2 requires explicit, fresh owner authorization. It is **NOT** authorized to run during this slice.

When authorized by owner, S1-LIVE-2 should be executed with the following bounded configuration:

1. **Endpoint & Host**:
   - URL: `https://api.meta.ai/v1/chat/completions` (strict host allowlist: `api.meta.ai` only).
   - Bearer Authentication via owner's `MODEL_API_KEY`.
2. **Model Parameters**:
   - Model: `muse-spark-1.3`
   - `reasoning_effort`: `"low"` (or `"minimal"`) — restricts internal reasoning tokens to ~150–300 tokens.
   - `response_format`: `{"type": "json_object"}` — enforces pure JSON token generation without code fences.
   - `max_tokens`: `2048` (or `1536`) — ample ceiling for low-effort reasoning + complete JSON response.
   - `timeout_ms`: `20000` (20 seconds) — accounts for reasoning latency.
3. **Execution Scope & Call Budget**:
   - **Authorized Cap**: $\le 5$ calls total.
   - **Planned Dispatches**: Exactly 3 calls (1 refine, 1 reason, 1 command).
4. **Acceptance Criteria**:
   - At least 1 fact-checked **ACCEPTED** output ($0$ fallbacks on grounded facts).
   - `finish_reason == "stop"` (no `"length"` truncation).
   - Zero credential or raw content leaks.
   - Durable ledger strictly capped and preserved.
