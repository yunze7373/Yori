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
   - Every reply token is validated against `SuppliedFacts` (places, times, distances, ratings, prices, weather, durations, habits).
   - Distance validation normalizes km/mi/ft to meters with tight tolerance. Minutes are never converted to distance `m`.
   - Ratings require exact equality (`Math.abs(replyRating - suppliedRating) < 0.01`).
   - Weather condition words (`sunny`, `rain`, `umbrella`, etc.) require corresponding weather in supplied facts.
   - Numeric allowlist: every digit-bearing token in a reply must correspond to a supplied fact or applied parameter (times, distances, ratings, deltas, durations, weather temperatures).
   - Proper nouns: capitalised phrases are extracted and verified against supplied places, routes, weather, and habits. Unlisted venues (e.g. "Ichiran") are strictly rejected.
   - Action alignment: claimed deltas (e.g. 15m) must equal applied parameters. Action-claim verbs (`booked`, `reserved`, `ordered`, `called`, `sent`, `scheduled`, `changed`, `moved`, `switched`, `updated`) are forbidden on non-action intents (`UNSUPPORTED`, `WHY`).
   - Sensitive traits: assertions of user traits (`you are / you're / since you're vegan|vegetarian|gluten-free|...`) are strictly rejected.
   - If validation fails for any reason, the system safely falls back to the deterministic template.
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

## 3. Live Model Verification & Ledger Audit

### Live Smoke Execution (`scripts/live-smoke-reply.ts`)
Executed against real Muse Spark API endpoints with live key:
- **Scenario 1: Lunch ("somewhere quieter")**
  - Model reply: `"Certainly, I'll look for a quieter lunch spot for you."`
  - Engine status: `meta_model_live`
  - Grounding validation: `VALID (INV-103 satisfied)`
- **Scenario 2: Depart ("leave 15 minutes later")**
  - Model reply: `"Absolutely, I'll shift your departure 15 minutes later."`
  - Engine status: `meta_model_live`
  - Grounding validation: `VALID (INV-103 satisfied)`
- **Scenario 3: Free question ("is it far?")**
  - Model reply: `"Not far at all — just 350m from you."`
  - Engine status: `meta_model_live`
  - Grounding validation: `VALID (INV-103 satisfied)`

### Comprehensive Ledger Audit (`.yori-runtime/model-live-ledger.json`)
- **Initial Baseline**: `call_count: 40` (recorded at 14:26 JST 11/04 prior to task start).
- **Final Call Count**: `call_count: 65` (callIndex 41 to 65 = 25 reservations total).
- **Ledger Delta**:
  - Total reservations: **+25 calls**
  - Tokens in delta: **+8,271 tokens**
  - Tokens out delta: **+23,610 tokens**
  - USD delta: **+$0.063762** (cumulative `usd_estimate` moved from $0.830924 to $0.894686)
- **Breakdown of 25 Reservations (callIndex 41–65)**:
  - Calls 41–42: 2 candidate live ranking exploratory calls (695 tokens in, 3,066 tokens out, $0.007522).
  - Calls 43–50: 8 mock / unit test reservations in proxy boundary suites (~50 tokens in, ~20 tokens out, $0.001120 total).
  - Calls 51–53: Initial live smoke runs with 300 token clamp (1,656 tokens in, 900 tokens out, $0.005112).
  - Calls 54 & 56: 2 precharge reservations that encountered network timeouts ($0.022384 precharge recorded; zero tokens consumed).
  - Calls 55, 57–65: Live smoke verification and prompt grounding runs with `MODEL_MAX_TOKENS=4096` (~5,920 tokens in, ~19,644 tokens out, ~$0.050008).
- **Runaway Protection**: Verified server-side per-process cap (`MODEL_REPLY_PER_PROCESS_CAP=20`) terminates calls once limit is exceeded, preventing runaway billing.

## 4. Playwright Dual-Gate E2E Verification
Executed on isolated port 4285 with mock model proxy:
- Mobile (`390x844`): PASSED (4/4 tests across lunch and depart flows).
- Desktop (`1280x800`): PASSED (4/4 tests across lunch and depart flows).

