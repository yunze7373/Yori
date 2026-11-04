# Yori (ヨリ) — Demo Video Script v5 · Director's Cut (≤3:00, phone 390×844, English VO)

> **Governed by Plan:** `DEMO_RESCUE` (Rev 14, Closeout)  
> **Target Duration:** Exactly 2:58 (178s: 2:56 content + 2s tail, ≤ 3:00, 7 segments)  
> **Format:** Single canvas, Mobile portrait (390×844), 60 fps, DPR 3  
> **Voiceover (VO):** ElevenLabs Morgan Vox (`en-US`, Live VO variant B, `vo_el_v5/yori_vo_el_v5_full.wav`)  
> **Background Audio:** Soft felt-piano bed at -24 LUFS (`assets_el/music_bed_3min.mp3`); subtle rain foley in Segment 2  
> **Theme:** Build for Your World  
> **Track:** Indie Developer Track  
> **Team Name:** Yonro  
> **Repository:** https://github.com/yunze7373/Yori  
> **License:** MIT License  

---

## 🎬 Director's Thesis & Core Narrative

- **「提前准备好而不等人问」 (Prepares before you ask)**: The film opens on a phone where the afternoon plan is already laid out. Zero chat box or prompt input in the opening moments.
- **「打开即有现成所需」 (Ready at first glance)**: 3-second comprehension. Frame 1 opens on Living Context (Now / Ahead / For You) with a persistent corner badge `Demo · simulated data`.
- **"Always thinking ahead, not always interrupting"**: Explicit **Not now** beat and calm **Quiet State** (*"Nothing needs your attention right now."*).
- **"Memory follows the user, not the place"**: Habit learning (Segment 4) is introduced before Live mode (Segment 5). The Me tab demonstrates that memory is designed to follow you, not the venue.
- **"Build for Your World"**: Hirosaki is our own city in northern Japan—not a tourist excursion. Yori is built to understand you in your own world.
- **The Six-Stage Intelligence Loop**: Perceive · Understand · Predict · Prepare · Present · **Confirm & learn**. Culminates in: *"Yori. It thinks ahead for you."*

---

## 🎨 Visual & Motion Style

- **Single Canvas Presentation**: The phone viewport (390×844) floats on a warm ivory background (`#F8F8F5`). Camera transitions utilize smooth glide, push-in, and pull-back motions.
- **Climax Pull-Back (2:26)**: At 2:26, the camera smoothly pulls back to reveal the seven pivotal moments across the canvas, sequencing the six-stage loop words.
- **Editorial Typography**: Warm serif display typography paired with clean, accessible geometric sans body copy. Quiet Precision tokens: touch targets ≥ 44 px.
- **Uncompromised Honesty**: Every `SIMULATED` badge, `Demo · simulated ›` header chip, and schematic disclosure remains unclipped and visible. Only Segment 5 is live.

---

## 🧭 Truth Map: Demo vs. Live Modes

| Subsystem / Feature | Demo Scenes (Segments 1–4, 6) | Live Mode (Segment 5) | Verification & Grounding Rule |
|---|---|---|---|
| **Schedule / Calendar** | Simulated appointment fixture (`Piano lesson at 3:00 PM`) | Not shown in the video | Time-bounded, never fabricates commitments |
| **Ambient Weather** | Simulated rain forecast (`issued 1:35 PM`) | Not shown in the video | Consented, fail-closed to current conditions if stale |
| **Route & Travel Time** | Schematic travel simulation (20m prep, 25m drive) | Not used; route geometry cut | Explicitly labelled `Schematic · simulated`; no fake GPS |
| **Nearby Places** | Curated mock listings (`Pacific Ramen Bar`, etc.) | Real venues via OpenStreetMap / Overpass / Google Places | Real places around the set coordinate; no fake venues |
| **Location Coordinate** | Selected City (simulated) | Placed coordinate (`40.6075 N, 140.4640 E` at Hirosaki Castle) | Truthful caption: *"Location set to Hirosaki Castle"* |
| **Location Permission** | N/A (simulated scene) | In-conversation permission prompt with `[Allow location]` | Native browser geolocation API; Allow / Not now chips |
| **Ranking & Reasoning** | Deterministic habit rule (`Rain travel habit`) | **Meta Muse Spark 1.3 (`muse-spark-1.3`)** live API ranking | Hero card labelled `Meta Muse Spark · live` |
| **Conversational Reply** | N/A | **Meta Muse Spark 1.3** live model reply | Ask header chip labelled `Meta model · live` |
| **Habit Learning** | Pure domain memory (`src/core/memory/`) | Pure domain memory | Visible under *"What Yori has learned"*; one-tap Forget |
| **Proactive Budget** | Shown on Me (`0 of 3 used today` / `1 of 3`) | Not shown in the video | Policy budget of 3 proactive prompts/day is shown on Me; this build emits no proactive prompts or notifications. |

