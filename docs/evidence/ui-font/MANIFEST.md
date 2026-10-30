# UIFONT Evidence Manifest: Self-Hosted Typography & Zero External Font CDN

> **Task ID**: `[TID:INBOX-20261030-3E957D]` (`UIFONT`)  
> **Backlog**: `BACKLOG-20261031-UIFONT`  
> **Date**: 2026-10-31  
> **Scope**: Offline robustness & network privacy: vendor Inter and Newsreader webfonts, remove runtime CDN dependencies (`fonts.googleapis.com` / `fonts.gstatic.com`), verify visual parity across mobile and desktop viewports.

---

## 1. Architectural Scope & Implementation Decisions

### Scope (1): Self-Hosted Fonts & Vendoring
- **Sourced Packages**:
  - `@fontsource/inter@5.3.0`
  - `@fontsource/newsreader@5.3.0`
- **Vendored Font Files (`public/fonts/`)**:
  - `inter-400.woff2` (400 normal)
  - `inter-500.woff2` (500 medium)
  - `inter-600.woff2` (600 semi-bold)
  - `inter-700.woff2` (700 bold)
  - `newsreader-400.woff2` (400 normal serif)
  - `newsreader-500.woff2` (500 medium serif)
  - `newsreader-600.woff2` (600 semi-bold serif)
  - `newsreader-400-italic.woff2` (400 italic serif)
- **Licensing & Legal Compliance**:
  - Both Inter and Newsreader are licensed under the SIL Open Font License (OFL) 1.1.
  - Placed `public/fonts/LICENSE-inter.txt` and `public/fonts/LICENSE-newsreader.txt`.
  - Added root `THIRD_PARTY_NOTICES.md` with complete OFL 1.1 attribution and full license text.
  - Documented offline font delivery in `docs/PRIVACY.md` (Section 3.C) and `docs/DEMO.md`.

### Scope (2): Zero Runtime External Requests
- Removed Google Fonts preconnect (`fonts.googleapis.com`, `fonts.gstatic.com`) and stylesheet links from `index.html`.
- Defined `@font-face` blocks with `font-display: swap` in `src/ui/living-context/fonts.css`.
- Imported `fonts.css` directly into `src/ui/living-context/styles.css`.
- Confirmed zero occurrences of `fonts.googleapis.com` and `fonts.gstatic.com` across `src/`, `index.html`, and `dist/`.

### Scope (3): Production Gating & Automated Tests
- Updated `scripts/verify-production-build.ts` to enforce:
  - Disallowance of external font hosts (`fonts.googleapis.com`, `fonts.gstatic.com`) in `dist/`.
  - Required presence and valid non-empty byte count for all 8 self-hosted font `.woff2` files and 2 license files in `dist/fonts/`.
- Added unit tests in `src/adapters/static-check.test.ts` to audit `index.html`, `src/ui/living-context/styles.css`, and `public/fonts/`.
- Created E2E test `tests/e2e/ui-font.spec.ts` asserting:
  - Zero requests to external hosts upon initial application load and navigation.
  - All requested font assets resolve to local `/fonts/*.woff2`.
  - Font face availability in `document.fonts`.
  - Visual parity captures.

---

## 2. Screenshot Manifest & Visual Parity

Screenshots captured at Mobile (390×844) and Desktop (1280×800) under both Google Fonts CDN (`before`) and self-hosted typography (`after`).

