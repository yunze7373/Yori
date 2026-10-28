# Yori (ヨリ) — 3-Minute Video Demonstration Script

> **Governed by Plan:** `YORI_SUBMIT` (Task `VIDEO-SCRIPT-SYNC`, AC-205-2)  
> **Target Duration:** Exactly 3:00 (180 seconds)  
> **Pacing:** ~138 words per minute (415 spoken words)  
> **Resolution:** 1280×800 Desktop or 390×844 Mobile portrait  
> **Guaranteed Path:** Zero owner credentials; all demo scenes run deterministically with external model off (`MODEL_API_KEY` unset) and mock/recorded fixtures.

---

## Breakdown Timeline Overview

| Section | Time Window | Scene / Screen | Key Focus |
|---|---|---|---|
| **1. Hook & The Calm Philosophy** | `0:00 – 0:25` (25s) | Scene D1: Clear | Proactive, glanceable Living Context; single NOW card. |
| **2. Thinking Ahead & Environmental Adaptation** | `0:25 – 0:50` (25s) | Scene D2: Rain Re-Plan | Dynamic context shifts: umbrella chip & transit ranking by habit. |
| **3. Away Dining & Honest Quiet State** | `0:50 – 1:15` (25s) | Scene D3 & D4: Away / Busy | Taste citations, mock disclosure, and calm quiet state when busy. |
| **4. The Explainable Review Loop** | `1:15 – 1:45` (30s) | Why Sheet & Adjust Dialog | Plain-language reason codes, buffer adjustment, preference proposal. |
| **5. User Sovereignty & The Me Tab** | `1:45 – 2:18` (33s) | Me Page & Sovereign Memory | Confirm-only memory (INV-107), budget meter, recomputed D2 timing. |
| **6. Reasoning Demo (Model Off) & Extensibility** | `2:18 – 2:46` (28s) | Reasoning Demo & Codebase | Multi-candidate deterministic fallback, grocery plugin, zero core diff. |
| **7. Honest Disclosure & Closing** | `2:46 – 3:00` (14s) | App Home / Tagline | Simulated providers disclosure, owner-gated AI keys, tagline. |

---

## Detailed Script & On-Screen Actions

### Part 1: Hook & The Calm Philosophy (`0:00 – 0:25` · 25s)

**[ON SCREEN]**:  
Browser open to `http://127.0.0.1:5173`. Scene D1 (Clear Departure) is selected. Clean, uncluttered UI visible with a warm greeting: *"Good morning. I've been looking ahead for you."* Exactly one NOW card is prominently visible: *"Piano lesson: Get ready at 2:05 PM, leave by 2:25 PM"*. Explicit header chip reads: *"Demo · simulated context"*. Card badge displays: `SIMULATED`.

**[VOICEOVER / NARRATION]**:  
*(0:00)* "Most AI assistants today are either passive chat boxes you have to prompt, or noisy notification feeds that interrupt your day.  
*(0:10)* Meet **Yori**—a calm, proactive context-aware assistant designed to help you plan ahead and act at the right moment.  
*(0:18)* Instead of waiting for prompts, Yori synthesizes your schedule, weather, and transit into a Living Context: at most one actionable NOW card, followed by what's ahead."

---

### Part 2: Thinking Ahead & Environmental Adaptation (`0:25 – 0:50` · 25s)

**[ON SCREEN]**:  
Cursor moves to top-right scenario picker and switches to **Rain Re-Plan (D2)**. The NOW card smoothly updates: banner reads *"What changed: rain forecast"*, an **Umbrella** checklist chip appears (*"Umbrella"*), and two transit options are ranked—Drive first (*"Drive · leave 2:30 PM"*, *"25m drive"*), then Bus (*"Bus · leave 2:15 PM"*, *"40m bus"*), citing a habit preference for rainy days (*"You usually prefer driving when it rains."*).

**[VOICEOVER / NARRATION]**:  
*(0:25)* "Watch what happens when conditions change.  
*(0:29)* A sudden rain forecast arrives for our departure window.  
*(0:33)* Yori adapts proactively: it reminds us to grab an umbrella and re-ranks transit options, placing driving first based on a habit preference for rainy days.  
*(0:43)* Times and buffers are calculated deterministically—no hallucinated departures, no invented delays."

