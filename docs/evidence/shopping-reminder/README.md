# Shopping Reminder & Dedicated "Nearby now" Section Verification Evidence

**Task ID**: `INBOX-20261104-9C01AA` (`SHOPPING-REMINDER`)  
**Environment**: **Mocked Only** (Zero live paid API calls, isolated port 4289)  
**Date**: 2026-11-05 (Updated for Reviewer Revision)  

## Reviewer Feedback Addressed

1. **(P1) Fictional Demo Store**:
   - `DEMO_SHOPPING_STORE` updated from real brand to fictional store name `Market Square Grocery` (`100 Market St, San Francisco, CA`).
2. **(P1) Live Essentials Badge**:
   - Live `'Nearby essentials'` proposal updated to `provenance: 'live'`, rendering `Live` badge instead of `"You confirmed"`.
3. **(P2) Shopping Card Rendered Once**:
   - Removed duplicate shopping reminder from Section 1: Now. The proactive card is rendered exactly once in the dedicated **"Nearby now"** section (`#feed-section-nearbynow`).

## Verified Deliverables

1. **Ask Flow (On-Device Memory)**:
   - Natural phrasing such as `"remind me to buy milk, eggs"` (and Chinese equivalents) is parsed deterministically without model calls via `tryMemoryStatement`/`MemoryPort`.
   - Never infers items. Sensitive items fail closed under existing guard.
   - User feedback confirms items added to shopping list.

2. **Me Page (What Yori has learned)**:
   - Lists `"Shopping list: milk, eggs"` under "What Yori has learned".
   - Quiet `"Forget"` action immediately deletes the memory fact from on-device state without confirmation prompts (INV-107).

3. **Proactive Shopping Reminder Card**:
   - Displays format: `Pick up milk, eggs at <store name> · <distance> · <open status>`.
   - Includes `"Directions"` link leading to Google Maps directions.
   - Includes `"Got it"` action to mark items completed and dismiss the reminder.
   - Includes `"Not now"` quiet one-tap snooze.

4. **Dedicated "Nearby now" Section**:
   - Separates real places and nearby reminders (`#feed-section-nearbynow`) from learned user preferences.
   - Preserves dedicated action buttons on nearby cards.

5. **Demo Mode (Scene "shopping")**:
   - `?scene=shopping` uses fixture store (`Market Square Grocery`) and displays `SIMULATED` pill.
   - Forget from Me tab clears the fixture habit.

## Evidence Artifacts

| Screenshot | Description | Viewport |
| :--- | :--- | :--- |
| `01-demo-shopping-scene-mobile-390x844.png` | Demo shopping scene with SIMULATED card and Nearby now section | Mobile (390×844) |
| `01-demo-shopping-scene-desktop-1280x800.png` | Demo shopping scene with SIMULATED card and Nearby now section | Desktop (1280×800) |
| `02-me-tab-shopping-list-mobile-390x844.png` | Me page displaying Shopping list under What Yori has learned | Mobile (390×844) |
| `02-me-tab-shopping-list-desktop-1280x800.png` | Me page displaying Shopping list under What Yori has learned | Desktop (1280×800) |
| `03-me-tab-after-forget-mobile-390x844.png` | Me page after tapping Forget | Mobile (390×844) |
| `03-me-tab-after-forget-desktop-1280x800.png` | Me page after tapping Forget | Desktop (1280×800) |
| `04-home-after-forget-mobile-390x844.png` | Home view after shopping list forgotten (card dismissed) | Mobile (390×844) |
| `04-home-after-forget-desktop-1280x800.png` | Home view after shopping list forgotten (card dismissed) | Desktop (1280×800) |
| `05-ask-add-shopping-items-mobile-390x844.png` | Ask conversation storing shopping items | Mobile (390×844) |
| `05-ask-add-shopping-items-desktop-1280x800.png` | Ask conversation storing shopping items | Desktop (1280×800) |
| `06-live-proactive-card-mobile-390x844.png` | Proactive card with real store and Nearby now section (shown once) | Mobile (390×844) |
| `06-live-proactive-card-desktop-1280x800.png` | Proactive card with real store and Nearby now section (shown once) | Desktop (1280×800) |
| `07-after-got-it-cleared-mobile-390x844.png` | Home view after tapping "Got it" (shopping card cleared) | Mobile (390×844) |
| `07-after-got-it-cleared-desktop-1280x800.png` | Home view after tapping "Got it" (shopping card cleared) | Desktop (1280×800) |
