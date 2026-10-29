# Yori (ヨリ) — 3-Minute Video Demonstration Script

> **Governed by Plan:** `YORI_PRE_S1` (Slice `PRE-S1-D`, AC-205-2, G-205)  
> **Core Base Duration:** Exactly 3:00 (180 seconds)  
> **Optional V5 Extension:** At most 20s (+20s), clearly labelled as simulated/manual location with straight-line distances (explicitly added to the 3:00 base)  
> **Pacing:** ~138 words per minute (415 spoken words for core base)  
> **Resolution:** 1280×800 Desktop or 390×844 Mobile portrait  
> **Recording Candidate Build:** V2 Living Context UI (`/?ui=v2` or `VITE_YORI_UI=v2`)  
> **Guaranteed Path:** Zero owner credentials; all demo scenes run deterministically with external model off (`MODEL_API_KEY` unset), cloud memory off (`XMEMO_OAUTH_ENABLED=false`), live weather off (`WEATHER_LIVE_ENABLED=false`), and scripted/recorded fixtures.

---

## Storyboard Per-Segment Breakdown Table

The core storyboard timings sum to **exactly 3:00 (180 seconds)** across approved V4 owner loops (Rain D2 and Lunch D3/D4). An optional V5 segment is provided as an appendix (+20s extension, max 20s) and is explicitly noted as added to the 3:00 base.

| Segment | Start | End | Duration | Scene / Screen | On-Screen Action |
|---|---|---|---|---|---|
| **1. Hook & The Calm Philosophy** | `0:00` | `0:25` | `25s` | Scene D1: Clear (`/?ui=v2`) | Open browser to `/?ui=v2` with Scene D1 selected. Inspect glanceable Living Context: single NOW card with calm departure time (`Piano lesson at 3:00 PM`, `Get ready at 2:05 PM, leave by 2:25 PM`, `SIMULATED`, `Demo · simulated context`), spatial route map (`Spatial Context Map` / `Route Map`), and docked Ask Bar (`Ask Yori about your day...` / `Ask Yori...`, `Tap to chat`). |
| **2. Thinking Ahead & Environmental Adaptation** | `0:25` | `0:50` | `25s` | Scene D2: Rain Re-Plan | Switch scenario to Rain Re-Plan (D2). NOW card updates with alert banner (`What changed: rain forecast`), dynamic umbrella chip (`Umbrella`), route map weather callout (`Rain forecast · simulated`, `Issued 1:35 PM`), and habit-ranked transit options (`Drive · leave 2:30 PM`, `Recommended`, `25 min drive + 5m margin`, `Ranked by habit: Rain travel habit (Demo profile · sample)`, `Bus · leave 2:15 PM`, `Alternative`, `40 min bus + 5m margin`, `You usually prefer driving when it rains.`). |
| **3. Away Dining & Honest Quiet State** | `0:50` | `1:15` | `25s` | Scene D3 & D4: Away / Busy | Switch to Away Lunch (D3): view Candidates Hero (`Lunch options near you`, `Places matching what you like, within walking distance`, `Details →`), labelled venue cards (`Demo Place A · Ramen`, `Demo Place B · Salad`, `Demo Place C · Sushi`), and mock disclosure (`Mock places for this demo; real listings come from a place provider.`). Tap Why to show sample-profile habit badge. Switch to Busy Lunch (D4): screen transitions into quiet state (`Nothing needs your attention right now.`, `You're all caught up. We'll let you know when something comes up.`). |
| **4. The Explainable Review Loop** | `1:15` | `1:45` | `30s` | Scene D2: Rain (Why & Adjust) | Return to D2. Tap Why button to open Why Sheet (`Why you're seeing this`, `Evidence & Signals`, `Memory & Habits`, `Weather forecast`, `Forecast conditions`, `Recorded at 1:35 PM`, `SIMULATED`, `Rain travel habit`, `Buffer before leaving`, `Time to get ready`, `Demo profile · sample preference`). Close Why Sheet. Tap Adjust button (`Adjust Departure Timing`): update prep to 25m, buffer to 10m, and click the remember preference button (`#btn-adjust-remember`). Proposal generates under For You tab (`Remember departure prep & buffer routine?`). |
| **5. User Sovereignty & The Me Tab** | `1:45` | `2:18` | `33s` | For You & Me Tab (`/?ui=v2`) | Inspect pending proposal under For You tab (`Remember departure prep & buffer routine?`). Navigate to Me tab (`Me & Memory`): verify daily proactive budget (`0 of 3 used today`) and empty confirmed state (`No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.`). Locate pending proposal (`Preparation buffer habit`), tap confirm (`.btn-confirm-proposal`), and observe promotion to Confirmed Preferences (`Confirmed`). Return to Home: schedule recomputed to `Get ready at 2:00 PM, leave by 2:25 PM`. Why Sheet reflects `Confirmed`. |
| **6. Conversational Shell & Reasoning Demo** | `2:18` | `2:46` | `28s` | Ask Yori & Multi-Candidate | Return to Home; tap docked Ask Bar to open conversation overlay (`Ask Yori`, `Offline demo · simulated`, `Offline fallback · deterministic`). Send natural language shift query (`Can I leave later?`); observe status chip update (`Scripted model fixture · not a live model call`). Close conversation overlay. Select multi-candidate reasoning demo scene: demonstrate deterministic conflict resolution with model off (Piano lesson prioritized as NOW, Lunch placed in AHEAD), backed by 540 unit tests, 18 goldens, 56 drills, and 192 Playwright e2e tests from the PRE-S1 closeout run (`docs/evidence/pre-s1/CLOSEOUT_PRE_S1.md` @ `6d2da2d` / `9007ccc`), and 0 core diffs vs anchor `f43c6c1d`. |
| **7. Honest Disclosure & Closing** | `2:46` | `3:00` | `14s` | Scene D1: Clear (Home / Closing) | Return to clean Home view; camera pauses on calm UI during honest closing disclosure and spoken tagline. |
| **Core Total** | `0:00` | `3:00` | **`180s`** | **Full V4 Approved Loops** | **Exact 3:00 Duration (Sum = 25s + 25s + 25s + 30s + 33s + 28s + 14s = 180s)** |
| **[Optional V5 Extension]** | `+0:00` (`3:00`) | `+0:20` (`3:20`) | `20s` (max 20s) | Scene V5-Fuel: `Fuel (Low Fuel Warning)` | **[ADDED TO 3:00 — OPTIONAL EXTENSION]** Clearly labelled as simulated/manual location with straight-line distances (selected via `Fuel (Low Fuel Warning)` in `#scene-select`, or dev/test preview URL `?ui=v2&scene=fuel&test=1`). Proactive low-fuel card (`Low Fuel Warning`, `Nearby gas stations from simulated fixture · straight-line distances shown`, `SIMULATED`) displays candidate card (`Metro Gas & Go`, `Gas Station`, `(straight-line)`, `Simulated fixture · Metro Gas`) and verified external navigation modal handoff with zero real GPS calls. |

