# Slot-Aware Grounding Walkthrough Audit Report (PRE-S1-B)

**Audit Date**: 2026-10-30  
**Specification**: `docs/architecture/YORI_PRE_S1.plan.json` (Task `PRE-S1-B`, Slice B)  
**Execution Scope**: 4 Scripted Walkthroughs (Rain, Away-Lunch, Fuel V5, Dynamic Lunch V5)  
**Viewports Tested**: Desktop (1280×800) and Mobile (390×844)  
**Pass Bar**: **0 ungrounded domain slot items**  
**Audit Verdict**: ✅ PASS (0 ungrounded domain items across all slots)

---

## 1. Executive Summary

This report documents the slot-aware grounding audit performed over every rendered field captured from the live rendered DOM during end-to-end Playwright walkthroughs.

Unlike token-level text scrapers, this harness is strictly **slot-aware**:
1. Every rendered value slot in DOM is instrumented with explicit `[data-source-ref="<recordId>.<field>"]` and `[data-slot="domain"]`.
2. Every slot resolves to its **OWN** record field via `GroundedRecommendationVerifier.verifyField`.
3. A real value presented in the wrong slot (e.g. arrival time in departure slot, or Station 2's distance on Station 1's card) strictly **fails closed**.
4. All non-domain elements (buttons, badges, section titles) are classified as explicit UI chrome with documented rationale (0 unclassified leaf elements).
5. All temporal values, distances, and entity names are prevented from leaking into chrome slots via an automated chrome value-leak guard.

### Walkthrough Resolution Overview

| Walkthrough Scene | Viewports Audited | Domain Slots | Grounded | Ungrounded | Resolution Rate | Verdict |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **rain** | Desktop + Mobile | 242 | 242 | 0 | 100.0% | ✅ PASS |
| **away-lunch** | Desktop + Mobile | 44 | 44 | 0 | 100.0% | ✅ PASS |
| **fuel** | Desktop + Mobile | 38 | 38 | 0 | 100.0% | ✅ PASS |
| **dynamic-lunch** | Desktop + Mobile | 64 | 64 | 0 | 100.0% | ✅ PASS |
| **Total Across All Scenes** | **Both (8 Runs)** | **388** | **388** | **0** | **100.0%** | **✅ PASS** |

---

## 2. Adversarial Negative Self-Test Verification

To prove that the audit harness enforces genuine slot-awareness and normalized equality, 10 adversarial negative test probes were executed through the **EXACT SAME** `auditDump` function against mutated in-memory dumps:

| Test ID | Adversarial Probe | Description | Expected Reason | Actual Reason | Verdict |
|:---|:---|:---|:---|:---|:---:|
| `NEG-1` | **Swap leave time ↔ arrive time in rendered slots (A)** | Rendered arriveTime (2:55 PM) swapped into leaveTime slot through auditDump | `tampered_value` | `tampered_value` | ✅ PASS (Rejected) |
| `NEG-2` | **Swap two candidate cards straight-line distances (B)** | Candidate card 1 distance swapped with candidate card 2 through auditDump | `tampered_value` | `tampered_value` | ✅ PASS (Rejected) |
| `NEG-3` | **Headline departure time tampering (C)** | Hero headline leave time slot mutated from 2:30 PM to 2:55 PM | `tampered_value` | `tampered_value` | ✅ PASS (Rejected) |
| `NEG-4` | **Hero candidate straight-line distance tampering (D)** | Hero candidate distance mutated from 140 m to 254 m | `tampered_value` | `tampered_value` | ✅ PASS (Rejected) |
| `NEG-5` | **Navigate modal destination renamed (E)** | Destination place name mutated to Sunset Station in modal prompt | `tampered_value` | `tampered_value` | ✅ PASS (Rejected) |
| `NEG-6` | **Fabricated content appended to time slot (F)** | Arbitrary text appended around 2:30 PM in anchored time slot | `tampered_value` | `tampered_value` | ✅ PASS (Rejected) |
| `NEG-7` | **Sample preference mislabelled as confirmed (G)** | Sample habit presented as "You confirmed" in provenance badge slot | `sample_mislabelled_as_confirmed` | `sample_mislabelled_as_confirmed` | ✅ PASS (Rejected) |
| `NEG-8` | **Value leaked into chrome slot without allowlist (H)** | Temporal value placed in chrome slot with unallowlisted reason | `chrome_leak` | `chrome_leak` | ✅ PASS (Rejected) |
| `NEG-9` | **Unannotated DOM text leaf rejection (I)** | Unannotated element with slotType unclassified presented to auditDump | `unclassified_slot` | `unclassified_slot` | ✅ PASS (Rejected) |
| `NEG-10` | **Bundle-derived entity name leaked into chrome slot without allowlist (J)** | Bundle record entity name ("Bay City Sushi") leaked into non-allowlisted chrome slot | `chrome_leak` | `chrome_leak` | ✅ PASS (Rejected) |

