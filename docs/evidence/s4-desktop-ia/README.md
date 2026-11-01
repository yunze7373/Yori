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

## Evidence Manifest (19 Deliverables Matrix)

| File | Resolution | Description |
|---|---|---|
| `01-travel-390x844.png` | 390×844 | Mobile Demo Travel: Single-column Living Context with bottom tabs |
| `01-travel-1280x800.png` | 1280×800 | Desktop Demo Travel: Three-zone shell with Route & destination weather panel |
| `01-travel-1440x900.png` | 1440×900 | Desktop Wide Demo Travel: 1440px three-zone shell with comfortable max measure |
| `02-lunch-390x844.png` | 390×844 | Mobile Demo Lunch: Lunch card with candidate actions |
| `02-lunch-1280x800.png` | 1280×800 | Desktop Demo Lunch: Nearby dining options & walking times panel |
| `02-lunch-1440x900.png` | 1440×900 | Desktop Wide Demo Lunch: Contextual dining panel with selection state |
| `03-live-empty-390x844.png` | 390×844 | Mobile Live Empty: Truthful Live status indicator and quiet context |
| `03-live-empty-1280x800.png` | 1280×800 | Desktop Live Empty: Neutral Live panel with honest Route & Places status |
| `03-live-empty-1440x900.png` | 1440×900 | Desktop Wide Live Empty: Neutral Live panel with zero fixture leakage |
| `04-live-route-390x844.png` | 390×844 | Mobile Live Route: Truthful unavailable notice in Living Context |
| `04-live-route-1280x800.png` | 1280×800 | Desktop Live Route: Route notice with explicit no-route reason in right panel |
| `04-live-route-1440x900.png` | 1440×900 | Desktop Wide Live Route: Honest provider-backed metadata and zero fake geometry |
| `05-connectors-390x844.png` | 390×844 | Mobile Connectors: Settings view in single-column layout |
| `05-connectors-1280x800.png` | 1280×800 | Desktop Connectors: Left nav intact with active marker, quiet right panel |
| `05-connectors-1440x900.png` | 1440×900 | Desktop Wide Connectors: Three-zone shell hosting Connectors center view |
| `06-ask-expanded-390x844.png` | 390×844 | Mobile Ask Expanded: Conversation sheet above single-column context |
| `06-ask-expanded-1280x800.png` | 1280×800 | Desktop Ask Expanded: Expanded conversation input preserving grid measures |
| `06-ask-expanded-1440x900.png` | 1440×900 | Desktop Wide Ask Expanded: Conversational surface in 3-zone layout |
| `07-tablet-rail-768x1024.png` | 768×1024 | Tablet 768px: Collapsed 72px icon rail with two-zone shell and hidden right panel |
