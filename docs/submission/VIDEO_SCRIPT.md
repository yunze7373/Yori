# Yori (ヨリ) — 3-Minute Video Demonstration Script

> **Governed by Plan:** `YORI_PRE_S1` (Slice `PRE-S1-D`, AC-205-2, G-205)  
> **Core Base Duration:** Exactly 3:00 (180 seconds)  
> **Optional V5 Extension:** At most 20s (+20s), clearly labelled as simulated/manual location with straight-line distances (explicitly added to the 3:00 base)  
> **Pacing:** ~140 words per minute (~419 spoken words for core base)  
> **Resolution:** 1280×800 Desktop or 390×844 Mobile portrait  
> **Recording Candidate Build:** V2 Living Context UI (`/?ui=v2` or `VITE_YORI_UI=v2`)  
> **Guaranteed Path:** Zero owner credentials; all demo scenes run deterministically with external model off (`MODEL_API_KEY` unset), cloud memory off (`XMEMO_OAUTH_ENABLED=false`), live weather off (`WEATHER_LIVE_ENABLED=false`), and scripted/recorded fixtures.

---

> [!TIP]
> ### Recording Preparation Checklist
> - **Storage Reset**: Always start from a clean slate. Either run on a fresh browser profile or execute a storage reset between takes: navigate to the **Me** tab, click **Reset Storage** (`Reset Storage`), and confirm in the 2-step verification modal (or run `localStorage.clear()` in DevTools console).
> - **Environment & Server**:
>   - **Recommended Primary**: Use the **Test Preview Build** (`npm run build:test && npm run preview:test` on port `:4173`). This production-like bundled build matches the verified Playwright E2E environment (`tests/e2e/video-script.spec.ts`), serving optimized assets while retaining verified test hooks and URL forcing (`?ui=v2`, `?scene=fuel&test=1`).
>   - **Alternative**: The local development server (`npm run dev` on port `:5173`) also supports interactive hot-reloading and test hooks.
>   - Target URL: `http://127.0.0.1:4173/?ui=v2` (recommended primary) or `http://127.0.0.1:5173/?ui=v2`.
>   - *Note*: The production bundle (`npm run preview` on `:4174`) strips all URL test hooks and forcing flags for security and is not intended for scripted video recording.
> - **Offline & Hermetic Guarantee**:
>   - Zero external hosts: self-hosted fonts (`@font-face` WOFF2 fonts served locally from `/fonts/`, zero Google Fonts / external CDN requests).
>   - Deterministic fixtures: leave `MODEL_API_KEY` unset, `XMEMO_OAUTH_ENABLED=false`, and `WEATHER_LIVE_ENABLED=false`. All scenes run deterministically with zero network calls and zero model billing.
> - **Display & Zoom**:
>   - Browser zoom: **exactly 100%** (no browser zoom or CSS scaling distortion).
>   - Viewport dimensions: **1280×800** (Desktop recording) or **390×844** (Mobile portrait recording).

---

## Storyboard Per-Segment Breakdown Table

The core storyboard timings sum to **exactly 3:00 (180 seconds)** across approved V4 owner loops (Rain D2 and Lunch D3/D4). An optional V5 segment is provided as an appendix (+20s extension, max 20s) and is explicitly noted as added to the 3:00 base.