---

## ⏱️ Storyboard & Segment Timeline (178s Total · ≤3:00)

All demo scene URLs require `&test=1` alongside `?scene=<id>` to activate scene switching:  
`http://localhost:4173/?mode=demo&ui=v2&test=1&scene=<clear|rain|lunch|busy-lunch>`

| # | Time | Segment Name | Scene / URL | Screen & Camera Action | On-Screen Caption | Spoken Voiceover (Verbatim) |
|---|---|---|---|---|---|---|
| **1** | `0:00–0:15` (15s) | **Open — Already Prepared** | `scene=clear&test=1` | Phone open on Home. Living Context: Now / Ahead / For You. Push-in on NOW card: *"Piano lesson at 3:00 PM"*, *"Get ready at 2:05 PM, leave by 2:25 PM"*, `SIMULATED`, chip `Demo · simulated ›`. | **Already prepared** before you ask | "Most assistants wait for you to ask. Yori prepares before you do. Open it, and your afternoon is already laid out. No chat box. This is Yori." |
| **2** | `0:15–0:41` (26s) | **Rain — Plan Changes** | `scene=rain&test=1` | 3s illustrative rain b-roll. Cut to rain card: *"What changed: rain forecast"*, Umbrella chip, *"Rain in the forecast for your travel window · simulated (issued 1:35 PM)"*. Departure moves later to 2:30 PM with drive buffer (*"Leave by 2:30 PM"*, *"Rain forecast · Drive"*). Tap Accept → the card shows Accepted · Undo. | Context changed → **plan changed** | "A simulated afternoon. Piano lesson at three. Then the forecast turns to rain. Yori doesn't just warn you. It proposes a new plan: drive instead, and leave at two thirty, not two twenty-five. It shows exactly what changed. One tap to accept." |
| **3** | `0:41–1:02` (21s) | **Lunch → Not Now → Quiet** | `scene=lunch&test=1` → `scene=busy-lunch&test=1` | Noon lunch recommendations: *"Lunch options near you"*, *"Mock places for this demo"*, *"Pacific Ramen Bar"*. Tap `Not now`. 3s quiet café b-roll. Cut to busy-lunch: *"Nothing needs your attention right now."*, *"You're all caught up. We'll let you know when something comes up."*. | **Thinking ahead**, not interrupting | "Around noon, lunch is already lined up nearby. Not now? One tap, and Yori steps back. And when nothing needs you, it stays quiet. Always thinking ahead. Not always interrupting." |
| **4** | `1:02–1:18` (16s) | **Learns — Preference** | `scene=clear&test=1` | Return to Demo Home. Tap Adjust on departure timing: set prep 25 min, buffer 10 min. Tap *"Remember as preference"*. Card updates to *"UPDATED Leave by 2:25 PM → 2:20 PM"*, *"Get ready at 1:55 PM, leave by 2:20 PM"*. | **You** stay in charge | "Adjust a plan, and choose to remember it as a preference. Yori learns from what you choose, and shows you exactly what it keeps." |
| **5** | `1:18–2:08` (50s) | **LIVE: Hirosaki — My Own City** | Live Mode (`mode=live&ui=v2`) | Real Street View still of Hirosaki Castle cherry blossoms. Cut to Live phone (demo badge off). Tap *"Lunch nearby"* → inline permission prompt → tap `[Allow location]`. Real places load; hero card labelled **`Meta Muse Spark · live`** (hold ≥4s). Tap *"Somewhere quieter"*; live Muse reply loads with chip `Meta model · live` (hold ≥4s). Slow pull-back. | **Real places**, ranked live by **Meta Muse Spark** | "Yori is built for your world. This one is ours: Hirosaki, in northern Japan. Now, live. With our location set to Hirosaki Castle, tap Lunch nearby, and Meta Muse Spark ranks real places nearby, live. Want somewhere quieter? One tap, and Muse Spark writes the reply. Live is labeled live. Simulated stays simulated." |
| **6** | `2:08–2:26` (18s) | **Me & Memory — See It, Forget It** | Me Tab (`#tab-me`) | Navigate to Me tab: *"Me & Memory"*, proactive budget *"0 of 3 used today"*. Under *"What Yori has learned"*, find *"Preparation buffer habit · Get ready 25 min · Leave a 10 min buffer · You told Yori"*. Tap `Forget` → item is cleared, displaying *"Nothing yet. As you pick places in Yori, it learns what you like and puts it first."*. | See it. **Forget it.** | "What Yori remembers lives in one place you control. It's designed to follow you, not the place. See it. Forget it. Anytime." |
| **7** | `2:26–2:56` (30s + 2s tail) | **Close — The Loop & End Card** | Canvas Overview | Camera pulls back to reveal the 7 phone moments across the canvas. Six loop words appear: **Perceive · Understand · Predict · Prepare · Present · Confirm & learn**. End card appears at 2:38: *"Yori — thinks ahead for you"*, repo URL, *"Built with Meta Muse Spark"*, Team Yonro. Ring out on final piano chord to 2:58. | **Perceive · Understand · Predict · Prepare · Present · Confirm & learn** | "That's the loop Yori is built on. Perceive. Understand. Predict. Prepare. Present, at the right moment. Then you confirm, and it learns. Yori. It thinks ahead for you." |

