# Yori (ヨリ) — 3-Minute Video Demonstration Script

> **Governed by Plan:** `yori_ph002_001` (Slice PH-002 E2, AC-205-2)  
> **Target Duration:** Exactly 3:00 (180 seconds)  
> **Pacing:** ~140 words per minute (~420 spoken words)  
> **Resolution:** 1280×800 Desktop or 390×844 Mobile portrait  

---

## Breakdown Timeline Overview

| Section | Time Window | Scene / Screen | Key Focus |
|---|---|---|---|
| **1. Hook & The Calm Philosophy** | `0:00 – 0:25` (25s) | Scene D1: Clear | Proactive, glanceable Living Context; single NOW card. |
| **2. Thinking Ahead & Environmental Adaptation** | `0:25 – 0:55` (30s) | Scene D2: Rain Re-Plan | Dynamic context shifts: umbrella chip & transit ranking by habit. |
| **3. Away Dining & Honest Quiet State** | `0:55 – 1:25` (30s) | Scene D3 & D4: Away/Busy | Taste memory citations, mock disclosure, and quiet calm when busy. |
| **4. The Explainable Review Loop** | `1:25 – 1:55` (30s) | Why Sheet & Adjust Dialog | Plain-language reason codes, buffer adjustment, preference proposal. |
| **5. User Sovereignty & The Me Tab** | `1:55 – 2:25` (30s) | Me Page & Storage | Confirm-only memory (INV-107), budget meter, XMemo sync status. |
| **6. Architecture & Extensibility Proof** | `2:25 – 2:45` (20s) | Grocery Plugin / Code | Zero-core-diff extensibility, pure domain core, degradation drills. |
| **7. Honest Disclosure & Closing** | `2:45 – 3:00` (15s) | Navigation / Terminal | Simulated providers disclosure, owner-gated AI keys, tagline. |

---

## Detailed Script & On-Screen Actions

### Part 1: Hook & The Calm Philosophy (`0:00 – 0:25` · 25s)

**[ON SCREEN]**:  
Browser open to `http://127.0.0.1:5173`. Scene D1 (Clear Departure) is selected. Clean, uncluttered UI visible with a warm greeting: *"Good morning. I've been looking ahead for you."* Exactly one NOW card is prominently visible: *"Piano lesson: Get ready at 2:05 PM, leave by 2:25 PM"*.

**[VOICEOVER / NARRATION]**:  
*(0:00)* "Most AI assistants today are either passive chat boxes you have to prompt, or noisy notification feeds that interrupt your day.  
*(0:10)* Meet **Yori**—a calm, proactive context-aware assistant designed to help you plan ahead and act at the right moment.  
*(0:18)* Instead of waiting for prompts, Yori synthesizes your schedule, weather, and transit into a Living Context: at most one actionable NOW card, followed by what's ahead."

---

### Part 2: Thinking Ahead & Environmental Adaptation (`0:25 – 0:55` · 30s)

**[ON SCREEN]**:  
Cursor moves to top-right scenario picker and switches to **Rain Re-Plan (D2)**. The NOW card smoothly updates: an **Umbrella** checklist chip appears, and two transit options are ranked—Drive first at 2:30 PM, then Bus at 2:15 PM.

**[VOICEOVER / NARRATION]**:  
*(0:25)* "Watch what happens when conditions change.  
*(0:29)* A sudden rain forecast arrives for our departure window.  
*(0:33)* Yori adapts proactively: it reminds us to grab an umbrella and re-ranks transit options, placing driving first based on our confirmed habit for rainy days.  
*(0:44)* Times and buffers are calculated deterministically—no hallucinated departures, no invented delays."

---

### Part 3: Away Dining & Honest Quiet State (`0:55 – 1:25` · 30s)

**[ON SCREEN]**:  
Switch to **Away Lunch (D3)**. Shows NOW card with 3 curated dining venues within walking distance. Explicit chip: *"Demo · simulated context"*. Then switch to **Busy Lunch (D4)**: the screen gently falls into a quiet state: *"Nothing needs your attention right now."*

**[VOICEOVER / NARRATION]**:  
*(0:55)* "At lunch time, when you're away from home, Yori suggests nearby dining that matches your confirmed tastes, clearly marked with simulated mock disclosure.  
*(1:07)* But if you're in back-to-back meetings or have already logged lunch?  
*(1:13)* Yori stays completely quiet: *'Nothing needs your attention right now.'*  
*(1:18)* It respects your peace of mind and never generates noise just because it can."

---

### Part 4: The Explainable Review Loop (`1:25 – 1:55` · 30s)

**[ON SCREEN]**:  
Return to D2. Tap **Why** button on NOW card. The **Why Sheet** slides up, showing plain-language evidence lines without technical jargon. Tap **Adjust** button: adjust buffer minutes by +5 min, select *"Remember as preference"*, and click Save.

**[VOICEOVER / NARRATION]**:  
*(1:25)* "Every suggestion in Yori is fully explainable.  
*(1:29)* Tap 'Why' to see exactly where times and recommendations came from—citing real snapshot signals and habits in plain language.  
*(1:38)* When you adjust a buffer time, you can choose 'For this time only' or 'Remember as preference'.  
*(1:46)* But remembering never silently alters your preferences. It creates a proposal that waits for your explicit confirmation."

---

### Part 5: User Sovereignty & The Me Tab (`1:55 – 2:25` · 30s)

**[ON SCREEN]**:  
Click navigation tab to open **Me** page (`/me`). Show proactive budget meter: *"0 of 3 used today"*. Show Confirmed Preferences list. Show the new Pending Proposal with **Confirm** and **Not true** buttons. Tap **Confirm**; fact moves to Confirmed list. Scroll down to show data export/reset and the XMemo Sync status card.

**[VOICEOVER / NARRATION]**:  
*(1:55)* "Under the 'Me' tab, you have total sovereignty.  
*(1:59)* Yori strictly caps daily proactive prompts to three per day.  
*(2:04)* Under Invariant INV-107, pending proposals never enter confirmed memory or leave your device until you tap 'Confirm'.  
*(2:13)* Our XMemo cloud memory port syncs confirmed facts securely via OAuth 2.0 PKCE, with zero tokens stored in browser storage."

---

### Part 6: Architecture & Extensibility Proof (`2:25 – 2:45` · 20s)

**[ON SCREEN]**:  
Briefly show terminal with passing verification suite: 231 unit tests, 10 golden scenarios, 21 drills, 38 e2e tests. Highlight `git diff --stat f43c6c1d HEAD -- src/core` (0 files changed, 100% empty). Highlight the grocery-stub plugin in the codebase.

**[VOICEOVER / NARRATION]**:  
*(2:25)* "Under the hood, Yori's pure domain core is frozen and mathematically deterministic.  
*(2:31)* New intents—like our grocery errand plugin—plug into the pipeline with zero diffs to core logic.  
*(2:38)* Even if network models or memory APIs fail, Yori runs 100% reliably offline."

---

### Part 7: Honest Disclosure & Closing (`2:45 – 3:00` · 15s)

**[ON SCREEN]**:  
Return to app home screen. Camera pauses on the clean, calm UI with the tagline visible: *"A little ahead. By your side."*

**[VOICEOVER / NARRATION]**:  
*(2:45)* "To protect privacy in this demo, calendar and location data are simulated mock fixtures. Meta Muse Spark reasoning and XMemo live sync remain owner-gated.  
*(2:54)* Yori: A calm, proactive assistant. A little ahead. By your side."

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence.
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.