**Adversarial Self-Test Verdict**: ✅ **100% (10/10) of negative probes correctly detected and rejected**

---

## 3. UI Chrome & Static Element Accounting

Every non-domain rendered element captured during the walkthroughs was tagged with `[data-slot="chrome"]` and `[data-slot-reason]`. There are **0 silently skipped or unannotated elements**.

| Component | Chrome Purpose / Rationale | Rendered Count | Sample Rendered Content |
|:---|:---|:---:|:---|
| `now-card` | Simulated illustration badge | 42 | "Illustration · simulated" |
| `now-card` | Recommendation ranking basis label | 42 | "Based on taste: Japanese (Demo profile ·" |
| `now-card` | Navigation trigger button | 42 | "Directions →" |
| `now-card` | View details button | 42 | "Details →" |
| `now-card` | Static timeline step label | 30 | "Get ready" |
| `v2-map-card` | Map section heading | 24 | "NEARBY PLACES MAP" |
| `v2-map-card` | Simulated map badge | 24 | "Schematic · simulated" |
| `now-card` | Section header label | 24 | "NOW · YOUR NEXT MOMENT" |
| `now-card` | Simulated fixture badge | 24 | "SIMULATED" |
| `now-card` | Static basis template | 24 | "Based on your location, schedule window," |
| `now-card` | Accept plan button | 24 | "Accept" |
| `now-card` | Trip details action button | 24 | "Details →" |
| `now-card` | Why provenance action button | 24 | "Why" |
| `now-card` | Adjust plan button | 22 | "Adjust" |
| `now-card` | Dismiss plan button | 22 | "Dismiss" |
| `why-sheet-backdrop` | Signal category label | 22 | "Current location status" |
| `why-sheet-backdrop` | Recorded time prefix | 22 | "Recorded at" |
| `why-sheet-backdrop` | Signal simulated badge | 22 | "SIMULATED" |
| `now-card` | Noise filter tag | 20 | "Quiet" |
| `why-sheet-backdrop` | Signal descriptive text | 20 | "You're away from home" |
| `now-card` | City preset selection button | 20 | "San Francisco" |
| `why-sheet-backdrop` | Signal recorded time | 16 | "12:10 PM" |
| `now-card` | Option mode label | 16 | "Drive · leave" |
| `now-card` | Option recommendation badge | 16 | "Recommended" |
| `now-card` | Candidates hero title | 14 | "Lunch options near you" |
| `now-card` | Places disclosure notice | 14 | "Mock places for this demo; real listings" |
| `why-sheet-backdrop` | Memory preference label | 14 | "Dining taste preferences" |
| `now-card` | Candidate category label | 12 | "Gas Station" |
| `v2-map-card` | Map schematic destination label | 10 | "Lunch locations near you" |
| `now-card` | Candidates hero headline | 10 | "Places matching what you like, within wa" |
| `now-card` | Dietary filter tag | 10 | "Vegetarian" |
| `now-card` | Location status bar | 10 | "📍 Location: Selected City (simulated) C" |
| `now-card` | City preset selector label | 10 | "Demo City Presets:" |
| `now-card` | Appointment time connector | 10 | "at" |
| `now-card` | Departure prep prefix | 10 | "Get ready at" |
| `now-card` | Departure leave connector | 10 | ", leave by" |
| `now-card` | Timeline step detail | 10 | "Scheduled appointment" |
| `v2-insight-banner` | Insight alert prefix | 8 | "Rain in the forecast for your travel win" |
| `v2-insight-banner` | Insight alert suffix | 8 | "). I've prepared an updated departure sc" |
| `v2-insight-banner` | Checklist chip | 8 | "Umbrella" |
| `now-card` | Checklist chip | 8 | "Umbrella" |
| `now-card` | Checklist prep prefix | 8 | "Take umbrella ·" |
| `why-sheet-backdrop` | Why sheet title | 6 | "Why you're seeing this" |
| `why-sheet-backdrop` | Modal close button | 6 | "×" |
| `why-sheet-backdrop` | Evidence section heading | 6 | "EVIDENCE & SIGNALS" |
| `why-sheet-backdrop` | Memory section heading | 6 | "MEMORY & HABITS" |
| `why-sheet-backdrop` | Derivation section heading | 6 | "HOW THIS WAS DERIVED" |
| `why-sheet-backdrop` | Derivation synthesis narrative | 6 | "Detected that you are away from home dur" |
| `why-sheet-backdrop` | Close why sheet | 6 | "Close" |
| `navigate-confirm-modal` | Navigation modal title | 4 | "Start Navigation" |
| `navigate-confirm-modal` | Navigation verified handoff badge | 4 | "Verified handoff" |
| `navigate-confirm-modal` | Navigation directions prefix | 4 | "Open driving directions to" |
| `navigate-confirm-modal` | Navigation directions suffix | 4 | "in Google Maps?" |
| `navigate-confirm-modal` | Verified URL label | 4 | "VERIFIED DESTINATION URL:" |
| `navigate-confirm-modal` | Verified URL preview | 4 | "https://www.google.com/maps/dir/?api=1&d" |
| `navigate-confirm-modal` | Cancel navigation button | 4 | "Cancel" |
| `navigate-confirm-modal` | Confirm navigation button | 4 | "Open Maps" |
| `now-card` | Hero candidate separator | 4 | "·" |
| `now-card` | Option late connector | 4 | "·" |
| `now-card` | Plan updated status badge | 2 | "Updated" |
| `now-card` | Undo action button | 2 | "Undo" |
| `me-view-container` | Me page title | 2 | "Me & Memory" |
| `me-view-container` | Me page subtitle | 2 | "Manage your confirmed preferences, propo" |
| `me-view-container` | Daily budget section label | 2 | "TODAY'S PROACTIVE PROMPTS" |
| `me-view-container` | Daily prompt budget badge | 2 | "0 of 3 used today" |
| `me-view-container` | Daily budget description | 2 | "Your Living Context refreshes smoothly w" |
| `me-view-container` | Confirmed preferences section label | 2 | "CONFIRMED PREFERENCES" |
| `me-view-container` | Empty confirmed preferences notice | 2 | "No confirmed preferences yet. Active dem" |
| `me-view-container` | Pending proposals section label | 2 | "PENDING PROPOSALS" |
| `me-view-container` | Pending proposals count badge | 2 | "0 Pending" |
| `me-view-container` | Pending proposals description | 2 | "Proposals created from your actions, wai" |
| `me-view-container` | Empty pending proposals notice | 2 | "No pending proposals." |
| `me-view-container` | Rejected proposals section label | 2 | "REJECTED PROPOSALS" |
| `me-view-container` | Rejected proposals description | 2 | "Declined proposals retained for audit. T" |
| `me-view-container` | Empty rejected proposals notice | 2 | "No rejected proposals." |
| `me-view-container` | Data controls section label | 2 | "DATA CONTROLS & STORAGE" |
| `me-view-container` | Export raw data button | 2 | "Export Raw Data" |
| `me-view-container` | Reset storage button | 2 | "Reset Storage" |