| Segment | Start | End | Duration | Scene / Screen | On-Screen Action |
|---|---|---|---|---|---|
| **1. Hook & The Calm Philosophy** | `0:00` | `0:25` | `25s` | Scene D1: Clear (`/?ui=v2`) | Open browser to `/?ui=v2` with Scene D1 selected. Inspect glanceable Living Context: single NOW card with calm departure time (`Piano lesson at 3:00 PM`, `Get ready at 2:05 PM, leave by 2:25 PM`, `SIMULATED`, `Demo · simulated context`), spatial route map (`Spatial Context Map` / `Route Map`), and docked Ask Bar (`Ask Yori about your day...` / `Ask Yori...`, `Tap to chat`). |
| **2. Thinking Ahead & Environmental Adaptation** | `0:25` | `0:50` | `25s` | Scene D2: Rain Re-Plan | Switch scenario to Rain Re-Plan (D2). NOW card updates with alert banner (`What changed: rain forecast`), dynamic umbrella chip (`Umbrella`), route map weather callout (`Rain forecast · simulated`, `Issued 1:35 PM`), and habit-ranked transit options (`Drive · leave 2:30 PM`, `Recommended`, `25 min drive + 5m margin`, `Ranked by habit: Rain travel habit (Demo profile · sample)`, `Bus · leave 2:15 PM`, `Alternative`, `40 min bus + 5m margin`, `You usually prefer driving when it rains.`). |
| **3. Away Dining & Honest Quiet State** | `0:50` | `1:15` | `25s` | Scene D3 & D4: Away / Busy | Switch to Away Lunch (D3): view Candidates Hero (`Lunch options near you`, `Places matching what you like, within walking distance`, `Details →`), labelled venue cards (`Demo Place A · Ramen`, `Demo Place B · Salad`, `Demo Place C · Sushi`), and mock disclosure (`Mock places for this demo; real listings come from a place provider.`). Tap Why to show sample-profile habit badge. Switch to Busy Lunch (D4): screen transitions into quiet state (`Nothing needs your attention right now.`, `You're all caught up. We'll let you know when something comes up.`). |
| **4. The Explainable Review Loop** | `1:15` | `1:45` | `30s` | Scene D2: Rain (Why & Adjust) | Return to D2. Tap Why button to open Why Sheet (`Why you're seeing this`, `Evidence & Signals`, `Memory & Habits`, `Weather forecast`, `Forecast conditions`, `Recorded at 1:35 PM`, `SIMULATED`, `Rain travel habit`, `Buffer before leaving`, `Time to get ready`, `Demo profile · sample preference`). Close Why Sheet. Tap Adjust button (`Adjust Departure Timing`): inspect options (`For this time only` vs `Remember as preference`), update prep to 25m, buffer to 10m, and click the remember preference button (`#btn-adjust-remember`). Proposal generates under For You tab (`Remember departure prep & buffer routine?`). |
| **5. User Sovereignty & The Me Tab** | `1:45` | `2:18` | `33s` | For You & Me Tab (`/?ui=v2`) | Inspect pending proposal under For You tab (`Remember departure prep & buffer routine?`). Navigate to Me tab (`Me & Memory`): verify daily proactive budget (`0 of 3 used today`), reset control (`Reset Storage`), and empty confirmed state (`No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.`). Locate pending proposal (`Preparation buffer habit`), tap confirm (`.btn-confirm-proposal`), and observe promotion to Confirmed Preferences (`Confirmed`). Return to Home: schedule recomputed to `Get ready at 2:00 PM, leave by 2:25 PM`. Why Sheet reflects `Confirmed`. |
| **6. Conversational Shell & Reasoning Demo** | `2:18` | `2:46` | `28s` | Ask Yori & Multi-Candidate | Return to Home; tap docked Ask Bar to open conversation overlay (`Ask Yori`, `Offline demo · simulated`, `Offline fallback · deterministic`). Send natural language shift query (`Can I leave later?`); observe status chip update (`Scripted model fixture · not a live model call`). Close conversation overlay. Select multi-candidate reasoning demo scene: demonstrate deterministic conflict resolution with model off (Piano lesson prioritized as NOW, Lunch placed in AHEAD), backed by 795 unit tests across 32 files, 18 goldens, 56 drills, and 286 Playwright e2e tests across 23 files, and 0 core diffs vs anchor `f43c6c1d`. |
| **7. Honest Disclosure & Closing** | `2:46` | `3:00` | `14s` | Scene D1: Clear (Home / Closing) | Return to clean Home view; camera pauses on calm UI during honest closing disclosure (model off; Muse Spark refine and reasoning verified live separately; conversational commands, XMemo sync, and weather owner-gated) and spoken tagline. |
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
*(1:27)* When you adjust a buffer time, you can choose `For this time only` or `Remember as preference`.  
*(1:36)* But remembering never silently alters your preferences. It creates a proposal that waits for your explicit confirmation."

