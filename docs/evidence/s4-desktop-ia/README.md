# S4 Desktop Information Architecture & Viewport Evidence

Governed by Architecture Rev3 Live Roadmap slice S4 (`docs/architecture/REV3_LIVE_ROADMAP.plan.json`).

## Reference Citation

- **Desktop Reference**: Concept brief, 1586×992, sha256 `667f1ff2320b9f97431a47999d1c6297fb33b017c6de7d00b40cc95aacb04efc`.
- **Text-Only Note**: Built from text design brief and IA requirements; no pixel parity is claimed. The reference concept is cited by sha256 digest only.
- **Mobile Reference**: Mockup, 390×844, sha256 `ef4cf701b22e1694f4c9ea9902693fa2b32252a1e74a806c9a35e0ce26d8ee15`.

## Shell Specifications by Breakpoint

1. **Desktop Shell (`≥1024px`, target 1280×800 / 1440×900)**:
   - **Three Zones**:
     - **Left Navigation** (240px): Vertical sidebar containing wordmark, Home, Plans, For You, Connectors, Memories, Settings, with active state indicators, visible focus, and arrow key roving focus. Bottom tab bar is strictly hidden (`display: none !important`).
     - **Center Living Context**: Comfortable max measure (`max-width: 680px`), serif greeting, single truthful context pill, hero card with evidence chips and review actions, Now/Ahead/For You sections, and expandable Ask bar.
     - **Right Detail Panel** (380px): Contextual detail following selected card (travel route/map + departure weather vs nearby dining options with walking times).
2. **Tablet Shell (`768–1023px`, target 768×1024)**:
   - **Two Zones**: Left nav collapses to a 72px icon rail with accessible touch targets (≥44×44px). Right panel and bottom tab bar are strictly hidden (`display: none !important`).
3. **Mobile Shell (`<768px`, target 390×844)**:
   - **One Zone**: Single-column Living Context with bottom tab bar and bottom Ask bar. Left nav and right panel are strictly hidden (`display: none !important`). Detail views render as full sheets.

## Right Panel Coherence Invariants

- **Travel Card**: Renders route map and destination weather at departure time. Zero dining candidate items are displayed.
- **Lunch Card**: Renders nearby options with walking times. Zero route polylines or static maps are displayed.
- **Dynamic Selection**: Selecting or focusing a card immediately updates the right panel in place and announces the transition via `aria-live="polite"`.
- **Live Mode Truthfulness**: Zero fixture provenance elements (`data-provenance="fixture"`, `SIMULATED`). Live elements carry truthful provider metadata (`data-source`, `data-fetched-at`) or explicit unavailable notices (`data-provenance="none"`).

## Evidence Manifest

| File | Resolution | Description |
|---|---|---|
| `01-desktop-demo-travel-1440x900.png` | 1440×900 | Desktop Demo Travel: Hero travel card with route & destination weather panel |
| `02-desktop-demo-lunch-1440x900.png` | 1440×900 | Desktop Demo Lunch: Nearby options & walking times panel |
| `03-desktop-live-empty-1440x900.png` | 1440×900 | Desktop Live Mode: Quiet state with honest provenance |
| `04-desktop-live-route-1440x900.png` | 1440×900 | Desktop Live Mode: Route unavailable panel |
| `05-desktop-connectors-1440x900.png` | 1440×900 | Connectors in Desktop Shell: Left nav intact with active marker |
| `06-desktop-ask-expanded-1440x900.png` | 1440×900 | Ask bar expanded on desktop: Multi-zone layout and grid measures preserved |
| `07-tablet-rail-768x1024.png` | 768×1024 | Tablet 768px: Collapsed 72px icon rail with two-zone shell |
| `08-mobile-single-column-390x844.png` | 390×844 | Mobile 390px: Single-column Home with bottom tab bar |