---

## 📝 End-Card Small Print (Verbatim)

```
Live: Meta Muse Spark ranking and replies (Hirosaki segment). Everything else: simulated demo data. Location was set, not physical. Illustrative footage is not product UI.
```

---

## 🎙️ Live VO Variants

- **Variant B (Default, Master Track)**: Claims only verified facts: real places ranked live by Meta Muse Spark; Meta Muse Spark writes the quieter reply.
- **Variant A (Preference Link — Not Supported)**: Connects live ranking back to learned departure preference. *Excluded because live ranking does not ingest departure buffers.*
- **Variant C (No-Ask Fallback)**: Drops the quieter reply beat if live reply take cannot be completed live, extending card hold times.

---

## 🎬 Detailed Segment Specifications

### Segment 1: Open — Already Prepared (`0:00 – 0:15` · 15s)
- **URL**: `http://localhost:4173/?mode=demo&ui=v2&test=1&scene=clear`
- **Viewport**: 390×844 (Mobile portrait)
- **On-Screen Text**:
  - Greeting: *"I've already looked ahead for you."*
  - Timing: *"Leave by 2:25 PM"*
  - Headline: *"Piano lesson at 3:00 PM"*
  - Schedule: *"Get ready at 2:05 PM, leave by 2:25 PM"*
  - Pill badge: `SIMULATED`
  - Demo header chip: `Demo · simulated ›`
  - Persistent badge: `Demo · simulated data`
- **Camera**: Gentle push-in toward the NOW card; camera glides across Now → Ahead → For You without tapping.

### Segment 2: Rain — Plan Changes (`0:15 – 0:41` · 26s)
- **URL**: `http://localhost:4173/?mode=demo&ui=v2&test=1&scene=rain`
- **On-Screen Text**:
  - Alert banner: *"What changed: rain forecast"*
  - Weather chip: `Umbrella`
  - Forecast note: *"Rain in the forecast for your travel window · simulated (issued 1:35 PM)"*
  - Updated timing: *"Leave by 2:30 PM"* (departure moves later to accommodate drive travel with buffer)
  - Updated schedule: *"Get ready at 2:10 PM, leave by 2:30 PM"*
  - Recommended transit chip: *"Rain forecast · Drive"*
  - Action buttons: `Accept`, `Adjust`, `Details →`, `Not now`
  - Route map: *"Schematic · simulated"*
- **Sequence**:
  1. 0:15–0:18: 3s illustrative rain on window (`assets_el/broll_B_rain_window_9x16.mp4`).
  2. 0:18–0:34: Cut from clear card (2:25) to rain card (2:30) highlighting *"What changed"*.
  3. 0:34–0:41: Tap `Accept` → the card shows `Accepted` · `Undo`.

### Segment 3: Lunch → Not Now → Quiet (`0:41 – 1:02` · 21s)
- **URL**: `http://localhost:4173/?mode=demo&ui=v2&test=1&scene=lunch` then `&scene=busy-lunch`
- **On-Screen Text**:
  - Headline: *"Lunch options near you"*
  - Subtitle: *"Nearby places (straight-line distances)"*
  - Mock notice: *"Mock places for this demo; real listings come from a place provider."*
  - Location badge: *"Location: Selected City (simulated)"*
  - Primary recommendation: *"Pacific Ramen Bar"*
  - Action buttons: `Accept`, `Adjust`, `Details →`, `Not now`