---

### Part 5: User Sovereignty & The Me Tab (`1:45 – 2:18` · 33s)

**[ON SCREEN]**:  
Navigate to the **For You** tab (`#tab-for-you` / `#desktop-nav-for-you`) to view the pending proposal card (*"Remember departure prep & buffer routine?"*). Then open the **Me** tab (`#tab-me` / `#desktop-nav-me`, *"Me & Memory"*). Proactive budget meter shows *"0 of 3 used today"*. Confirmed Preferences list displays the explicit empty state: *"No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own."* Below, the pending proposal appears titled *"Preparation buffer habit"*, showing confirm and reject buttons. Tap **Confirm** (`.btn-confirm-proposal`); the item moves to Confirmed Preferences with a green `Confirmed` badge.  
Return to the Home tab on Scene D2: the NOW card immediately recomputes its departure schedule to *"Get ready at 2:00 PM, leave by 2:25 PM"*. Re-open the Why Sheet: the two adjusted timing facts (*"Buffer before leaving"*, *"Time to get ready"*) now display `Confirmed`, while the rain habit remains `Demo profile · sample preference`. Point out data export/reset (`Reset Storage`) and the XMemo Sync section, noting local storage sovereignty.

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
Return to the Home tab. Tap docked Ask Bar: full-page conversation overlay opens with title *"Ask Yori"*, status badge *"Offline demo · simulated"*, and engine status chip *"Offline fallback · deterministic"*. Type conversational query: *"Can I leave later?"* and tap send. Model interpreter executes the scripted model fixture command and status chip updates to *"Scripted model fixture · not a live model call"*. Close conversation overlay. Select **Reasoning demo** scene: show that even with external AI model turned off (`MODEL_API_KEY` unset), Yori handles competing candidates deterministically—keeping the time-critical Piano lesson as NOW and placing Lunch in AHEAD. Briefly highlight the terminal showing 795 passing unit tests across 32 files, 18 golden fixtures, 56 drills, and 286 Playwright e2e tests across 23 files, and `git diff --stat f43c6c1d HEAD -- src/core` completely empty.

**[VOICEOVER / NARRATION]**:  
*(2:18)* "Whenever you want to chat, the Ask Yori conversation shell opens instantly.  
*(2:23)* You can ask natural questions like 'Can I leave later?'—running on deterministic fixtures with transparent engine disclosure.  
*(2:30)* When multiple intents compete, Yori prioritizes time-critical commitments deterministically.  
*(2:36)* Backed by 756 unit tests across 31 files, 18 goldens, 56 drills, and 268 Playwright e2e tests across 21 files, our pure domain core is completely frozen with zero diffs."

---

### Part 7: Honest Disclosure & Closing (`2:46 – 3:00` · 14s)

**[ON SCREEN]**:  
Return to app home screen. Camera pauses on the clean, calm UI.

**[VOICEOVER / NARRATION]**:  
*(2:46)* "This demo runs offline with the model off. Muse Spark refine and reasoning were verified live separately; conversational commands, XMemo live sync and live weather remain owner-gated.  
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

## Honest Verification & Integration Claims (INV-102)

To preserve total transparency and intellectual honesty, every capability shown in this video demonstration is grounded strictly in demonstrable code and verified test evidence:

| Capability / Seam | Video Status | Live Verification Reality | Grounding Evidence File(s) |
|---|---|---|---|
| **Pure Domain Core** | **Active** (Deterministic Replay) | Verified deterministic: zero ambient clock calls, zero network imports, and frozen domain contracts with zero lines changed vs baseline anchor `f43c6c1d`. | 756 unit tests across 31 files (`npm test`), 18 golden scenarios (`npm run test:golden`), 56 drills (`npm run test:drills`), 268 Playwright e2e tests across 21 files (`tests/e2e/video-script.spec.ts`), `git diff f43c6c1d -- src/core` (0 diffs). |
| **Meta Muse Spark (`muse-spark-1.3`)** | **Offline Fallback** (`MODEL_API_KEY` unset, engine chip `'Scripted model fixture · not a live model call'`) | **Live Billed Accepted on 2026-10-31** under owner authorization S1-LIVE-2 (7 billed calls dispatched, lifetime ledger at 17/50 calls, SHA256 `46aa6fa9...`). Phrasing refinement (`[REFINE]`) and candidate ranking rationale (`[REASON]`) passed live fact-checking. Conversational command (`decision_command`) was repaired offline with closed intent set and fact-checks (S1CMD-P2), but its live billed acceptance is owner-gated (S1-LIVE-3). | [`docs/evidence/s1-live-2/S1_LIVE_2_REPORT.md`](../evidence/s1-live-2/S1_LIVE_2_REPORT.md)<br>`.yori-runtime/model-live-ledger.json` |
| **XMemo Cloud Memory (`https://xmemo.dev/mcp`)** | **Disabled** (`XMEMO_OAUTH_ENABLED=false`) | **Live Sync NOT Verified**. Owner-key read-only integration harness is implemented and verified offline with mock server tests (`docs/evidence/s2-ro/S2_RO_REPORT.md`). Live remote vault connection against owner's production account remains owner-gated (S2-LIVE). All memory demonstrated is sovereign to local browser storage with Confirm-Only invariant (INV-107). | [`docs/evidence/s2-ro/S2_RO_REPORT.md`](../evidence/s2-ro/S2_RO_REPORT.md)<br>`src/adapters/xmemo/server-proxy.ts` |
| **Ambient Weather (Open-Meteo)** | **Simulated Fixture** (`WEATHER_LIVE_ENABLED=false`, `SIMULATED` badge) | **Live Seam Implemented & Offline-Verified**. Live Open-Meteo REST API toggle is fully implemented and tested offline in dual viewports, with visual proof in evidence directory. Demo scenes run on deterministic mock fixtures to guarantee reproducible departures. | [`docs/evidence/ph2-d1/live-weather-desktop-1280x800.png`](../evidence/ph2-d1/live-weather-desktop-1280x800.png)<br>[`tests/e2e/live-weather-ui.spec.ts`](../../tests/e2e/live-weather-ui.spec.ts) |
| **Device Geolocation & POI** | **Simulated Fixture** (Straight-line distance) | **Zero Device GPS Calls**. Transparent consent gating with explicit flag-off notice; manual coordinate input supported with straight-line distance calculations only. Zero real geotracking or live place network calls. | [`tests/e2e/v5-geo.spec.ts`](../../tests/e2e/v5-geo.spec.ts)<br>[`tests/e2e/v5-fuel.spec.ts`](../../tests/e2e/v5-fuel.spec.ts) |

---

## Verbatim UI Quotes & E2E Assertion Map

Every on-screen string and step sequence quoted in this script is verified verbatim against the rendered UI by the automated, executable video script Playwright walkthrough ([`tests/e2e/video-script.spec.ts`](../../tests/e2e/video-script.spec.ts)) across dual viewports under `/?ui=v2`:

| Script Section | Quoted UI Text | Rendered UI Selector | Test Spec Reference | Test Suite / Title |
|---|---|---|---|---|
| Part 1 (Hook) | `Demo · simulated context` | `.demo-chip` | [`video-script.spec.ts:192`](../../tests/e2e/video-script.spec.ts#L192) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `V2 Preview` | `#badge-ui-version` | [`video-script.spec.ts:193`](../../tests/e2e/video-script.spec.ts#L193) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `Piano lesson at 3:00 PM` | `.now-card .now-subject` | [`video-script.spec.ts:194`](../../tests/e2e/video-script.spec.ts#L194) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `Get ready at 2:05 PM, leave by 2:25 PM` | `.now-card #now-title` | [`video-script.spec.ts:195-197`](../../tests/e2e/video-script.spec.ts#L195-L197) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `SIMULATED` | `.now-card .card-badge` | [`video-script.spec.ts:198`](../../tests/e2e/video-script.spec.ts#L198) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `Spatial Context Map` | `.map-header .v2-heading-desktop` | [`video-script.spec.ts:205`](../../tests/e2e/video-script.spec.ts#L205) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `Route Map` | `.map-header .v2-heading-mobile` | [`video-script.spec.ts:201`](../../tests/e2e/video-script.spec.ts#L201) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `Ask Yori about your day...` | `#ask-bar .v2-ask-desktop` | [`video-script.spec.ts:206`](../../tests/e2e/video-script.spec.ts#L206) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `Ask Yori...` | `#ask-bar .v2-ask-mobile` | [`video-script.spec.ts:202`](../../tests/e2e/video-script.spec.ts#L202) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 1 (Hook) | `Tap to chat` | `#ask-bar .ask-bar-hint` | [`video-script.spec.ts:208`](../../tests/e2e/video-script.spec.ts#L208) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `What changed: rain forecast` | `.v2-insight-title, .rain-banner` | [`video-script.spec.ts:227`](../../tests/e2e/video-script.spec.ts#L227) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Umbrella` | `#chip-umbrella` | [`video-script.spec.ts:230`](../../tests/e2e/video-script.spec.ts#L230) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Rain forecast · simulated` | `.v2-map-weather-callout` | [`video-script.spec.ts:233`](../../tests/e2e/video-script.spec.ts#L233) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Issued 1:35 PM` | `.v2-map-weather-callout` | [`video-script.spec.ts:236`](../../tests/e2e/video-script.spec.ts#L236) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Drive · leave 2:30 PM` | `.v2-option-card:first-child .v2-option-label` | [`video-script.spec.ts:243`](../../tests/e2e/video-script.spec.ts#L243) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Recommended` | `.v2-option-card:first-child .v2-option-badge` | [`video-script.spec.ts:244`](../../tests/e2e/video-script.spec.ts#L244) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `25 min drive + 5m margin` | `.v2-option-card:first-child .v2-option-meta` | [`video-script.spec.ts:245`](../../tests/e2e/video-script.spec.ts#L245) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Ranked by habit: Rain travel habit (Demo profile · sample)` | `.v2-option-card:first-child .v2-option-basis` | [`video-script.spec.ts:246-248`](../../tests/e2e/video-script.spec.ts#L246-L248) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Bus · leave 2:15 PM` | `.v2-option-card:nth-child(2) .v2-option-label` | [`video-script.spec.ts:251`](../../tests/e2e/video-script.spec.ts#L251) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `Alternative` | `.v2-option-card:nth-child(2) .v2-option-badge` | [`video-script.spec.ts:252`](../../tests/e2e/video-script.spec.ts#L252) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `40 min bus + 5m margin` | `.v2-option-card:nth-child(2) .v2-option-meta` | [`video-script.spec.ts:253`](../../tests/e2e/video-script.spec.ts#L253) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 2 (D2 Rain) | `You usually prefer driving when it rains.` | `.habit-note` | [`video-script.spec.ts:256`](../../tests/e2e/video-script.spec.ts#L256) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D3 Away) | `Lunch options near you` | `.v2-candidates-hero .now-subject` | [`video-script.spec.ts:275`](../../tests/e2e/video-script.spec.ts#L275) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D3 Away) | `Places matching what you like, within walking distance` | `.v2-candidates-hero #now-title` | [`video-script.spec.ts:276-278`](../../tests/e2e/video-script.spec.ts#L276-L278) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D3 Away) | `Mock places for this demo; real listings come from a place provider.` | `.mock-places-notice` | [`video-script.spec.ts:288-290`](../../tests/e2e/video-script.spec.ts#L288-L290) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D3 Away) | `Details →` | `.v2-view-detail-link` | [`video-script.spec.ts:279`](../../tests/e2e/video-script.spec.ts#L279) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D3 Away) | `Demo Place A · Ramen` | `.v2-candidate-card:nth-child(1)` | [`video-script.spec.ts:283`](../../tests/e2e/video-script.spec.ts#L283) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D3 Away) | `Demo Place B · Salad` | `.v2-candidate-card:nth-child(2)` | [`video-script.spec.ts:284`](../../tests/e2e/video-script.spec.ts#L284) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D3 Away) | `Demo Place C · Sushi` | `.v2-candidate-card:nth-child(3)` | [`video-script.spec.ts:285`](../../tests/e2e/video-script.spec.ts#L285) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D4 Busy) | `Nothing needs your attention right now.` | `.quiet-title` | [`video-script.spec.ts:304`](../../tests/e2e/video-script.spec.ts#L304) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 3 (D4 Busy) | `You're all caught up. We'll let you know when something comes up.` | `.quiet-subtitle` | [`video-script.spec.ts:305-307`](../../tests/e2e/video-script.spec.ts#L305-L307) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Why you're seeing this` | `#why-sheet-title` | [`video-script.spec.ts:327`](../../tests/e2e/video-script.spec.ts#L327) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Evidence & Signals` | `.why-section h3:first-child` | [`video-script.spec.ts:331`](../../tests/e2e/video-script.spec.ts#L331) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Memory & Habits` | `.why-section h3:nth-child(2)` | [`video-script.spec.ts:332`](../../tests/e2e/video-script.spec.ts#L332) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Weather forecast` | `.why-section .evidence-item` | [`video-script.spec.ts:336`](../../tests/e2e/video-script.spec.ts#L336) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Forecast conditions` | `.why-section .evidence-item` | [`video-script.spec.ts:337`](../../tests/e2e/video-script.spec.ts#L337) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Recorded at 1:35 PM` | `.why-section .evidence-item` | [`video-script.spec.ts:338`](../../tests/e2e/video-script.spec.ts#L338) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Demo profile · sample preference` | `.card-badge` in Why Sheet | [`video-script.spec.ts:347`](../../tests/e2e/video-script.spec.ts#L347) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Rain travel habit` | `.why-section .memory-item` | [`video-script.spec.ts:343`](../../tests/e2e/video-script.spec.ts#L343) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Buffer before leaving` | `.why-section .memory-item` | [`video-script.spec.ts:344`](../../tests/e2e/video-script.spec.ts#L344) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Why Sheet) | `Time to get ready` | `.why-section .memory-item` | [`video-script.spec.ts:345`](../../tests/e2e/video-script.spec.ts#L345) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Adjust) | `Adjust Departure Timing` | `#adjust-dialog-title` | [`video-script.spec.ts:362`](../../tests/e2e/video-script.spec.ts#L362) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Adjust) | `For this time only` | `#btn-adjust-for-today` | [`video-script.spec.ts:363`](../../tests/e2e/video-script.spec.ts#L363) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 4 (Adjust) | `Remember as preference` | `#btn-adjust-remember` | [`video-script.spec.ts:364`](../../tests/e2e/video-script.spec.ts#L364) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (For You) | `Remember departure prep & buffer routine?` | `.v2-for-you-view .v2-proposal-title` | [`video-script.spec.ts:371-373`](../../tests/e2e/video-script.spec.ts#L371-L373) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (Me Tab) | `Me & Memory` | `.me-title` | [`video-script.spec.ts:388`](../../tests/e2e/video-script.spec.ts#L388) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (Me Tab) | `0 of 3 used today` | `.badge-budget` | [`video-script.spec.ts:389`](../../tests/e2e/video-script.spec.ts#L389) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (Me Tab) | `No confirmed preferences yet. Active demo scenes use sample preferences from the simulated demo profile until you confirm your own.` | `#confirmed-facts-list .memory-empty` | [`video-script.spec.ts:390-392`](../../tests/e2e/video-script.spec.ts#L390-L392) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (Me Tab) | `Reset Storage` | `#btn-me-reset` | [`video-script.spec.ts:396`](../../tests/e2e/video-script.spec.ts#L396) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (Me Tab) | `Preparation buffer habit` | `#proposal-prep_buffer_preference .memory-key` | [`video-script.spec.ts:401`](../../tests/e2e/video-script.spec.ts#L401) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (Me Tab) | `Confirmed` | `.badge-confirmed` | [`video-script.spec.ts:409`](../../tests/e2e/video-script.spec.ts#L409) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 5 (Recomputation) | `Get ready at 2:00 PM, leave by 2:25 PM` | `#now-title` (post-confirmation) | [`video-script.spec.ts:416`](../../tests/e2e/video-script.spec.ts#L416) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 6 (Conversational) | `Ask Yori` | `#conversation-title` | [`video-script.spec.ts:449`](../../tests/e2e/video-script.spec.ts#L449) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 6 (Conversational) | `Offline demo · simulated` | `#conversation-status-badge` | [`video-script.spec.ts:450`](../../tests/e2e/video-script.spec.ts#L450) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 6 (Conversational) | `Offline fallback · deterministic` | `#engine-status-chip` | [`video-script.spec.ts:451-453`](../../tests/e2e/video-script.spec.ts#L451-L453) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 6 (Conversational) | `Can I leave later?` | `.chat-bubble-user .chat-text` | [`video-script.spec.ts:456`](../../tests/e2e/video-script.spec.ts#L456) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Part 6 (Conversational) | `Scripted model fixture · not a live model call` | `#engine-status-chip` | [`video-script.spec.ts:458-460`](../../tests/e2e/video-script.spec.ts#L458-L460) | `Core 7 Segments Walkthrough in Order with Verbatim Assertions and Timing Budget` |
| Optional V5 (Fuel) | `Fuel (Low Fuel Warning)` | `#scene-select option[value="fuel"]` | [`video-script.spec.ts:197, 553`](../../tests/e2e/video-script.spec.ts#L553) | `Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion` |
| Optional V5 (Fuel) | `Low Fuel Warning` | `.now-card .now-subject` | [`video-script.spec.ts:555`](../../tests/e2e/video-script.spec.ts#L555) | `Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion` |
| Optional V5 (Fuel) | `Nearby gas stations from simulated fixture · straight-line distances shown` | `.now-card .mock-places-notice` | [`video-script.spec.ts:557-559`](../../tests/e2e/video-script.spec.ts#L557-L559) | `Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion` |
| Optional V5 (Fuel) | `Metro Gas & Go` | `.v2-candidate-card:first-child .v2-candidate-name` | [`video-script.spec.ts:562`](../../tests/e2e/video-script.spec.ts#L562) | `Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion` |
| Optional V5 (Fuel) | `Gas Station` | `.v2-candidate-card:first-child .v2-cuisine-chip` | [`video-script.spec.ts:563`](../../tests/e2e/video-script.spec.ts#L563) | `Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion` |
| Optional V5 (Fuel) | `(straight-line)` | `.v2-distance-chip` | [`video-script.spec.ts:564`](../../tests/e2e/video-script.spec.ts#L564) | `Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion` |
| Optional V5 (Fuel) | `Simulated fixture · Metro Gas` | `.v2-candidate-card:first-child .v2-candidate-basis` | [`video-script.spec.ts:565-567`](../../tests/e2e/video-script.spec.ts#L565-L567) | `Optional V5 Extension: Dynamic Fuel & Straight-Line Distance Assertion` |

---

## Speaker Production Checklist

- [ ] Speak in a calm, clear, unhurried conversational cadence (~140 wpm).
- [ ] Align screen interactions tightly with spoken timestamps.
- [ ] Avoid buzzwords like "supercharged" or "magical"; let the calm clarity of the UI speak for itself.
- [ ] Verify audio levels are crisp with no background hum or clipping.
