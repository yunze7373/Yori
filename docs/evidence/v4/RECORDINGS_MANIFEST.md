# Yori Living Context V2 — End-to-End Screen Recordings Manifest (Task V4 Closeout)

> **Governed by Plan:** `YORI_V2.plan.json` (Task `V4`, Priority P0, Condition C5)  
> **Status:** ✅ **COMPLETED (Two End-to-End Loops Verified & Captured at 390×844 and 1280×800)**  
> **Execution Date:** 2026-10-29  
> **Credentials Environment:** ZERO external credentials (`MODEL_API_KEY` unset, `XMEMO_OAUTH_ENABLED=false`, `WEATHER_LIVE_ENABLED=false`).  
> **Recording Engine:** Playwright Chromium (lossless `.webm`, 60fps).

---

## 1. Recording Files & Integrity Manifest

| Scenario | Viewport | Filename | Size | SHA-256 Checksum |
|---|---|---|---|---|
| **Rain Departure Loop** | 390×844 Mobile | `v4-rain-recording-390x844.webm` | 1.1 MB | `94cabac699a6ea47b95d469bb53cb95de8e34f27bcb66f1b1f669adbafa9adf3` |
| **Rain Departure Loop** | 1280×800 Desktop | `v4-rain-recording-1280x800.webm` | 993 KB | `3f8ba564794bdae8e6c428689208b0f6c8a87a8d585aada3006d5d491164487d` |
| **Away Lunch Loop** | 390×844 Mobile | `v4-lunch-recording-390x844.webm` | 694 KB | `a2cd7ed03fe4cdb58e8a3b6d6f9e6251a0818c0e6a8e0f12d4ee6e280aa52f71` |
| **Away Lunch Loop** | 1280×800 Desktop | `v4-lunch-recording-1280x800.webm` | 564 KB | `36fe0c0b4dbe23ff5f345603a5576188ebbc7d488ada12596e56fa8e09edbd58` |

**Local File Directory:** `<repo-root>/docs/evidence/v4/recordings/`

---

## 2. Rain Departure Loop: Step → Timestamp Ledger

> **Loop Script:** `change → route → map/Why → chat 'leave later' → compare → confirm → collapse → updated home/map/times → Undo → confirm-only memory`

### Mobile (390×844 Portrait) & Desktop (1280×800)

| Timestamp | Step Name | User Action | State & UI Transition | Honest Disclosure & Verification |
|---|---|---|---|---|
| `0:01` | **Initial Clear State** | Navigate to `http://localhost:4173/?ui=v2` on Clear scene (D1). | Single NOW card: *"Piano lesson at 3:00 PM"*, *"Get ready at 2:05 PM, leave by 2:25 PM"*. | Header: `Demo · simulated context`, Badge: `SIMULATED`, Axe: 0 violations. |
| `0:01` | **Change (Weather Shift)** | Switch scenario picker to Rain Re-Plan (D2). | NOW card alerts: *"What changed: rain forecast"*; umbrella chip visible; map renders weather callout. | Callout: `"Rain forecast · simulated"`, `"Issued 1:35 PM"`. |
| `0:02` | **Route & Transit Ranking** | Inspect Route Map and transit options. | Drive ranked first (`Drive · leave 2:30 PM`, `Recommended`), Bus second (`Bus · leave 2:15 PM`). | Basis cites: `"Rain travel habit (Demo profile · sample)"`; map schematic. |
| `0:03` | **Why Provenance Review** | Tap **Why** button on NOW card. | Why Sheet slides up: details weather signals (`Issued 1:35 PM`) and sample profile habits. | Memory section: `"Memory & Habits"`, badge: `"Demo profile · sample preference"`. |
| `0:05` | **Ask Yori: Leave Later Query** | Tap Ask Bar; submit query *"Can I leave 15 minutes later?"*. | Full-page conversation overlay opens; model interpreter executes scripted fixture command. | Engine status updates: `"Offline fallback · deterministic"` → `"Scripted model fixture · not a live model call"`. |
| `0:06` | **Compare Late Arrival** | Review transcript late arrival comparison box. | Highlights late shift: *"Arrive 3:10 PM (10 min after appointment) · Late"*. | Explicit user choice: single-trip override confirmation box. |
| `0:06` | **Confirm Shift** | Tap **Confirm late shift** (`#btn-chat-confirm`). | Shift confirmed for this time only; action state commits session override. | Local action state committed; zero core diff. |
| `0:06` | **Collapse to Updated Home** | Auto-collapse back to updated Living Context. | NOW card updates: leave `2:45 PM`, prep `2:25 PM`. Both option cards visible. | Why provenance: `"Because you asked: leave 15 min later · this time only"`. |
| `0:07` | **Undo Override** | Tap **Undo** button (`#btn-undo-accept`). | Schedule reverts immediately to original `2:30 PM` departure, `2:10 PM` prep. | Non-destructive rollback of local session override. |
| `0:11` | **Confirm-Only Memory & Sovereignty** | Open Adjust Departure Timing, set prep 25m, buffer 10m, Remember as preference; view on For You / Me; confirm on Me. | Proposal appears on For You; Me tab shows proposal titled *"Preparation buffer habit"*; confirm moves to Confirmed; Home recomputes to `2:00 PM / 2:25 PM`! | **INV-107 confirm-only memory**: no silent writes; **X1 unauthorized**: remote sync off; storage sovereign. |

