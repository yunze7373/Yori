# Yori (ヨリ) — 3-Minute Video Demonstration Script

> **Governed by Plan:** `YORI_SUBMIT` (Task `FALLBACK-VERIFY`, AC-205-2)  
> **Target Duration:** Exactly 3:00 (180 seconds)  
> **Pacing:** ~140 words per minute (~420 spoken words)  
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
| **5. User Sovereignty & The Me Tab** | `1:45 – 2:15` (30s) | Me Page & Sovereign Memory | Confirm-only memory (INV-107), budget meter, local truth source. |
| **6. Reasoning Demo (Model Off) & Extensibility** | `2:15 – 2:45` (30s) | Reasoning Demo & Codebase | Multi-candidate deterministic fallback, grocery plugin, zero core diff. |
| **7. Honest Disclosure & Closing** | `2:45 – 3:00` (15s) | App Home / Tagline | Simulated providers disclosure, owner-gated AI keys, tagline. |

---

## Detailed Script & On-Screen Actions

### Part 1: Hook & The Calm Philosophy (`0:00 – 0:25` · 25s)

**[ON SCREEN]**:  
Browser open to `http://127.0.0.1:5173`. Scene D1 (Clear Departure) is selected. Clean, uncluttered UI visible with a warm greeting: *"Good morning. I've been looking ahead for you."* Exactly one NOW card is prominently visible: *"Piano lesson: Get ready at 2:05 PM, leave by 2:25 PM"*. Explicit header chip reads: *"Demo · simulated context"*.

**[VOICEOVER / NARRATION]**:  
*(0:00)* "Most AI assistants today are either passive chat boxes you have to prompt, or noisy notification feeds that interrupt your day.  
*(0:10)* Meet **Yori**—a calm, proactive context-aware assistant designed to help you plan ahead and act at the right moment.  
*(0:18)* Instead of waiting for prompts, Yori synthesizes your schedule, weather, and transit into a Living Context: at most one actionable NOW card, followed by what's ahead."

---

### Part 2: Thinking Ahead & Environmental Adaptation (`0:25 – 0:50` · 25s)

**[ON SCREEN]**:  
Cursor moves to top-right scenario picker and switches to **Rain Re-Plan (D2)**. The NOW card smoothly updates: an **Umbrella** checklist chip appears (*"Grab umbrella · rain in forecast"*), and two transit options are ranked—Drive first at 2:30 PM, then Bus at 2:15 PM, citing your confirmed rainy-day preference.

**[VOICEOVER / NARRATION]**:  
*(0:25)* "Watch what happens when conditions change.  
*(0:29)* A sudden rain forecast arrives for our departure window.  
*(0:33)* Yori adapts proactively: it reminds us to grab an umbrella and re-ranks transit options, placing driving first based on our confirmed habit for rainy days.  
*(0:43)* Times and buffers are calculated deterministically—no hallucinated departures, no invented delays."

---

### Part 3: Away Dining & Honest Quiet State (`0:50 – 1:15` · 25s)

**[ON SCREEN]**:  
Switch to **Away Lunch (D3)**. Shows NOW card with curated dining venues within walking distance, citing confirmed tastes (`Japanese`, `Salad`) with clear mock venue disclosure. Then switch to **Busy Lunch (D4)**: the screen gently falls into a quiet state: *"Nothing needs your attention right now."*

**[VOICEOVER / NARRATION]**:  
*(0:50)* "At lunch time, when you're away from home, Yori suggests nearby dining that matches your confirmed tastes, clearly marked with simulated mock disclosure.  
*(1:01)* But if you're in back-to-back meetings or have already logged lunch?  
*(1:06)* Yori stays completely quiet: *'Nothing needs your attention right now.'* It respects your focus and never creates noise."

---

### Part 4: The Explainable Review Loop (`1:15 – 1:45` · 30s)

**[ON SCREEN]**:  
Return to D2. Tap **Why** button on NOW card. The **Why Sheet** slides up, showing plain-language evidence lines without technical jargon or raw ISO dates. Close Why Sheet. Tap **Adjust** button: adjust buffer minutes by +5 min, select *"Remember as preference"*, and click Save.

**[VOICEOVER / NARRATION]**:  
*(1:15)* "Every suggestion in Yori is fully explainable.  
*(1:19)* Tap 'Why' to see exactly where recommendations came from—citing real snapshot signals and habits in plain language.  
*(1:27)* When you adjust a buffer time, you can choose 'For this time only' or 'Remember as preference'.  
*(1:36)* But remembering never silently alters your preferences. It creates a proposal that waits for your explicit confirmation."

---

### Part 5: User Sovereignty & The Me Tab (`1:45 – 2:15` · 30s)

**[ON SCREEN]**:  
Click navigation tab to open **Me** page (`/me`). Show proactive budget meter: *"0 of 3 used today"*. Show Confirmed Preferences list. Show the new Pending Proposal with **Confirm** and **Not true** buttons. Tap **Confirm**; fact moves to Confirmed list. Show data export/reset. Point out the XMemo Sync section, noting that local storage is the sovereign source of truth while remote sync remains safely owner-gated.

**[VOICEOVER / NARRATION]**:  
*(1:45)* "Under the 'Me' tab, you have total sovereignty.  
*(1:49)* Yori strictly caps proactive prompts to three per day.  
*(1:54)* Under Invariant INV-107, pending proposals never enter confirmed memory or leave your device until you tap 'Confirm'.  
*(2:03)* Local storage is the absolute source of truth. Remote cloud synchronization via XMemo is architected behind an owner consent gate and remains disabled until authorized."

---

### Part 6: Reasoning Demo (Model Off) & Extensibility (`2:15 – 2:45` · 30s)

**[ON SCREEN]**:  
Return to Today tab. Select **Reasoning demo** scene. Show that even with the external AI model turned off (`MODEL_API_KEY` unset), Yori handles competing candidates deterministically—keeping the time-critical Piano lesson as NOW and placing Lunch in AHEAD. Briefly highlight the terminal showing 261 passing unit tests, 10 golden fixtures, 21 drills, and `git diff --stat f43c6c1d HEAD -- src/core` completely empty. Point to the grocery plugin.

**[VOICEOVER / NARRATION]**:  
*(2:15)* "When multiple intents compete—like an upcoming lesson and a lunch window—Yori works seamlessly even with the external AI model turned off.  
*(2:24)* It deterministically prioritizes time-critical commitments without hallucinating reorders.  
*(2:31)* And our pure domain core is frozen: new intents, like our grocery plugin, plug into the pipeline with zero diffs to core logic. Yori runs 100% reliably offline."

---

### Part 7: Honest Disclosure & Closing (`2:45 – 3:00` · 15s)

**[ON SCREEN]**:  
Return to app home screen. Camera pauses on the clean, calm UI with the tagline visible: *"A little ahead. By your side."*

**[VOICEOVER / NARRATION]**:  
*(2:45)* "To protect privacy in this demo, calendar and location data are simulated mock fixtures. Meta Muse Spark live reasoning and XMemo live sync remain owner-gated.  
*(2:54)* Yori: A calm, proactive assistant. A little ahead. By your side."

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence.
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence.
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.