---

## Detailed Script & On-Screen Actions

### Part 1: Hook & The Calm Philosophy (`0:00 – 0:25` · 25s)

**[ON SCREEN]**:  
Browser open to `http://127.0.0.1:5173/?ui=v2`. Scene D1 (Clear Departure) is selected. Clean, uncluttered UI visible with warm editorial morning greeting. Exactly one NOW card is prominently visible: *"Piano lesson at 3:00 PM"*, *"Get ready at 2:05 PM, leave by 2:25 PM"*. Explicit header chip reads: *"Demo · simulated context"*; V2 preview badge reads: *"V2 Preview"*; card badge displays: `SIMULATED`. Route map section displays *"Spatial Context Map"* (desktop) / *"Route Map"* (mobile), schematic map with origin and destination markers. Docked bottom Ask Bar displays: *"Ask Yori about your day..."* (desktop) / *"Ask Yori..."* (mobile) with chip *"Tap to chat"*.

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
Switch to **Away Lunch (D3)**. Shows Candidates Hero (*"Lunch options near you"*, *"Places matching what you like, within walking distance"*, *"Details →"*) with curated dining venues matching taste preferences, featuring local labelled SVG illustrations (rendered truthful names: *"Demo Place A · Ramen"*, *"Demo Place B · Salad"*, *"Demo Place C · Sushi"*) with clear mock venue disclosure: *"Mock places for this demo; real listings come from a place provider."* Tap **Why** to show the memory section titled **Memory & Habits** labelled `Demo profile · sample preference`. Then switch to **Busy Lunch (D4)**: the screen gently falls into a quiet state: *"Nothing needs your attention right now."* (*"You're all caught up. We'll let you know when something comes up."*).

