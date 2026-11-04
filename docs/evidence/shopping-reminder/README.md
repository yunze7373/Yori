# Shopping Reminder & Now Card Placement Verification Evidence

**Task ID**: `INBOX-20261104-FB5951` (`SHOPPING-NOW-PLACEMENT`)  
(Follow-up to approved `INBOX-20261104-9C01AA` @ `9f4edac`)  
**Environment**: **Mocked Only** (Zero live paid API calls, isolated port 4289)  
**Date**: 2026-11-05  

## Delivered Requirements & Reviewer Feedback Addressed

1. **Now Card Dynamic Placement (`SHOPPING-NOW-PLACEMENT`)**:
   - When a shopping reminder exists (live: real nearest store + non-empty list; demo scene `'shopping'`: fixture store `Market Square Grocery`) **AND** Now would otherwise be the quiet state (`'Nothing needs your attention right now.'`):
     - Renders the shopping reminder **AS** the Section 1: Now card (`#card-shopping-now` · `SHOPPING` eyebrow · `Live`/`SIMULATED` pill · `'Pick up … at <store> · <distance> · <open status>'` · `Directions` / `Got it` / `Not now`).
     - Does **NOT** repeat the shopping reminder in "Nearby now".
     - Header subline uses `"I've already looked ahead for you."` instead of `"Nothing needs you right now."`.
   - If Now already has a plan (depart/lunch), the shopping reminder remains in "Nearby now" while Section 1: Now displays the plan.
2. **E2E Spec Geolocation Origin Fix**:
   - Updated `tests/e2e/shopping-reminder.spec.ts` line 172 to grant geolocation to `new URL(APP).origin` rather than hard-coded `http://localhost:4289`, enabling the test suite to execute against any port (e.g. reviewer on port 4283).
3. **Fictional Demo Store**:
   - `DEMO_SHOPPING_STORE` uses fictional name `Market Square Grocery` with `SIMULATED` pill.
4. **Live Essentials Badge**:
   - Live `'Nearby essentials'` proposal carries `provenance: 'live'` (`Live` badge, never `"You confirmed"`).

## Verified Deliverables

1. **Ask Flow (On-Device Memory)**:
   - Natural phrasing such as `"remind me to buy milk, eggs"` (and Chinese equivalents) is parsed deterministically without model calls via `tryMemoryStatement`/`MemoryPort`.
   - Never infers items. Sensitive items fail closed under existing guard.
   - User feedback confirms items added to shopping list.

2. **Me Page (What Yori has learned)**:
   - Lists `"Shopping list: milk, eggs"` under "What Yori has learned".
   - Quiet `"Forget"` action immediately deletes the memory fact from on-device state without confirmation prompts (INV-107).

3. **Now Shopping Reminder Card**:
   - Displays format: `Pick up milk, eggs at <store name> · <distance> · <open status>`.
   - Includes `"Directions"` link leading to Google Maps directions.
   - Includes `"Got it"` action to mark items completed and dismiss the reminder.
   - Includes `"Not now"` quiet one-tap snooze.

4. **Dedicated "Nearby now" Section**:
   - When shopping reminder is on Now, "Nearby now" displays other nearby essentials without repeating the shopping card.
   - When Now has a plan, "Nearby now" displays the shopping reminder.

5. **Demo Mode (Scene "shopping")**:
   - `?scene=shopping` uses fixture store (`Market Square Grocery`) on Section 1: Now and displays `SIMULATED` pill.
   - Forget from Me tab clears the fixture habit and returns Home to the quiet state.

## Evidence Artifacts

| Screenshot | Description | Viewport |
| :--- | :--- | :--- |
| `01-demo-shopping-scene-mobile-390x844.png` | Demo shopping scene with Now card (Shopping eyebrow, SIMULATED pill) | Mobile (390×844) |
| `01-demo-shopping-scene-desktop-1280x800.png` | Demo shopping scene with Now card (Shopping eyebrow, SIMULATED pill) | Desktop (1280×800) |
| `02-me-tab-shopping-list-mobile-390x844.png` | Me page displaying Shopping list under What Yori has learned | Mobile (390×844) |
| `02-me-tab-shopping-list-desktop-1280x800.png` | Me page displaying Shopping list under What Yori has learned | Desktop (1280×800) |
| `03-me-tab-after-forget-mobile-390x844.png` | Me page after tapping Forget | Mobile (390×844) |
| `03-me-tab-after-forget-desktop-1280x800.png` | Me page after tapping Forget | Desktop (1280×800) |
| `04-home-after-forget-mobile-390x844.png` | Home view after shopping list forgotten (quiet state, card dismissed) | Mobile (390×844) |
| `04-home-after-forget-desktop-1280x800.png` | Home view after shopping list forgotten (quiet state, card dismissed) | Desktop (1280×800) |
| `05-ask-add-shopping-items-mobile-390x844.png` | Ask conversation storing shopping items | Mobile (390×844) |
| `05-ask-add-shopping-items-desktop-1280x800.png` | Ask conversation storing shopping items | Desktop (1280×800) |
| `06-live-proactive-card-mobile-390x844.png` | Live proactive card as Now card (Shopping eyebrow, Live pill) & Nearby essentials | Mobile (390×844) |
| `06-live-proactive-card-desktop-1280x800.png` | Live proactive card as Now card (Shopping eyebrow, Live pill) & Nearby essentials | Desktop (1280×800) |
| `07-after-got-it-cleared-mobile-390x844.png` | Home view after tapping "Got it" (shopping card cleared) | Mobile (390×844) |
| `07-after-got-it-cleared-desktop-1280x800.png` | Home view after tapping "Got it" (shopping card cleared) | Desktop (1280×800) |
