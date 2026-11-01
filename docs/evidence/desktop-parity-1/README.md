# DESKTOP-PARITY-1: Desktop Parity Evidence & Verification Report

Governed by Task `[TID:INBOX-20261101-4DD41F]`.  
Plan of Record: `.progress/review/reports/OWNER_DESIGN_FEEDBACK_20261102.md` (Item 2).  
Approved Reference Dashboard: `<repo-root>/Downloads/Yori Proactive AI Dashboard.png` (sha256 `667f1ff2320b9f97431a47999d1c6297fb33b017c6de7d00b40cc95aacb04efc`, 1586×992, preserved outside git tree).

---

## 1. Executive Summary

This deliverable brings the desktop Home view, header, hero card, and contextual right panel into full structural and visual parity with the owner's approved dashboard reference.

- **Empty Header Eliminated**: Replaced bare top area with the Desktop Greeting Row ("Good afternoon. I've already looked ahead for you.") paired with a 5-item truthful connector status strip (Location, Calendar, Weather, XMemo, Alerts), runtime pill, demo controls, and profile avatar.
- **Hero Card "THOUGHT AHEAD FOR YOU"**: Equipped with top badge `THOUGHT AHEAD FOR YOU`, headline `#now-title` with transit mode icon, one-sentence rationale, rain checklist chip (`#chip-umbrella`), and a 4-signal tile grid (Weather, Calendar, Transit, Memory).
- **Structured Sectioned Feed**: Replaced collapsible secondary sections with 3 clear sections:
  1. *Now*: Event headline, subtitle, and prominent countdown pill (`In 1 hr 15 min` / `In 55m`).
  2. *Ahead*: 2-column grid of upcoming plans with "See all ›" link (`#link-ahead-see-all`).
  3. *For You*: Personalized suggestions card with Confirm/Reject actions and "See all ›" link (`#link-foryou-see-all`).
- **Right Panel Multi-Section Reference Layout**:
  1. *Trip Details*: Header with `🟢 On time`, schematic route map, and a 4-stat metric row (Leave by / Arrive by / Distance / Traffic).
  2. *Destination Weather*: Temperature, conditions, departure-window timeline, and location.
  3. *Nearby Lunch Recommendations*: Candidate cards with local illustrations, walk times, cuisine chips, and sparkle rationale (`✨`).
  4. *Live Mode Coherence*: Strictly preserves honest notices (`#desktop-notice-route-unavailable`, `#desktop-notice-places-disabled`) with zero simulated provenance leakage.

---

## 2. Zone-by-Zone Reference Parity Matrix

| Reference Dashboard Zone | Reference Feature | Implemented In | Truthfulness & Provenance (INV-102/103) |
|---|---|---|---|
| **Top Greeting Row** | "Good afternoon. I've already looked ahead for you." | `src/ui/living-context/app.ts` (`.desktop-greeting-row`) | Dynamic time-of-day greeting from snapshot clock. |
| **Connector Status Strip** | Location, Calendar, Weather, XMemo, Alerts | `#desktop-connector-strip` (`.connector-status-chip`) | Truthful runtime status: Calendar = `N/A`, Weather = `20°C` / `Open-Meteo`, XMemo = `Simulated` / `Connected`. |
| **Hero Badge** | `THOUGHT AHEAD FOR YOU` with star icon | `v2-home-view.ts` (`.hero-thought-badge`) | Visually prominent badge matching reference aesthetic. |
| **Hero Headline & Rationale** | `#now-title` with transit icon & umbrella chip | `v2-home-view.ts` (`#now-title`, `#chip-umbrella`) | Preserves all verbatim test assertions and engine diffing. |
| **Hero Signal Inputs Grid** | 4 signal tiles: Weather, Calendar, Transit, Memory | `v2-home-view.ts` (`#hero-signals-grid`, `.signal-tile`) | Real facts from engine pipeline inputs. |
| **Hero Action Bar** | Accept, Adjust, Dismiss, Details →, Why | `v2-home-view.ts` (`#btn-accept`, `#btn-adjust`, `#btn-dismiss`, `#btn-view-trip-details`, `#btn-why`) | Unchanged action semantics with refreshed reference styling. |
| **Now Feed Section** | Event title, subtitle, countdown pill (`In 1 hr 15 min`) | `v2-home-view.ts` (`#feed-section-now`, `.feed-countdown-pill`) | Dynamic countdown derived from plan departure time. |
| **Ahead Feed Section** | 2-column upcoming card grid + "See all ›" link | `v2-home-view.ts` (`#feed-section-ahead`, `.feed-ahead-grid`, `#link-ahead-see-all`) | Renders scheduled events or neutral quiet card. |
| **For You Feed Section** | Personalized suggestion card + Confirm / Reject | `v2-home-view.ts` (`#feed-section-foryou`, `.proposal-card`, `#link-foryou-see-all`) | Backed by engine memory proposals; zero hallucinated ratings. |
| **Right Panel: Trip Details** | Map card + 4 stat cells: Leave by / Arrive by / Distance / Traffic | `desktop-panel.ts` (`.trip-stats-grid`, `.trip-stat-cell`) | Metric derivations truthful to route geometry and traffic alerts. |
| **Right Panel: Weather** | Destination Weather card with temp & forecast | `desktop-panel.ts` (`.desktop-weather-card`) | Weather signal derived; SIMULATED badge in demo mode. |
| **Right Panel: Lunch Recs** | Nearby Lunch cards with illustrations, walk times, sparkle rationale | `desktop-panel.ts` (`.desktop-candidates-list`, `.desktop-candidate-tile`) | Uses truthful demo entities (`Demo Place A · Ramen`, etc.) with accessible illustration markers. |

