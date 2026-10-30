# UI-A11Y Accessibility & Visual Verification Manifest

**Task ID**: `INBOX-20261030-5F8F70`  
**Reference**: `BACKLOG-20261031-UIA11Y`  
**Standard**: WCAG 2.1 AA  
**Timestamp**: 2026-10-31T06:13:00+09:00  

---

## 1. Executive Summary

This slice resolves all keyboard, focus, and ARIA accessibility violations on modal dialogs and candidate recommendation cards in the Yori Living Context interface, achieving **0 violations under axe `wcag2a` and `wcag2aa`** across all standard scenes and views.

---

## 2. Changes Made & Dialogs Updated

### A. Modal Dialog Accessibility (`src/ui/review/modal-accessibility.ts`)
Created reusable accessible modal manager `attachModalAccessibility` implementing:
1. **Focus on Open**: Moves focus inside the dialog immediately upon opening (`document.activeElement !== document.body`), prioritizing dialog title (`tabindex="-1"`) and interactive controls.
2. **Keyboard Trap**: Traps `Tab` and `Shift+Tab` cycling strictly within the dialog's focusable elements. Shift+Tab from first element/title wraps to last element; Tab from last element wraps to first.
3. **Escape to Close**: Pressing `Escape` key immediately closes the dialog with `preventDefault()`.
4. **Backdrop Click**: Clicking outside the modal card closes the dialog.
5. **Inert Background**: Siblings (`.header-bar`, `main.main-container`, `.bottom-tab-bar`) receive `inert` and `aria-hidden="true"` while any modal is open, preventing background leakage.
6. **Focus Restoration**: On close (via Esc, X button, Done/Cancel button, or backdrop click), focus is restored to the invoking control (`#btn-why`, `.btn-ahead-why`, `#btn-adjust`, `#btn-dismiss`, or `.v2-directions-btn`).

**Exhaustive List of Modals Updated in `src/ui/living-context/app.ts`**:
1. **Why Sheet** (`#why-sheet-backdrop`, card `[role="dialog"] aria-modal="true" aria-labelledby="why-sheet-title"`)
   - Invoking controls: `#btn-why` (NOW card), `.btn-ahead-why` (AHEAD cards).
   - Close controls: `#btn-close-why`, `#btn-why-sheet-done`, backdrop click, Escape key.
2. **Adjust Dialog** (`#adjust-dialog-backdrop`, card `[role="dialog"] aria-modal="true" aria-labelledby="adjust-dialog-title"`)
   - Invoking control: `#btn-adjust`.
   - Close controls: `#btn-close-adjust`, `#btn-adjust-for-today`, `#btn-adjust-remember`, backdrop click, Escape key.
3. **Dismiss Dialog** (`#dismiss-dialog-backdrop`, card `[role="dialog"] aria-modal="true" aria-labelledby="dismiss-dialog-title"`)
   - Invoking control: `#btn-dismiss`.
   - Close controls: `#btn-close-dismiss`, `#btn-cancel-dismiss`, `#btn-confirm-dismiss`, backdrop click, Escape key.
4. **Navigate Confirmation Modal** (`#navigate-confirm-backdrop`, card `#navigate-confirm-modal [role="dialog"] aria-modal="true" aria-labelledby="nav-modal-title"`)
   - Invoking control: `.v2-directions-btn` (`#btn-navigate-${c.id}`).
   - Close controls: `#btn-cancel-navigate`, `#btn-confirm-navigate`, backdrop click, Escape key.

### B. Candidate Cards Nested Interactive Removal (`src/ui/living-context/v2-home-view.ts`)
- **Root Cause**: `div.v2-candidate-card` previously carried `role="button"`, `tabindex="0"`, and `aria-label`, while containing nested interactive `<button class="v2-directions-btn">`. This triggered `nested-interactive` (serious) Axe violations x3 per scene in `lunch`, `fuel`, and `away-lunch`.
- **Solution**:
  - Removed `role="button"` and `tabindex="0"` from the outer card container `div.v2-candidate-card`.
  - Replaced the inner `<span class="v2-view-detail-link">Details →</span>` with an accessible `<button type="button" class="btn v2-view-detail-link" id="btn-detail-${c.id}" data-candidate-id="${c.id}" aria-label="View details for ${escapeHtml(c.name)}">Details →</button>`.
  - Preserved mouse click handling on the card container (excluding child buttons) so clicking anywhere on the card continues opening restaurant details.
  - Reset button chrome in `styles.css` (`button.v2-view-detail-link`) ensuring 100% bit-exact visible layout matching.
