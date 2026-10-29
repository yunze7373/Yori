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
| **6. Conversational Shell & Reasoning Demo** | `2:18 – 2:46` (28s) | Ask Yori & Reasoning Scene | Offline conversational shell, scripted fixture execution, deterministic multi-candidate fallback, 454 unit tests, zero core diff. |
| **7. Honest Disclosure & Closing** | `2:46 – 3:00` (14s) | App Home / Tagline | Exact integration status per `SUBMISSION_READINESS.md`, spoken tagline. |

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
Cursor moves to top-right scenario picker and switches to **Rain Re-Plan (D2)**. The NOW card smoothly updates: alert banner reads *"What changed: rain forecast"*, an **Umbrella** checklist chip appears (*"Umbrella"*), and the Route Map displays an organic weather callout: *"Rain forecast · simulated"* (*"Issued 1:35 PM"*). Two transit options are ranked: Drive first (*"Drive · leave 2:30 PM"*, badge *"Recommended"*, *"25 min drive + 5m margin"*, ranked by habit: *"Ranked by habit: Rain travel habit (Demo profile · sample)"*), then Bus (*"Bus · leave 2:15 PM"*, badge *"Alternative"*, *"40 min bus + 5m margin"*). Habit note cites: *"You usually prefer driving when it rains."*.

**[VOICEOVER / NARRATION]**:  
*(0:25)* "Watch what happens when conditions change.  
*(0:29)* A sudden rain forecast arrives for our departure window.  
*(0:33)* Yori adapts proactively: it reminds us to grab an umbrella, illustrates the weather on our route map, and re-ranks transit options—placing driving first based on our rainy-day habit.  
*(0:43)* Times and buffers are calculated deterministically—no hallucinated departures, no invented delays."

---

### Part 3: Away Dining & Honest Quiet State (`0:50 – 1:15` · 25s)

**[ON SCREEN]**:  
Switch to **Away Lunch (D3)**. Shows Candidates Hero (*"Lunch options near you"*, *"Places matching what you like, within walking distance"*) with curated dining venues matching taste preferences (`Japanese`, `Salad`), featuring local labelled SVG illustrations (rendered truthful names: *"Demo Place A · Ramen"*, *"Demo Place B · Salad"*, *"Demo Place C · Sushi"*) with clear mock venue disclosure: *"Mock places for this demo; real listings come from a place provider."* Tap **Why** to show the memory section titled **Memory & Habits** labelled `Demo profile · sample preference`. Then switch to **Busy Lunch (D4)**: the screen gently falls into a quiet state: *"Nothing needs your attention right now."* (*"You're all caught up. We'll let you know when something comes up."*).

**[VOICEOVER / NARRATION]**:  
*(0:50)* "At lunch time, when you're away from home, Yori suggests nearby dining that matches your taste preferences, illustrated with local artwork and clear mock disclosure.  
*(1:01)* But if you're in back-to-back meetings or have already logged lunch?  
*(1:06)* Yori stays completely quiet: *'Nothing needs your attention right now.'* It respects your focus and never creates noise."

---

### Part 4: The Explainable Review Loop (`1:15 – 1:45` · 30s)

**[ON SCREEN]**:  
Return to D2. Tap **Why** button on NOW card. The **Why Sheet** slides up (*"Why you're seeing this"*), showing plain-language evidence lines without technical jargon or raw ISO dates. Scenario signals are clearly labelled `SIMULATED` (*"Weather forecast"*, *"Forecast conditions"*, *"Recorded at 1:35 PM"*), and the memory section is titled **Memory & Habits** with persona facts clearly labelled `Demo profile · sample preference` (*"Rain travel habit"*, *"Buffer before leaving"*, *"Time to get ready"*). Close Why Sheet. Tap **Adjust** button (*"Adjust Departure Timing"*): adjust prep time to 25 min and buffer time to 10 min, select *"Remember as preference"*, and click Save. A pending proposal appears under the **For You** tab (*"Remember departure prep & buffer routine?"*).