**[VOICEOVER / NARRATION]**:  
*(0:50)* "At lunch time, when you're away from home, Yori suggests nearby dining that matches your taste preferences, illustrated with local artwork and clear mock disclosure.  
*(1:01)* But if you're in back-to-back meetings or have already logged lunch?  
*(1:06)* Yori stays completely quiet: *'Nothing needs your attention right now.'* It respects your focus and never creates noise."

---

### Part 4: The Explainable Review Loop (`1:15 – 1:45` · 30s)

**[ON SCREEN]**:  
Return to D2. Tap **Why** button on NOW card. The **Why Sheet** slides up (*"Why you're seeing this"*), showing plain-language evidence lines without technical jargon or raw ISO dates. Scenario signals are clearly labelled `SIMULATED` (*"Weather forecast"*, *"Forecast conditions"*, *"Recorded at 1:35 PM"*), and the memory section is titled **Memory & Habits** with persona facts clearly labelled `Demo profile · sample preference` (*"Rain travel habit"*, *"Buffer before leaving"*, *"Time to get ready"*). Close Why Sheet. Tap **Adjust** button (*"Adjust Departure Timing"*): adjust prep time to 25 min and buffer time to 10 min, and click the remember preference button (`#btn-adjust-remember`). A pending proposal appears under the **For You** tab (*"Remember departure prep & buffer routine?"*).

**[VOICEOVER / NARRATION]**:  
*(1:15)* "Every suggestion in Yori is fully explainable.  
*(1:19)* Tap 'Why' to see exactly where recommendations came from—citing the scenario's simulated signals and demo-profile sample preferences in plain language.  
*(1:27)* When you adjust a buffer time, you can choose 'For this time only' or 'Remember as preference'.  
*(1:36)* But remembering never silently alters your preferences. It creates a proposal that waits for your explicit confirmation."

---

### Part 5: User Sovereignty & The Me Tab (`1:45 – 2:18` · 33s)

**[ON SCREEN]**:  
Navigate to the **For You** tab (`#tab-for-you` / `#desktop-nav-for-you`) to view the pending proposal card (*"Remember departure prep & buffer routine?"*). Then open the **Me** tab (`#tab-me` / `#desktop-nav-me`, *"Me & Memory"*). Proactive budget meter shows *"0 of 3 used today"*. Confirmed Preferences list displays the explicit empty state: *"No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own."* Below, the pending proposal appears titled *"Preparation buffer habit"*, showing confirm and reject buttons. Tap **Confirm** (`.btn-confirm-proposal`); the item moves to Confirmed Preferences with a green `Confirmed` badge.  
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
Return to the Home tab. Tap docked Ask Bar: full-page conversation overlay opens with title *"Ask Yori"*, status badge *"Offline demo · simulated"*, and engine status chip *"Offline fallback · deterministic"*. Type conversational query: *"Can I leave later?"* and tap send. Model interpreter executes the scripted model fixture command and status chip updates to *"Scripted model fixture · not a live model call"*. Close conversation overlay. Select **Reasoning demo** scene: show that even with external AI model turned off (`MODEL_API_KEY` unset), Yori handles competing candidates deterministically—keeping the time-critical Piano lesson as NOW and placing Lunch in AHEAD. Briefly highlight the terminal showing 540 passing unit tests, 18 golden fixtures, 56 drills, and 192 Playwright e2e tests from the PRE-S1 closeout verification run (`docs/evidence/pre-s1/CLOSEOUT_PRE_S1.md` @ `6d2da2d` / `9007ccc`), and `git diff --stat f43c6c1d HEAD -- src/core` completely empty.

**[VOICEOVER / NARRATION]**:  
*(2:18)* "Whenever you want to chat, the Ask Yori conversation shell opens instantly.  
*(2:23)* You can ask natural questions like 'Can I leave later?'—running on deterministic fixtures with transparent engine disclosure.  
*(2:30)* When multiple intents compete, Yori prioritizes time-critical commitments deterministically.  
*(2:36)* Backed by 540 unit tests, 18 goldens, 56 drills, and 192 Playwright e2e tests verified during PRE-S1 closeout, our pure domain core is completely frozen with zero diffs."

---