---

### Part 3: Away Dining & Honest Quiet State (`0:50 – 1:15` · 25s)

**[ON SCREEN]**:  
Switch to **Away Lunch (D3)**. Shows NOW card (*"Lunch options near you"*) with curated dining venues within walking distance, citing taste preferences (`Japanese`, `Salad`) with clear mock venue disclosure: *"Mock places for this demo; real listings come from a place provider."* Tap **Why** to show the memory section titled **Memory & Habits** labelled `Demo profile · sample preference`. Then switch to **Busy Lunch (D4)**: the screen gently falls into a quiet state: *"Nothing needs your attention right now."*

**[VOICEOVER / NARRATION]**:  
*(0:50)* "At lunch time, when you're away from home, Yori suggests nearby dining that matches your taste preferences, clearly marked with simulated mock disclosure.  
*(1:01)* But if you're in back-to-back meetings or have already logged lunch?  
*(1:06)* Yori stays completely quiet: *'Nothing needs your attention right now.'* It respects your focus and never creates noise."

---

### Part 4: The Explainable Review Loop (`1:15 – 1:45` · 30s)

**[ON SCREEN]**:  
Return to D2. Tap **Why** button on NOW card. The **Why Sheet** slides up (*"Why you're seeing this"*), showing plain-language evidence lines without technical jargon or raw ISO dates. Scenario signals are clearly labelled `SIMULATED` (*"Weather forecast"*, *"Forecast conditions"*, *"Recorded at 1:35 PM"*), and the memory section is titled **Memory & Habits** with persona facts clearly labelled `Demo profile · sample preference` (*"Rain travel habit"*, *"Buffer before leaving"*, *"Time to get ready"*). Close Why Sheet. Tap **Adjust** button (*"Adjust Departure Timing"*): adjust prep time to 25 min and buffer time to 10 min, select *"Remember as preference"*, and click Save. A pending proposal appears under FOR YOU on the home screen.

**[VOICEOVER / NARRATION]**:  
*(1:15)* "Every suggestion in Yori is fully explainable.  
*(1:19)* Tap 'Why' to see exactly where recommendations came from—citing the scenario's simulated signals and demo-profile sample preferences in plain language.  
*(1:27)* When you adjust a buffer time, you can choose 'For this time only' or 'Remember as preference'.  
*(1:36)* But remembering never silently alters your preferences. It creates a proposal that waits for your explicit confirmation."

---

### Part 5: User Sovereignty & The Me Tab (`1:45 – 2:18` · 33s)

**[ON SCREEN]**:  
Click navigation tab to open **Me** page (`/me`, *"Me & Memory"*). Proactive budget meter shows *"0 of 3 used today"*. Confirmed Preferences list displays the explicit empty state: *"No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own."* Below, the pending proposal appears (*"Preparation buffer habit"*), showing **Confirm** and **Not true** buttons. Tap **Confirm**; the item moves to Confirmed Preferences with a green `Confirmed` badge.  
Return to the Today tab on Scene D2: the NOW card immediately recomputes its departure schedule to *"Get ready at 2:00 PM, leave by 2:25 PM"*. Re-open the Why Sheet: the two adjusted timing facts (*"Buffer before leaving"*, *"Time to get ready"*) now display `Confirmed`, while the rain habit remains `Demo profile · sample preference`. Point out data export/reset and the XMemo Sync section, noting local storage sovereignty.

**[VOICEOVER / NARRATION]**:  
*(1:45)* "Under the 'Me' tab, you have total sovereignty.  
*(1:49)* Yori strictly caps proactive prompts to three per day.  
*(1:53)* Before you confirm anything, your confirmed list is empty—active demo scenes only borrow sample habits from a simulated demo profile.  
*(2:01)* Under Invariant INV-107, pending proposals never enter confirmed memory until you tap 'Confirm'.  
*(2:07)* Once confirmed, returning to Today immediately recalculates departure timing, and the Why Sheet updates to show your preferences as 'Confirmed'.  
*(2:14)* Local storage is sovereign; remote sync remains safely owner-gated."