---

## 4. Complete Slot Resolution Ledger (Full Accounting)

Below is the complete resolution ledger for all audited domain slots across all walkthroughs (0 truncated rows):

| Slot ID | Scene | Viewport | Step | Component | Record ID | Field | Rendered Text | Status |
|:---|:---|:---:|:---|:---|:---|:---|:---|:---:|
| `now-card-mock-place-1-name-0` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-1` | `name` | "Demo Place A · Ramen" | ✅ GROUNDED |
| `now-card-mock-place-1-cuisine-1` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-1-distanceText-2` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-1` | `distanceText` | "5m away" | ✅ GROUNDED |
| `now-card-mock-place-2-name-3` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-2` | `name` | "Demo Place B · Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-cuisine-4` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-distanceText-5` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-2` | `distanceText` | "7m away" | ✅ GROUNDED |
| `now-card-mock-place-3-name-6` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-3` | `name` | "Demo Place C · Sushi" | ✅ GROUNDED |
| `now-card-mock-place-3-cuisine-7` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-3-distanceText-8` | away-lunch | 1280x800 | Proactive Away Lunch Card | `now-card` | `mock-place-3` | `distanceText` | "10m away" | ✅ GROUNDED |
| `now-card-mock-place-1-name-0` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-1` | `name` | "Demo Place A · Ramen" | ✅ GROUNDED |
| `now-card-mock-place-1-cuisine-1` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-1-distanceText-2` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-1` | `distanceText` | "5m away" | ✅ GROUNDED |
| `now-card-mock-place-2-name-3` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-2` | `name` | "Demo Place B · Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-cuisine-4` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-distanceText-5` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-2` | `distanceText` | "7m away" | ✅ GROUNDED |
| `now-card-mock-place-3-name-6` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-3` | `name` | "Demo Place C · Sushi" | ✅ GROUNDED |
| `now-card-mock-place-3-cuisine-7` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-3-distanceText-8` | away-lunch | 1280x800 | Why Provenance Sheet | `now-card` | `mock-place-3` | `distanceText` | "10m away" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-description-0` | away-lunch | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `taste_preference` | `description` | "You like ramen or salad" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-provenance-1` | away-lunch | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `taste_preference` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-description-2` | away-lunch | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `description` | "Japanese" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-provenance-3` | away-lunch | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `now-card-mock-place-1-name-0` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-1` | `name` | "Demo Place A · Ramen" | ✅ GROUNDED |
| `now-card-mock-place-1-cuisine-1` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-1-distanceText-2` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-1` | `distanceText` | "5m away" | ✅ GROUNDED |
| `now-card-mock-place-2-name-3` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-2` | `name` | "Demo Place B · Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-cuisine-4` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-distanceText-5` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-2` | `distanceText` | "7m away" | ✅ GROUNDED |
| `now-card-mock-place-3-name-6` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-3` | `name` | "Demo Place C · Sushi" | ✅ GROUNDED |
| `now-card-mock-place-3-cuisine-7` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-3-distanceText-8` | away-lunch | 390x844 | Proactive Away Lunch Card | `now-card` | `mock-place-3` | `distanceText` | "10m away" | ✅ GROUNDED |
| `now-card-mock-place-1-name-0` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-1` | `name` | "Demo Place A · Ramen" | ✅ GROUNDED |
| `now-card-mock-place-1-cuisine-1` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-1-distanceText-2` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-1` | `distanceText` | "5m away" | ✅ GROUNDED |
| `now-card-mock-place-2-name-3` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-2` | `name` | "Demo Place B · Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-cuisine-4` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-mock-place-2-distanceText-5` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-2` | `distanceText` | "7m away" | ✅ GROUNDED |
| `now-card-mock-place-3-name-6` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-3` | `name` | "Demo Place C · Sushi" | ✅ GROUNDED |
| `now-card-mock-place-3-cuisine-7` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-mock-place-3-distanceText-8` | away-lunch | 390x844 | Why Provenance Sheet | `now-card` | `mock-place-3` | `distanceText` | "10m away" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-description-0` | away-lunch | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `taste_preference` | `description` | "You like ramen or salad" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-provenance-1` | away-lunch | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `taste_preference` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-description-2` | away-lunch | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `description` | "Japanese" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-provenance-3` | away-lunch | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `now-card-lunch-sf-1-name-0` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-cuisine-1` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-1-straightLineDistanceLabel-2` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-1` | `straightLineDistanceLabel` | "207 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-2-name-3` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-2` | `name` | "Garden Fresh Bowls" | ✅ GROUNDED |
| `now-card-lunch-sf-2-cuisine-4` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-lunch-sf-2-straightLineDistanceLabel-5` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-2` | `straightLineDistanceLabel` | "139 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-3-name-6` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-3` | `name` | "Bay City Sushi" | ✅ GROUNDED |
| `now-card-lunch-sf-3-cuisine-7` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-3-straightLineDistanceLabel-8` | dynamic-lunch | 1280x800 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-3` | `straightLineDistanceLabel` | "416 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-1-name-0` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-cuisine-1` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-1-straightLineDistanceLabel-2` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-1` | `straightLineDistanceLabel` | "207 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-2-name-3` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-2` | `name` | "Garden Fresh Bowls" | ✅ GROUNDED |
| `now-card-lunch-sf-2-cuisine-4` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-lunch-sf-2-straightLineDistanceLabel-5` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-2` | `straightLineDistanceLabel` | "139 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-3-name-6` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-3` | `name` | "Bay City Sushi" | ✅ GROUNDED |
| `now-card-lunch-sf-3-cuisine-7` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-3-straightLineDistanceLabel-8` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `now-card` | `lunch-sf-3` | `straightLineDistanceLabel` | "416 m (straight-line)" | ✅ GROUNDED |
| `navigate-confirm-modal-lunch-sf-1-name-0` | dynamic-lunch | 1280x800 | Navigate Handoff Modal | `navigate-confirm-modal` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-name-0` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-cuisine-1` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-1-straightLineDistanceLabel-2` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-1` | `straightLineDistanceLabel` | "207 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-2-name-3` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-2` | `name` | "Garden Fresh Bowls" | ✅ GROUNDED |
| `now-card-lunch-sf-2-cuisine-4` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-lunch-sf-2-straightLineDistanceLabel-5` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-2` | `straightLineDistanceLabel` | "139 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-3-name-6` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-3` | `name` | "Bay City Sushi" | ✅ GROUNDED |
| `now-card-lunch-sf-3-cuisine-7` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-3-straightLineDistanceLabel-8` | dynamic-lunch | 1280x800 | Why Sheet | `now-card` | `lunch-sf-3` | `straightLineDistanceLabel` | "416 m (straight-line)" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-description-0` | dynamic-lunch | 1280x800 | Why Sheet | `why-sheet-backdrop` | `taste_preference` | `description` | "You like ramen or salad" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-provenance-1` | dynamic-lunch | 1280x800 | Why Sheet | `why-sheet-backdrop` | `taste_preference` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-description-2` | dynamic-lunch | 1280x800 | Why Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `description` | "Japanese" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-provenance-3` | dynamic-lunch | 1280x800 | Why Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `now-card-lunch-sf-1-name-0` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-cuisine-1` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-1-straightLineDistanceLabel-2` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-1` | `straightLineDistanceLabel` | "207 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-2-name-3` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-2` | `name` | "Garden Fresh Bowls" | ✅ GROUNDED |
| `now-card-lunch-sf-2-cuisine-4` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-lunch-sf-2-straightLineDistanceLabel-5` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-2` | `straightLineDistanceLabel` | "139 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-3-name-6` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-3` | `name` | "Bay City Sushi" | ✅ GROUNDED |
| `now-card-lunch-sf-3-cuisine-7` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-3-straightLineDistanceLabel-8` | dynamic-lunch | 390x844 | Dynamic Lunch Proactive Card | `now-card` | `lunch-sf-3` | `straightLineDistanceLabel` | "416 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-1-name-0` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-cuisine-1` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-1-straightLineDistanceLabel-2` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-1` | `straightLineDistanceLabel` | "207 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-2-name-3` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-2` | `name` | "Garden Fresh Bowls" | ✅ GROUNDED |
| `now-card-lunch-sf-2-cuisine-4` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-lunch-sf-2-straightLineDistanceLabel-5` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-2` | `straightLineDistanceLabel` | "139 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-3-name-6` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-3` | `name` | "Bay City Sushi" | ✅ GROUNDED |
| `now-card-lunch-sf-3-cuisine-7` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-3-straightLineDistanceLabel-8` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `now-card` | `lunch-sf-3` | `straightLineDistanceLabel` | "416 m (straight-line)" | ✅ GROUNDED |
| `navigate-confirm-modal-lunch-sf-1-name-0` | dynamic-lunch | 390x844 | Navigate Handoff Modal | `navigate-confirm-modal` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-name-0` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-1` | `name` | "Pacific Ramen Bar" | ✅ GROUNDED |
| `now-card-lunch-sf-1-cuisine-1` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-1` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-1-straightLineDistanceLabel-2` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-1` | `straightLineDistanceLabel` | "207 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-2-name-3` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-2` | `name` | "Garden Fresh Bowls" | ✅ GROUNDED |
| `now-card-lunch-sf-2-cuisine-4` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-2` | `cuisine` | "Salad" | ✅ GROUNDED |
| `now-card-lunch-sf-2-straightLineDistanceLabel-5` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-2` | `straightLineDistanceLabel` | "139 m (straight-line)" | ✅ GROUNDED |
| `now-card-lunch-sf-3-name-6` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-3` | `name` | "Bay City Sushi" | ✅ GROUNDED |
| `now-card-lunch-sf-3-cuisine-7` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-3` | `cuisine` | "Japanese" | ✅ GROUNDED |
| `now-card-lunch-sf-3-straightLineDistanceLabel-8` | dynamic-lunch | 390x844 | Why Sheet | `now-card` | `lunch-sf-3` | `straightLineDistanceLabel` | "416 m (straight-line)" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-description-0` | dynamic-lunch | 390x844 | Why Sheet | `why-sheet-backdrop` | `taste_preference` | `description` | "You like ramen or salad" | ✅ GROUNDED |
| `why-sheet-backdrop-taste_preference-provenance-1` | dynamic-lunch | 390x844 | Why Sheet | `why-sheet-backdrop` | `taste_preference` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-description-2` | dynamic-lunch | 390x844 | Why Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `description` | "Japanese" | ✅ GROUNDED |
| `why-sheet-backdrop-favorite_cuisine-provenance-3` | dynamic-lunch | 390x844 | Why Sheet | `why-sheet-backdrop` | `favorite_cuisine` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `v2-map-card-fuel-sf-1-name-0` | fuel | 1280x800 | Low Fuel Hero Card | `v2-map-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-0` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-1` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m straight-line" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-2` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-3` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-2-name-4` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-2` | `name` | "Sunset Fuel Station" | ✅ GROUNDED |
| `now-card-fuel-sf-2-straightLineDistanceLabel-5` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-2` | `straightLineDistanceLabel` | "254 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-3-name-6` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-3` | `name` | "Bayfront Express Gas" | ✅ GROUNDED |
| `now-card-fuel-sf-3-straightLineDistanceLabel-7` | fuel | 1280x800 | Low Fuel Hero Card | `now-card` | `fuel-sf-3` | `straightLineDistanceLabel` | "518 m (straight-line)" | ✅ GROUNDED |
| `v2-map-card-fuel-sf-1-name-0` | fuel | 1280x800 | Navigate Handoff Modal | `v2-map-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-0` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-1` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m straight-line" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-2` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-3` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-2-name-4` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-2` | `name` | "Sunset Fuel Station" | ✅ GROUNDED |
| `now-card-fuel-sf-2-straightLineDistanceLabel-5` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-2` | `straightLineDistanceLabel` | "254 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-3-name-6` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-3` | `name` | "Bayfront Express Gas" | ✅ GROUNDED |
| `now-card-fuel-sf-3-straightLineDistanceLabel-7` | fuel | 1280x800 | Navigate Handoff Modal | `now-card` | `fuel-sf-3` | `straightLineDistanceLabel` | "518 m (straight-line)" | ✅ GROUNDED |
| `navigate-confirm-modal-fuel-sf-1-name-0` | fuel | 1280x800 | Navigate Handoff Modal | `navigate-confirm-modal` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `v2-map-card-fuel-sf-1-name-0` | fuel | 390x844 | Low Fuel Hero Card | `v2-map-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-0` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-1` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m straight-line" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-2` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-3` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-2-name-4` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-2` | `name` | "Sunset Fuel Station" | ✅ GROUNDED |
| `now-card-fuel-sf-2-straightLineDistanceLabel-5` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-2` | `straightLineDistanceLabel` | "254 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-3-name-6` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-3` | `name` | "Bayfront Express Gas" | ✅ GROUNDED |
| `now-card-fuel-sf-3-straightLineDistanceLabel-7` | fuel | 390x844 | Low Fuel Hero Card | `now-card` | `fuel-sf-3` | `straightLineDistanceLabel` | "518 m (straight-line)" | ✅ GROUNDED |
| `v2-map-card-fuel-sf-1-name-0` | fuel | 390x844 | Navigate Handoff Modal | `v2-map-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-0` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-1` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m straight-line" | ✅ GROUNDED |
| `now-card-fuel-sf-1-name-2` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `now-card-fuel-sf-1-straightLineDistanceLabel-3` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-1` | `straightLineDistanceLabel` | "140 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-2-name-4` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-2` | `name` | "Sunset Fuel Station" | ✅ GROUNDED |
| `now-card-fuel-sf-2-straightLineDistanceLabel-5` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-2` | `straightLineDistanceLabel` | "254 m (straight-line)" | ✅ GROUNDED |
| `now-card-fuel-sf-3-name-6` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-3` | `name` | "Bayfront Express Gas" | ✅ GROUNDED |
| `now-card-fuel-sf-3-straightLineDistanceLabel-7` | fuel | 390x844 | Navigate Handoff Modal | `now-card` | `fuel-sf-3` | `straightLineDistanceLabel` | "518 m (straight-line)" | ✅ GROUNDED |
| `navigate-confirm-modal-fuel-sf-1-name-0` | fuel | 390x844 | Navigate Handoff Modal | `navigate-confirm-modal` | `fuel-sf-1` | `name` | "Metro Gas & Go" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 1280x800 | Initial Clear State | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 1280x800 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 1280x800 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 1280x800 | Initial Clear State | `now-card` | `eta-drive-piano` | `prepareTime` | "2:05 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 1280x800 | Initial Clear State | `now-card` | `eta-drive-piano` | `leaveTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 1280x800 | Initial Clear State | `now-card` | `eta-drive-piano` | `prepareTime` | "2:05 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 1280x800 | Initial Clear State | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 1280x800 | Initial Clear State | `now-card` | `eta-drive-piano` | `leaveTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 1280x800 | Initial Clear State | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 30 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 1280x800 | Initial Clear State | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 1280x800 | Initial Clear State | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 1280x800 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 1280x800 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-12` | rain | 1280x800 | Initial Clear State | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 1280x800 | Weather Shift (Rain) | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 1280x800 | Weather Shift (Rain) | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 1280x800 | Weather Shift (Rain) | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 1280x800 | Weather Shift (Rain) | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 1280x800 | Weather Shift (Rain) | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-12` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-14` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-eta-bus-piano-leaveTime-15` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-bus-piano` | `leaveTime` | "2:15 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-16` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-17` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-18` | rain | 1280x800 | Weather Shift (Rain) | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 1280x800 | Route Options (Drive vs Bus) | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 1280x800 | Route Options (Drive vs Bus) | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 1280x800 | Route Options (Drive vs Bus) | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 1280x800 | Route Options (Drive vs Bus) | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 1280x800 | Route Options (Drive vs Bus) | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-12` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-14` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-eta-bus-piano-leaveTime-15` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-bus-piano` | `leaveTime` | "2:15 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-16` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-17` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-18` | rain | 1280x800 | Route Options (Drive vs Bus) | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 1280x800 | Why Provenance Sheet | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 1280x800 | Why Provenance Sheet | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 1280x800 | Why Provenance Sheet | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 1280x800 | Why Provenance Sheet | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 1280x800 | Why Provenance Sheet | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-12` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-14` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-eta-bus-piano-leaveTime-15` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-bus-piano` | `leaveTime` | "2:15 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-16` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-17` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-18` | rain | 1280x800 | Why Provenance Sheet | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `why-sheet-backdrop-cal-piano-issuedTime-0` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `cal-piano` | `issuedTime` | "10:00 AM" | ✅ GROUNDED |
| `why-sheet-backdrop-travel-rain-issuedTime-1` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `travel-rain` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `why-sheet-backdrop-weather-rain-issuedTime-2` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `weather-rain` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_buffer_minutes-description-3` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_buffer_minutes` | `description` | "5 min" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_buffer_minutes-provenance-4` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_buffer_minutes` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_duration_minutes-description-5` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_duration_minutes` | `description` | "20 min" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_duration_minutes-provenance-6` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_duration_minutes` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-rain_transport_preference-description-7` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `rain_transport_preference` | `description` | "Prefers driving when it rains" | ✅ GROUNDED |
| `why-sheet-backdrop-rain_transport_preference-provenance-8` | rain | 1280x800 | Why Provenance Sheet | `why-sheet-backdrop` | `rain_transport_preference` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 1280x800 | After Late Shift Confirmed | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 1280x800 | After Late Shift Confirmed | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 1280x800 | After Late Shift Confirmed | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 1280x800 | After Late Shift Confirmed | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 1280x800 | After Late Shift Confirmed | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-prepareTime-2` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `prepareTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-leaveTime-3` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `leaveTime` | "2:45 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-drivePrepareTime-4` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `drivePrepareTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep" | ✅ GROUNDED |
| `now-card-user_override_timing-driveLeaveTime-6` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `driveLeaveTime` | "2:45 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-user_override_timing-driveArrivalTime-8` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `driveArrivalTime` | "3:10 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-lateMinutes-9` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `lateMinutes` | "Late by 10m" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-user_override_timing-driveLeaveTime-12` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `driveLeaveTime` | "2:45 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive" | ✅ GROUNDED |
| `now-card-user_override_timing-lateMinutes-14` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `lateMinutes` | "late by 10m" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-15` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-user_override_timing-busLeaveTime-16` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `busLeaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-17` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus" | ✅ GROUNDED |
| `now-card-user_override_timing-lateMinutes-18` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `lateMinutes` | "late by 10m" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-19` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-20` | rain | 1280x800 | After Late Shift Confirmed | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 390x844 | Initial Clear State | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 390x844 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 390x844 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 390x844 | Initial Clear State | `now-card` | `eta-drive-piano` | `prepareTime` | "2:05 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 390x844 | Initial Clear State | `now-card` | `eta-drive-piano` | `leaveTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 390x844 | Initial Clear State | `now-card` | `eta-drive-piano` | `prepareTime` | "2:05 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 390x844 | Initial Clear State | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 390x844 | Initial Clear State | `now-card` | `eta-drive-piano` | `leaveTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 390x844 | Initial Clear State | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 30 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 390x844 | Initial Clear State | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 390x844 | Initial Clear State | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 390x844 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 390x844 | Initial Clear State | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-12` | rain | 390x844 | Initial Clear State | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 390x844 | Weather Shift (Rain) | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 390x844 | Weather Shift (Rain) | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 390x844 | Weather Shift (Rain) | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 390x844 | Weather Shift (Rain) | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 390x844 | Weather Shift (Rain) | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-12` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-14` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-eta-bus-piano-leaveTime-15` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-bus-piano` | `leaveTime` | "2:15 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-16` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-17` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-18` | rain | 390x844 | Weather Shift (Rain) | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 390x844 | Route Options (Drive vs Bus) | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 390x844 | Route Options (Drive vs Bus) | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 390x844 | Route Options (Drive vs Bus) | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 390x844 | Route Options (Drive vs Bus) | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 390x844 | Route Options (Drive vs Bus) | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-12` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-14` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-eta-bus-piano-leaveTime-15` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-bus-piano` | `leaveTime` | "2:15 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-16` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-17` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-18` | rain | 390x844 | Route Options (Drive vs Bus) | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 390x844 | Why Provenance Sheet | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 390x844 | Why Provenance Sheet | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 390x844 | Why Provenance Sheet | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 390x844 | Why Provenance Sheet | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 390x844 | Why Provenance Sheet | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 390x844 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 390x844 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-2` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-3` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-prepareTime-4` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `prepareTime` | "2:10 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 390x844 | Why Provenance Sheet | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep + 5m buffer" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-6` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-eta-drive-piano-arrivalTime-8` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `arrivalTime` | "2:55 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-bufferMinutes-9` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `bufferMinutes` | "On time · 5m buffer" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 390x844 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 390x844 | Why Provenance Sheet | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-eta-drive-piano-leaveTime-12` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `leaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-14` | rain | 390x844 | Why Provenance Sheet | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-eta-bus-piano-leaveTime-15` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-bus-piano` | `leaveTime` | "2:15 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-16` | rain | 390x844 | Why Provenance Sheet | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus + 5m margin" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-17` | rain | 390x844 | Why Provenance Sheet | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-18` | rain | 390x844 | Why Provenance Sheet | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |
| `why-sheet-backdrop-cal-piano-issuedTime-0` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `cal-piano` | `issuedTime` | "10:00 AM" | ✅ GROUNDED |
| `why-sheet-backdrop-travel-rain-issuedTime-1` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `travel-rain` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `why-sheet-backdrop-weather-rain-issuedTime-2` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `weather-rain` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_buffer_minutes-description-3` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_buffer_minutes` | `description` | "5 min" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_buffer_minutes-provenance-4` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_buffer_minutes` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_duration_minutes-description-5` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_duration_minutes` | `description` | "20 min" | ✅ GROUNDED |
| `why-sheet-backdrop-prep_duration_minutes-provenance-6` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `prep_duration_minutes` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `why-sheet-backdrop-rain_transport_preference-description-7` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `rain_transport_preference` | `description` | "Prefers driving when it rains" | ✅ GROUNDED |
| `why-sheet-backdrop-rain_transport_preference-provenance-8` | rain | 390x844 | Why Provenance Sheet | `why-sheet-backdrop` | `rain_transport_preference` | `provenance` | "Demo profile · sample preference" | ✅ GROUNDED |
| `v2-insight-banner-weather-rain-rainBanner-0` | rain | 390x844 | After Late Shift Confirmed | `v2-insight-banner` | `weather-rain` | `rainBanner` | "What changed: rain forecast" | ✅ GROUNDED |
| `v2-insight-banner-weather:2026-10-28T20:35:00.000Z-issuedTime-1` | rain | 390x844 | After Late Shift Confirmed | `v2-insight-banner` | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | "1:35 PM" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutText-0` | rain | 390x844 | After Late Shift Confirmed | `v2-map-card` | `weather-rain` | `calloutText` | "Rain forecast · simulated" | ✅ GROUNDED |
| `v2-map-card-weather-rain-calloutSubtext-1` | rain | 390x844 | After Late Shift Confirmed | `v2-map-card` | `weather-rain` | `calloutSubtext` | "Issued 1:35 PM" | ✅ GROUNDED |
| `v2-map-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-2` | rain | 390x844 | After Late Shift Confirmed | `v2-map-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-0` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-1` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-prepareTime-2` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `prepareTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-leaveTime-3` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `leaveTime` | "2:45 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-drivePrepareTime-4` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `drivePrepareTime` | "2:25 PM" | ✅ GROUNDED |
| `now-card-prep_duration_minutes-prepText-5` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `prep_duration_minutes` | `prepText` | "20m prep" | ✅ GROUNDED |
| `now-card-user_override_timing-driveLeaveTime-6` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `driveLeaveTime` | "2:45 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-7` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `eta-drive-piano` | `travelMinutes` | "Drive · 25 min" | ✅ GROUNDED |
| `now-card-user_override_timing-driveArrivalTime-8` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `driveArrivalTime` | "3:10 PM" | ✅ GROUNDED |
| `now-card-user_override_timing-lateMinutes-9` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `lateMinutes` | "Late by 10m" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-apptTime-10` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | "3:00 PM" | ✅ GROUNDED |
| `now-card-calendar:2026-10-28T17:00:00.000Z-subjectTitle-11` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | "Piano lesson" | ✅ GROUNDED |
| `now-card-user_override_timing-driveLeaveTime-12` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `driveLeaveTime` | "2:45 PM" | ✅ GROUNDED |
| `now-card-eta-drive-piano-travelMinutes-13` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `eta-drive-piano` | `travelMinutes` | "25 min drive" | ✅ GROUNDED |
| `now-card-user_override_timing-lateMinutes-14` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `lateMinutes` | "late by 10m" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-15` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-user_override_timing-busLeaveTime-16` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `busLeaveTime` | "2:30 PM" | ✅ GROUNDED |
| `now-card-eta-bus-piano-travelMinutes-17` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `eta-bus-piano` | `travelMinutes` | "40 min bus" | ✅ GROUNDED |
| `now-card-user_override_timing-lateMinutes-18` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `user_override_timing` | `lateMinutes` | "late by 10m" | ✅ GROUNDED |
| `now-card-habit-rain-transport-rankingBasis-19` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `habit-rain-transport` | `rankingBasis` | "Ranked by habit: Rain travel habit (Demo profile · sample)" | ✅ GROUNDED |
| `now-card-rain_transport_preference-habitNote-20` | rain | 390x844 | After Late Shift Confirmed | `now-card` | `rain_transport_preference` | `habitNote` | "You usually prefer driving when it rains." | ✅ GROUNDED |

---

## 5. Architectural Invariant Compliance (Dynamically Computed)

1. **Non-Live Boundary**: 0 live GPS queries, 0 live Places API requests, 0 live network calls, 0 credentials.
2. **Frozen Baseline Manifests**:
   - `docs/evidence/v4/MANIFEST.sha256`: **VERIFIED_OK**
   - `docs/evidence/v5-fuel/MANIFEST.sha256`: **VERIFIED_OK**
   - `docs/evidence/v5-geo/MANIFEST.sha256`: **VERIFIED_OK**
   - `docs/evidence/v5-lunch/MANIFEST.sha256`: **VERIFIED_OK**
3. **Core Diff Boundary**: `git diff --stat f43c6c1d HEAD -- src/core` -> **0 files, 0 lines (clean)**
4. **Environment Gating**: Evidence capture runs only when `PRE_S1_RECORD=1`; standard Playwright test runs do not alter tracked evidence.
