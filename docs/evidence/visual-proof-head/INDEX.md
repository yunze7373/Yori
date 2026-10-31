# Current-HEAD Visual Evidence Matrix (VISUAL-PROOF-HEAD)

> **Task Reference:** `[TID:INBOX-20261031-AAE267]` (Follow-up: `[TID:INBOX-20261031-AAE267-REV-d8cbd12f]`)  
> **Governed by:** Coordinator Readiness Audit (`msg_1956ab2c`), Reviewer ad-hoc dispatch decision `b5931625-6210-4f8e-be2c-fc56d6611002`  
> **Captured HEAD SHA:** `a5a826ea7194b8c367cb3c70aedb0e1fdbcc4ec7` (updated in rework 1)  
> **Capture Date:** 2026-10-31  
> **Spec File:** `tests/e2e/visual-proof-head.spec.ts`  
> **Test Status:** 6 / 6 passing across both viewports, verified green twice consecutively.  
> **Network Invariant:** 0 external requests. All non-localhost traffic strictly blocked and asserted empty.  
> **Accessibility Invariant:** 0 critical or serious Axe violations across all 18 captures.

---

## 1. Context & Gap Resolved

The owner-facing fallback set in `docs/evidence/submit-fallback/` was captured on 2026-10-28 (`981007a`) and predated six approved UI slices:
1. `UI-DEMO-FY` (`f525c6b`) — Plans, For You, and routine proposal review loop.
2. `UIA11Y` (`09117de`) — Accessible touch targets, color contrast, and heading hierarchies.
3. `UIFONT` (`a4e4f21`) — Typography scale and layout stability.
4. `UI-POLISH` (`2bdcca9`) — Schematic map callouts, ask bar clearance, distance formatting.
5. `PROV-INTEGRITY` (`62ef824`) — Field-level provenance tracking and simulated badges.
6. `XMEMO-PORT-WIRE` (`25f23b2`/`f53f4cd`) — `Synced from XMemo` provenance badges in Why sheets.

This directory provides the definitive, reproducible visual evidence captured from the current HEAD code state.

---

## 2. Screenshot Matrix (18 Captures)