> [!NOTE]
> All Playwright E2E screenshots are generated using a mocked `/api/model/*` proxy simulating the `meta_model_live` engine status and header chip. They represent visual UI layout and interaction verification. Live model proof is documented in Section 3 above via the live smoke and ledger audit.

### Settled Evidence Screenshots
- `lunch-reply-390x844.png`: Mobile Ask sheet showing model-generated lunch reply (mocked proxy).
- `lunch-reply-1280x800.png`: Desktop Ask sheet showing model-generated lunch reply (mocked proxy).
- `depart-reply-390x844.png`: Mobile Ask sheet showing model-generated depart reply for "leave 15 minutes later" (mocked proxy).
- `depart-reply-1280x800.png`: Desktop Ask sheet showing model-generated depart reply for "leave 15 minutes later" (mocked proxy).
- `free-question-390x844.png`: Mobile Ask sheet showing model-generated free question answer (mocked proxy).
- `free-question-1280x800.png`: Desktop Ask sheet showing model-generated free question answer (mocked proxy).

## 5. Test Suite Verification
- `npm run typecheck`: 0 errors.
- `src/adapters/model/llm-reply.test.ts`: 37/37 passed (including all adversarial probes for distance, rating, numeric allowlist, unlisted proper nouns, action deltas, sensitive traits, top-pick alignment, number word normalisation, applied leave times, and km<->m conversions).
- `src/adapters/model/model.test.ts`: 132/132 passed.
- `src/adapters/model/server-proxy.test.ts`: 71/71 passed.
- `npm test`: 77 test files passed (1,419 tests).
- `npx vitest run tests/golden tests/integration`: All golden and integration suites passed (8 files, 74 tests).
- `npx playwright test -c playwright.llm-reply.config.ts`: 4/4 passed.

## 6. Hardening Iteration 2 (`[TID:INBOX-20261104-D46F15]`)
Follow-up improvements addressing reviewer findings:
1. **Top-Pick Alignment**:
   - `extractTopPickClaim(wording, places)` identifies if a place is claimed as top/best/first pick.
   - When `appliedAction.topPickName` is defined, any reply claiming another place as the top/best pick (e.g. `Sora Ramen is your top pick` or `Sora Ramen is the best choice` when top pick is `Kissa Hoshi` / `Near Cafe`) is strictly rejected with `action_mismatch`.
2. **Number Word Normalisation**:
   - `normaliseNumberWords(text)` normalises colloquial time idioms (`half an hour` -> `30 minutes`, `quarter of an hour` -> `15 minutes`, `three quarters of an hour` -> `45 minutes`, `an hour` -> `60 minutes`, `a minute` -> `1 minute`), compound numbers (`twenty-one`..`fifty-nine`), single number words (`zero`..`sixty`), and numerical `"one"`.
   - Normalisation occurs prior to delta checks and numeric allowlist validation, correctly catching `'leave half an hour later'` vs delta 15 as `action_mismatch` and `'a twelve minute walk'` as `unlisted_fact_token: 12`.
3. **Applied Leave Time & km<->m Distance Unit Conversion**:
   - Time tokens from `appliedAction.leaveTime` (e.g. `2:40 PM` or `Depart for Piano lesson: prepare 2:20 PM, leave 2:40 PM`) are admitted into `suppliedMinutes` and `buildNumericAllowlist` for `LEAVE_LATER` actions.
   - Distances convert bidirectionally between meters and kilometers without an artificial `>= 1000m` clamp, enabling `0.35 km` to match supplied `350 m` across both distance tolerance matching and the numeric allowlist.
4. **Depart E2E Header Chip Parity**:
   - Identified root cause in `tests/e2e/llm-reply.spec.ts`: LivingContext triggered `coordinateReasoning` for the depart plan, hitting unmocked `/api/model/reason` and resetting `engineStatus` to `offline_deterministic`.
   - Added mock route for `/api/model/reason` with `engineStatus: 'meta_model_live'`.
   - Updated `updateStatusChip` in `src/ui/conversation/conversation-view.ts` to actively update `#conversation-model-status-pill` and subscribed it to `globalDecisionLogger`.
   - Recaptured `depart-reply-390x844.png` and `depart-reply-1280x800.png` displaying `Meta model · live` chip with zero live model calls or spend.
