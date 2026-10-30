# Yori Living Context V2 — End-to-End Screen Recordings Manifest (Task V4 Closeout)

> **Governed by Plan:** `YORI_V2.plan.json` (Task `V4`, Priority P0, Condition C5)  
> **Status:** ✅ **COMPLETED (Two End-to-End Loops Verified & Captured at 390×844 and 1280×800)**  
> **Execution Date:** 2026-10-29  
> **Credentials Environment:** ZERO external credentials (`MODEL_API_KEY` unset, `XMEMO_OAUTH_ENABLED=false`, `WEATHER_LIVE_ENABLED=false`).  
> **Recording Engine:** Playwright Chromium WebM (`recordVideo: { size: viewport }`, VP8, 25fps, paced at 2.5s per step).

---

## 1. Recording Files & Integrity Manifest

| Scenario | Viewport | Filename | Size | Duration | SHA-256 Checksum |
|---|---|---|---|---|---|
| **Rain Departure Loop** | 390×844 Mobile | `v4-rain-recording-390x844.webm` | 2.1 MB (2,259,484 B) | 34.84 s | `9c7dafad0de5893fc1c3ef921944a02ad15677c29d5adfcac72569a5b36f646a` |
| **Rain Departure Loop** | 1280×800 Desktop | `v4-rain-recording-1280x800.webm` | 3.0 MB (3,192,103 B) | 34.84 s | `4f6c4821ef529b98f9b9e42ce5e01fba435f6a762b505c402cd4bcb1ea678464` |
| **Away Lunch Loop** | 390×844 Mobile | `v4-lunch-recording-390x844.webm` | 1.5 MB (1,569,805 B) | 24.48 s | `e537911214d113356064be0def2467bdac575a658b232f65c01ed41e4a7d212c` |
| **Away Lunch Loop** | 1280×800 Desktop | `v4-lunch-recording-1280x800.webm` | 2.4 MB (2,485,541 B) | 24.56 s | `02af48a82c8be92ae6c2268b72a703a628ca5bb1e53f69ec71087b508ba2408b` |

**Local File Directory:** `docs/evidence/v4/recordings/`

### Verbatim `ffprobe` Technical Stream Metadata

```text
=== docs/evidence/v4/recordings/v4-rain-recording-390x844.webm ===
width=390
height=844
r_frame_rate=25/1
duration=34.840000
size=2259484

=== docs/evidence/v4/recordings/v4-rain-recording-1280x800.webm ===
width=1280
height=800
r_frame_rate=25/1
duration=34.840000
size=3192103

=== docs/evidence/v4/recordings/v4-lunch-recording-390x844.webm ===
width=390
height=844
r_frame_rate=25/1
duration=24.480000
size=1569805

=== docs/evidence/v4/recordings/v4-lunch-recording-1280x800.webm ===
width=1280
height=800
r_frame_rate=25/1
duration=24.560000
size=2485541
```

---

## 2. Rain Departure Loop: Step → Timestamp Ledger

> **Loop Script:** `change → route → map/Why → chat 'leave later' → compare → confirm → collapse → updated home/map/times → Undo → confirm-only memory`

### Step Progression (Mobile 390×844 & Desktop 1280×800)

| Timestamp | Step Name | User Action | State & UI Transition | Honest Disclosure & Verification |
|---|---|---|---|---|
| `0:00` (1s) | **Initial Clear State** | Navigate to `http://localhost:4173/?ui=v2` on Clear scene (D1). | Single NOW card: *"Piano lesson at 3:00 PM"*, *"Get ready at 2:05 PM, leave by 2:25 PM · Drive · 30 min"*. | Header: `Demo · simulated context`, Badge: `SIMULATED`, Axe: 0 violations. |
| `0:03` (3s) | **Change (Weather Shift)** | Switch scenario picker to Rain Re-Plan (D2). | NOW card alerts: *"What changed: rain forecast"*; umbrella chip visible; map renders weather callout. | Callout: `"Rain forecast · simulated"`, `"Issued 1:35 PM"`. |
| `0:05` (6s) | **Route Options (Drive vs Bus)** | Compare Drive vs Bus recommendation cards. | Drive ranked first (`Drive · leave 2:30 PM`, `Recommended`, 25m drive + 5m margin), Bus second (`Bus · leave 2:15 PM`, `Alternative`, 40m bus + 5m margin). | Basis cites: `"Ranked by habit: Rain travel habit (Demo profile · sample)"`; map schematic. |
| `0:08` (8s) | **Map & Why Provenance** | Tap **Why** button on NOW card. | Why Sheet opens: details calendar event (`10:00 AM`), weather signal (`Recorded at 1:35 PM`), and sample profile habits. | Memory section: `"Memory & Habits"`, badge: `"Demo profile · sample preference"`. |
| `0:14` (14s) | **Ask Yori: Leave Later Query** | Tap Ask Bar; submit query *"Can I leave 15 minutes later?"*. | Full-page conversation overlay opens; model interpreter executes scripted fixture command. | Engine status updates: `"Offline fallback · deterministic"` → `"Scripted model fixture · not a live model call"`. |
| `0:16` (17s) | **Compare Late Arrival** | Review transcript late arrival comparison box. | Highlights late shift: *"Leaving 15 minutes later moves your departure to Rain re-plan for Piano lesson: prepare 2:25 PM, leave 2:45 PM... You will arrive late for Piano lesson."* | Explicit user choice: single-trip override confirmation box. |
| `0:19` (19s) | **Confirm Shift** | Tap **Confirm for this time only** (`#btn-chat-confirm`). | Shift confirmed for this time only; action state commits session override. | Local action state committed; zero core diff. |
| `0:21` (22s) | **Collapse to Updated Home** | Auto-collapse back to updated Living Context. | NOW card updates: leave `2:45 PM`, prep `2:25 PM`. Both option cards visible. | Why provenance: `"Because you asked: leave 15 min later · this time only"`. |
| `0:24` (24s) | **Undo Override** | Tap **Undo** button (`#btn-undo-accept`). | Schedule reverts immediately to original `2:30 PM` departure, `2:10 PM` prep. | Non-destructive rollback of local session override. |
| `0:32` (32s) | **Confirm-Only Memory & Sovereignty** | Open Adjust Departure Timing, set prep 25m, buffer 10m, Remember as preference; view on For You / Me; confirm on For You. | Proposal appears on For You; confirmed moves to Confirmed; Home recomputes to `2:00 PM / 2:25 PM`! | **INV-107 confirm-only memory**: no silent writes; **X1 unauthorized**: remote sync off; storage sovereign. |