| File # | File Name | Scenario | State | Viewport | Proof & Visible Text Assertions |
|---|---|---|---|---|---|
| 01 (Desktop) | `01-d2-rain-home-desktop-1280x800.png` | Rain Departure (D2) | Home (NOW + AHEAD + FOR YOU) | 1280x800 | Full-page capture (`fullPage: true`) showing complete home timeline: Piano lesson NOW card with `What changed: rain forecast`, `Umbrella` chip, ranked options (`Drive · leave 2:30 PM`, `Bus · leave 2:15 PM`), habit note (`You usually prefer driving when it rains`), plus visible AHEAD and FOR YOU sections below the hero card. |
| 01 (Mobile) | `01-d2-rain-home-mobile-390x844.png` | Rain Departure (D2) | Home (NOW + AHEAD + FOR YOU) | 390x844 | Full-page capture (`fullPage: true`) showing mobile single-column layout without horizontal scroll overflow. Shows complete vertical hierarchy (NOW, AHEAD, and FOR YOU) at 390px. |
| 02 (Desktop) | `02-d2-rain-why-provenance-desktop-1280x800.png` | Rain Departure (D2) | Why Sheet Provenance | 1280x800 | Why sheet modal showing Evidence badged as `SIMULATED` (forecast & conditions) and Memory & Habits badged as `Demo profile · sample preference` (0 unearned Confirmed badges). |
| 02 (Mobile) | `02-d2-rain-why-provenance-mobile-390x844.png` | Rain Departure (D2) | Why Sheet Provenance | 390x844 | Mobile Why modal with 0 Axe accessibility violations and clear card badges. |
| 03 (Desktop) | `03-d2-rain-confirm-me-desktop-1280x800.png` | Rain Departure (D2) | Confirm -> Me Tab | 1280x800 | Sovereign review loop: Adjust dialog timing (25m prep, 10m buffer) saved as proposal -> confirmed on Me tab -> promoted to `Confirmed` (`Source: you confirmed`). |
| 03 (Mobile) | `03-d2-rain-confirm-me-mobile-390x844.png` | Rain Departure (D2) | Confirm -> Me Tab | 390x844 | Mobile Me tab showing confirmed preference badge, truthful attribution, and prompt meter. |
| 04 (Desktop) | `04-d2-rain-dismiss-reason-desktop-1280x800.png` | Rain Departure (D2) | Dismiss with Reason | 1280x800 | Dismissing recommendation with reason (`busy_today`) immediately enters Quiet State (`Nothing needs your attention right now`) without a dismissal note (dismissal notes are shown in D3). |
| 04 (Mobile) | `04-d2-rain-dismiss-reason-mobile-390x844.png` | Rain Departure (D2) | Dismiss with Reason | 390x844 | Mobile Quiet State presentation with peaceful sun illustration, clean copy, and 0 horizontal overflow. |
| 05 (Desktop) | `05-d3-lunch-home-desktop-1280x800.png` | Away Lunch (D3) | Home (NOW + AHEAD + FOR YOU) | 1280x800 | Full-page capture (`fullPage: true`) showing Lunch recommendations card with mock place provider notice (`Mock places for this demo; real listings come from a place provider`), plus visible AHEAD and FOR YOU sections. |
| 05 (Mobile) | `05-d3-lunch-home-mobile-390x844.png` | Away Lunch (D3) | Home (NOW + AHEAD + FOR YOU) | 390x844 | Full-page capture (`fullPage: true`) showing mobile responsive Away Lunch card with schematic map, candidate options, and full-page sections. |
| 06 (Desktop) | `06-d3-lunch-why-provenance-desktop-1280x800.png` | Away Lunch (D3) | Why Sheet Provenance | 1280x800 | Dining preferences in Why Sheet clearly badged as `Demo profile · sample preference`. |
| 06 (Mobile) | `06-d3-lunch-why-provenance-mobile-390x844.png` | Away Lunch (D3) | Why Sheet Provenance | 390x844 | Mobile dining Why sheet with truthful habit provenance. |
| 07 (Desktop) | `07-d3-lunch-dismiss-reason-desktop-1280x800.png` | Away Lunch (D3) | Dismiss Reason & Proposal | 1280x800 | Selecting "Don't suggest lunch today" produces quiet state and creates proposal in FOR YOU with explicit dismissal note: `Skip lunch suggestions for today? (You dismissed lunch · Not today)`. |
| 07 (Mobile) | `07-d3-lunch-dismiss-reason-mobile-390x844.png` | Away Lunch (D3) | Dismiss Reason & Proposal | 390x844 | Mobile view of FOR YOU proposal creation and dismissal note following lunch dismissal. |
| 08 (Desktop) | `08-d3-lunch-suppressed-accepted-desktop-1280x800.png` | Away Lunch (D3) | Suppression Confirmed -> Me Tab | 1280x800 | Confirming lunch suppression proposal removes proposal from FOR YOU and promotes `suppress_lunch_recommendations` into Confirmed Preferences on Me tab (`Confirmed`, `Source: you confirmed`). |
| 08 (Mobile) | `08-d3-lunch-suppressed-accepted-mobile-390x844.png` | Away Lunch (D3) | Suppression Confirmed -> Me Tab | 390x844 | Mobile Me tab showing confirmed lunch suppression preference with truthful attribution and zero accessibility violations. |
| 09 (Desktop) | `09-xmemo-synced-why-desktop-1280x800.png` | Rain Departure (D2) + XMemo | Truthful XMemo Vault Badges | 1280x800 | Why sheet reflects preferences synced from mock XMemo vault (`/api/xmemo/*`), displaying `Synced from XMemo` badges. Zero live cloud calls. |
| 09 (Mobile) | `09-xmemo-synced-why-mobile-390x844.png` | Rain Departure (D2) + XMemo | Truthful XMemo Vault Badges | 390x844 | Mobile view of Why sheet displaying `Synced from XMemo` badges with verified Axe color contrast and accessible DOM. |

---

## 3. Strict Invariant Verification Summary

1. **Full-Page Timeline Visibility**:
   - Captures `01` (Rain D2) and `05` (Away Lunch D3) use `fullPage: true`, ensuring all three primary timeline sections (`NOW`, `AHEAD`, and `FOR YOU`) are visibly captured within the image frame.
2. **Truthful Causality on Suppression Confirmation (Capture 08)**:
   - *Observation*: In the current engine, dismissing with `dont_suggest_today` already initiates same-day quiet suppression for the lunch intent on Home; confirming the proposal on the Me tab permanently registers this intent into sovereign memory (`Source: you confirmed`) and clears the pending proposal from FOR YOU.
   - Capture `08` specifically documents the Me tab showing the confirmed suppression fact (`#fact-suppress_lunch_recommendations`), directly proving the state change produced by confirmation.
3. **Deterministic Execution**:
   - Zero randomness, zero floating timers.
   - Clean localStorage reset before each matrix test.
4. **Zero External Network Requests**:
   - Monitored by Playwright route interception (`page.route('**/*', ...)`).
   - Non-localhost requests are aborted immediately with `blockedbyclient`.
   - Result: 0 non-localhost requests encountered across the entire suite run.
5. **WCAG Accessibility Compliance**:
   - Tested using `@axe-core/playwright` (`color-contrast`, `button-name`, `heading-order`, `label`).
   - Result: 0 critical or serious violations on every captured state.
6. **No Horizontal Scrolling**:
   - `scrollWidth <= clientWidth + 1` asserted on every captured state at both 390px and 1280px.
