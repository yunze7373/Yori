# Yori (ヨリ) — 3-Minute Video Demonstration Script

> **Governed by Plan:** `YORI_V2` (Task `DOC-RESYNC`, AC-205-2)  
> **Target Duration:** Exactly 3:00 (180 seconds)  
> **Pacing:** ~138 words per minute (415 spoken words)  
> **Resolution:** 1280×800 Desktop or 390×844 Mobile portrait  
> **Recording Candidate Build:** V2 Living Context UI (`/?ui=v2` or `VITE_YORI_UI=v2`)  
> **Guaranteed Path:** Zero owner credentials; all demo scenes run deterministically with external model off (`MODEL_API_KEY` unset), cloud memory off (`XMEMO_OAUTH_ENABLED=false`), live weather off (`WEATHER_LIVE_ENABLED=false`), and scripted/recorded fixtures.

---

## Breakdown Timeline Overview

| Section | Time Window | Scene / Screen | Key Focus |
|---|---|---|---|
| **1. Hook & The Calm Philosophy** | `0:00 – 0:25` (25s) | Scene D1: Clear (`?ui=v2`) | Proactive, glanceable Living Context; single NOW card, route map, docked Ask Bar. |
| **2. Thinking Ahead & Environmental Adaptation** | `0:25 – 0:50` (25s) | Scene D2: Rain Re-Plan | Dynamic context shifts: umbrella chip, route map with weather callout, transit ranking by habit. |
| **3. Away Dining & Honest Quiet State** | `0:50 – 1:15` (25s) | Scene D3 & D4: Away / Busy | Candidate cards with local SVG illustrations, mock disclosure, and calm quiet state when busy. |
| **4. The Explainable Review Loop** | `1:15 – 1:45` (30s) | Why Sheet & Adjust Dialog | Plain-language reason codes, buffer adjustment, preference proposal. |
| **5. User Sovereignty & The Me Tab** | `1:45 – 2:18` (33s) | Me Page & Sovereign Memory | Confirm-only memory (INV-107), budget meter, recomputed D2 timing. |
| **6. Conversational Shell & Reasoning Demo** | `2:18 – 2:46` (28s) | Ask Yori & Reasoning Scene | Offline conversational shell, scripted fixture execution, deterministic multi-candidate fallback, 418 unit tests, zero core diff. |
| **7. Honest Disclosure & Closing** | `2:46 – 3:00` (14s) | App Home / Tagline | Exact integration status per `SUBMISSION_READINESS.md`, tagline. |

---

## Detailed Script & On-Screen Actions

### Part 1: Hook & The Calm Philosophy (`0:00 – 0:25` · 25s)

**[ON SCREEN]**:  
Browser open to `http://127.0.0.1:5173/?ui=v2`. Scene D1 (Clear Departure) is selected. Clean, uncluttered UI visible with a warm editorial greeting: *"Good morning. I've been looking ahead for you."* Exactly one NOW card is prominently visible: *"Piano lesson at 3:00 PM"*, *"Get ready at 2:05 PM, leave by 2:25 PM"*. Explicit header chip reads: *"Demo · simulated context"*; V2 preview badge reads: *"V2 Preview"*; card badge displays: `SIMULATED`. Route map section displays *"Spatial Context Map"* (desktop) / *"Route Map"* (mobile), schematic map with *"Home"* and *"Piano lesson"* markers. Docked bottom Ask Bar displays: *"Ask Yori about your day..."* (desktop) / *"Ask Yori..."* (mobile) with chip *"Tap to chat"*.

**[VOICEOVER / NARRATION]**:  
*(0:00)* "Most AI assistants today are either passive chat boxes you have to prompt, or noisy notification feeds that interrupt your day.  
*(0:10)* Meet **Yori**—a calm, proactive context-aware assistant designed to help you plan ahead and act at the right moment.  
*(0:18)* Instead of waiting for prompts, Yori synthesizes your schedule, weather, and transit into a Living Context: at most one actionable NOW card, followed by what's ahead."