---

## 3. Evidence Artifacts & Checksums

The following artifacts were captured via Playwright in `tests/e2e/desktop-parity.spec.ts`:

| File | Resolution | Scene / Tab | Verified SHA-256 |
|---|---|---|---|
| `mobile-390x844-home.png` | 390×844 | Mobile Clear Home | `f2dc12da15cf14e7a064da217bb7418a02a9eb538743606f7cb93ea290fa83c6` |
| `parity-clear-ref-1586x992.png` | 1586×992 | Reference Dashboard Clear | `f6a422fc9ae70e0a58a74e2d3121d5c5a7114cf05c6ba440d99ba798db4c29bf` |
| `parity-rain-ref-1586x992.png` | 1586×992 | Reference Dashboard Rain | `e83e60249216d1ba56b0d9e83ec50f384ba6ce80d0d216f4675549079a0ebf35` |
| `parity-away-lunch-ref-1586x992.png` | 1586×992 | Reference Dashboard Away Lunch | `311e9fbfb6e15948f2195f08ca70ae796d13540ce89fa12ae62f4e0c4b22c676` |
| `parity-multi-candidate-ref-1586x992.png` | 1586×992 | Reference Dashboard Multi-Candidate | `10f607c34d3f5698b674872c03509bca3b1dfcf975cc3bc9df7ec62fdb6348aa` |
| `parity-clear-wide-1440x900.png` | 1440×900 | Wide Desktop Clear | `fa939e656e187a584033b93478d227f27715f4e3c5ec796ea8a39a95786a9d0a` |
| `parity-rain-wide-1440x900.png` | 1440×900 | Wide Desktop Rain | `9e30a59b20b2203cfc40a5bfa4910cfbe4f3be7da98f483c61309f44db4ae78f` |
| `parity-away-lunch-wide-1440x900.png` | 1440×900 | Wide Desktop Away Lunch | `a793c9fa8398ff0ef8187884ec471b017b2e95a9404289816e84bf9fe0a202dc` |
| `parity-multi-candidate-wide-1440x900.png` | 1440×900 | Wide Desktop Multi-Candidate | `58572ea0ce38290e290e2ea02fc4e057390632599c9eb1453ae408cf8ba5dfae` |
| `parity-clear-std-1280x800.png` | 1280×800 | Standard Desktop Clear | `c126939a8c081e7d82e2c5e52a925e0be6bb8972e39be3388a1073cefb185873` |
| `parity-rain-std-1280x800.png` | 1280×800 | Standard Desktop Rain | `99be4ebbb6bf9b380db3ea6f0df598188151fc0efaa76f8202973da9b5fef79d` |
| `parity-away-lunch-std-1280x800.png` | 1280×800 | Standard Desktop Away Lunch | `3bc272d7f8d6fb2228d4957f9ea32be432e99214d023b711a3b53f6c8d76e27b` |
| `parity-multi-candidate-std-1280x800.png` | 1280×800 | Standard Desktop Multi-Candidate | `c126939a8c081e7d82e2c5e52a925e0be6bb8972e39be3388a1073cefb185873` |

---

## 4. Verification & Compliance Checklist

- [x] **Axe WCAG AA**: 0 critical or serious violations across all viewports (`tests/e2e/desktop-parity.spec.ts`).
- [x] **No Horizontal Overflow**: `scrollWidth <= clientWidth + 1` across 1586×992, 1440×900, 1280×800, and 390×844.
- [x] **Zero Core Diff**: `git diff f43c6c1d -- src/core` = 0 lines.
- [x] **Zero Billed Provider Calls**: Model API calls locked at lifetime 22/50.
- [x] **Video Script Verbatim Preservation**: `tests/e2e/video-script.spec.ts` passes 4/4 with all timing budgets satisfied.
- [x] **Truthfulness Audit**: `tests/e2e/closeout-truth-audit.spec.ts` passes 34/34.
- [x] **S4 Desktop IA**: `tests/e2e/s4-desktop-ia.spec.ts` passes 18/18.
- [x] **Unit & Integration Suite**: `npm test` passes 40 test files (914 tests).