### Part 7: Honest Disclosure & Closing (`2:46 – 3:00` · 14s)

**[ON SCREEN]**:  
Return to app home screen. Camera pauses on the clean, calm UI.

**[VOICEOVER / NARRATION]**:  
*(2:46)* "To protect privacy in this demo, calendar and location data are simulated mock fixtures. Meta Muse Spark live reasoning, XMemo live sync, and live weather remain owner-gated.  
*(2:54)* Yori: A calm, proactive assistant. A little ahead. By your side."

---

### Optional V5 Extension: Dynamic Fuel & Manual Geolocation (`+0:00 – +0:20` / `3:00 – 3:20` · 20s max · Added to 3:00)

> ⚠️ **Status**: Optional 20-second demonstration extension (added to the 3:00 base). Clearly labelled as simulated/manual location with straight-line distances.  
> ℹ️ **URL Forcing & Preview Note**: URL forcing parameters (`?scene=`, `?geo=`, `?geo_consent=`) work only on the development server (`:5173`) or the test preview (`:4173`, via `npm run preview:test`) with `?test=1`. In the shipping production build (`npm run preview` on `:4174`), all URL forcing parameters and dev/test window hooks are completely inert and stripped.

**[ON SCREEN]**:  
Select **Fuel (Low Fuel Warning)** from the `#scene-select` scenario dropdown (or navigate to `?ui=v2&scene=fuel&test=1` on the development server `:5173` or test preview `:4173`). Proactive hero card prominently surfaces: *"Low Fuel Warning"*, *"SIMULATED"*, *"Nearby gas stations from simulated fixture · straight-line distances shown"*. Candidate list renders top station *"Metro Gas & Go"*, category *"Gas Station"*, straight-line distance chip *"(straight-line)"*, and data provenance badge *"Simulated fixture · Metro Gas"*. Zero star ratings, prices, or fabricated review counts are shown. Tap Directions on Metro Gas & Go: safe external navigation modal opens with verified handoff URL. Transparent location permission notice displays honest flag-off disclosure and manual coordinate entry, with zero real device GPS tracking.

**[VOICEOVER / NARRATION]**:  
*(3:00)* "Beyond scheduled travel, Yori's V5 extensions handle contextual needs like a low fuel warning.  
*(3:06)* Stations are fetched from local simulated fixtures with honest straight-line distances—never fabricated reviews or fake ratings.  
*(3:14)* Real GPS is never tapped; location consent is transparent, with verified external navigation handoff."

---

## Verbatim UI Quotes & E2E Assertion Map

Every on-screen string and step sequence quoted in this script is verified verbatim against the rendered UI by automated Playwright assertions across our test suite under `/?ui=v2`:

| Script Section | Quoted UI Text | Rendered UI Selector | Test Spec Reference | Test Suite / Title |
|---|---|---|---|---|
| Part 1 (Hook) | `Demo · simulated context` | `.demo-chip` | [`v2-smoke.spec.ts:601`](../../tests/e2e/v2-smoke.spec.ts#L601) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 1 (Hook) | `V2 Preview` | `#badge-ui-version` | [`v2-smoke.spec.ts:602`](../../tests/e2e/v2-smoke.spec.ts#L602) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 1 (Hook) | `Piano lesson at 3:00 PM` | `.now-card .now-subject` | [`v2-smoke.spec.ts:603`](../../tests/e2e/v2-smoke.spec.ts#L603) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 1 (Hook) | `Get ready at 2:05 PM, leave by 2:25 PM` | `.now-card #now-title` | [`v2-smoke.spec.ts:604`](../../tests/e2e/v2-smoke.spec.ts#L604) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 1 (Hook) | `SIMULATED` | `.now-card .card-badge` | [`v2-smoke.spec.ts:605`](../../tests/e2e/v2-smoke.spec.ts#L605) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 1 (Hook) | `Spatial Context Map` | `.map-header .v2-heading-desktop` | [`v3-tokens-motion-touch.spec.ts:516`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L516) | `V3 390px Mobile Hero: single-line ask-bar placeholder, header chip, and section heading with ask-bar height <= 56px` |
| Part 1 (Hook) | `Route Map` | `.map-header .v2-heading-mobile` | [`v3-tokens-motion-touch.spec.ts:493`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L493) | `V3 390px Mobile Hero: single-line ask-bar placeholder, header chip, and section heading with ask-bar height <= 56px` |
| Part 1 (Hook) | `Ask Yori about your day...` | `#ask-bar .v2-ask-desktop` | [`v3-tokens-motion-touch.spec.ts:512`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L512) | `V3 390px Mobile Hero: single-line ask-bar placeholder, header chip, and section heading with ask-bar height <= 56px` |
| Part 1 (Hook) | `Ask Yori...` | `#ask-bar .v2-ask-mobile` | [`v3-tokens-motion-touch.spec.ts:472`](../../tests/e2e/v3-tokens-motion-touch.spec.ts#L472) | `V3 390px Mobile Hero: single-line ask-bar placeholder, header chip, and section heading with ask-bar height <= 56px` |
| Part 1 (Hook) | `Tap to chat` | `#ask-bar .ask-bar-hint` | [`v2-smoke.spec.ts:606`](../../tests/e2e/v2-smoke.spec.ts#L606) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `What changed: rain forecast` | `.v2-insight-title, .rain-banner` | [`v2-smoke.spec.ts:612`](../../tests/e2e/v2-smoke.spec.ts#L612) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Umbrella` | `#chip-umbrella` | [`v2-smoke.spec.ts:613`](../../tests/e2e/v2-smoke.spec.ts#L613) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Rain forecast · simulated` | `.v2-map-weather-callout text` | [`v2-smoke.spec.ts:614`](../../tests/e2e/v2-smoke.spec.ts#L614) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Issued 1:35 PM` | `.v2-map-weather-callout text` | [`v2-smoke.spec.ts:615`](../../tests/e2e/v2-smoke.spec.ts#L615) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Drive · leave 2:30 PM` | `.v2-option-card:first-child .v2-option-label` | [`v2-smoke.spec.ts:621`](../../tests/e2e/v2-smoke.spec.ts#L621) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Recommended` | `.v2-option-card:first-child .v2-option-badge` | [`v2-smoke.spec.ts:622`](../../tests/e2e/v2-smoke.spec.ts#L622) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `25 min drive + 5m margin` | `.v2-option-card:first-child .v2-option-meta` | [`v2-smoke.spec.ts:623`](../../tests/e2e/v2-smoke.spec.ts#L623) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Ranked by habit: Rain travel habit (Demo profile · sample)` | `.v2-option-card:first-child .v2-option-basis` | [`v2-smoke.spec.ts:624-626`](../../tests/e2e/v2-smoke.spec.ts#L624-L626) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Bus · leave 2:15 PM` | `.v2-option-card:nth-child(2) .v2-option-label` | [`v2-smoke.spec.ts:629`](../../tests/e2e/v2-smoke.spec.ts#L629) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `Alternative` | `.v2-option-card:nth-child(2) .v2-option-badge` | [`v2-smoke.spec.ts:630`](../../tests/e2e/v2-smoke.spec.ts#L630) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `40 min bus + 5m margin` | `.v2-option-card:nth-child(2) .v2-option-meta` | [`v2-smoke.spec.ts:631`](../../tests/e2e/v2-smoke.spec.ts#L631) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 2 (D2 Rain) | `You usually prefer driving when it rains.` | `.habit-note` | [`v2-smoke.spec.ts:632`](../../tests/e2e/v2-smoke.spec.ts#L632) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D3 Away) | `Lunch options near you` | `.v2-candidates-hero .now-subject` | [`v2-smoke.spec.ts:638`](../../tests/e2e/v2-smoke.spec.ts#L638) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D3 Away) | `Places matching what you like, within walking distance` | `.v2-candidates-hero #now-title` | [`v2-smoke.spec.ts:639-641`](../../tests/e2e/v2-smoke.spec.ts#L639-L641) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D3 Away) | `Mock places for this demo; real listings come from a place provider.` | `.mock-places-notice` | [`v2-smoke.spec.ts:642-644`](../../tests/e2e/v2-smoke.spec.ts#L642-L644) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D3 Away) | `Details →` | `.v2-view-detail-link` | [`v2-smoke.spec.ts:645`](../../tests/e2e/v2-smoke.spec.ts#L645) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D3 Away) | `Demo Place A · Ramen` | `.v2-candidate-card:nth-child(1)` | [`v2-smoke.spec.ts:649`](../../tests/e2e/v2-smoke.spec.ts#L649) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D3 Away) | `Demo Place B · Salad` | `.v2-candidate-card:nth-child(2)` | [`v2-smoke.spec.ts:650`](../../tests/e2e/v2-smoke.spec.ts#L650) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D3 Away) | `Demo Place C · Sushi` | `.v2-candidate-card:nth-child(3)` | [`v2-smoke.spec.ts:651`](../../tests/e2e/v2-smoke.spec.ts#L651) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D4 Busy) | `Nothing needs your attention right now.` | `.quiet-title` | [`v2-smoke.spec.ts:656`](../../tests/e2e/v2-smoke.spec.ts#L656) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 3 (D4 Busy) | `You're all caught up. We'll let you know when something comes up.` | `.quiet-subtitle` | [`v4-recordings.spec.ts:532`](../../tests/e2e/v4-recordings.spec.ts#L532) | `V4-LUNCH: proactive card -> photos/candidates/basis -> chat quieter+vegetarian -> re-rank -> selected on home -> Why provenance` |
| Part 4 (Why Sheet) | `Why you're seeing this` | `#why-sheet-title` | [`v2-smoke.spec.ts:663`](../../tests/e2e/v2-smoke.spec.ts#L663) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 4 (Why Sheet) | `Evidence & Signals` | `.why-section h3:first-child` | [`v2-smoke.spec.ts:664`](../../tests/e2e/v2-smoke.spec.ts#L664) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 4 (Why Sheet) | `Memory & Habits` | `.why-section h3:nth-child(2)` | [`v2-smoke.spec.ts:665`](../../tests/e2e/v2-smoke.spec.ts#L665) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 4 (Why Sheet) | `Weather forecast` | `.why-section .evidence-item` | [`fallback-walkthrough.spec.ts:256`](../../tests/e2e/fallback-walkthrough.spec.ts#L256) | `Full Video Script Walkthrough (Steps 1–7) with Evidence Capture` |
| Part 4 (Why Sheet) | `Forecast conditions` | `.why-section .evidence-item` | [`fallback-walkthrough.spec.ts:257`](../../tests/e2e/fallback-walkthrough.spec.ts#L257) | `Full Video Script Walkthrough (Steps 1–7) with Evidence Capture` |
| Part 4 (Why Sheet) | `Recorded at 1:35 PM` | `.why-section .evidence-item` | [`fallback-walkthrough.spec.ts:258`](../../tests/e2e/fallback-walkthrough.spec.ts#L258) | `Full Video Script Walkthrough (Steps 1–7) with Evidence Capture` |
| Part 4 (Why Sheet) | `Demo profile · sample preference` | `.card-badge` in Why Sheet | [`v2-smoke.spec.ts:666-668`](../../tests/e2e/v2-smoke.spec.ts#L666-L668) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 4 (Why Sheet) | `Rain travel habit` | `.why-section .memory-item` | [`fallback-walkthrough.spec.ts:264`](../../tests/e2e/fallback-walkthrough.spec.ts#L264) | `Full Video Script Walkthrough (Steps 1–7) with Evidence Capture` |
| Part 4 (Why Sheet) | `Buffer before leaving` | `.why-section .memory-item` | [`fallback-walkthrough.spec.ts:265`](../../tests/e2e/fallback-walkthrough.spec.ts#L265) | `Full Video Script Walkthrough (Steps 1–7) with Evidence Capture` |
| Part 4 (Why Sheet) | `Time to get ready` | `.why-section .memory-item` | [`fallback-walkthrough.spec.ts:266`](../../tests/e2e/fallback-walkthrough.spec.ts#L266) | `Full Video Script Walkthrough (Steps 1–7) with Evidence Capture` |
| Part 4 (Adjust) | `Adjust Departure Timing` | `#adjust-dialog-title` | [`v2-smoke.spec.ts:674`](../../tests/e2e/v2-smoke.spec.ts#L674) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 5 (For You) | `Remember departure prep & buffer routine?` | `.v2-for-you-view .v2-proposal-title` | [`v2-smoke.spec.ts:684-686`](../../tests/e2e/v2-smoke.spec.ts#L684-L686) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 5 (Me Tab) | `Me & Memory` | `.me-title` | [`v2-smoke.spec.ts:690`](../../tests/e2e/v2-smoke.spec.ts#L690) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 5 (Me Tab) | `0 of 3 used today` | `.badge-budget` | [`v2-smoke.spec.ts:691`](../../tests/e2e/v2-smoke.spec.ts#L691) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 5 (Me Tab) | `No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.` | `#confirmed-facts-list .memory-empty` | [`v2-smoke.spec.ts:692-694`](../../tests/e2e/v2-smoke.spec.ts#L692-L694) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 5 (Me Tab) | `Preparation buffer habit` | `#proposal-prep_buffer_preference .memory-key` | [`v2-smoke.spec.ts:698`](../../tests/e2e/v2-smoke.spec.ts#L698) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 5 (Me Tab) | `Confirmed` | `.badge-confirmed` | [`v2-smoke.spec.ts:706`](../../tests/e2e/v2-smoke.spec.ts#L706) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 5 (Recomputation) | `Get ready at 2:00 PM, leave by 2:25 PM` | `#now-title` (post-confirmation) | [`v2-smoke.spec.ts:711`](../../tests/e2e/v2-smoke.spec.ts#L711) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 6 (Conversational) | `Ask Yori` | `#conversation-title` | [`v2-smoke.spec.ts:724`](../../tests/e2e/v2-smoke.spec.ts#L724) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 6 (Conversational) | `Offline demo · simulated` | `#conversation-status-badge` | [`v2-smoke.spec.ts:725`](../../tests/e2e/v2-smoke.spec.ts#L725) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 6 (Conversational) | `Offline fallback · deterministic` | `#engine-status-chip` | [`v2-smoke.spec.ts:726`](../../tests/e2e/v2-smoke.spec.ts#L726) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Part 6 (Conversational) | `Scripted model fixture · not a live model call` | `#engine-status-chip` | [`v2-smoke.spec.ts:730-732`](../../tests/e2e/v2-smoke.spec.ts#L730-L732) | `V2 Video Script Verbatim Walkthrough: asserts all quoted text and recomputed timing (2:00 PM / 2:25 PM) under /?ui=v2` |
| Optional V5 (Fuel) | `Low Fuel Warning` | `.now-card .now-subject` | [`v5-fuel.spec.ts:71`](../../tests/e2e/v5-fuel.spec.ts#L71) | `V5-FUEL loop: low fuel card -> straight-line distance -> navigate modal -> verified URL handoff (AC-212-1, AC-212-2, G1, G2)` |
| Optional V5 (Fuel) | `Nearby gas stations from simulated fixture · straight-line distances shown` | `.now-card #now-title` | [`v5-fuel.spec.ts:73`](../../tests/e2e/v5-fuel.spec.ts#L73) | `V5-FUEL loop: low fuel card -> straight-line distance -> navigate modal -> verified URL handoff (AC-212-1, AC-212-2, G1, G2)` |
| Optional V5 (Fuel) | `Metro Gas & Go` | `.v2-candidate-card:first-child .v2-candidate-name` | [`v5-fuel.spec.ts:81`](../../tests/e2e/v5-fuel.spec.ts#L81) | `V5-FUEL loop: low fuel card -> straight-line distance -> navigate modal -> verified URL handoff (AC-212-1, AC-212-2, G1, G2)` |
| Optional V5 (Fuel) | `Gas Station` | `.v2-candidate-card:first-child .v2-candidate-category` | [`v5-fuel.spec.ts:82`](../../tests/e2e/v5-fuel.spec.ts#L82) | `V5-FUEL loop: low fuel card -> straight-line distance -> navigate modal -> verified URL handoff (AC-212-1, AC-212-2, G1, G2)` |
| Optional V5 (Fuel) | `(straight-line)` | `.v2-distance-chip` | [`v5-fuel.spec.ts:83`](../../tests/e2e/v5-fuel.spec.ts#L83) | `V5-FUEL loop: low fuel card -> straight-line distance -> navigate modal -> verified URL handoff (AC-212-1, AC-212-2, G1, G2)` |
| Optional V5 (Fuel) | `Simulated fixture · Metro Gas` | `.v2-candidate-card:first-child .card-badge` | [`v5-fuel.spec.ts:84`](../../tests/e2e/v5-fuel.spec.ts#L84) | `V5-FUEL loop: low fuel card -> straight-line distance -> navigate modal -> verified URL handoff (AC-212-1, AC-212-2, G1, G2)` |

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence (~138 wpm).
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.