---

### Part 2: Thinking Ahead & Environmental Adaptation (`0:25 – 0:50` · 25s)

**[ON SCREEN]**:  
Cursor moves to top-right scenario picker and switches to **Rain Re-Plan (D2)**. The NOW card smoothly updates: alert banner reads *"What changed: rain forecast"*, an **Umbrella** checklist chip appears (*"Umbrella"*), and the Route Map displays an organic weather callout: *"Rain forecast · simulated"* (*"Issued 1:35 PM"*). Two transit options are ranked: Drive first (*"Drive · leave 2:30 PM"*, *"25m drive · 5m buffer"*, ranked by habit: *"Ranked by habit: Rain travel habit (Demo profile · sample)"*), then Bus (*"Bus · leave 2:15 PM"*, *"40m bus · 5m buffer"*, *"Alternative route"*). Habit note cites: *"You usually prefer driving when it rains."*.

**[VOICEOVER / NARRATION]**:  
*(0:25)* "Watch what happens when conditions change.  
*(0:29)* A sudden rain forecast arrives for our departure window.  
*(0:33)* Yori adapts proactively: it reminds us to grab an umbrella, illustrates the weather on our route map, and re-ranks transit options—placing driving first based on our rainy-day habit.  
*(0:43)* Times and buffers are calculated deterministically—no hallucinated departures, no invented delays."

---

### Part 3: Away Dining & Honest Quiet State (`0:50 – 1:15` · 25s)

**[ON SCREEN]**:  
Switch to **Away Lunch (D3)**. Shows Candidates Hero (*"Lunch options near you"*, *"Places matching what you like, within walking distance"*) with curated dining venues matching taste preferences (`Japanese`, `Salad`), featuring local labelled SVG illustrations (e.g. *"Ramen Kobo"*, *"Green Garden"*) with clear mock venue disclosure: *"Mock places for this demo; real listings come from a place provider."* Tap **Why** to show the memory section titled **Memory & Habits** labelled `Demo profile · sample preference`. Then switch to **Busy Lunch (D4)**: the screen gently falls into a quiet state: *"Nothing needs your attention right now."* (*"You're all caught up. We'll let you know when something comes up."*).

**[VOICEOVER / NARRATION]**:  
*(0:50)* "At lunch time, when you're away from home, Yori suggests nearby dining that matches your taste preferences, illustrated with local artwork and clear mock disclosure.  
*(1:01)* But if you're in back-to-back meetings or have already logged lunch?  
*(1:06)* Yori stays completely quiet: *'Nothing needs your attention right now.'* It respects your focus and never creates noise."

---

### Part 4: The Explainable Review Loop (`1:15 – 1:45` · 30s)

**[ON SCREEN]**:  
Return to D2. Tap **Why** button on NOW card. The **Why Sheet** slides up (*"Why you're seeing this"*), showing plain-language evidence lines without technical jargon or raw ISO dates. Scenario signals are clearly labelled `SIMULATED` (*"Weather forecast"*, *"Forecast conditions"*, *"Recorded at 1:35 PM"*), and the memory section is titled **Memory & Habits** with persona facts clearly labelled `Demo profile · sample preference` (*"Rain travel habit"*, *"Buffer before leaving"*, *"Time to get ready"*). Close Why Sheet. Tap **Adjust** button (*"Adjust Departure Timing"*): adjust prep time to 25 min and buffer time to 10 min, select *"Remember as preference"*, and click Save. A pending proposal appears under FOR YOU on the home screen (*"Remember departure prep & buffer routine?"*).

**[VOICEOVER / NARRATION]**:  
*(1:15)* "Every suggestion in Yori is fully explainable.  
*(1:19)* Tap 'Why' to see exactly where recommendations came from—citing the scenario's simulated signals and demo-profile sample preferences in plain language.  
*(1:27)* When you adjust a buffer time, you can choose 'For this time only' or 'Remember as preference'.  
*(1:36)* But remembering never silently alters your preferences. It creates a proposal that waits for your explicit confirmation."

