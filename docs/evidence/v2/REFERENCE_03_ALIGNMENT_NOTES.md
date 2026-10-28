# Yori Living Context V2 (V1 Slice) — Reference 03 Frame 1 Alignment Notes

**Governed by**: `LIVING_CONTEXT_V2.md §4` & Task `V1` Binding Data-Honesty Rules  
**Date**: 2026-10-28  
**Reference Asset**: `docs/design/v2-reference/03_mobile_experience_v1_approved.png` (Frame 1 Home for Scenarios 1 & 2)

---

## 1. Scenario 1: Rain Travel Planning (D2 Rain Re-plan)

| Aspect | Reference 03 Frame 1 | Yori Living Context V2 Implementation | Alignment Classification |
|---|---|---|---|
| **Context Greeting** | "Good afternoon. I've been looking ahead for you." | Dynamic greeting (`Good morning.` / `Good afternoon.`) + "I've been looking ahead for you." | ✅ Aligned |
| **Rain Insight Card** | Cloud with rain icon, "Rain is expected around 2:00 PM", subtitle "I've prepared an updated plan for your piano lesson." | Cloud with rain icon, `.v2-insight-banner` with "Rain is expected around 2:00 PM" and prep notification | ✅ Aligned |
| **Checklist** | Visual umbrella icon in detail | Prominent `#chip-umbrella` chip ("Take umbrella · 20m prep + 5m buffer") | ✅ Aligned |
| **Spatial Map** | Map snippet showing route and "Rain expected" callout | Prominent `.v2-map-card` with schematic street grid, origin (Home), destination (Piano Studio), Drive route (solid `#2D6A4F`), Bus route (dashed `#718096`), and "Rain expected · Heavier 2:00–4:00 PM" badge | ✅ Aligned |
| **Timeline & Options** | Shows leave 2:25 PM, arrive 3:09 PM (44 min) | Exact fixture values: Leave 2:30 PM (drive 25m) or 2:15 PM (bus 40m), arriving 2:55 PM (5m buffer) for 3:00 PM lesson | ⚠️ Intentionally Differs (Data Honesty) |
| **Avatar** | Stock photo of a woman | Yori brand emblem / mark (no fake person photo) | ⚠️ Intentionally Differs (Data Honesty) |
| **Map Truthfulness** | Concept stylized road map | Labelled `Schematic · simulated` | ⚠️ Intentionally Differs (Data Honesty) |
| **Bottom Navigation** | 5 tabs with disabled placeholders | 2 clean active tabs (`Today`, `Me`) with docked Ask Bar above nav; zero dead controls | ⚠️ Intentionally Differs (Usability) |

### Data Honesty Note (Rain)
Reference 03 contains contradictory numbers in its concept art (e.g., leave 2:25 PM, arrive 3:09 PM with 44 min duration, for a 3:00 PM lesson). In accordance with binding data-honesty rules, Yori uses mathematically consistent fixture values: appointment at 3:00 PM, drive 25 min (leave 2:30 PM, arrive 2:55 PM with 5 min buffer), bus 40 min (leave 2:15 PM, arrive 2:55 PM with 5 min buffer).

---

## 2. Scenario 2: Lunch Recommendations Away From Home (D3 Away Lunch)

| Aspect | Reference 03 Frame 1 | Yori Living Context V2 Implementation | Alignment Classification |
|---|---|---|---|
| **Header Banner** | "Lunch near your destination · 3–5 min from your route" | "Lunch options near you", "Lunch near your destination · Based on your free window, location away from home, and taste memory." | ✅ Aligned |
| **Candidate Cards** | 3 candidate cards (Sakura Italian, Ramen Kuro, Café Lumi) with image, name, cuisine, distance | 3 candidate cards (`Demo Place A · Ramen`, `Demo Place B · Salad`, `Demo Place C · Sushi`) with local illustration, cuisine pill, and distance chip | ✅ Aligned |
| **Visual Artwork** | Food photos | Local SVG illustrations (`ramen`, `salad`, `sushi`, `cafe`, `italian`) labelled `Illustration · simulated`; zero external HTTP/HTTPS requests | ⚠️ Intentionally Differs (Zero-Remote-Asset Policy) |
| **Ratings & Reviews** | "★ 4.5 (320)" / "★ 4.3 (114)" | Star ratings and review counts omitted; replaced by confirmed memory basis (e.g. `Confirmed taste preference: Japanese`) | ⚠️ Intentionally Differs (Data Honesty: No Invented Ratings) |
| **Nearby Map** | None in mobile Frame 1 | Compact `.v2-map-card` showing user location in Downtown and walk lines to candidate locations | ✅ Enhancement |
| **Mock Disclosure** | None | Visible notice: `Demonstration places generated from simulated context` | ⚠️ Intentionally Differs (Transparency) |

---

## 3. Evidence Artifacts

- **Rain Mobile (390×844)**: `docs/evidence/v2/v2-rain-mobile-390x844.png`
- **Rain Desktop (1280×800)**: `docs/evidence/v2/v2-rain-desktop-1280x800.png`
- **Lunch Mobile (390×844)**: `docs/evidence/v2/v2-lunch-mobile-390x844.png`
- **Lunch Desktop (1280×800)**: `docs/evidence/v2/v2-lunch-desktop-1280x800.png`
- **Clear Home Mobile (390×844)**: `docs/evidence/v2/v2-home-mobile-390x844.png`
- **Clear Home Desktop (1280×800)**: `docs/evidence/v2/v2-home-desktop-1280x800.png`
