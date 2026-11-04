# Evidence: In-Conversation Location Permission (`[TID:ASK-INLINE-PERMISSION]`)

## 1. Context & User Steering
- **Task ID**: `[TID:INBOX-20261104-2667E7]`
- **Origin**: Owner steering (Han, Telegram 2026-11-05 01:33 JST):
  > *"这种要权限的能否直接在会话中请求权限，用户点同意或者拒绝。"*
  > *(Can permission requests like this be asked directly within the conversation, where the user can click allow or deny?)*

## 2. Invariant & Architecture Guardrails
- **In-Conversation Permission**: When Ask Yori needs device location in Live mode (for lunch nearby, fuel, quieter spots, etc.) and location status is `'prompt'`:
  - Presents one honest line: `"I need your location to find places near you."`
  - Inline action buttons: primary `"Allow location"` and secondary `"Not now"` (minimum 44x44 px touch target, Quiet Precision tokens, `:focus-visible` styling, reduced-motion compliant).
  - No Why/explanation UI, no extraneous confirmation prompts, no nagging.
- **Unified Geolocation Seam**: `"Allow location"` calls `consentAndRequest()` on the same underlying `defaultLocationPort` (backed by `GeolocationAdapter`) as Home's `#btn-request-location`.
  - On browser grant: action buttons disappear immediately, original utterance resumes automatically (re-runs pending utterance once), and replies normally.
  - On browser denial: action buttons disappear immediately, responds with one honest line: `"No problem — I'll work with what I have."`.
- **"Not now" secondary action**:
  - Removes action buttons immediately.
  - Responds with one polite line: `"No problem — I'll work with what I have."`. No repeat nagging in the same session.
- **Browser-level Block (`denied`)**:
  - If location access is blocked at the browser level, displays honest instruction:
    `"Location access is blocked in your browser settings. Please enable location in your browser to find places near you."`
  - Never renders action buttons that cannot work.
- **Zero Model Flicker**:
  - When location status is `'prompt'` or `'denied'`, `submitMessageAsync` immediately intercepts without calling the model or showing a "Thinking... live model" bubble. Zero paid calls and zero network flicker.
- **Environment Isolation**:
  - E2E tests run on isolated preview port `4285` (port `4173` is never touched).

## 3. Evidence Captures

| Flow | Viewport | Screenshot | Description |
|---|---|---|---|
| Flow A (Prompt) | Mobile (390x844) | `flow-a-prompt-390x844.png` | Inline prompt with primary "Allow location" & secondary "Not now" |
| Flow A (Prompt) | Desktop (1280x800) | `flow-a-prompt-1280x800.png` | Desktop inline prompt in Quiet Precision layout |
| Flow A (Granted) | Mobile (390x844) | `flow-a-granted-390x844.png` | Location acquired, pending ask auto-resumed, lunch options on Home |
| Flow A (Granted) | Desktop (1280x800) | `flow-a-granted-1280x800.png` | Desktop lunch recommendations displayed after permission granted |
| Flow B (Not now) | Mobile (390x844) | `flow-b-not-now-390x844.png` | Buttons stripped, honest acknowledgement: *"No problem — I'll work with what I have."* |
| Flow B (Not now) | Desktop (1280x800) | `flow-b-not-now-1280x800.png` | Desktop view showing honest fallback without nagging |
| Flow C (Denied) | Mobile (390x844) | `flow-c-denied-390x844.png` | Browser-blocked explanation line without unusable buttons |
| Flow C (Denied) | Desktop (1280x800) | `flow-c-denied-1280x800.png` | Desktop view explaining browser settings block |

## 4. Test Verification
- **Unit Tests**: `src/ui/conversation/inline-permission.test.ts` (10/10 passed)
  - Inline permission generation on prompt status
  - Allow location success re-running pending utterance
  - Allow location browser denial honest fallback
  - Not now action stripping and acknowledgement
  - Pre-denied status explanation
  - Zero model flicker / no inflight bubble
  - HTML escaping and older-message button disabling
  - Fuel intent prompt and denied states
- **Full Unit Test Suite**: `npm test` (78 test files, 1429 passed)
- **Playwright E2E**: `npx playwright test -c playwright.ask-permission.config.ts` (6/6 passed)