- **Sequence**:
  1. 0:41–0:50: Lunch recommendations surface at noon.
  2. 0:50–0:54: Tap `Not now` on the lunch card → card is replaced by quiet note banner with Undo (requires NOT-NOW-ONE-TAP; if not shipped, record Not now → reason dialog → "Don't suggest this today" and drop "One tap" from the VO).
  3. 0:54–0:57: 3s quiet café b-roll (`assets_el/broll_C_quiet_cafe_9x16.mp4`).
  4. 0:57–1:02: Cut to `scene=busy-lunch`: *"Nothing needs your attention right now."*, *"You're all caught up. We'll let you know when something comes up."*.

### Segment 4: Learns — Preference (`1:02 – 1:18` · 16s)
- **URL**: `http://localhost:4173/?mode=demo&ui=v2&test=1&scene=clear`
- **On-Screen Text**:
  - Tap `Adjust` on departure timing.
  - Modal title: *"Adjust Departure Timing"*
  - Inputs: Prep 25m, Buffer 10m.
  - Action button: *"Remember as preference"*
  - Updated card: *"UPDATED Leave by 2:25 PM → 2:20 PM"*, *"Get ready at 1:55 PM, leave by 2:20 PM"*
  - Context: *"You told Yori · Get ready 25 min · Leave a 10 min buffer"*

### Segment 5: LIVE: Hirosaki — My Own City (`1:18 – 2:08` · 50s)
- **Execution**: Live Mode (`/?mode=live&ui=v2`), Owner-recorded on local Mac
- **Coordinate**: `40.6075 N, 140.4640 E` (Hirosaki Castle, Aomori Prefecture, Japan)
- **Corner Card**: *"LIVE · Location set to Hirosaki Castle · 40.6075 N, 140.4640 E"* (Demo badge OFF)
- **Sequence**:
  1. 1:18–1:21: Real Google Street View still of Hirosaki Castle honmaru cherry blossoms (`assets_maps/sv_castle_h*.jpg`) with Google logo & © kumax aomori.
  2. 1:21–1:28: Cut to phone in Live mode.
  3. 1:28–1:44: Tap suggested chip *"Lunch nearby"*. Inline prompt *"I need your location to find places near you."* appears. Tap `[Allow location]`. Real venues around Hirosaki Castle load.
  4. 1:44–1:48: Hold ≥4s on hero card rank label: **`Meta Muse Spark · live`**.
  5. 1:48–2:00: Reopen Ask, tap follow-up chip *"Somewhere quieter"*. Live grounded reply authored by Meta Muse Spark appears with header chip **`Meta model · live`** (hold ≥4s).
  6. 2:00–2:08: Slow pull-back with both live labels visible.

### Segment 6: Me & Memory — See It, Forget It (`2:08 – 2:26` · 18s)
- **URL**: Me Tab (`#tab-me`)
- **On-Screen Text**:
  - Title: *"Me & Memory"*
  - Budget badge: *"0 of 3 used today"*
  - Section: *"What Yori has learned"*
  - Learned entry: *"Preparation buffer habit · Get ready 25 min · Leave a 10 min buffer · You told Yori"*
  - Action: Tap `Forget` button.
  - Cleared state: *"Nothing yet. As you pick places in Yori, it learns what you like and puts it first."*
  - Sovereign action: *"Reset Storage"*

### Segment 7: Close — The Loop & End Card (`2:26 – 2:56` (+2s tail) · 32s)
- **Visual**: Camera smoothly pulls back from phone frame to reveal 7 phone states across the canvas.
- **Six-Stage Intelligence Loop**:
  1. **Perceive** (Calendar, Weather, Location)
  2. **Understand** (User choices, stated constraints)
  3. **Predict** (Delays, hunger windows, rain impact)
  4. **Prepare** (At most one actionable plan)
  5. **Present** (Calm glanceable Living Context)
  6. **Confirm & learn** (User sovereignty and habit memory)
- **End Card (2:38 – 2:58)**:
  - Brand: `Yori — thinks ahead for you`
  - Repository: `https://github.com/yunze7373/Yori`
  - Attribution: `Built with Meta Muse Spark`
  - Team: `Yonro`
  - Small Print: `Live: Meta Muse Spark ranking and replies (Hirosaki segment). Everything else: simulated demo data. Location was set, not physical. Illustrative footage is not product UI.`
