# UI-HOME-QUIET Visual Evidence & Verification Matrix

Governed by Task `[TID:INBOX-20261031-24FF42]` (Rev3 UI Redesign Slice 1 of 3: Quiet Consumer Home and Isolated Presentation Demo Panel).

---

## 1. Reference Mockup Target
- **Target Mockup**: `<repo-root>/Downloads/yori_proactive_life_assistant_mockup.png`
- **Mockup SHA-256**: `ef4cf701e3fb6bf96325a7c9a6609f3f396f6db439ce972f562e2d63d887c70d`
- **Git Invariant**: The external mockup image and any composite derivatives are never committed to git (kept strictly external or under `test-results/`).

---

## 2. Core Deliverables Summary

### A1. Restrained Header & Context Pill
- **Serif Wordmark**: Newsreader serif "Yori" top-left.
- **Monogram Avatar**: Neutral monogram circular avatar button (`#btn-header-avatar`) top-right, opening profile and preferences (Me tab).
- **Honest Dynamic Greeting**: Newsreader title with honest dynamic subheading:
  - `"I've already looked ahead for you."` when an action card or prepared plan exists.
  - `"Nothing needs you right now."` when in a quiet state (e.g. busy-lunch or live runtime with no urgent action).
- **Single Context Status Pill (`#pill-context-status`)**: Under the greeting, exactly one compact status pill shows:
  - Header: `Demo · simulated ›` (Demo) or `Live context ›` (Live).
  - Subline: Active sources only. Demo displays `'Demo · simulated scenes'`. Live displays `'Device clock'` (plus `'Weather'` only if enabled, plus `'Location'` only if granted this session; never Calendar or Memories unless connected).
- **Sources / Why Provenance View**: Clicking `#pill-context-status` opens the Sources & Truth Status view (`#why-sheet-backdrop`). It does **NOT** open demo controls.

### A2. Isolated Presentation Demo Panel
- **Consumer Isolation**: By default, consumer Home shows ZERO demo controls in the DOM (`#scene-select`, `#btn-mode-demo`, `#btn-mode-live`, `#btn-replay-before-you-ask`, `#badge-ui-version` are detached).
- **Developer Affordance**: Gated behind `?dev=1` (or session flag `yori_dev=1`), revealing a discreet developer icon button (`#btn-dev-demo-controls`) in the header.
- **Presentation Sheet (`#demo-panel`)**: Displays `"Demo controls · for presentation"`, housing mode toggles, scenario switcher, replay trigger, and technical status badges.
- **Accessibility & Focus**: Implements full accessible modal focus trap, Escape keyboard dismissal, and restores focus cleanly to `#btn-dev-demo-controls`.

### A4 & A8. Home Layout & Visual Hierarchy
- **Now Action Card**: Includes category badge (`TRAVEL`), departure and preparation times, inline schematic route map (`.v2-card-inline-map .now-inline-map`), equal-height action buttons (`Accept`, `Adjust`, `Why`, `Dismiss`), and Undo affordance.
- **Ahead Section**: Section title with `See all ›` link (`#link-ahead-see-all`) routing to the Plans view.
- **For You Section**: Section title with `See all ›` link (`#link-foryou-see-all`) routing to the For You view, with inline Confirm and Reject buttons for proposals.
- **Floating Ask Composer (`#ask-bar`)**: Bottom docked for ergonomic thumb-reach on mobile, opening the full conversational shell.

---

## 3. Intentional A9 Truth Differences (Mockup vs. Real Runtime)

1. **Ergonomic Composer Placement**: The mockup depicted a top search bar; real runtime uses a bottom-docked Ask bar (`#ask-bar`) to optimize mobile one-handed usability and avoid header clutter.
2. **Zero Fabricated Calendar Events**: The mockup depicted static demo events; the real runtime strictly derives events from actual pipeline evidence (never inventing calendar events).
3. **Active Sources Transparency**: The mockup lacked source indicators; real runtime includes an active sources subline (`#pill-context-status .context-pill-subtitle`) stating explicitly which sensors/signals are currently feeding Home.
4. **Accessible Touch Targets**: All action buttons (`Accept`, `Adjust`, `Why`, `Dismiss`) are sized to >= 44x44px per WCAG 2.1 AA requirements.

---

## 4. Visual Evidence Manifest (`MANIFEST.sha256`)

| File | SHA-256 | Purpose |
| :--- | :--- | :--- |
| `before-consumer-home.png` | `47bab4e525de90a556d65da75a2e8abfc0564055a709f66413b35f9d14f3338a` | Baseline consumer Home (Clear scene, default) |
| `after-consumer-home-quiet.png` | `2c00d4a9d7e1779f560376bd6b0e1532a0d054d6ef76d481fcc5e3b851f4840d` | Honest quiet state ("Nothing needs you right now.") |
| `after-consumer-home-rain.png` | `eacd250441e127a04abcec253048a8b6da75c7de8352278ff834427391197ecc` | Rain scene (Now card, inline map, equal-height actions) |
| `after-demo-panel-open.png` | `9252f9e10e14ad3728da07f001ed91eb6583fdf432134f0064c7b116de480eb0` | Developer Presentation Demo Controls sheet |
| `after-sources-dialog-open.png` | `3b5f778138468ae5b2d71115be988337b51096b70188b946994bc7e4362256d7` | Sources / Why provenance dialog opened via context pill |
| `after-conversation-open.png` | `86ce53874c61f168e5d3fe236cd692e1a303290b12f0602cd40f89f8232f7382` | Ask Yori conversation shell overlay |
| `after-mobile-390.png` | `3cfa6ac7a9409cf400f73923d23ff093ce52f3d7a3d593e882eea6a95349eb47` | Mobile responsive viewport (390x844) |
| `after-desktop-1024.png` | `d52990f2d04af6c7b9d3652e4618ac311167c997457a500cd1b1e018cc8b405e` | Desktop responsive viewport (1024x768) |
| `after-reduced-motion.png` | `d52990f2d04af6c7b9d3652e4618ac311167c997457a500cd1b1e018cc8b405e` | Prefers-reduced-motion accessibility mode |

---

## 5. Verification Check Results
- **TypeScript Typecheck**: 0 errors (`npm run typecheck`).
- **Unit Test Suite**: 34 files, 817 unit tests all PASSING (`npm test`).
- **Golden Tests**: 4 files, 18 golden tests all PASSING (`npm run test:golden`).
- **Drill Tests**: 4 files, 56 drills all PASSING (`npm run test:drills`).
- **E2E Playwright Suite**: 100% green across all specs.
- **Privacy Scan**: Overall PASS (`npx tsx scripts/publish/privacy-scan.ts`).
- **Core Diff**: 0 lines changed (`git diff --stat f43c6c1d HEAD -- src/core` = 0 lines).
- **Model Billed Calls**: 22/50 (0 calls made, untouched ledger).