---

### Part 6: Reasoning Demo (Model Off) & Extensibility (`2:18 – 2:46` · 28s)

**[ON SCREEN]**:  
Return to Today tab. Select **Reasoning demo** scene. Show that even with the external AI model turned off (`MODEL_API_KEY` unset), Yori handles competing candidates deterministically—keeping the time-critical Piano lesson as NOW and placing Lunch in AHEAD. Briefly highlight the terminal showing 261 passing unit tests, 10 golden fixtures, 21 drills, and `git diff --stat f43c6c1d HEAD -- src/core` completely empty. Point to the grocery plugin.

**[VOICEOVER / NARRATION]**:  
*(2:18)* "When multiple intents compete—like an upcoming lesson and a lunch window—Yori works seamlessly even with the external AI model turned off.  
*(2:26)* It deterministically prioritizes time-critical commitments without hallucinating reorders.  
*(2:33)* And our pure domain core is frozen: new intents, like our grocery plugin, plug into the pipeline with zero diffs to core logic. Yori runs 100% reliably offline."

---

### Part 7: Honest Disclosure & Closing (`2:46 – 3:00` · 14s)

**[ON SCREEN]**:  
Return to app home screen. Camera pauses on the clean, calm UI with the tagline visible: *"A little ahead. By your side."*

**[VOICEOVER / NARRATION]**:  
*(2:46)* "To protect privacy in this demo, calendar and location data are simulated mock fixtures. Meta Muse Spark live reasoning and XMemo live sync remain owner-gated.  
*(2:54)* Yori: A calm, proactive assistant. A little ahead. By your side."

---

## Verbatim UI Quotes & E2E Assertion Map

Every on-screen string quoted in this script is verified verbatim against the rendered UI by automated Playwright assertions in [`tests/e2e/fallback-walkthrough.spec.ts`](../../tests/e2e/fallback-walkthrough.spec.ts):