| Screenshot File | Scene / View | Viewport | Mode | SHA256 Checksum |
|---|---|---|---|---|
| `home-clear-mobile-before.png` | Home (Clear) | Mobile (390×844) | Before (Google Fonts CDN) | `1e2b29d9a6fec71be624d1b352ca5855a4b228b3676a2e040dc974df18276d97` |
| `home-clear-mobile-after.png` | Home (Clear) | Mobile (390×844) | After (Self-Hosted) | `5d0fb4306cba54ffef7cd0a1a8a51729253b5409be13557e0c442435bb59e977` |
| `home-clear-desktop-before.png` | Home (Clear) | Desktop (1280×800) | Before (Google Fonts CDN) | `e5abfa396f632131bfcc7b2f596e1195e1501125dc5795aaac6d73ac9eeb58a2` |
| `home-clear-desktop-after.png` | Home (Clear) | Desktop (1280×800) | After (Self-Hosted) | `6ed27367fe8ba6022d3eba7da6535023216b699014fbefbdb47a3ab39c4f8074` |
| `home-rain-mobile-before.png` | Home (Rain) | Mobile (390×844) | Before (Google Fonts CDN) | `c58296462aa41df95bcc178ddd4c66763615b2ec38dcf5f61d6c53ca6fd1dd32` |
| `home-rain-mobile-after.png` | Home (Rain) | Mobile (390×844) | After (Self-Hosted) | `a7ea7b2ddf2a524b9f7d7fd08d31ac5802fa11dd4963be2e9301df3222f51033` |
| `home-rain-desktop-before.png` | Home (Rain) | Desktop (1280×800) | Before (Google Fonts CDN) | `01de938f9dca20e3b861f1ce4ef008ab86a1606ed1741c82b5e6d1a50c04035e` |
| `home-rain-desktop-after.png` | Home (Rain) | Desktop (1280×800) | After (Self-Hosted) | `7761776be189ec78735b23e9c0dc7d93b46e368ab7802a57f12ab5ba70767381` |
| `why-sheet-mobile-before.png` | Why Sheet Dialog | Mobile (390×844) | Before (Google Fonts CDN) | `f4c3b6c894493712164cafc441bf959ac7abd7187b7184bd5c45949237d4cbcf` |
| `why-sheet-mobile-after.png` | Why Sheet Dialog | Mobile (390×844) | After (Self-Hosted) | `ab1fc9eb59bc1f194c71b35cc48d8e789e95d38fe580613b59ec8bdcadcb9b43` |
| `why-sheet-desktop-before.png` | Why Sheet Dialog | Desktop (1280×800) | Before (Google Fonts CDN) | `03e482cd643d0dce89927b1164ed7aa31e5b2aa16048d88b63922e3c1915f754` |
| `why-sheet-desktop-after.png` | Why Sheet Dialog | Desktop (1280×800) | After (Self-Hosted) | `854cd1242e9989d8c4e1d03505b50cf55a8653f868dcccc51cf2e9aeb14a3ed1` |
| `for-you-mobile-before.png` | For You View | Mobile (390×844) | Before (Google Fonts CDN) | `a64881a565d94f4750f24991076ff4ce287b449b5fbdc40c69dcfd8a3b1fcb4a` |
| `for-you-mobile-after.png` | For You View | Mobile (390×844) | After (Self-Hosted) | `d6a2cb41804f45f56123f8096f58a5c73601a9192fe55c2eb90106ca0bfe9688` |
| `for-you-desktop-before.png` | For You View | Desktop (1280×800) | Before (Google Fonts CDN) | `725988dc96ebcdd5ab803a96a3ed574c3eb7eb3082e32168c374a140f1134b75` |
| `for-you-desktop-after.png` | For You View | Desktop (1280×800) | After (Self-Hosted) | `84077bdf67224fd623fa30db39ff37d1e6ad65d4895191747d3f2dab72d09c4f` |

---

## 3. Invariants & Scope Compliance
- `src/core` Diff: Empty (`git diff f43c6c1d -- src/core` produces 0 lines).
- Model Live Ledger: Unchanged at 17 entries (`.yori-runtime/model-live-ledger.json` sha256 `46aa6fa9...`).
- Accessibility: `ui-a11y` test suite passes with 0 Axe WCAG 2.0 Level A & AA violations.
- Production Gating: `npm run verify:production` passes cleanly.