---

## 3. Away Lunch Loop: Step → Timestamp Ledger

> **Loop Script:** `proactive card → photos/candidates/basis → chat 'quieter + vegetarian' → re-rank → selected on home → Why provenance → quiet state`

### Step Progression (Mobile 390×844 & Desktop 1280×800)

| Timestamp | Step Name | User Action | State & UI Transition | Honest Disclosure & Verification |
|---|---|---|---|---|
| `0:01` (2s) | **Proactive Lunch Card** | Select Away Lunch (D3) scene. | Candidates Hero: *"Lunch options near you"*, *"Places matching what you like, within walking distance"*. | Mock notice: `"Mock places for this demo; real listings come from a place provider."` Zero star ratings or review counts. |
| `0:04` (4s) | **Candidates & Detail View** | Inspect candidate cards with local artwork; tap Place A. | Place A (`Demo Place A · Ramen`) details view opens: artwork, attribute chips (`Quiet`, `Japanese`, `5m away`), in-app Directions. | Truthful venue names: `Demo Place A/B/C`; in-app mock directions; zero external map URLs. |
| `0:07` (8s) | **Ask Yori & Scene-Aware Greeting** | Tap docked Ask Bar; inspect scene-aware lunch greeting. | Conversation overlay opens; transcript greets with lunch context: `"I can help with lunch recommendations: ask 'quieter', 'vegetarian', 'closer', or 'Why this recommendation?'."` | Engine status chip: `"Offline fallback · deterministic"`. |
| `0:11` (11s) | **Ask Yori: Preference Re-rank** | Submit conversational query *"quieter + vegetarian"*. | Conversation shell acknowledges: *"Filtered for quieter, vegetarian: re-ranked lunch recommendations"*. | Transcript remains visible for reading before auto-collapse. |
| `0:13` (14s) | **Re-ranked Candidates on Home** | Auto-collapse back to refreshed Home. | Candidates re-ranked: `Demo Place B · Salad` moves to #1 and is highlighted as selected! Attribute chips: `Quiet`, `Vegetarian`, `7m away`. | Why button cites: `"Because you asked: quieter, vegetarian · this time only"`. |
| `0:16` (16s) | **Inspect Why Citation** | Tap **Why** button on re-ranked candidate. | Why sheet opens: cites *"Because you asked: quieter, vegetarian · this time only"* alongside schedule fit and taste basis. | Provenance attribution clearly distinguishes in-session query from stored facts. |
| `0:21` (21s) | **Quiet State & Sovereignty** | Switch to Busy Lunch (D4); navigate to Me tab. | Screen smoothly enters quiet state: *"Nothing needs your attention right now."* Me tab displays proactive budget meter (`0 of 3 used today`). | Respects user focus; INV-107 confirm-only memory; X1 unauthorized remote sync off; local storage controls. |

---

## 4. Key Architectural Invariants Verified

1. **Simulated-Data Labelling**: Every surface displays clear, prominent disclosure badges (`Demo · simulated context`, `SIMULATED`, `Rain forecast · simulated`, `Schematic · simulated`, `Mock places for this demo`).
2. **Confirm-Only Memory (INV-107)**: When an adjustment is saved with "Remember as preference", it creates a pending proposal on For You and Me. Confirmed preferences remain strictly empty until the user explicitly confirms.
3. **Engine-Status Honesty**: Transparent disclosure (`Offline fallback · deterministic` and `Scripted model fixture · not a live model call`). No simulated responses are ever falsely claimed as live AI model calls.
4. **Exact Viewport Dimensions**: Recordings captured with `recordVideo: { size: viewport }` at exact 390×844 and 1280×800 dimensions (no downscaling).
5. **Human Reading Pacing**: Steps paced at 2.5s intervals, with chat query responses and Why citations kept open for examination.
6. **Accessibility (WCAG 2.1 AA / Axe Core)**: Both mobile and desktop runs execute `checkAxe` across all views with **0 critical or serious violations**.
7. **Zero-Core-Diff Invariant**: `git diff --stat f43c6c1d HEAD -- src/core` remains **100% EMPTY** (0 files, 0 lines changed).