---

### Part 5: User Sovereignty & The Me Tab (`1:45 – 2:18` · 33s)

**[ON SCREEN]**:  
Click navigation tab to open **Me** page (`/me`, *"Me & Memory"*). Proactive budget meter shows *"0 of 3 used today"*. Confirmed Preferences list displays the explicit empty state: *"No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own."* Below, the pending proposal appears (*"Remember departure prep & buffer routine?"*), showing **Confirm** and **Not true** buttons. Tap **Confirm**; the item moves to Confirmed Preferences with a green `Confirmed` badge.  
Return to the Today tab on Scene D2: the NOW card immediately recomputes its departure schedule to *"Get ready at 2:00 PM, leave by 2:25 PM"*. Re-open the Why Sheet: the two adjusted timing facts (*"Buffer before leaving"*, *"Time to get ready"*) now display `Confirmed`, while the rain habit remains `Demo profile · sample preference`. Point out data export/reset and the XMemo Sync section, noting local storage sovereignty.

**[VOICEOVER / NARRATION]**:  
*(1:45)* "Under the 'Me' tab, you have total sovereignty.  
*(1:49)* Yori strictly caps proactive prompts to three per day.  
*(1:53)* Before you confirm anything, your confirmed list is empty—active demo scenes only borrow sample habits from a simulated demo profile.  
*(2:01)* Under Invariant INV-107, pending proposals never enter confirmed memory until you tap 'Confirm'.  
*(2:07)* Once confirmed, returning to Today immediately recalculates departure timing, and the Why Sheet updates to show your preferences as 'Confirmed'.  
*(2:14)* Local storage is sovereign; remote sync remains safely owner-gated."

---

### Part 6: Conversational Shell & Reasoning Demo (`2:18 – 2:46` · 28s)

**[ON SCREEN]**:  
Return to Today tab. Tap docked Ask Bar: full-page conversation overlay opens with title *"Ask Yori"*, status badge *"Offline demo · simulated"*, and engine status chip *"Offline fallback · deterministic"*. Type conversational query: *"Can I leave later?"* and tap send. Model interpreter executes the scripted model fixture command and status chip updates to *"Scripted model fixture · not a live model call"*. Close conversation overlay. Select **Reasoning demo** scene: show that even with external AI model turned off (`MODEL_API_KEY` unset), Yori handles competing candidates deterministically—keeping the time-critical Piano lesson as NOW and placing Lunch in AHEAD. Briefly highlight the terminal showing 418 passing unit tests, 18 golden fixtures, 53 drills, 16 Playwright e2e tests, and `git diff --stat f43c6c1d HEAD -- src/core` completely empty.

**[VOICEOVER / NARRATION]**:  
*(2:18)* "Whenever you want to chat, the Ask Yori conversation shell opens instantly.  
*(2:23)* You can ask natural questions like 'Can I leave later?'—running on deterministic fixtures with transparent engine disclosure.  
*(2:30)* When multiple intents compete, Yori prioritizes time-critical commitments deterministically.  
*(2:36)* Backed by 418 unit tests, 18 goldens, and 53 drills, our pure domain core is completely frozen with zero diffs."

---

### Part 7: Honest Disclosure & Closing (`2:46 – 3:00` · 14s)

**[ON SCREEN]**:  
Return to app home screen. Camera pauses on the clean, calm UI with the tagline visible: *"A little ahead. By your side."*

**[VOICEOVER / NARRATION]**:  
*(2:46)* "To protect privacy in this demo, calendar and location data are simulated mock fixtures. Meta Muse Spark live reasoning, XMemo live sync, and live weather remain owner-gated.  
*(2:54)* Yori: A calm, proactive assistant. A little ahead. By your side."

---

## Verbatim UI Quotes & E2E Assertion Map

