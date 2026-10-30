# UI-DEMO-FY Evidence Manifest: Deterministic For You & Plans Loop

> **Task ID**: `[TID:INBOX-20261030-185912]` (`UI-DEMO-FY`)  
> **Date**: 2026-10-31  
> **Environment**: OFFLINE, Deterministic test/demo mode  
> **Reference Video Script**: `docs/submission/VIDEO_SCRIPT.md` (Segments 4, 5, 6)

---

## 1. Architectural & Interaction Scope Decisions

### Scope (1): Interaction Path Analysis & Selection
1. **Existing 2-Tap Interaction Flow**:
   - In scenes `clear` (D1) and `rain` (D2), tapping `#btn-adjust` ("Adjust timing", Tap 1) and `#btn-adjust-remember` ("Save & remember as preference", Tap 2) reliably creates a pending routine proposal `prep_buffer_preference` (`status: 'pending'`).
   - When navigating to the **For You** tab (`#tab-for-you`), this pending proposal renders with `Confirm` and `Not true` buttons.
   - This 2-tap interaction is fully covered and verified in `tests/e2e/ui-demo-fy.spec.ts`.
2. **Deterministic Multi-Candidate Seed for Instant Demonstration**:
   - To ensure that a reviewer or video recording can immediately inspect both **For You** and **Plans / Ahead** without requiring prior adjustments, `multi-candidate` (Reasoning demo scene, Segment 6) seeds a demo routine proposal `prep_buffer_preference` (`{ prepMinutes: 20, bufferMinutes: 10 }`, `status: 'pending'`, `source: 'seed'`, labelled `Demo profile · sample preference`) when storage is clean.
   - The scene displays:
     - $\ge 1$ upcoming item in **Plans / Ahead** (`Lunch options near you`, badge `SIMULATED`) consistent with the Home timeline.
     - $\ge 1$ pending routine proposal in **For You** (`Remember departure prep & buffer routine?`, badge `PROPOSAL`, basis `Derived from sample demo profile`).

### Scope (2): Local Actions & State Persistence
- **Confirm**:
  - Clicking `Confirm` promotes the proposal to `status: 'confirmed'` and writes back through `MemoryPort.writeBack()` using `LocalMemoryAdapter`.
  - Persists to `sharedStorage` / `localStorage`.
  - Proposal is removed from **For You** (which displays the calm empty state) and appears on the **Me** tab under `#confirmed-facts-list` as `Departure prep & buffer routine` with badge `Confirmed` and metadata `Source: you confirmed`.
- **Not true**:
  - Clicking `Not true` updates the fact to `status: 'rejected'` (`source: 'user_feedback'`, note: `'Declined by user'`).
  - Persists to `sharedStorage` / `localStorage`.
  - Proposal is removed from **For You** and appears on the **Me** tab under `#rejected-proposals-list` (Declined Habits & Suggestions) with audit note `Declined by user`.
- **Honest Labelling**:
  - All seeded and simulated items are labelled with existing badges (`SIMULATED`, `PROPOSAL`).
  - No invented places, persons, or times outside existing fixtures.

### Scope (3): Invariant Adherence & Zero Regressions
- **D1–D6 Byte-Identity**:
  - Fixtures D1–D6 and initial state remain 100% byte-identical (`test:golden` 18/18 green).
- **Proactive Budget**:
  - Daily proactive prompt budget remains strictly capped at 3 (`0 of 3 used today` in Me view).
- **Local MemoryPort Isolation**:
  - `writeBack()` executes strictly against `LocalMemoryAdapter` with zero network / XMemo dispatches.
- **Core Immutability**:
  - `git diff f43c6c1d -- src/core` is 100% empty.

---

## 2. Accessibility Audit (Axe WCAG 2.0 Level A & AA)

All views were scanned using `@axe-core/playwright` with tags `['wcag2a', 'wcag2aa']`:
- **Plans View (Mobile 390×844)**: 0 violations ✅
- **Plans View (Desktop 1280×800)**: 0 violations ✅
- **For You View (Mobile 390×844)**: 0 violations ✅
- **For You View (Desktop 1280×800)**: 0 violations ✅

---

## 3. Screenshot Evidence & Checksum Manifest

| File | Description | Viewport | SHA256 Checksum |
|---|---|---|---|
| `for-you-mobile.png` | For You view showing pending routine proposal with Confirm/Not true | Mobile (390×844) | `a64881a565d94f4750f24991076ff4ce287b449b5fbdc40c69dcfd8a3b1fcb4a` |
| `for-you-desktop.png` | For You view showing pending routine proposal with Confirm/Not true | Desktop (1280×800) | `725988dc96ebcdd5ab803a96a3ed574c3eb7eb3082e32168c374a140f1134b75` |
| `plans-mobile.png` | Plans view showing upcoming plan matching Home timeline with `SIMULATED` badge | Mobile (390×844) | `b8113d28d999d7acd7f1f604e42739a46abf3b270c321039c9601ae09f0f88f9` |
| `plans-desktop.png` | Plans view showing upcoming plan matching Home timeline with `SIMULATED` badge | Desktop (1280×800) | `7f41ec1a3fa01288412883eb1da82d53929edde74ca072c00493bc90cbb472a1` |
| `me-confirmed-mobile.png` | Me tab showing confirmed preference after Confirm click | Mobile (390×844) | `24377851fcd3a4ff35095ac097a5ced8f04a1c610f70014701903f541d01bb58` |
| `me-confirmed-desktop.png` | Me tab showing confirmed preference after Confirm click | Desktop (1280×800) | `ab15d422a2ccddc9035c1703d8a4bb8baad6a433364d0308749bddb7e1c512f9` |
| `me-rejected-mobile.png` | Me tab showing declined audit row after Not true click | Mobile (390×844) | `d2144ade39f088fb16b19315ed9dc408ab8aa739533eabd9a1120bf4889f228b` |
| `me-rejected-desktop.png` | Me tab showing declined audit row after Not true click | Desktop (1280×800) | `f4a636cd2f947da9a38e0c389e02f6521bf7595c03851d905b0debbbf932ea16` |

---

## 4. Test Suite Reference

Automated E2E tests:
- `tests/e2e/ui-demo-fy.spec.ts` (6/6 tests passing)
  - `[mobile] multi-candidate: Plans & For You populated, Confirm moves to Me, Axe WCAG2A/AA passes`
  - `[mobile] multi-candidate: Not true moves proposal to declined audit on Me page`
  - `[mobile] rain scene: 2-tap interaction (Adjust -> Save & Remember) reliably produces For You proposal`
  - `[desktop] multi-candidate: Plans & For You populated, Confirm moves to Me, Axe WCAG2A/AA passes`
  - `[desktop] multi-candidate: Not true moves proposal to declined audit on Me page`
  - `[desktop] rain scene: 2-tap interaction (Adjust -> Save & Remember) reliably produces For You proposal`
