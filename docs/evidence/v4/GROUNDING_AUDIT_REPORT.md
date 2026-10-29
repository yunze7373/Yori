# Automated Grounding Evidence Audit Report (YORI_V2 Task V4)

**Audit Date**: 2026-10-29  
**Scope**: Yori Living Context V2 Chapter Closeout (Condition C5, G12-CORE, V4 Acceptance 4)  
**Pass Bar**: **0 ungrounded items**  
**Audit Verdict**: ✅ PASS (0 ungrounded domain items)

---

## 1. Executive Summary

This report documents the automated grounding evidence audit performed over every place, number, and time rendered across the two end-to-end screen recordings (**Rain** and **Lunch**) at dual viewports (Mobile 390×844 and Desktop 1280×800).

Every extracted token was checked via `GroundedRecommendationVerifier.verifyField` against authentic session `EvidenceBundle` instances constructed directly from scenario fixture adapters (`d2Scenario` and `d3Scenario`) and user command overrides.

| Category | Total Tokens | Grounded | Ungrounded | Resolution Rate | Status |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Places / Venues** | 84 | 84 | 0 | 100.0% | ✅ PASS |
| **Times & Clocks** | 98 | 98 | 0 | 100.0% | ✅ PASS |
| **Numbers & Margins** | 130 | 130 | 0 | 100.0% | ✅ PASS |
| **Overall Total** | **312** | **312** | **0** | **100.0%** | **✅ PASS** |

---

## 2. Adversarial Negative Self-Test Verification

To ensure that the audit harness does not merely perform existence checks or fall back to permissive defaults, the audit script executes an adversarial negative test suite prior to analyzing recording dumps. Fabricated times, durations, distances, and invented venue names were injected via full sentences into the verification pipeline:

- ✅ PROBE REJECTED (correctly failed closed): Invented Venue (Blue Fern Café) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Invented Venue (Sakura Tei) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Invented Venue (Osteria Nove) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Fabricated Walk Duration (3 min) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Fabricated Departure Time (4:47 PM) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Fabricated Duration (99 min) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Fabricated Distance (63m away) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Fabricated Lunch Time (11:59 PM) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed closed): Fabricated Candidate (Demo Place D · Pizza) -> reason=missing_ref
- ✅ TAMPERED APP_TIME PROBE REJECTED: correctly detected tampered_value on calendar:2026-10-28T17:00:00.000Z.apptTime

**Self-Test Result**: ✅ 100% of fabricated probes correctly rejected

---

## 3. Explicit UI Chrome & Out-of-Scope Allowlist

Per V4 acceptance criteria, UI chrome, quota tracking meters, and initial baseline schedule tokens rendered prior to sudden scenario shifts are categorized under an explicit allowlist with full architectural justification:

| Token | Classification | Documented Rationale |
|:---|:---|:---|
| `2:05 PM` | UI Chrome / Initial Schedule | Initial Clear plan preparation time (D1 dry schedule before rain forecast signal arrives at 1:35 PM) |
| `2:25 PM` | UI Chrome / Initial Schedule | Initial Clear plan departure time (D1 dry schedule before rain forecast signal arrives at 1:35 PM) |
| `2:55 PM` | UI Chrome / Initial Schedule | Initial Clear plan arrival time (D1 dry schedule before rain forecast signal arrives at 1:35 PM) |
| `30 min` | UI Chrome / Initial Schedule | Initial Clear plan travel duration (D1 baseline drive time before rain delay) |
| `Home` | UI Chrome / Initial Schedule | Route map schematic origin label and bottom navigation tab (UI chrome / navigation) |
| `0 of 3` | UI Chrome / Initial Schedule | Proactive Prompts quota meter under INV-107 / policy controls, not a domain record |

---

## 4. Grounding Resolution Ledger

Below is the complete resolution ledger for all audited domain tokens:

