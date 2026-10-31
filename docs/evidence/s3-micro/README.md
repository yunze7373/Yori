# S3-MICRO Evidence: Microinteractions, Action Surfaces & Motion Patterns

## Overview
This evidence bundle records verification for slice **S3-MICRO** (TID: `INBOX-20261031-09E001`) under `docs/architecture/REV3_UI_CONNECTORS.plan.md` §Slice 3 and `LIVING_CONTEXT_V2.md` §2 / §8.

All interactions operate strictly within the bounded, offline action-state machine:
1. **Ask Composer Smart Collapse**: Opens with context chip (`#conversation-context-chip`), reflects in-flight state (`#btn-cancel-inflight`), and smart collapses to Home with visible semantic plan diff (`#plan-diff-banner`, `.plan-diff-highlight`), aria-live announcement, and Undo restoration (`#btn-undo-accept`).
2. **Action Surfaces**:
   - **Accept**: Commits plan to accepted state with `.badge-accepted` and full Undo capability.
   - **Adjust**: Opens `#adjust-dialog` to modify preparation/buffer timing, computes new departure schedule, shows `#plan-diff-banner`, and restores on Undo.
   - **Why**: Opens provenance sheet `#why-sheet` and restores focus on Esc/Done.
   - **Dismiss**: Suppresses intent via `#dismiss-dialog` and transitions to the honest quiet empty state (`.quiet-card`).
3. **Motion Tokens & Reduced Motion Parity**: Motion tokens (`--motion-fast: 120ms;`, `--motion-base: 200ms;`) collapse to instant `0s` transitions under `prefers-reduced-motion: reduce`, ensuring no information is carried by motion alone.
4. **Honest Loading Skeleton**: `#loading-skeleton` is rendered only while asynchronous status reads are actually pending, disappearing as soon as data arrives.
5. **Fail-Closed Degraded Notice**: Under 500 status on `/api/weather/status`, `#weather-error-notice` names the degraded capability while keeping the prior plan card visible.

---

## Screenshot Matrix

| State | Mobile (390×844) | Desktop (1280×800) | Description |
|---|---|---|---|
| 01. Initial Home | `01-home-initial-mobile.png`<br>`7a186b49…` | `01-home-initial-desktop.png`<br>`b96ecc67…` | Baseline Home with departure Now card. |
| 02. Ask Expanded | `02-ask-expanded-with-context-chip-mobile.png`<br>`8208bec9…` | `02-ask-expanded-with-context-chip-desktop.png`<br>`c73d30fe…` | Ask overlay showing `#conversation-context-chip` ("Demo scene · simulated"). |
| 03. Ask In-Flight | `03-ask-inflight-processing-mobile.png`<br>`9f92986f…` | `03-ask-inflight-processing-desktop.png`<br>`ec0e9242…` | In-flight processing state with `#btn-cancel-inflight`. |
| 04. Home Diff | `04-home-updated-with-diff-mobile.png`<br>`808c5fe7…` | `04-home-updated-with-diff-desktop.png`<br>`130ccc04…` | Home after collapse showing `#plan-diff-banner` and `.plan-diff-highlight`. |
| 05. Adjust Dialog | `05-action-adjust-dialog-mobile.png`<br>`5f2e0aa7…` | `05-action-adjust-dialog-desktop.png`<br>`99223ca6…` | Modal `#adjust-dialog` for prep and buffer minutes adjustment. |
| 06. Why Sheet | `06-action-why-sheet-mobile.png`<br>`c5443ad2…` | `06-action-why-sheet-desktop.png`<br>`c07096ea…` | Modal `#why-sheet` provenance view with grounding citations. |
| 07. Dismiss Quiet | `07-action-dismiss-quiet-state-mobile.png`<br>`3ccc6782…` | `07-action-dismiss-quiet-state-desktop.png`<br>`63a1096f…` | Honest quiet state (`.quiet-card`) after user plan dismissal. |
| 08. Skeleton | `08-loading-skeleton-mobile.png`<br>`c8a2a79c…` | `08-loading-skeleton-desktop.png`<br>`6d343dfc…` | Loading skeleton `#loading-skeleton` during pending status fetch. |
| 09. Error Notice | `09-degraded-error-notice-mobile.png`<br>`4b410928…` | `09-degraded-error-notice-desktop.png`<br>`0a3a87c0…` | Fail-closed `#weather-error-notice` keeping prior plan card visible. |

---

## Architectural Compliance
- **Zero billed model calls**: Meta ledger untouched (remains at 22/50 lifetime).
- **Zero core diff**: `git diff f43c6c1d HEAD -- src/core` produces 0 lines.
- **Accessibility**: Axe WCAG 2.1 AA passes with 0 violations; all interactive buttons meet or exceed 44×44px touch target ergonomics.
- **Reference**: Compared against `yori_proactive_life_assistant_mockup.png` (`ef4cf701…`).