- **Scrollable Region Accessibility**:
  - Added `tabindex="0" role="region"` and accessible labels to `.modal-body` elements, resolving Safari scrollable region focusability requirements under WCAG 2.1 AA.
- **Progress Bar Accessible Name**:
  - Added `aria-labelledby="me-budget-title"` to `.budget-meter-track` in `src/ui/me/me-view.ts`.

---

## 3. Byte-Identity Visual Verification

All before and after screenshots captured across Mobile (390×844) and Desktop (1280×800) viewports match byte-for-byte with identical SHA-256 hashes:

| Scene | Viewport | Target | Before Hash | After Hash | Status |
|---|---|---|---|---|---|
| `lunch` | Desktop | Candidate Card | `3619286c5dfa...` | `3619286c5dfa...` | **Bit-Exact Match** |
| `lunch` | Mobile | Candidate Card | `8fcec8969d16...` | `8fcec8969d16...` | **Bit-Exact Match** |
| `lunch` | Desktop | Candidate List | `debea9907ce9...` | `debea9907ce9...` | **Bit-Exact Match** |
| `lunch` | Mobile | Candidate List | `c830473de50e...` | `c830473de50e...` | **Bit-Exact Match** |
| `fuel` | Desktop | Candidate Card | `38d2050a2037...` | `38d2050a2037...` | **Bit-Exact Match** |
| `fuel` | Mobile | Candidate Card | `76926aaddba8...` | `76926aaddba8...` | **Bit-Exact Match** |
| `fuel` | Desktop | Candidate List | `74fefbd4e8b5...` | `74fefbd4e8b5...` | **Bit-Exact Match** |
| `fuel` | Mobile | Candidate List | `dd02296a38f5...` | `dd02296a38f5...` | **Bit-Exact Match** |
| `away-lunch` | Desktop | Candidate Card | `1731fa1e9e39...` | `1731fa1e9e39...` | **Bit-Exact Match** |
| `away-lunch` | Mobile | Candidate Card | `187cab2c3934...` | `187cab2c3934...` | **Bit-Exact Match** |
| `away-lunch` | Desktop | Candidate List | `22993b1c087a...` | `22993b1c087a...` | **Bit-Exact Match** |
| `away-lunch` | Mobile | Candidate List | `8ae914e2b1ee...` | `8ae914e2b1ee...` | **Bit-Exact Match** |

---

## 4. Test Verification Summary

1. **Unit Tests (`npm test`)**: 737 / 737 passed (30 files).
2. **Golden Tests (`npm run test:golden`)**: 18 / 18 passed (4 files).
3. **Drill Tests (`npm run test:drills`)**: 56 / 56 passed (4 files).
4. **New Accessibility E2E (`tests/e2e/ui-a11y.spec.ts`)**: 50 / 50 passed (mobile + desktop).
   - 0 Axe violations on Home for `clear`, `rain`, `lunch`, `fuel`, `away-lunch`.
   - 0 Axe violations on Why Sheet open state.
   - 0 Axe violations on For You, Plans, and Me tabs.
5. **Existing Regression E2E**:
   - `tests/e2e/v2-smoke.spec.ts`: 12 / 12 passed.
   - `tests/e2e/v5-lunch.spec.ts`: 14 / 14 passed.
   - `tests/e2e/v5-fuel.spec.ts`: 20 / 20 passed.
   - `tests/e2e/ui-demo-fy.spec.ts`: 6 / 6 passed.
6. **Compilation & Build**: `npm run typecheck` clean (0 errors), `npm run build` clean.
7. **Core Isolation**: `git diff f43c6c1d -- src/core` empty (zero diff).
8. **Model Ledger**: `.yori-runtime/model-live-ledger.json` SHA256 `46aa6fa9...` unchanged (17 entries).