| Script Section | Quoted UI Text | Rendered UI Selector | Test Spec Line Reference |
|---|---|---|---|
| Part 1 (Hook) | `Demo · simulated context` | `.demo-chip` | [`fallback-walkthrough.spec.ts:93`](../../tests/e2e/fallback-walkthrough.spec.ts#L93) |
| Part 1 (Hook) | `Piano lesson` | `.now-card .now-subject` | [`fallback-walkthrough.spec.ts:101`](../../tests/e2e/fallback-walkthrough.spec.ts#L101) |
| Part 1 (Hook) | `Get ready at 2:05 PM, leave by 2:25 PM` | `.now-card #now-title` | [`fallback-walkthrough.spec.ts:102`](../../tests/e2e/fallback-walkthrough.spec.ts#L102) |
| Part 1 (Hook) | `SIMULATED` | `.now-card .card-badge` | [`fallback-walkthrough.spec.ts:103`](../../tests/e2e/fallback-walkthrough.spec.ts#L103) |
| Part 2 (D2 Rain) | `What changed: rain forecast` | `.now-card .rain-banner` | [`fallback-walkthrough.spec.ts:119`](../../tests/e2e/fallback-walkthrough.spec.ts#L119) |
| Part 2 (D2 Rain) | `Umbrella` | `.now-card #chip-umbrella` | [`fallback-walkthrough.spec.ts:124`](../../tests/e2e/fallback-walkthrough.spec.ts#L124) |
| Part 2 (D2 Rain) | `Drive · leave 2:30 PM` / `25m drive` | `.options-grid .option-tile:first-child` | [`fallback-walkthrough.spec.ts:129-130`](../../tests/e2e/fallback-walkthrough.spec.ts#L129-L130) |
| Part 2 (D2 Rain) | `Bus · leave 2:15 PM` / `40m bus` | `.options-grid .option-tile:nth-child(2)` | [`fallback-walkthrough.spec.ts:131-132`](../../tests/e2e/fallback-walkthrough.spec.ts#L131-L132) |
| Part 2 (D2 Rain) | `You usually prefer driving when it rains.` | `.now-card .habit-note` | [`fallback-walkthrough.spec.ts:135`](../../tests/e2e/fallback-walkthrough.spec.ts#L135) |
| Part 3 (D3 Away) | `Lunch options near you` | `.now-card .now-subject` | [`fallback-walkthrough.spec.ts:169`](../../tests/e2e/fallback-walkthrough.spec.ts#L169) |
| Part 3 (D3 Away) | `Mock places for this demo; real listings come from a place provider.` | `.now-card .mock-places-notice` | [`fallback-walkthrough.spec.ts:171-173`](../../tests/e2e/fallback-walkthrough.spec.ts#L171-L173) |
| Part 3 (D3 Away) | `Memory & Habits` / `Demo profile · sample preference` | `.why-section` | [`fallback-walkthrough.spec.ts:181-185`](../../tests/e2e/fallback-walkthrough.spec.ts#L181-L185) |
| Part 3 (D4 Busy) | `Nothing needs your attention right now.` | `.quiet-title` | [`fallback-walkthrough.spec.ts:219`](../../tests/e2e/fallback-walkthrough.spec.ts#L219) |
| Part 4 (Why Sheet) | `Why you're seeing this` | `#why-sheet-title` | [`fallback-walkthrough.spec.ts:245`](../../tests/e2e/fallback-walkthrough.spec.ts#L245) |
| Part 4 (Why Sheet) | `Weather forecast` / `Recorded at 1:35 PM` / `SIMULATED` | `.why-section:has-text("Evidence & Signals")` | [`fallback-walkthrough.spec.ts:251-254`](../../tests/e2e/fallback-walkthrough.spec.ts#L251-L254) |
| Part 4 (Why Sheet) | `Memory & Habits` / `Demo profile · sample preference` | `.why-section:has-text("Memory & Habits")` | [`fallback-walkthrough.spec.ts:257-265`](../../tests/e2e/fallback-walkthrough.spec.ts#L257-L265) |
| Part 4 (Adjust) | `Adjust Departure Timing` | `#adjust-dialog-title` | [`fallback-walkthrough.spec.ts:285`](../../tests/e2e/fallback-walkthrough.spec.ts#L285) |
| Part 5 (Me Tab) | `Me & Memory` | `.me-title` | [`fallback-walkthrough.spec.ts:315`](../../tests/e2e/fallback-walkthrough.spec.ts#L315) |
| Part 5 (Me Tab) | `0 of 3 used today` | `.badge-budget` | [`fallback-walkthrough.spec.ts:320`](../../tests/e2e/fallback-walkthrough.spec.ts#L320) |
| Part 5 (Me Tab) | `No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.` | `#confirmed-facts-list .memory-empty` | [`fallback-walkthrough.spec.ts:325-327`](../../tests/e2e/fallback-walkthrough.spec.ts#L325-L327) |
| Part 5 (Me Tab) | `Preparation buffer habit` | `#proposal-prep_buffer_preference` | [`fallback-walkthrough.spec.ts:332`](../../tests/e2e/fallback-walkthrough.spec.ts#L332) |
| Part 5 (Me Tab) | `Confirmed` | `#fact-prep_buffer_preference` | [`fallback-walkthrough.spec.ts:348`](../../tests/e2e/fallback-walkthrough.spec.ts#L348) |
| Part 5 (Recomputation) | `Get ready at 2:00 PM, leave by 2:25 PM` | `#now-title` (Scene D2 post-confirm) | [`fallback-walkthrough.spec.ts:361`](../../tests/e2e/fallback-walkthrough.spec.ts#L361) |
| Part 5 (Recomputation) | `Buffer before leaving` / `Time to get ready` (`Confirmed`) | `.why-section .badge-confirmed` | [`fallback-walkthrough.spec.ts:369-371`](../../tests/e2e/fallback-walkthrough.spec.ts#L369-L371) |
| Part 5 (Recomputation) | `Rain travel habit` (`Demo profile · sample preference`) | `.why-section .card-badge` | [`fallback-walkthrough.spec.ts:374-376`](../../tests/e2e/fallback-walkthrough.spec.ts#L374-L376) |

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence (~138 wpm).
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.
