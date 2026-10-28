# Yori Living Context V2 (V1b Slice) — Reference 02/03 Frame 2 Alignment Notes

**Governed by**: `docs/architecture/LIVING_CONTEXT_V2.md §8 D1/D2/D4` and Task `V1b` (`docs/architecture/YORI_V2.plan.json` Rev3)  
**Date**: 2026-10-28  
**Reference Assets**:
- `docs/design/v2-reference/02_mobile_experience_storyboard_v1.png` (Frame 2 Detail Views)
- `docs/design/v2-reference/03_mobile_experience_v1_approved.png` (Frame 2 Step-2 Expanded Screens)

---

## 1. TripDetail View (Rain Travel Step-2)

| Aspect | Reference 02/03 Frame 2 | Yori Living Context V2 Implementation (V1b) | Alignment Classification |
|---|---|---|---|
| **Entry Point** | Tapped from rain/depart card in Frame 1 | Tapped from NOW card or "Details →" button (`#btn-view-trip-details`) | ✅ Aligned |
| **Top Navigation** | Back button "←", Title "Piano lesson at 3:00 PM" | Back button `#trip-detail-back-btn` with focus restoration; Title "Piano lesson at 3:00 PM"; `SIMULATED` badge | ✅ Aligned |
| **Mode Tabs** | Drive, Transit, Walk tabs with duration pills | Derived strictly from plan options: **Drive · 25 min** (`#mode-tab-drive`) and **Bus · 40 min** (`#mode-tab-bus`). Walk is omitted because no walk option fixture exists. Switching updates times dynamically. | ⚠️ Intentionally Differs (Data Honesty) |
| **Current / Selected Plan Row** | Leave 2:25 PM, arrive 3:09 PM (44 min) | Mathematically consistent fixture times: Drive = leave **2:30 PM**, arrive **2:55 PM** (5m buffer); Bus = leave **2:15 PM**, arrive **2:55 PM** (5m buffer). Buffer and prep pills displayed honestly. | ⚠️ Intentionally Differs (Data Honesty: No Inconsistent Timing) |
| **Schematic Map** | Large map with route line | Large prominent schematic map (`.v2-map-card.prominent`) with origin (Home), destination (Piano Studio), route polylines, and weather callout (`Rain forecast · simulated`) | ✅ Aligned |
| **"Why this plan?" Section** | Narrative rationale and preference chips | Dedicated `.v2-why-plan-card` with derivation text and honest provenance chips: confirmed facts tagged `You confirmed` vs demo defaults tagged `Demo profile · sample` | ⚠️ Intentionally Differs (Data Honesty: Honest Provenance) |
| **Ratings & Star Counts** | None | Strictly zero stars, zero review counts | ✅ Aligned |
| **Back Navigation & Popstate** | Returns to home | Back button and browser `popstate` return to Home with focus restored to originating card / button | ✅ Aligned |

---

## 2. RestaurantDetail View (Lunch Candidate Step-2)

