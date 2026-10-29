# Automated Grounding Evidence Audit Report (YORI_V2 Task V4)

**Audit Date**: 2026-10-29T03:07:53.088Z  
**Scope**: Yori Living Context V2 Chapter Closeout (Condition C5, G12-CORE, V4 Acceptance 4)  
**Pass Bar**: **0 ungrounded items**  
**Audit Verdict**: ✅ PASS (0 ungrounded items)

---

## 1. Executive Summary

This report documents the automated grounding evidence audit performed over every place, number, and time rendered across the two end-to-end screen recordings (**Rain** and **Lunch**) at dual viewports (Mobile 390×844 and Desktop 1280×800).

Every extracted token was checked via `GroundedRecommendationVerifier.verifyField` against authentic session `EvidenceBundle` instances constructed directly from scenario fixture adapters and user command overrides.

| Category | Total Tokens | Grounded | Ungrounded | Resolution Rate | Status |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Places / Venues** | 106 | 106 | 0 | 100.0% | ✅ PASS |
| **Times & Clocks** | 126 | 126 | 0 | 100.0% | ✅ PASS |
| **Numbers & Margins** | 136 | 136 | 0 | 100.0% | ✅ PASS |
| **Overall Total** | **368** | **368** | **0** | **100.0%** | **✅ PASS** |

---

## 2. Adversarial Negative Self-Test Verification

To ensure that the audit harness is not merely performing existence checks or falling back to permissive defaults, the audit script executes an adversarial negative test suite prior to analyzing recording dumps. Fabricated times, durations, distances, and invented venue names were injected into the verification pipeline:

- ✅ PROBE REJECTED (correctly failed): Injected Rain Time (4:47 PM) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed): Injected Rain Duration (99 min) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed): Injected Rain Distance (63m away) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed): Injected Lunch Time (11:59 PM) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed): Invented Venue (Ramen Kobo) -> reason=missing_ref
- ✅ PROBE REJECTED (correctly failed): Invented Venue (Green Garden) -> reason=missing_ref
- ✅ TAMPERED APP_TIME PROBE REJECTED: correctly detected tampered_value on cal-piano.apptTime

**Self-Test Result**: ✅ 100% of fabricated probes correctly rejected

---

## 3. Grounding Resolution Ledger

Below is the complete resolution ledger for all audited tokens:

| Token | Type | Scene | Step | Viewport | Record ID | Field | Provenance | Status |
|:---|:---:|:---:|:---|:---:|:---|:---|:---:|:---:|
| `3:00 PM` | time | rain | Initial Clear State | 390x844 | `cal-piano` | `apptTime` | simulated | ✅ GROUNDED |
| `2:05 PM` | time | rain | Initial Clear State | 390x844 | `cal-piano` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Initial Clear State | 390x844 | `cal-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Initial Clear State | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Initial Clear State | 390x844 | `eta-drive-piano` | `prepMinutes` | simulated | ✅ GROUNDED |
| `5m buffer` | number | rain | Initial Clear State | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `30 min` | number | rain | Initial Clear State | 390x844 | `eta-drive-piano` | `travelMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Initial Clear State | 390x844 | `cal-piano` | `subjectTitle` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Initial Clear State | 390x844 | `cal-piano` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Change (Weather Shift) | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Change (Weather Shift) | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Change (Weather Shift) | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Change (Weather Shift) | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Change (Weather Shift) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Change (Weather Shift) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Change (Weather Shift) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Change (Weather Shift) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Change (Weather Shift) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Route Options (Drive vs Bus) | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Route Options (Drive vs Bus) | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Route Options (Drive vs Bus) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Route Options (Drive vs Bus) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Route Options (Drive vs Bus) | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Route Options (Drive vs Bus) | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Route Options (Drive vs Bus) | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Map & Why Provenance | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Map & Why Provenance | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Map & Why Provenance | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `10:00 AM` | time | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `recordedAt` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Map & Why Provenance | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Map & Why Provenance | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Map & Why Provenance | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Map & Why Provenance | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Map & Why Provenance | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `5 min` | number | rain | Map & Why Provenance | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `20 min` | number | rain | Map & Why Provenance | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `Piano lesson` | place | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Map & Why Provenance | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Ask Yori: Leave Later Query | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Ask Yori: Leave Later Query | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Ask Yori: Leave Later Query | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Ask Yori: Leave Later Query | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Ask Yori: Leave Later Query | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Ask Yori: Leave Later Query | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Ask Yori: Leave Later Query | 390x844 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Ask Yori: Leave Later Query | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Compare Late Arrival | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Compare Late Arrival | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Compare Late Arrival | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Compare Late Arrival | 390x844 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Compare Late Arrival | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Compare Late Arrival | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Compare Late Arrival | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Compare Late Arrival | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Compare Late Arrival | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Compare Late Arrival | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Compare Late Arrival | 390x844 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Compare Late Arrival | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm Shift | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Confirm Shift | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Confirm Shift | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Confirm Shift | 390x844 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Confirm Shift | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Confirm Shift | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Confirm Shift | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Confirm Shift | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Confirm Shift | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Confirm Shift | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Confirm Shift | 390x844 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Confirm Shift | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Collapse to Updated Home | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Collapse to Updated Home | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `3:10 PM` | time | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `arrivalTime` | session | ✅ GROUNDED |
| `2:30 PM` | time | rain | Collapse to Updated Home | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Collapse to Updated Home | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `25 min` | number | rain | Collapse to Updated Home | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `Late by 10m` | number | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `marginMinutes` | session | ✅ GROUNDED |
| `late by 10m` | number | rain | Collapse to Updated Home | 390x844 | `user_override_timing` | `marginMinutes` | session | ✅ GROUNDED |
| `40 min` | number | rain | Collapse to Updated Home | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Collapse to Updated Home | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Collapse to Updated Home | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Undo Override | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Undo Override | 390x844 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Undo Override | 390x844 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Undo Override | 390x844 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Undo Override | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Undo Override | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Undo Override | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Undo Override | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Undo Override | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm-Only Memory & Sovereignty | 390x844 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `0 of 3` | number | rain | Confirm-Only Memory & Sovereignty | 390x844 | `prompt_budget` | `usage` | confirmed | ✅ GROUNDED |
| `25 min` | number | rain | Confirm-Only Memory & Sovereignty | 390x844 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `10 min` | number | rain | Confirm-Only Memory & Sovereignty | 390x844 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Confirm-Only Memory & Sovereignty | 390x844 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Initial Clear State | 1280x800 | `cal-piano` | `apptTime` | simulated | ✅ GROUNDED |
| `2:05 PM` | time | rain | Initial Clear State | 1280x800 | `cal-piano` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Initial Clear State | 1280x800 | `cal-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Initial Clear State | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Initial Clear State | 1280x800 | `eta-drive-piano` | `prepMinutes` | simulated | ✅ GROUNDED |
| `5m buffer` | number | rain | Initial Clear State | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `30 min` | number | rain | Initial Clear State | 1280x800 | `eta-drive-piano` | `travelMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Initial Clear State | 1280x800 | `cal-piano` | `subjectTitle` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Initial Clear State | 1280x800 | `cal-piano` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Change (Weather Shift) | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Change (Weather Shift) | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Change (Weather Shift) | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Change (Weather Shift) | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Change (Weather Shift) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Change (Weather Shift) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Change (Weather Shift) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Change (Weather Shift) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Change (Weather Shift) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Route Options (Drive vs Bus) | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Route Options (Drive vs Bus) | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Route Options (Drive vs Bus) | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Map & Why Provenance | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Map & Why Provenance | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Map & Why Provenance | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `10:00 AM` | time | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `recordedAt` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Map & Why Provenance | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Map & Why Provenance | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Map & Why Provenance | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Map & Why Provenance | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Map & Why Provenance | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `5 min` | number | rain | Map & Why Provenance | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `20 min` | number | rain | Map & Why Provenance | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `Piano lesson` | place | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Map & Why Provenance | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Ask Yori: Leave Later Query | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Ask Yori: Leave Later Query | 1280x800 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Ask Yori: Leave Later Query | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Compare Late Arrival | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Compare Late Arrival | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Compare Late Arrival | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Compare Late Arrival | 1280x800 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Compare Late Arrival | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Compare Late Arrival | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Compare Late Arrival | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Compare Late Arrival | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Compare Late Arrival | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Compare Late Arrival | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Compare Late Arrival | 1280x800 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Compare Late Arrival | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm Shift | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Confirm Shift | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Confirm Shift | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Confirm Shift | 1280x800 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Confirm Shift | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `20m prep` | number | rain | Confirm Shift | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Confirm Shift | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Confirm Shift | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Confirm Shift | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Confirm Shift | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `15 minutes` | number | rain | Confirm Shift | 1280x800 | `user_override_timing` | `deltaMinutes` | session | ✅ GROUNDED |
| `Piano lesson` | place | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Confirm Shift | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Collapse to Updated Home | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Collapse to Updated Home | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:25 PM` | time | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `prepareTime` | session | ✅ GROUNDED |
| `2:45 PM` | time | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `leaveTime` | session | ✅ GROUNDED |
| `3:10 PM` | time | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `arrivalTime` | session | ✅ GROUNDED |
| `2:30 PM` | time | rain | Collapse to Updated Home | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Collapse to Updated Home | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `25 min` | number | rain | Collapse to Updated Home | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `Late by 10m` | number | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `marginMinutes` | session | ✅ GROUNDED |
| `late by 10m` | number | rain | Collapse to Updated Home | 1280x800 | `user_override_timing` | `marginMinutes` | session | ✅ GROUNDED |
| `40 min` | number | rain | Collapse to Updated Home | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Collapse to Updated Home | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Collapse to Updated Home | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Undo Override | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `3:00 PM` | time | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `apptTime` | simulated | ✅ GROUNDED |
| `2:10 PM` | time | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `prepareTime` | simulated | ✅ GROUNDED |
| `2:30 PM` | time | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `leaveTime` | simulated | ✅ GROUNDED |
| `2:55 PM` | time | rain | Undo Override | 1280x800 | `eta-drive-piano` | `arrivalTime` | simulated | ✅ GROUNDED |
| `2:15 PM` | time | rain | Undo Override | 1280x800 | `eta-bus-piano` | `leaveTime` | simulated | ✅ GROUNDED |
| `20m prep` | number | rain | Undo Override | 1280x800 | `rain_transport_preference` | `prepMinutes` | sample | ✅ GROUNDED |
| `5m buffer` | number | rain | Undo Override | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `25 min` | number | rain | Undo Override | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `5m margin` | number | rain | Undo Override | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `40 min` | number | rain | Undo Override | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `busMinutes` | simulated | ✅ GROUNDED |
| `Piano lesson` | place | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `title` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Undo Override | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `1:35 PM` | time | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `weather:2026-10-28T20:35:00.000Z` | `issuedTime` | simulated | ✅ GROUNDED |
| `0 of 3` | number | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `prompt_budget` | `usage` | confirmed | ✅ GROUNDED |
| `25 min` | number | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `travel_estimate:2026-10-28T20:35:00.000Z` | `driveMinutes` | simulated | ✅ GROUNDED |
| `10 min` | number | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `eta-drive-piano` | `bufferMinutes` | simulated | ✅ GROUNDED |
| `Home` | place | rain | Confirm-Only Memory & Sovereignty | 1280x800 | `calendar:2026-10-28T17:00:00.000Z` | `origin` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Proactive Lunch Card | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Candidates & Detail View | 390x844 | `schedule_window` | `windowStart` | simulated | ✅ GROUNDED |
| `1:30 PM` | time | away-lunch | Candidates & Detail View | 390x844 | `schedule_window` | `freeUntil` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Candidates & Detail View | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Candidates & Detail View | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
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
| `Demo Place B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Inspect Why Citation | 390x844 | `schedule_window` | `windowStart` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Inspect Why Citation | 390x844 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Inspect Why Citation | 390x844 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Inspect Why Citation | 390x844 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Inspect Why Citation | 390x844 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `0 of 3` | number | away-lunch | Quiet State & Sovereignty | 390x844 | `prompt_budget` | `usage` | confirmed | ✅ GROUNDED |
| `5m away` | number | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Proactive Lunch Card | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Candidates & Detail View | 1280x800 | `schedule_window` | `windowStart` | simulated | ✅ GROUNDED |
| `1:30 PM` | time | away-lunch | Candidates & Detail View | 1280x800 | `schedule_window` | `freeUntil` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Candidates & Detail View | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Candidates & Detail View | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
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
| `Demo Place B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Re-ranked Candidates on Home | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `12:10 PM` | time | away-lunch | Inspect Why Citation | 1280x800 | `schedule_window` | `windowStart` | simulated | ✅ GROUNDED |
| `7m away` | number | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-2` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `10m away` | number | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-3` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `5m away` | number | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-1` | `distanceMinutes` | simulated | ✅ GROUNDED |
| `Demo Place B · Salad` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `Demo Place C · Sushi` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `Demo Place A · Ramen` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `A · Ramen` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-1` | `name` | simulated | ✅ GROUNDED |
| `B · Salad` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-2` | `name` | simulated | ✅ GROUNDED |
| `C · Sushi` | place | away-lunch | Inspect Why Citation | 1280x800 | `mock-place-3` | `name` | simulated | ✅ GROUNDED |
| `0 of 3` | number | away-lunch | Quiet State & Sovereignty | 1280x800 | `prompt_budget` | `usage` | confirmed | ✅ GROUNDED |

---

## 4. Architectural Boundary Enforcement

1. **Zero Core Diff**: All audit logic, verifier execution, and tokenization logic reside in `scripts/` and `src/ui/`. `src/core/` diff vs `f43c6c1d` remains strictly 100% empty.
2. **Freshness Windows**: All records validated against scene clock (`asOfIso`), never machine wall clock.
3. **No Circular Evidence**: Bundle records constructed exclusively from scenario adapters and explicit request overrides; no strings derived from unverified plan outputs.