Every on-screen string and step sequence quoted in this script is verified verbatim against the rendered UI by automated Playwright assertions across our test suite:

| Script Section | Quoted UI Text | Rendered UI Selector | Test Spec Reference |
|---|---|---|---|
| Part 1 (Hook) | `Demo · simulated context` | `.demo-chip` | [`fallback-walkthrough.spec.ts:93`](../../tests/e2e/fallback-walkthrough.spec.ts#L93) / [`v2-smoke.spec.ts:40`](../../tests/e2e/v2-smoke.spec.ts#L40) |
| Part 1 (Hook) | `V2 Preview` | `#badge-ui-version` | [`v2-smoke.spec.ts:68`](../../tests/e2e/v2-smoke.spec.ts#L68) |
| Part 1 (Hook) | `Piano lesson at 3:00 PM` | `.now-card .now-subject` | [`v2-smoke.spec.ts:44`](../../tests/e2e/v2-smoke.spec.ts#L44) |
| Part 1 (Hook) | `Get ready at 2:05 PM, leave by 2:25 PM` | `.now-card #now-title` | [`v2-smoke.spec.ts:45`](../../tests/e2e/v2-smoke.spec.ts#L45) |
| Part 1 (Hook) | `SIMULATED` | `.now-card .card-badge` | [`fallback-walkthrough.spec.ts:103`](../../tests/e2e/fallback-walkthrough.spec.ts#L103) |
| Part 1 (Hook) | `Spatial Context Map` (Desktop) / `Route Map` (Mobile) | `.map-header .section-label` | [`v3-tokens-motion-touch.spec.ts:493,507`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L493) |
| Part 1 (Hook) | `Ask Yori about your day...` / `Ask Yori...` | `#ask-bar .ask-bar-text` | [`v3-tokens-motion-touch.spec.ts:470,503`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L470) |
| Part 1 (Hook) | `Tap to chat` | `#ask-bar .ask-bar-hint` | [`v2-smoke.spec.ts:74`](../../tests/e2e/v2-smoke.spec.ts#L74) |
| Part 2 (D2 Rain) | `What changed: rain forecast` | `.v2-insight-title, .rain-banner` | [`v2a-interaction.spec.ts:120`](../../tests/e2e/v2a-interaction.spec.ts#L120) |
| Part 2 (D2 Rain) | `Umbrella` | `#chip-umbrella` | [`fallback-walkthrough.spec.ts:124`](../../tests/e2e/fallback-walkthrough.spec.ts#L124) |
| Part 2 (D2 Rain) | `Rain forecast · simulated` / `Issued 1:35 PM` | `.v2-map-weather-callout text` | [`v3-tokens-motion-touch.spec.ts:420`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L420) |
| Part 2 (D2 Rain) | `Drive · leave 2:30 PM` | `.v2-option-card:first-child .v2-option-label` | [`v2a-interaction.spec.ts:135`](../../tests/e2e/v2a-interaction.spec.ts#L135) |
| Part 2 (D2 Rain) | `Bus · leave 2:15 PM` | `.v2-option-card:nth-child(2) .v2-option-label` | [`v2a-interaction.spec.ts:140`](../../tests/e2e/v2a-interaction.spec.ts#L140) |
| Part 2 (D2 Rain) | `You usually prefer driving when it rains.` | `.habit-note` | [`fallback-walkthrough.spec.ts:135`](../../tests/e2e/fallback-walkthrough.spec.ts#L135) |
| Part 3 (D3 Away) | `Lunch options near you` | `.v2-candidates-hero .now-subject` | [`v2b-lunch-loop.spec.ts:65`](../../tests/e2e/v2b-lunch-loop.spec.ts#L65) |
| Part 3 (D3 Away) | `Places matching what you like, within walking distance` | `.v2-candidates-hero #now-title` | [`v2b-lunch-loop.spec.ts:68`](../../tests/e2e/v2b-lunch-loop.spec.ts#L68) |
| Part 3 (D3 Away) | `Mock places for this demo; real listings come from a place provider.` | `.mock-places-notice` | [`v2b-lunch-loop.spec.ts:75`](../../tests/e2e/v2b-lunch-loop.spec.ts#L75) |
| Part 3 (D3 Away) | `Details →` | `.v2-view-detail-link` | [`v2b-lunch-loop.spec.ts:85`](../../tests/e2e/v2b-lunch-loop.spec.ts#L85) |
| Part 3 (D4 Busy) | `Nothing needs your attention right now.` | `.quiet-title` | [`fallback-walkthrough.spec.ts:219`](../../tests/e2e/fallback-walkthrough.spec.ts#L219) |
| Part 4 (Why Sheet) | `Why you're seeing this` | `#why-sheet-title` | [`fallback-walkthrough.spec.ts:245`](../../tests/e2e/fallback-walkthrough.spec.ts#L245) |
| Part 4 (Why Sheet) | `Evidence & Signals` / `Memory & Habits` | `.why-section h3` | [`fallback-walkthrough.spec.ts:251-257`](../../tests/e2e/fallback-walkthrough.spec.ts#L251-L257) |
| Part 4 (Why Sheet) | `Demo profile · sample preference` | `.card-badge` in Why Sheet | [`fallback-walkthrough.spec.ts:265`](../../tests/e2e/fallback-walkthrough.spec.ts#L265) |
| Part 4 (Adjust) | `Adjust Departure Timing` | `#adjust-dialog-title` | [`fallback-walkthrough.spec.ts:285`](../../tests/e2e/fallback-walkthrough.spec.ts#L285) |
| Part 5 (Me Tab) | `Me & Memory` | `.me-title` | [`fallback-walkthrough.spec.ts:315`](../../tests/e2e/fallback-walkthrough.spec.ts#L315) |
| Part 5 (Me Tab) | `0 of 3 used today` | `.badge-budget` | [`fallback-walkthrough.spec.ts:320`](../../tests/e2e/fallback-walkthrough.spec.ts#L320) |
| Part 5 (Me Tab) | `No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.` | `#confirmed-facts-list .memory-empty` | [`fallback-walkthrough.spec.ts:325-327`](../../tests/e2e/fallback-walkthrough.spec.ts#L325-L327) |
| Part 5 (Me Tab) | `Remember departure prep & buffer routine?` | `#proposal-prep_buffer_preference` | [`fallback-walkthrough.spec.ts:332`](../../tests/e2e/fallback-walkthrough.spec.ts#L332) |
| Part 5 (Me Tab) | `Confirmed` | `.badge-confirmed` | [`fallback-walkthrough.spec.ts:348`](../../tests/e2e/fallback-walkthrough.spec.ts#L348) |
| Part 5 (Recomputation) | `Get ready at 2:00 PM, leave by 2:25 PM` | `#now-title` (post-confirmation) | [`fallback-walkthrough.spec.ts:361`](../../tests/e2e/fallback-walkthrough.spec.ts#L361) |
| Part 6 (Conversational) | `Ask Yori` | `#conversation-title` | [`v2a-interaction.spec.ts:60`](../../tests/e2e/v2a-interaction.spec.ts#L60) |
| Part 6 (Conversational) | `Offline demo · simulated` | `#conversation-status-badge` | [`v3-tokens-motion-touch.spec.ts:535`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L535) |
| Part 6 (Conversational) | `Offline fallback · deterministic` | `#engine-status-chip` | [`v3-tokens-motion-touch.spec.ts:540`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L540) |
| Part 6 (Conversational) | `Scripted model fixture · not a live model call` | `#engine-status-chip` | [`v3-tokens-motion-touch.spec.ts:546`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L546) |
| Part 7 (Tagline) | `A little ahead. By your side.` | Footer / Readme tagline | [`README.md:3`](../../README.md#L3) |

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence (~138 wpm).
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.