| Aspect | Reference 02/03 Frame 2 | Yori Living Context V2 Implementation (V1b) | Alignment Classification |
|---|---|---|---|
| **Entry Point** | Tapped from lunch candidate card in Frame 1 | Tapped or keyboard activated (`Enter`/`Space`) on candidate card (`.v2-candidate-card`) | ✅ Aligned |
| **Top Navigation** | Back button "←" | Back button `#restaurant-detail-back-btn` with focus restored to originating `#candidate-X` card | ✅ Aligned |
| **Hero Image / Artwork** | Food photograph | Local SVG illustration (`ramen`, `salad`, `sushi`, `cafe`, `italian`) with `Illustration · simulated` badge. Zero remote image URLs (enforced by static check and E2E test). | ⚠️ Intentionally Differs (Zero-Remote-Asset Policy) |
| **Title & Fixture Attributes** | Venue name, cuisine, distance, price range, review stars | Restaurant name (e.g. `Menya Musashi`), fixture attribute chips (`Ramen`, `5m away`, `Lunch window 12:10–1:30`). **Zero star ratings or review counts anywhere**. | ⚠️ Intentionally Differs (Data Honesty) |
| **Taste Preference Provenance** | "Based on your taste" | `Based on taste: Ramen (You confirmed)` or `(Demo profile · sample)` with honest provenance | ✅ Aligned |
| **Save Action** | "Save" button | `#btn-restaurant-save` toggles UI selection state only (`aria-pressed="true"`, text `Saved`). Strictly NO memory write or background mutation without explicit Remember flow. | ⚠️ Intentionally Differs (INV-107 No Ambient Memory Writes) |
| **Directions Action** | "Directions" button opening external map app | `#btn-restaurant-directions` reveals inline **In-App Walking Route (Schematic)** panel with step-by-step turns (`.v2-directions-panel`). Strictly zero external URLs, zero Google/Apple Maps redirects. | ⚠️ Intentionally Differs (Data Honesty & Boundary Isolation) |
| **Nearby Map** | Map view of restaurant | Compact schematic map showing user downtown location and venue pin | ✅ Aligned |

---

## 3. Decided Bottom Navigation & Desktop Navigation (D2)

| Navigation Item | Reference 03 Frame 1 / Concept | Yori Living Context V2 Implementation (V1b) | Alignment Classification |
|---|---|---|---|
| **Tab 1: Home** | "Today" (or Home icon) | `#tab-home` / `#desktop-nav-home`: Returns to main Living Context Home view with NOW, AHEAD, and candidate cards | ✅ Aligned |
| **Tab 2: Plans** | "Explore" (disabled placeholder) | `#tab-plans` / `#desktop-nav-plans`: Functional **Upcoming Plans** view (`.v2-plans-view`) rendering scheduled items from plan data. Zero disabled placeholders. | ⚠️ Intentionally Differs (D2: No Disabled Placeholders) |
| **Tab 3: For You** | "Ask" (disabled placeholder) | `#tab-for-you` / `#desktop-nav-for-you`: Functional **For You** view (`.v2-for-you-view`) rendering pending proposals and proactive insights with Confirm / Not true actions. | ⚠️ Intentionally Differs (D2: No Disabled Placeholders) |
| **Tab 4: Me** | "Me" (memory profile) | `#tab-me` / `#desktop-nav-me`: Functional **Me & Memory** view (`.me-view-container`) with budget meter, confirmed preferences, pending/rejected audits, and data controls. | ✅ Aligned |
| **Voice / Mic Icon** | Mic icon in search/ask bar | **Omitted completely**. Voice input does not exist in the offline demo. The ask bar reads "Ask Yori about your day..." and docks above the bottom navigation on mobile. | ⚠️ Intentionally Differs (D2 & D4: No Fake Voice Input) |

---

## 4. Evidence Artifacts

- **TripDetail Mobile (390×844)**: `docs/evidence/v2/v2-trip-detail-mobile-390x844.png`
- **TripDetail Desktop (1280×800)**: `docs/evidence/v2/v2-trip-detail-desktop-1280x800.png`
- **RestaurantDetail Mobile (390×844)**: `docs/evidence/v2/v2-restaurant-detail-mobile-390x844.png`
- **RestaurantDetail Desktop (1280×800)**: `docs/evidence/v2/v2-restaurant-detail-desktop-1280x800.png`
- **Rain Mobile (390×844)**: `docs/evidence/v2/v2-rain-mobile-390x844.png`
- **Rain Desktop (1280×800)**: `docs/evidence/v2/v2-rain-desktop-1280x800.png`
- **Lunch Mobile (390×844)**: `docs/evidence/v2/v2-lunch-mobile-390x844.png`
- **Lunch Desktop (1280×800)**: `docs/evidence/v2/v2-lunch-desktop-1280x800.png`
- **Clear Home Mobile (390×844)**: `docs/evidence/v2/v2-home-mobile-390x844.png`
- **Clear Home Desktop (1280×800)**: `docs/evidence/v2/v2-home-desktop-1280x800.png`