**[VOICEOVER / NARRATION]**:  
*(1:15)* "Every suggestion in Yori is fully explainable.  
*(1:19)* Tap 'Why' to see exactly where recommendations came from—citing the scenario's simulated signals and demo-profile sample preferences in plain language.  
*(1:27)* When you adjust a buffer time, you can choose 'For this time only' or 'Remember as preference'.  
*(1:36)* But remembering never silently alters your preferences. It creates a proposal that waits for your explicit confirmation."

---

### Part 5: User Sovereignty & The Me Tab (`1:45 – 2:18` · 33s)

**[ON SCREEN]**:  
Navigate to the **For You** tab (`#tab-for-you` / `#desktop-nav-for-you`) to view the pending proposal card (*"Remember departure prep & buffer routine?"*). Then open the **Me** tab (`#tab-me` / `#desktop-nav-me`, *"Me & Memory"*). Proactive budget meter shows *"0 of 3 used today"*. Confirmed Preferences list displays the explicit empty state: *"No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own."* Below, the pending proposal appears titled *"Preparation buffer habit"*, showing **Confirm** and **Not true** buttons. Tap **Confirm**; the item moves to Confirmed Preferences with a green `Confirmed` badge.  
Return to the Home tab on Scene D2: the NOW card immediately recomputes its departure schedule to *"Get ready at 2:00 PM, leave by 2:25 PM"*. Re-open the Why Sheet: the two adjusted timing facts (*"Buffer before leaving"*, *"Time to get ready"*) now display `Confirmed`, while the rain habit remains `Demo profile · sample preference`. Point out data export/reset and the XMemo Sync section, noting local storage sovereignty.

**[VOICEOVER / NARRATION]**:  
*(1:45)* "Under the 'Me' tab, you have total sovereignty.  
*(1:49)* Yori strictly caps proactive prompts to three per day.  
*(1:53)* Before you confirm anything, your confirmed list is empty—active demo scenes only borrow sample habits from a simulated demo profile.  
*(2:01)* Under Invariant INV-107, pending proposals never enter confirmed memory until you tap 'Confirm'.  
*(2:07)* Once confirmed, returning to Home immediately recalculates departure timing, and the Why Sheet updates to show your preferences as 'Confirmed'.  
*(2:14)* Local storage is sovereign; remote sync remains safely owner-gated."

---

### Part 6: Conversational Shell & Reasoning Demo (`2:18 – 2:46` · 28s)

**[ON SCREEN]**:  
Return to Today tab. Tap docked Ask Bar: full-page conversation overlay opens with title *"Ask Yori"*, status badge *"Offline demo · simulated"*, and engine status chip *"Offline fallback · deterministic"*. Type conversational query: *"Can I leave later?"* and tap send. Model interpreter executes the scripted model fixture command and status chip updates to *"Scripted model fixture · not a live model call"*. Close conversation overlay. Select **Reasoning demo** scene: show that even with external AI model turned off (`MODEL_API_KEY` unset), Yori handles competing candidates deterministically—keeping the time-critical Piano lesson as NOW and placing Lunch in AHEAD. Briefly highlight the terminal showing 454 passing unit tests, 18 golden fixtures, 53 drills, 128 Playwright e2e tests across the full suite, and `git diff --stat f43c6c1d HEAD -- src/core` completely empty.

**[VOICEOVER / NARRATION]**:  
*(2:18)* "Whenever you want to chat, the Ask Yori conversation shell opens instantly.  
*(2:23)* You can ask natural questions like 'Can I leave later?'—running on deterministic fixtures with transparent engine disclosure.  
*(2:30)* When multiple intents compete, Yori prioritizes time-critical commitments deterministically.  
*(2:36)* Backed by 454 unit tests, 18 goldens, 53 drills, and 128 Playwright e2e tests, our pure domain core is completely frozen with zero diffs."

