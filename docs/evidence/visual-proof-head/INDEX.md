# Current-HEAD Visual Evidence Matrix (VISUAL-PROOF-HEAD)

> **Task Reference:** `[TID:INBOX-20261031-15EADE]` (`PREVIEW-HEAD-TRUTH`)  
> **Governed by:** Coordinator Readiness Audit (`msg_ed75c330`), Reviewer dispatch `ac3bcb7a-9f0d-40d2-b20c-7222b371f33c`  
> **Captured Default URL:** `http://127.0.0.1:4174/` (Root `/` without query parameters)  
> **Promoted UI Version:** Living Context V2 (`v2` by default; explicit `?ui=v1` / `VITE_YORI_UI=v1` preserved as rollback path)  
> **Capture Date:** 2026-10-31  
> **Spec File:** `tests/e2e/visual-proof-head.spec.ts`  
> **Test Status:** 6 / 6 passing across both viewports, verified green twice consecutively.  
> **Network Invariant:** 0 external requests. All non-localhost traffic strictly blocked and asserted empty.  
> **Accessibility Invariant:** 0 critical or serious Axe violations across all 18 captures.

---

## 1. Context & Architecture (V2 as Default)

Following the formal approval of `CUTLINE_CHECK_V2` with outcome **CONTINUE** (`docs/architecture/LIVING_CONTEXT_V2.md` §11), Living Context V2 is promoted to the default UI version in `src/ui/living-context/app.ts` (`resolveUiVersion()` and `getEffectiveUiVersion()` return `'v2'` when no parameter or environment variable is set).

### V2 UI Hierarchy & Nav Structure
1. **Header**: Always displays the honest `Demo · simulated context` chip alongside the `V2 Preview` badge (`#badge-ui-version`).
2. **Primary Navigation**:
   - Mobile (bottom bar): `Home` (`#tab-home`), `Plans` (`#tab-plans`), `For You` (`#tab-for-you`), `Me` (`#tab-me`).
   - Desktop (top navigation): `Home` (`#desktop-nav-home`), `Plans` (`#desktop-nav-plans`), `For You` (`#desktop-nav-for-you`), `Me` (`#desktop-nav-me`).
3. **V2 Architectural Note on Secondary Sections**:
   - On V2 Home, upcoming plans and routine proposals are surfaced via their dedicated primary navigation tabs (`Plans` and `For You`) rather than static, empty vertical blocks on Home. When secondary items are empty, placeholders are collapsed cleanly to prevent clutter.
4. **Docked Interaction Shell**: The `#ask-bar` is persistently docked at the bottom of the viewport across all main screens.
5. **Rollback Invariant**: Explicit `?ui=v1` or `VITE_YORI_UI=v1` safely preserves the approved V1 layout without modification. Unknown/invalid tokens fail closed to `'v1'`.

---

## 2. Screenshot Matrix (18 Captures)

