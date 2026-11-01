# DESKTOP-PARITY-1: Desktop Parity Evidence & Verification Report

Governed by Task `[TID:INBOX-20261101-4DD41F]`.  
Plan of Record: `.progress/review/reports/OWNER_DESIGN_FEEDBACK_20261102.md` (Item 2).  
Approved Reference Dashboard: `~/Downloads/Yori Proactive AI Dashboard.png` (sha256 `667f1ff2320b9f97431a47999d1c6297fb33b017c6de7d00b40cc95aacb04efc`, 1586×992, preserved outside git tree).

> [!WARNING]
> Commit `383e027` contains the reference composite; exclude/scrub at R1 per `OWNER_PUSH_CHECKLIST`. In subsequent rework, side-by-side composite artifacts are generated into the gitignored path `.yori-runtime/evidence/desktop-parity-1/`.

---

## 1. Executive Summary

This deliverable brings the desktop Home view, header, hero card, and contextual right panel into full structural and visual parity with the owner's approved dashboard reference while strictly enforcing truthfulness and engine integrity (INV-102, INV-103).

- **Header Layout & Geometry Integrity**: Replaced bare top area with a clean two-row desktop header:
  - Row 1 (`.desktop-greeting-row`): Desktop Greeting ("Good afternoon. I've already looked ahead for you.") paired with truthful runtime context pill, demo controls, and profile avatar.
  - Row 2 (`.desktop-connector-strip-wrapper`): Full-width connector status strip directly beneath the greeting, completely eliminating overlap and wrapping cleanly on all viewport sizes (1024, 1280, 1440, 1586).
  - Center column container enforces `overflow-x: hidden` and modal focus restore uses `preventScroll: true` to guarantee zero horizontal shift under the left nav.
- **Hero Card "THOUGHT AHEAD FOR YOU"**: Equipped with top badge `THOUGHT AHEAD FOR YOU`, headline `#now-title` with transit mode icon, one-sentence rationale, rain checklist chip (`#chip-umbrella`), and a 4-signal tile grid (Weather, Calendar, Transit, Memory).
- **Structured Sectioned Feed**: Replaced collapsible secondary sections with 3 clear sections:
  1. *Now*: Event headline, subtitle (`Leave by 2:25 PM · Arrive 2:50 PM · Starts 3:00 PM`), and prominent countdown pill (`in 4h 25m` for Clear from 10:00 AM snapshot / `in 55m` for Rain from 1:45 PM snapshot). Relative countdown is derived dynamically from `leaveAt` and the scene snapshot clock (`snapshot.asOf`) with zero UI clock overrides. Adjusting buffer by +15m drops both hero and Now row countdowns by 15m (e.g. from `in 4h 25m` to `in 4h 10m`).
  2. *Ahead*: 2-column grid of upcoming plans with "See all ›" link (`#link-ahead-see-all`).
  3. *For You*: Personalized suggestions card with Confirm/Reject actions and "See all ›" link (`#link-foryou-see-all`).
- **Right Panel Multi-Section Reference Layout & Truthfulness**:
  1. *Trip Details*: Header with dynamic status pill (`🟢 On time`), schematic route map, and metric stat row (Leave by / Arrive by / Distance / Traffic). Arrive By is truthful to departure + transit duration (`2:50 PM` for clear; `2:55 PM` for rain; `2:35 PM` after adjust), strictly matching the Now row `Arrive` subtitle. Distance and Traffic cells only render when signal evidence is present.
  2. *Destination Weather*: Temperature, conditions, and truthful issued time (`Issued at 1:35 PM`), never a fake future time span.
  3. *Nearby Lunch Recommendations*: Candidate cards with local illustrations, walk times, cuisine chips, and sparkle rationale (`✨`). Strictly rendered when candidate cards are present (e.g. Lunch scene, Multi-candidate scene) and omitted during travel plans per S4 mutual exclusion (INV-103).
  4. *Live Mode Coherence*: Strictly preserves honest notices (`#desktop-notice-route-unavailable`, `#desktop-notice-places-disabled`) with zero simulated provenance leakage.

---

## 2. Intentional Differences & Review Rework Rationale

