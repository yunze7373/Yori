# Evidence: LLM-REPLY-GROUNDED (`[TID:INBOX-20261104-FA2315]`)

## 1. Overview
This slice fulfills the Owner Steering directive (Han, Telegram 2026-11-04 23:25 JST & 23:28 JST addendum):
> *"能不能真实接入llm而不是这种傻不拉几的写好的死内容。"*
> *"你能不能不要管钱的问题。"*

Ask Yori replies in the conversation transcript are dynamically written by the real live model via the server proxy (`/api/model/command`, `decision_command`), strictly grounded against supplied facts (`INV-103`), with hard server-side runaway budget caps and safe deterministic fallback.

## 2. Invariants Enforced
1. **Live Model Reply Generation**:
   Assistant message bubbles in the conversation transcript display model-written replies (`reply` field in `DecisionCommandOutput`), short (<= 2 sentences, <= 45 words), English-only, in a natural premium tone.
2. **Strict Grounding (Invariant INV-103)**:
   Every reply token is validated against `SuppliedFacts` (places, times, distances, ratings, prices, weather, habits). If the model hallucinates an unlisted place, time, price, rating, or distance, the reply is discarded and the system falls back to the deterministic template.
3. **Owner Philosophy (yori-understand-not-explain)**:
   - Zero Why / explanation UI.
   - Zero confirmation prompts.
   - Zero inference or mention of sensitive traits (diet, religion, health).
   - User input treated as untrusted (prompt injection neutralised, URLs and markup rejected, HTML output safely escaped).
4. **Spend Safety & Budget Protection**:
   - Every live call is reserved in `.yori-runtime/model-live-ledger.json` before outbound HTTP dispatch.
   - Server-side runaway cap per process (`MODEL_REPLY_PER_PROCESS_CAP`, default 20) is enforced server-side and env-configurable.
   - Keys remain strictly server-side; zero secrets printed.
5. **Port Isolation**:
   - Isolated preview runs on port 4285 (port 4173 is never touched or used).

## 3. Live Model Smoke Verification (`scripts/live-smoke-reply.ts`)
Executed against real Muse Spark API endpoints with live key:
- **Scenario 1: Lunch ("somewhere quieter")**
  - Model reply: `"Certainly, I'll look for a quieter lunch spot for you."`
  - Engine status: `meta_model_live`
  - Grounding validation: `VALID (INV-103 satisfied)`
  - Duration: 15,820 ms
- **Scenario 2: Depart ("leave 15 minutes later")**
  - Model reply: `"Absolutely, I'll shift your departure 15 minutes later."`
  - Engine status: `meta_model_live`
  - Grounding validation: `VALID (INV-103 satisfied)`
  - Duration: 12,305 ms
- **Scenario 3: Free question ("is it far?")**
  - Model reply: `"Not far at all — just 350m from you."`
  - Engine status: `meta_model_live`
  - Grounding validation: `VALID (INV-103 satisfied)`
  - Duration: 18,167 ms

### Ledger Delta
- Calls made: 3 calls
- Recorded in persistent ledger `.yori-runtime/model-live-ledger.json`
- Zero unverified or unreserved requests

## 4. Playwright Dual-Gate E2E Verification
Executed on port 4285 with mock proxy:
- Mobile (`390x844`): PASSED
- Desktop (`1280x800`): PASSED

### Settled Evidence Screenshots
- `lunch-reply-390x844.png`: Mobile Ask sheet showing model-generated lunch reply.
- `lunch-reply-1280x800.png`: Desktop Ask sheet showing model-generated lunch reply.
- `free-question-390x844.png`: Mobile Ask sheet showing model-generated free question answer.
- `free-question-1280x800.png`: Desktop Ask sheet showing model-generated free question answer.

## 5. Test Suite Verification
- `npm run typecheck`: 0 errors.
- `src/adapters/model/llm-reply.test.ts`: 25/25 passed.
- `npm test`: 77 test files passed (1,407 tests).
- `npx vitest run tests/golden tests/integration`: All golden and integration suites passed.