---

### Part 7: Honest Disclosure & Closing (`2:46 – 3:00` · 14s)

**[ON SCREEN]**:  
Return to app home screen. Camera pauses on the clean, calm UI.

**[VOICEOVER / NARRATION]**:  
*(2:46)* "To protect privacy in this demo, calendar and location data are simulated mock fixtures. Meta Muse Spark live reasoning, XMemo live sync, and live weather remain owner-gated.  
*(2:54)* Yori: A calm, proactive assistant. A little ahead. By your side."

---

## Verbatim UI Quotes & E2E Assertion Map

Every on-screen string and step sequence quoted in this script is verified verbatim against the rendered UI by automated Playwright assertions across our test suite under `/?ui=v2`:

| Script Section | Quoted UI Text | Rendered UI Selector | Test Spec Reference |
|---|---|---|---|
| Part 1 (Hook) | `Demo · simulated context` | `.demo-chip` | [`v2-smoke.spec.ts:601`](../../tests/e2e/v2-smoke.spec.ts#L601) |
| Part 1 (Hook) | `V2 Preview` | `#badge-ui-version` | [`v2-smoke.spec.ts:602`](../../tests/e2e/v2-smoke.spec.ts#L602) |
| Part 1 (Hook) | `Piano lesson at 3:00 PM` | `.now-card .now-subject` | [`v2-smoke.spec.ts:603`](../../tests/e2e/v2-smoke.spec.ts#L603) |
| Part 1 (Hook) | `Get ready at 2:05 PM, leave by 2:25 PM` | `.now-card #now-title` | [`v2-smoke.spec.ts:604`](../../tests/e2e/v2-smoke.spec.ts#L604) |
| Part 1 (Hook) | `SIMULATED` | `.now-card .card-badge` | [`v2-smoke.spec.ts:605`](../../tests/e2e/v2-smoke.spec.ts#L605) |
| Part 1 (Hook) | `Spatial Context Map` (Desktop) / `Route Map` (Mobile) | `.map-header .section-label` | [`v3-tokens-motion-touch.spec.ts:493,507`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L493) |
| Part 1 (Hook) | `Ask Yori about your day...` / `Ask Yori...` | `#ask-bar .ask-bar-text` | [`v3-tokens-motion-touch.spec.ts:470,503`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L470) |
| Part 1 (Hook) | `Tap to chat` | `#ask-bar .ask-bar-hint` | [`v2-smoke.spec.ts:606`](../../tests/e2e/v2-smoke.spec.ts#L606) |
| Part 2 (D2 Rain) | `What changed: rain forecast` | `.v2-insight-title, .rain-banner` | [`v2-smoke.spec.ts:612`](../../tests/e2e/v2-smoke.spec.ts#L612) / [`v2a-interaction.spec.ts:120`](../../tests/e2e/v2a-interaction.spec.ts#L120) |
| Part 2 (D2 Rain) | `Umbrella` | `#chip-umbrella` | [`v2-smoke.spec.ts:613`](../../tests/e2e/v2-smoke.spec.ts#L613) |
| Part 2 (D2 Rain) | `Rain forecast · simulated` / `Issued 1:35 PM` | `.v2-map-weather-callout text` | [`v2-smoke.spec.ts:614-615`](../../tests/e2e/v2-smoke.spec.ts#L614-L615) / [`v3-tokens-motion-touch.spec.ts:420`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L420) |
| Part 2 (D2 Rain) | `Drive · leave 2:30 PM` | `.v2-option-card:first-child .v2-option-label` | [`v2-smoke.spec.ts:621`](../../tests/e2e/v2-smoke.spec.ts#L621) / [`v2a-interaction.spec.ts:40`](../../tests/e2e/v2a-interaction.spec.ts#L40) |
| Part 2 (D2 Rain) | `Recommended` | `.v2-option-card:first-child .v2-option-badge` | [`v2-smoke.spec.ts:622`](../../tests/e2e/v2-smoke.spec.ts#L622) / [`v2a-interaction.spec.ts:41`](../../tests/e2e/v2a-interaction.spec.ts#L41) |
| Part 2 (D2 Rain) | `25 min drive + 5m margin` | `.v2-option-card:first-child .v2-option-meta` | [`v2-smoke.spec.ts:623`](../../tests/e2e/v2-smoke.spec.ts#L623) / [`v2a-interaction.spec.ts:42`](../../tests/e2e/v2a-interaction.spec.ts#L42) |
| Part 2 (D2 Rain) | `Ranked by habit: Rain travel habit (Demo profile · sample)` | `.v2-option-card:first-child .v2-option-basis` | [`v2-smoke.spec.ts:624-626`](../../tests/e2e/v2-smoke.spec.ts#L624-L626) / [`v2a-interaction.spec.ts:43-45`](../../tests/e2e/v2a-interaction.spec.ts#L43-L45) |
| Part 2 (D2 Rain) | `Bus · leave 2:15 PM` | `.v2-option-card:nth-child(2) .v2-option-label` | [`v2-smoke.spec.ts:629`](../../tests/e2e/v2-smoke.spec.ts#L629) / [`v2a-interaction.spec.ts:48`](../../tests/e2e/v2a-interaction.spec.ts#L48) |
| Part 2 (D2 Rain) | `Alternative` | `.v2-option-card:nth-child(2) .v2-option-badge` | [`v2-smoke.spec.ts:630`](../../tests/e2e/v2-smoke.spec.ts#L630) / [`v2a-interaction.spec.ts:49`](../../tests/e2e/v2a-interaction.spec.ts#L49) |
| Part 2 (D2 Rain) | `40 min bus + 5m margin` | `.v2-option-card:nth-child(2) .v2-option-meta` | [`v2-smoke.spec.ts:631`](../../tests/e2e/v2-smoke.spec.ts#L631) / [`v2a-interaction.spec.ts:50`](../../tests/e2e/v2a-interaction.spec.ts#L50) |
| Part 2 (D2 Rain) | `You usually prefer driving when it rains.` | `.habit-note` | [`v2-smoke.spec.ts:632`](../../tests/e2e/v2-smoke.spec.ts#L632) |
| Part 3 (D3 Away) | `Lunch options near you` | `.v2-candidates-hero .now-subject` | [`v2-smoke.spec.ts:638`](../../tests/e2e/v2-smoke.spec.ts#L638) / [`v2b-lunch-loop.spec.ts:65`](../../tests/e2e/v2b-lunch-loop.spec.ts#L65) |
| Part 3 (D3 Away) | `Places matching what you like, within walking distance` | `.v2-candidates-hero #now-title` | [`v2-smoke.spec.ts:639-641`](../../tests/e2e/v2-smoke.spec.ts#L639-L641) / [`v2b-lunch-loop.spec.ts:68`](../../tests/e2e/v2b-lunch-loop.spec.ts#L68) |
| Part 3 (D3 Away) | `Mock places for this demo; real listings come from a place provider.` | `.mock-places-notice` | [`v2-smoke.spec.ts:642-644`](../../tests/e2e/v2-smoke.spec.ts#L642-L644) / [`v2b-lunch-loop.spec.ts:75`](../../tests/e2e/v2b-lunch-loop.spec.ts#L75) |
| Part 3 (D3 Away) | `Details →` | `.v2-view-detail-link` | [`v2-smoke.spec.ts:645`](../../tests/e2e/v2-smoke.spec.ts#L645) / [`v2b-lunch-loop.spec.ts:85`](../../tests/e2e/v2b-lunch-loop.spec.ts#L85) |
| Part 3 (D3 Away) | `Demo Place A · Ramen` / `Demo Place B · Salad` / `Demo Place C · Sushi` | `.v2-candidate-card` | [`v2-smoke.spec.ts:649-651`](../../tests/e2e/v2-smoke.spec.ts#L649-L651) |
| Part 3 (D4 Busy) | `Nothing needs your attention right now.` | `.quiet-title` | [`v2-smoke.spec.ts:656`](../../tests/e2e/v2-smoke.spec.ts#L656) |
| Part 4 (Why Sheet) | `Why you're seeing this` | `#why-sheet-title` | [`v2-smoke.spec.ts:663`](../../tests/e2e/v2-smoke.spec.ts#L663) |
| Part 4 (Why Sheet) | `Evidence & Signals` / `Memory & Habits` | `.why-section h3` | [`v2-smoke.spec.ts:664-665`](../../tests/e2e/v2-smoke.spec.ts#L664-L665) |
| Part 4 (Why Sheet) | `Demo profile · sample preference` | `.card-badge` in Why Sheet | [`v2-smoke.spec.ts:666-668`](../../tests/e2e/v2-smoke.spec.ts#L666-L668) |
| Part 4 (Adjust) | `Adjust Departure Timing` | `#adjust-dialog-title` | [`v2-smoke.spec.ts:674`](../../tests/e2e/v2-smoke.spec.ts#L674) |
| Part 5 (For You) | `Remember departure prep & buffer routine?` | `.v2-for-you-view .v2-proposal-title` | [`v2-smoke.spec.ts:684-686`](../../tests/e2e/v2-smoke.spec.ts#L684-L686) |
| Part 5 (Me Tab) | `Me & Memory` | `.me-title` | [`v2-smoke.spec.ts:690`](../../tests/e2e/v2-smoke.spec.ts#L690) |
| Part 5 (Me Tab) | `0 of 3 used today` | `.badge-budget` | [`v2-smoke.spec.ts:691`](../../tests/e2e/v2-smoke.spec.ts#L691) |
| Part 5 (Me Tab) | `No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.` | `#confirmed-facts-list .memory-empty` | [`v2-smoke.spec.ts:692-694`](../../tests/e2e/v2-smoke.spec.ts#L692-L694) |
| Part 5 (Me Tab) | `Preparation buffer habit` | `#proposal-prep_buffer_preference .memory-key` | [`v2-smoke.spec.ts:698`](../../tests/e2e/v2-smoke.spec.ts#L698) |
| Part 5 (Me Tab) | `Confirmed` | `.badge-confirmed` | [`v2-smoke.spec.ts:706`](../../tests/e2e/v2-smoke.spec.ts#L706) |
| Part 5 (Recomputation) | `Get ready at 2:00 PM, leave by 2:25 PM` | `#now-title` (post-confirmation) | [`v2-smoke.spec.ts:711`](../../tests/e2e/v2-smoke.spec.ts#L711) |
| Part 6 (Conversational) | `Ask Yori` | `#conversation-title` | [`v2-smoke.spec.ts:724`](../../tests/e2e/v2-smoke.spec.ts#L724) / [`v2a-interaction.spec.ts:60`](../../tests/e2e/v2a-interaction.spec.ts#L60) |
| Part 6 (Conversational) | `Offline demo · simulated` | `#conversation-status-badge` | [`v2-smoke.spec.ts:725`](../../tests/e2e/v2-smoke.spec.ts#L725) / [`v3-tokens-motion-touch.spec.ts:535`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L535) |
| Part 6 (Conversational) | `Offline fallback · deterministic` | `#engine-status-chip` | [`v2-smoke.spec.ts:726`](../../tests/e2e/v2-smoke.spec.ts#L726) / [`v3-tokens-motion-touch.spec.ts:540`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L540) |
| Part 6 (Conversational) | `Scripted model fixture · not a live model call` | `#engine-status-chip` | [`v2-smoke.spec.ts:730-732`](../../tests/e2e/v2-smoke.spec.ts#L730-L732) / [`v3-tokens-motion-touch.spec.ts:546`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L546) |

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence (~138 wpm).
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.