| File # | File Name | Scenario | State | Viewport | Proof & Visible Text Assertions |
|---|---|---|---|---|---|
| 01 (Desktop) | `01-d2-rain-home-desktop-1280x800.png` | Rain Departure (D2) | Home (V2 Hierarchy) | 1280x800 | Full-page capture showing V2 Home: `V2 Preview` badge, `Demo · simulated context` chip, top nav (`Home`, `Plans`, `For You`, `Me`), prominent route map canvas (`.v2-map-canvas.prominent`), rain insight banner (`What changed: rain forecast`), journey card for `Piano lesson at 3:00 PM`, departure timeline (`.v2-timeline`), actions (`Accept`, `Adjust timing`, `Dismiss`, `Why?`, `Details →`), and docked `#ask-bar`. |
| 01 (Mobile) | `01-d2-rain-home-mobile-390x844.png` | Rain Departure (D2) | Home (V2 Hierarchy) | 390x844 | Full-page capture showing mobile V2 single-column layout without horizontal scroll overflow. Displays route map, journey timeline, actions, bottom 4-tab bar, and docked `#ask-bar`. |
| 02 (Desktop) | `02-d2-rain-why-provenance-desktop-1280x800.png` | Rain Departure (D2) | Why Sheet Provenance | 1280x800 | Why sheet modal showing Evidence badged as `SIMULATED` (forecast & conditions) and Memory & Habits badged as `Demo profile · sample preference` (0 unearned Confirmed badges). |
| 02 (Mobile) | `02-d2-rain-why-provenance-mobile-390x844.png` | Rain Departure (D2) | Why Sheet Provenance | 390x844 | Mobile Why modal with 0 Axe accessibility violations and clear card badges. |
| 03 (Desktop) | `03-d2-rain-confirm-me-desktop-1280x800.png` | Rain Departure (D2) | Confirm -> Me Tab | 1280x800 | Sovereign review loop: Adjust dialog timing (25m prep, 10m buffer) saved as proposal -> confirmed on Me tab -> promoted to `Confirmed` (`Source: you confirmed`). |
| 03 (Mobile) | `03-d2-rain-confirm-me-mobile-390x844.png` | Rain Departure (D2) | Confirm -> Me Tab | 390x844 | Mobile Me tab showing confirmed preference badge, truthful attribution, and prompt meter. |
| 04 (Desktop) | `04-d2-rain-dismiss-reason-desktop-1280x800.png` | Rain Departure (D2) | Dismiss with Reason | 1280x800 | Dismissing recommendation with reason (`busy_today`) immediately enters Quiet State (`Nothing needs your attention right now`) on Home. |
| 04 (Mobile) | `04-d2-rain-dismiss-reason-mobile-390x844.png` | Rain Departure (D2) | Dismiss with Reason | 390x844 | Mobile Quiet State presentation with peaceful sun illustration, clean copy, and 0 horizontal overflow. |
| 05 (Desktop) | `05-d3-lunch-home-desktop-1280x800.png` | Away Lunch (D3) | Home (V2 Candidates Hero) | 1280x800 | Full-page capture showing V2 Candidates Hero: `Lunch options near you`, mock place provider notice (`Mock places for this demo; real listings come from a place provider`), map canvas, candidates list, and docked `#ask-bar`. |
| 05 (Mobile) | `05-d3-lunch-home-mobile-390x844.png` | Away Lunch (D3) | Home (V2 Candidates Hero) | 390x844 | Full-page capture showing mobile responsive Away Lunch card with schematic map, candidate options, and docked ask bar. |
| 06 (Desktop) | `06-d3-lunch-why-provenance-desktop-1280x800.png` | Away Lunch (D3) | Why Sheet Provenance | 1280x800 | Dining preferences in Why Sheet clearly badged as `Demo profile · sample preference`. |
| 06 (Mobile) | `06-d3-lunch-why-provenance-mobile-390x844.png` | Away Lunch (D3) | Why Sheet Provenance | 390x844 | Mobile dining Why sheet with truthful habit provenance. |
| 07 (Desktop) | `07-d3-lunch-dismiss-reason-desktop-1280x800.png` | Away Lunch (D3) | Dismiss Reason & For You Tab | 1280x800 | Selecting "Don't suggest lunch today" produces quiet state on Home and generates proposal in `For You` tab: `Skip lunch suggestions for today?` with `PROPOSAL` badge and action buttons (`Confirm`, `Not true`). |
| 07 (Mobile) | `07-d3-lunch-dismiss-reason-mobile-390x844.png` | Away Lunch (D3) | Dismiss Reason & For You Tab | 390x844 | Mobile view of `For You` tab showing proposal card and actions following lunch dismissal. |
| 08 (Desktop) | `08-d3-lunch-suppressed-accepted-desktop-1280x800.png` | Away Lunch (D3) | Suppression Confirmed -> Me Tab | 1280x800 | Confirming lunch suppression proposal removes proposal from `For You` and promotes `suppress_lunch_recommendations` into Confirmed Preferences on Me tab (`Confirmed`, `Source: you confirmed`). |
| 08 (Mobile) | `08-d3-lunch-suppressed-accepted-mobile-390x844.png` | Away Lunch (D3) | Suppression Confirmed -> Me Tab | 390x844 | Mobile Me tab showing confirmed lunch suppression preference with truthful attribution and zero accessibility violations. |
| 09 (Desktop) | `09-xmemo-synced-why-desktop-1280x800.png` | Rain Departure (D2) + XMemo | Truthful XMemo Vault Badges | 1280x800 | Why sheet reflects preferences synced from mock XMemo vault (`/api/xmemo/*`), displaying `Synced from XMemo` badges. Zero live cloud calls. |
| 09 (Mobile) | `09-xmemo-synced-why-mobile-390x844.png` | Rain Departure (D2) + XMemo | Truthful XMemo Vault Badges | 390x844 | Mobile view of Why sheet displaying `Synced from XMemo` badges with verified Axe color contrast and accessible DOM. |

---

## 3. Strict Invariant Verification Summary

1. **V2 Default Promotion Verified**:
   - `resolveUiVersion()` returns `'v2'` for undefined/null/empty tokens.
   - Root URL `'/'` loads V2 layout with `V2 Preview` badge, Home/Plans/For You/Me nav, and docked Ask bar.
2. **Full-Page Timeline Visibility**:
   - Captures `01` (Rain D2) and `05` (Away Lunch D3) use `fullPage: true`, ensuring all primary components are visibly captured.
3. **Truthful Causality on Suppression Confirmation (Capture 08)**:
   - Dismissing with `dont_suggest_today` initiates same-day quiet suppression on Home and surfaces a pending proposal in the `For You` tab; confirming the proposal on the `For You` tab permanently registers this intent into sovereign memory on the `Me` tab (`Source: you confirmed`).
   - Capture `08` specifically documents the Me tab showing the confirmed suppression fact (`#fact-suppress_lunch_recommendations`), directly proving the state change produced by confirmation.
4. **Deterministic Execution**:
   - Zero randomness, zero floating timers.
   - Clean localStorage reset before each matrix test.
5. **Zero External Network Requests**:
   - Monitored by Playwright route interception (`page.route('**/*', ...)`).
   - Non-localhost requests are aborted immediately with `blockedbyclient`.
   - Result: 0 non-localhost requests encountered across the entire suite run.
6. **WCAG Accessibility Compliance**:
   - Tested using `@axe-core/playwright` (`color-contrast`, `button-name`, `heading-order`, `label`).
   - Result: 0 critical or serious violations on every captured state.
7. **No Horizontal Scrolling**:
   - `scrollWidth <= clientWidth + 1` asserted on every captured state at both 390px and 1280px.