| Reference Dashboard Feature | Reference Mock Value | Yori Truthful Implementation | Design & Truthfulness Rationale |
|---|---|---|---|
| **Trip Stats: Arrive By** | `3:00 PM` (Appt time) | `2:50 PM` (Clear) / `2:55 PM` (Rain) / `2:35 PM` (Adjusted) | Truthful calculation: `leaveMs + travelMin * 60_000`. Conflating arrival time with appointment time erases buffer and violates honest navigation contracts. Now feed subtitle mirrors this exactly: `Leave by 2:25 PM · Arrive 2:50 PM · Starts 3:00 PM`. |
| **Relative Countdown** | Static `In 1 hr 15 min` | Dynamic `in 4h 25m` (Clear) / `in 55m` (Rain) / `in 2h 15m` (Multi-candidate) / `in 4h 10m` (Adjusted) | Derived truthfully from `leaveAt - snapshot.asOf` with zero UI clock overrides. When timing buffer increases by +15m, countdown drops by exactly 15m in both hero card and Now row. |
| **Trip Stats: Distance & Traffic** | `6.8 km`, `Moderate (+6m)` | Rendered only when present in signal evidence | Fixture data does not invent arbitrary road distances or traffic delays without backing evidence signals. |
| **Trip Stats: Status Pill** | Static `🟢 On time` | `🟢 On time` / `🔴 Late by Xm` | Evaluated against actual appointment buffer (`apptMs - arriveMs`). Omitted if no appointment is scheduled. |
| **Destination Weather Timeline** | `2:30 PM – 4:00 PM` | `Issued at 1:35 PM` | Reflects actual signal observation timestamp (`issuedAt`), never an invented future time bracket. |
| **Travel Panel Dining Cards** | Always 3 lunch cards | 0 dining cards in Travel plan; rendered in Lunch scene | S4 Mutual Exclusion / INV-103: travel plans focus on route navigation and weather; dining recommendations are surfaced during lunch windows or when candidates exist. |
| **Header Layout** | Single inline flex bar | 2-row layout (Greeting row + Connector strip) | Avoids overlapping greeting text and connector chips at 1024px / 1280px / 1586px. Wraps gracefully without clipping. |
| **Composite Artifact Storage** | Committed PNG | Gitignored: `.yori-runtime/evidence/desktop-parity-1/` | Reference pixels contain private owner assets; preserved outside git index to prevent repo leak. |

---

## 3. Evidence Artifacts & Checksums

The following 20 artifacts represent the 4 viewports × 5 views matrix captured in `tests/e2e/desktop-parity.spec.ts`:

| File | Resolution | Scene / Tab | Verified SHA-256 |
|---|---|---|---|
| `parity-away-lunch-mob-390x844.png` | 390×844 | Mobile Away Lunch | `27c0288dddf7a75fc213523c52aec45aee87300e918761305c4d7b1a05d446ba` |
| `parity-away-lunch-ref-1586x992.png` | 1586×992 | Reference Away Lunch | `95206b388a53b640fa8cffb85313a5981d1d39627fc29f587b58e35f3279840a` |
| `parity-away-lunch-std-1280x800.png` | 1280×800 | Std Desktop Away Lunch | `4852625e3ce2c5581cd83bca13332a759185c5af9f9780887d300f072c3a825f` |
| `parity-away-lunch-wide-1440x900.png` | 1440×900 | Wide Desktop Away Lunch | `121a40d45f13dac52dc7c3f762409ba2d53cc3a22b41b71f26345ed2cfdb0070` |
| `parity-clear-mob-390x844.png` | 390×844 | Mobile Clear | `dfc2e708af472687925193da34896fd2dacb529ec09f5c7e8924d172abd8662c` |
| `parity-clear-ref-1586x992.png` | 1586×992 | Reference Clear | `9572016d786061890aea5a2e6c8b350d52112991352396195c49aeb99c6988b5` |
| `parity-clear-std-1280x800.png` | 1280×800 | Std Desktop Clear | `4bdc37b20566173e7e42e56bdd6dd1b264f2d29049351f90f83de26d2bdba86f` |
| `parity-clear-wide-1440x900.png` | 1440×900 | Wide Desktop Clear | `ee0da8595e88dbd329d970ce27132bdd040027bb3b66345bbb431f18ed7477bb` |
| `parity-for-you-mob-390x844.png` | 390×844 | Mobile For You | `93dcb557d36c66801708df4d3c77f01637995ed296b6a1ae47a125b15074f7ad` |
| `parity-for-you-ref-1586x992.png` | 1586×992 | Reference For You | `81b2debe0462660003efc8e744da3d181892862e084c586fb76de6a5d154f6f8` |
| `parity-for-you-std-1280x800.png` | 1280×800 | Std Desktop For You | `f90631e46dcdcc2069d9266a2aa4e50cba0c6d26a906e781fd2bb41e52e8881b` |
| `parity-for-you-wide-1440x900.png` | 1440×900 | Wide Desktop For You | `be72686eb8ea1768b9c4f9e2f1a80fb1564e2cd3ca6b5011c321eca63dcd854a` |
| `parity-multi-candidate-mob-390x844.png` | 390×844 | Mobile Multi-Candidate | `50a795ff7d96650b5923dfc66357472e95009048eff351198c421cfbb5e2a542` |
| `parity-multi-candidate-ref-1586x992.png` | 1586×992 | Reference Multi-Candidate | `c8a37c3fb983e559428f6b32749eead487e12d5c534e5aa9e40ed39554cb68aa` |
| `parity-multi-candidate-std-1280x800.png` | 1280×800 | Std Desktop Multi-Candidate | `f9e449a68f353174870aca8423c54561aaf6cf74a29eaea84f37a5ec68829d0f` |
| `parity-multi-candidate-wide-1440x900.png` | 1440×900 | Wide Desktop Multi-Candidate | `408e8040a175a6184c034315cd57a87140a24a45e2fe25409efcf8f597010961` |
| `parity-rain-mob-390x844.png` | 390×844 | Mobile Rain | `f7509790cf0cf56aba52597ef398bd3306c64f8d7a7d2c6d8b042a80cebdeed6` |
| `parity-rain-ref-1586x992.png` | 1586×992 | Reference Rain | `529a4670a46b0d68318fab239061d97ba3e4a5bd40b2ce20abef9f904a2b674e` |
| `parity-rain-std-1280x800.png` | 1280×800 | Std Desktop Rain | `b4dbc0bcf051c6a95741982812959e7251eb445699aa5e4a2b97a9c98d1bc41f` |
| `parity-rain-wide-1440x900.png` | 1440×900 | Wide Desktop Rain | `39a8037d84498378f6f17dd29875a6016db7e07eb10d904fbcb106973cdde7d9` |

### Gitignored Composite Artifact
- Path: `.yori-runtime/evidence/desktop-parity-1/reference-vs-app-rain-1586x992.png`
- SHA-256: `d9d9944f2545fc46b95f858b3c69d2e34c5b6417fcc9cb05a58beba385a260ae`
- Resolution: 3172×1032 side-by-side composite canvas with dark header banner and 2px dividing rule.

---

## 4. Verification & Compliance Checklist

- [x] **Axe WCAG AA**: 0 critical or serious violations across all viewports (`tests/e2e/desktop-parity.spec.ts`).
- [x] **No Horizontal Overflow**: `scrollWidth <= clientWidth + 1` across 1586×992, 1440×900, 1280×800, and 390×844.
- [x] **Geometry & Non-Intersection**: Heading bottom <= strip top, center container x >= nav right, scrollLeft === 0 verified at 1024, 1280, 1440, 1586.
- [x] **Dynamic Timing & Arrive By Synchronization**: Changing buffer +15m drops countdowns by 15m and synchronizes Now row `Arrive` with Right Panel `ARRIVE BY` (`tests/e2e/desktop-parity.spec.ts:test 9`).
- [x] **Zero Core Diff**: `git diff f43c6c1d -- src/core` = 0 lines.
- [x] **Zero Billed Provider Calls**: Model API calls locked at lifetime 22/50.
- [x] **Video Script Verbatim Preservation**: `tests/e2e/video-script.spec.ts` passes 4/4 with all timing budgets satisfied.
- [x] **Truthfulness Audit**: `tests/e2e/closeout-truth-audit.spec.ts` passes 34/34.
- [x] **S4 Desktop IA**: `tests/e2e/s4-desktop-ia.spec.ts` passes 18/18.
- [x] **Unit & Integration Suite**: `npm test` passes 40 test files (915 tests).