| Token | Type | Scene | Step | Viewport | Record ID | Field | Provenance | Status |
|:---|:---:|:---:|:---|:---:|:---|:---|:---:|:---:|
| `3:00 PM` | time | rain | Initial Clear State | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Initial Clear State | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Initial Clear State | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Initial Clear State | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Change (Weather Shift) | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Change (Weather Shift) | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Change (Weather Shift) | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Change (Weather Shift) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Change (Weather Shift) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Change (Weather Shift) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Change (Weather Shift) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Route Options (Drive vs Bus) | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Route Options (Drive vs Bus) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Route Options (Drive vs Bus) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Route Options (Drive vs Bus) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Route Options (Drive vs Bus) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Map & Why Provenance | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Map & Why Provenance | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `10:00 AM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `fetchedAt` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Map & Why Provenance | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Map & Why Provenance | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Map & Why Provenance | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Map & Why Provenance | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Map & Why Provenance | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `5 min` | number | rain | Map & Why Provenance | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `20 min` | number | rain | Map & Why Provenance | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `Piano lesson` | place | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Ask Yori: Leave Later Query | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Ask Yori: Leave Later Query | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Ask Yori: Leave Later Query | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Ask Yori: Leave Later Query | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Ask Yori: Leave Later Query | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Ask Yori: Leave Later Query | 390x844 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Compare Late Arrival | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Compare Late Arrival | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Compare Late Arrival | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Compare Late Arrival | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Compare Late Arrival | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Compare Late Arrival | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Compare Late Arrival | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Compare Late Arrival | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Compare Late Arrival | 390x844 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm Shift | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Confirm Shift | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Confirm Shift | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Confirm Shift | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Confirm Shift | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Confirm Shift | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Confirm Shift | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Confirm Shift | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Confirm Shift | 390x844 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Collapse to Updated Home | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Collapse to Updated Home | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `3:10 PM` | time | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `arrivalTime` | session | ✅ GROUNDED |
| `2:30 PM` | time | rain | Collapse to Updated Home | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Collapse to Updated Home | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `25 min` | number | rain | Collapse to Updated Home | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `Late by 10m` | number | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `lateMinutes` | session | ✅ GROUNDED |
| `late by 10m` | number | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `lateMinutes` | session | ✅ GROUNDED |
| `40 min` | number | rain | Collapse to Updated Home | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Collapse to Updated Home | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Undo Override | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Undo Override | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Undo Override | 390x844 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Undo Override | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Undo Override | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Undo Override | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Undo Override | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm-Only Memory & Sovereignty | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Confirm-Only Memory & Sovereignty | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `10 min` | number | rain | Confirm-Only Memory & Sovereignty | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Initial Clear State | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Initial Clear State | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Initial Clear State | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Initial Clear State | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Change (Weather Shift) | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Change (Weather Shift) | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Change (Weather Shift) | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Change (Weather Shift) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Change (Weather Shift) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Change (Weather Shift) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Change (Weather Shift) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Map & Why Provenance | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Map & Why Provenance | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `10:00 AM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `fetchedAt` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Map & Why Provenance | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Map & Why Provenance | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Map & Why Provenance | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Map & Why Provenance | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Map & Why Provenance | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `5 min` | number | rain | Map & Why Provenance | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `20 min` | number | rain | Map & Why Provenance | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `Piano lesson` | place | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Compare Late Arrival | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Compare Late Arrival | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Compare Late Arrival | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Compare Late Arrival | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Compare Late Arrival | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Compare Late Arrival | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Compare Late Arrival | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Compare Late Arrival | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Compare Late Arrival | 1280x800 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm Shift | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Confirm Shift | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Confirm Shift | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Confirm Shift | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Confirm Shift | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Confirm Shift | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Confirm Shift | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Confirm Shift | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Confirm Shift | 1280x800 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Collapse to Updated Home | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Collapse to Updated Home | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:45 PM` | time | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `3:10 PM` | time | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `arrivalTime` | session | ✅ GROUNDED |
| `2:30 PM` | time | rain | Collapse to Updated Home | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Collapse to Updated Home | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `25 min` | number | rain | Collapse to Updated Home | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `Late by 10m` | number | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `lateMinutes` | session | ✅ GROUNDED |
| `late by 10m` | number | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `lateMinutes` | session | ✅ GROUNDED |
| `40 min` | number | rain | Collapse to Updated Home | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Collapse to Updated Home | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Undo Override | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Undo Override | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Undo Override | 1280x800 | `prep_buffer_minutes` | `prepMinutes` | confirmed | ✅ GROUNDED |
| `5m buffer` | number | rain | Undo Override | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Undo Override | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Undo Override | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Undo Override | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `subjectTitle` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `10 min` | number | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Candidates & Detail View | 390x844 | `mock-place-1` | `fetchedAt` | simulated | ✅ GROUNDED |
| `1:30 PM` | time | away-lunch | Candidates & Detail View | 390x844 | `schedule_window` | `freeUntil` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Candidates & Detail View | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Candidates & Detail View | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Candidates & Detail View | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Candidates & Detail View | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Ask Yori: Preference Re-rank | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Inspect Why Citation | 390x844 | `mock-place-1` | `fetchedAt` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Inspect Why Citation | 390x844 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Inspect Why Citation | 390x844 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Inspect Why Citation | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Candidates & Detail View | 1280x800 | `mock-place-1` | `fetchedAt` | simulated | ✅ GROUNDED |
| `1:30 PM` | time | away-lunch | Candidates & Detail View | 1280x800 | `schedule_window` | `freeUntil` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Candidates & Detail View | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Candidates & Detail View | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Candidates & Detail View | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Candidates & Detail View | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Ask Yori & Scene-Aware Greeting | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Ask Yori: Preference Re-rank | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-1` | `fetchedAt` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |

---

## 5. Architectural Boundary Enforcement

1. **Zero Core Diff**: All audit logic, verifier execution, and tokenization logic reside exclusively under `scripts/` and `src/ui/`. `src/core/` diff vs `f43c6c1d` remains strictly 100% empty (0 files, 0 lines).
2. **Authentic Evidence Bundles**: Bundles are constructed directly from authentic scenario timeline snapshots (`d2Scenario`, `d3Scenario`) without artificial fallback records or synthetic mock fields in product code.
3. **Freshness Windows**: All records validated against scene clock (`asOfIso`), never machine wall clock.
4. **No Circular Evidence**: Bundle records constructed exclusively from scenario adapters and explicit request overrides; no strings derived from unverified plan outputs.
