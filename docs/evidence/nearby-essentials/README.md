# NEARBY-ESSENTIALS Verification Evidence (Mocked)

**Task ID**: `[TID:INBOX-20261104-EC92E9]` (`NEARBY-ESSENTIALS`)
**Execution Mode**: Mocked / Deterministic Offline (Zero paid/live network calls in tests)
**Port Invariant**: Port 4173 reserved for Owner live preview (PID 9845). Playwright tests strictly run on port **4289**.

## Verification Summary
1. **Places Proxy Allowlist & OSM/Google Types**:
   - `ALLOWED_AMENITIES` extended with `supermarket`, `convenience`, `shopping_mall`, `pharmacy`.
   - Overpass OSM tags mapped to `shop=supermarket`, `shop=convenience`, `shop=mall`, `amenity=pharmacy`.
   - Google Places `includedTypes` mapped to `supermarket`, `convenience_store`, `shopping_mall`, `pharmacy`.
   - Strict unit tests: `src/adapters/providers/overpass-places-adapter.test.ts` (10/10 green), `tests/proxy-boundary/google-places-proxy.test.ts` (13/13 green).

2. **Grammar, Reasoning & Model Interpreters**:
   - Closed decision intent `FIND_ESSENTIALS` with category & amenity slots.
   - Deterministic grammar matching for supermarket, shopping mall, convenience store, pharmacy (and Chinese variants).
   - Live idle opener chips updated with `'Supermarket nearby'`.
   - Unit tests: `src/ui/action-state/nearby-essentials.test.ts` (27/27 green).

3. **Live Search & Compact Trace**:
   - Real top pick result card rendered with name, straight-line distance, open status, rating/review count when available, and provider attribution.
   - Emits compact trace with toggle to inspect reasoning steps and provider details.

4. **Home 'Nearby essentials' For You Card**:
   - In live mode with location consent, queries real nearest supermarket/pharmacy and displays truthful summary card.
   - Hides when empty or location not consented.

5. **Demo/Offline Mode Honest Capability Answer**:
   - Truthfully explains that live places search requires active live mode and location consent.

## Screenshots (Mocked)
- `01-live-opener-chips-mobile-390x844.png` / `01-live-opener-chips-desktop-1280x800.png`
- `02-supermarket-result-card-mobile-390x844.png` / `02-supermarket-result-card-desktop-1280x800.png`
- `03-trace-expanded-mobile-390x844.png` / `03-trace-expanded-desktop-1280x800.png`
- `05-demo-offline-honest-answer-mobile-390x844.png` / `05-demo-offline-honest-answer-desktop-1280x800.png`

## Test Runs
- `npm run typecheck`: 0 errors
- `npm test`: 79/79 test files passed (1467/1467 tests)
- `npm run test:golden`: 4/4 files passed (18/18 tests)
- `npm run test:drills`: 4/4 files passed (56/56 tests)
- `npx playwright test --config=playwright.essentials.config.ts`: 4/4 passed (mobile 390x844 and desktop 1280x800)