---

## 3. Away Lunch Loop: Step → Timestamp Ledger

> **Loop Script:** `proactive card → photos/candidates/basis → chat 'quieter + vegetarian' → re-rank → selected on home → quiet state`

### Mobile (390×844 Portrait) & Desktop (1280×800)

| Timestamp | Step Name | User Action | State & UI Transition | Honest Disclosure & Verification |
|---|---|---|---|---|
| `0:01` | **Proactive Lunch Card** | Select Away Lunch (D3) scene. | Candidates Hero: *"Lunch options near you"*, *"Places matching what you like, within walking distance"*. | Mock notice: `"Mock places for this demo; real listings come from a place provider."` Zero star ratings or review counts. |
| `0:02` | **Candidates & Detail View** | Inspect candidate cards with local artwork; tap Place A. | Place A (`Demo Place A · Ramen`) details view opens: artwork, attribute chips (`Quiet`, `Japanese`, `5m away`), in-app Directions. | Truthful venue names: `Demo Place A/B/C`; in-app mock directions; zero external map URLs. |
| `0:03` | **Ask Yori: Preference Re-rank** | Tap docked Ask Bar; submit query *"quieter + vegetarian"*. | Conversation overlay opens; scripted model interpreter re-ranks candidate weights. | Engine status chip: `"Offline fallback · deterministic"`. |
| `0:04` | **Re-ranked Candidates** | Auto-collapse back to refreshed Home. | Candidates re-ranked: `Demo Place B · Salad` moves to #1 and is highlighted as selected! Attribute chips: `Quiet`, `Vegetarian`, `7m away`. | Why button cites: `"Because you asked: quieter + vegetarian · this time only"`. |
| `0:05` | **Selected Candidate on Home** | Tap `Demo Place B · Salad` to open details. | Place B details view opens from Home selected position: confirms Salad, Vegetarian, Quiet, 7m away. | Grounded attributes verified against mock place provider. |
| `0:07` | **Calm Quiet State & Sovereignty** | Switch to Busy Lunch (D4); navigate to Me tab. | Screen smoothly enters quiet state: *"Nothing needs your attention right now."* Me tab displays proactive budget meter (`0 of 3 used today`). | Respects user focus; INV-107 confirm-only memory; X1 unauthorized remote sync off; local storage controls. |

---

## 4. Key Architectural Invariants Verified

1. **Simulated-Data Labelling**: Every surface displays clear, prominent disclosure badges (`Demo · simulated context`, `SIMULATED`, `Rain forecast · simulated`, `Schematic · simulated`, `Mock places for this demo`).
2. **Confirm-Only Memory (INV-107)**: When an adjustment is saved with "Remember as preference", it creates a pending proposal on For You and Me. Confirmed preferences remain strictly empty until the user explicitly taps "Confirm".
3. **Engine-Status Honesty**: Transparent disclosure (`Offline fallback · deterministic` and `Scripted model fixture · not a live model call`). No simulated responses are ever falsely claimed as live AI model calls.
4. **Accessibility (WCAG 2.1 AA / Axe Core)**: Both mobile and desktop runs execute `checkAxe` across all views with **0 critical or serious violations**.
5. **Zero-Core-Diff Invariant**: `git diff --stat f43c6c1d HEAD -- src/core` remains **100% EMPTY** (0 files, 0 lines changed).
