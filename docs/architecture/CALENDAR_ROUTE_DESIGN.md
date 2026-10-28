# Calendar & Route Increment: Consent & Data-Flow Design

> **Document Status:** DESIGN ONLY — OWNER-GATED ARCHITECTURAL SPECIFICATION  
> **Governed by:** ADR-101, G-204, Acceptance Criteria AC-204-2, Invariants INV-101, INV-102, INV-103, INV-106, INV-107, INV-109, INV-110.  
> **Phase Ref:** PH-002 Slice D2 (Calendar/Route Consent & Data-Flow Design).

---

## ⚠️ Governance Notice: Owner Gate & Implementation Boundary

> [!IMPORTANT] OWNER GATE: DESIGN ONLY — ZERO REAL DATA IMPLEMENTATION
> - Under Slice **PH-002 D2 (AC-204-2)**, **NO CODE PATHS** that read real calendars or real routes or transmit device GPS coordinates are implemented.
> - No third-party OAuth applications have been registered; no external network requests for private user calendar data or transit routing are executed.
> - All calendar and routing signals in Yori remain **100% deterministic simulated mock fixtures** until the project owner (Han) explicitly authorizes live implementation and executes the owner decisions documented in Section 10.
> - This document serves as the formal architectural and security contract required before any future implementation slice (e.g. PH-003) may proceed.

---

## 1. Executive Summary & Design Scope

Yori's proactive intelligence relies on two critical context vectors:
1. **Calendar Signals (`calendar`):** To detect upcoming appointments within the active planning horizon (2–4 hours ahead) and compute when preparation and departure must occur.
2. **Transit & Route Signals (`travel_estimate`):** To compute deterministic leave times (`leave = appt - travel - buffer`) under current transit conditions.

Because calendar entries often contain sensitive personal appointments and routing requests reveal personal transit patterns, connecting real calendar and routing services introduces substantial privacy and security risks. 

This specification establishes:
- The candidate third-party providers with cited documentation, cost tiers, and licensing.
- Strict least-privilege permission scopes and field minimization filters.
- A transparent consent user experience (UX) with per-source opt-in and instant revocation.
- A comprehensive data-flow inventory defining custody, retention, and deletion.
- A seamless mapping onto the existing `ContextSignal` core interface (**0 lines changed in `src/core/**`**).
- A rigorous threat model ensuring zero client-side token exposure and zero browser geolocation tracking.

---

## 2. Candidate Provider Analysis

### 2.1 Calendar Provider Candidates

| Provider Candidate | Official Documentation & API Reference | Cost & Quota | Terms of Service & Privacy | Architectural Viability & Trade-offs |
| :--- | :--- | :--- | :--- | :--- |
| **Google Calendar API (v3)** | [Google Calendar API Reference](https://developers.google.com/calendar/api/v3/reference) (Accessed 2026-10-28) | Free tier: 1,000,000 queries/day; keyless development not supported (requires OAuth 2.0 Client ID) | [Google APIs ToS](https://developers.google.com/terms) & [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) (Limited Use compliance required) | **Primary Candidate for Web**: Standard OAuth 2.0 with PKCE supported via dev-server loopback proxy; requires verified app registration if opened beyond personal developer accounts. |
| **Apple EventKit / CalDAV (RFC 4791)** | [Apple EventKit Framework](https://developer.apple.com/documentation/eventkit) / [RFC 4791 CalDAV](https://datatracker.ietf.org/doc/html/rfc4791) | 0 USD; native OS service | Apple Developer Agreement; on-device privacy policy | **Primary Candidate for Native Wrappers**: Zero cloud network transmission; 100% on-device. Marked `UNVERIFIED` for web-browser sandbox because web browsers cannot access native EventKit without a local companion daemon. |
| **Microsoft Graph Calendar API** | [Microsoft Graph Calendar Docs](https://learn.microsoft.com/en-us/graph/api/resources/calendar) (Accessed 2026-10-28) | Free tier included with Microsoft 365 / Personal Microsoft Accounts; standard Graph throttling | [Microsoft APIs Terms of Use](https://learn.microsoft.com/en-us/legal/microsoft-apis/terms-of-use) | **Secondary Candidate for Enterprise/Outlook**: Standard OAuth 2.0 with Microsoft Entra ID; requires Azure App Registration. |
| **Webcal / iCal (.ics URL Feed)** | [RFC 5545 iCalendar Specification](https://datatracker.ietf.org/doc/html/rfc5545) | 0 USD; read-only HTTP GET | Governed by hosting provider of the ICS feed URL | **Lightweight Fallback Candidate**: Zero OAuth required; user provides secret calendar feed URL. However, exposes full calendar feed to local parser; must be stripped client-side. |

---

### 2.2 Route & Transit Provider Candidates

| Provider Candidate | Official Documentation & API Reference | Cost & Quota | Terms of Service & Privacy | Architectural Viability & Trade-offs |
| :--- | :--- | :--- | :--- | :--- |
| **Open Source Routing Machine (OSRM) / Valhalla** | [OSRM HTTP API Documentation](http://project-osrm.org/docs/v5.24.0/api/) (Accessed 2026-10-28) | 0 USD (Open-source, self-hostable); public demo server is free but rate-limited | [OSM Foundation Acceptable Use Policy](https://operations.osmfoundation.org/policies/api/); ODbL license attribution required | **Primary Candidate for Keyless/Free Routing**: Zero API key required for evaluation demo; can be self-hosted via Docker for unlimited private, local routing. |
| **OpenRouteService (ORS)** | [OpenRouteService API Docs](https://openrouteservice.org/dev/#/api-docs) (Accessed 2026-10-28) | Free tier: 2,000 directions requests/day, 40 requests/minute; requires free API key | Non-commercial evaluation under CC BY-SA 4.0; commercial use requires paid subscription | **Secondary Candidate**: Robust turn-by-turn and transit estimates, but requires key custody and non-commercial attribution. |
| **Google Maps Routes API (Directions)** | [Google Maps Routes API Reference](https://developers.google.com/maps/documentation/routes) (Accessed 2026-10-28) | Paid / Commercial billing: $5.00 per 1,000 requests after $200 monthly free tier | [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms); explicitly forbids caching duration estimates or displaying on non-Google base maps | **NOT Recommended for MVP**: Strict caching restrictions and commercial billing requirement violate Yori's zero-cost/fail-closed architecture. |

---

## 3. Least-Privilege Scopes & Field Minimization

### 3.1 OAuth Scope Matrix

| Service | Proposed Scope | Scope Justification | Prohibited Scopes (Forbidden) |
| :--- | :--- | :--- | :--- |
| **Google Calendar** | `https://www.googleapis.com/auth/calendar.events.readonly` | Read event titles, start/end times, and location for upcoming appointments only. | `calendar` (Full read/write), `calendar.events` (Write/Delete), `calendar.settings.readonly` |
| **Microsoft Graph** | `Calendars.Read` | Read user appointments for upcoming 12-hour window. | `Calendars.ReadWrite`, `Mail.Read`, `User.ReadWrite.All` |
| **Route Service** | No auth scopes; point-to-point duration query only (`origin_coords`, `dest_coords`) | Computes estimated travel duration in minutes. | Continuous location broadcasting, IP logging, device identifiers |

---

### 3.2 Strict Field Minimization (Ingress Boundary Filter)

Before any third-party calendar payload enters Yori's memory or context snapshot, an ingress adapter filter **must strip all non-essential fields**:

```
                       Incoming Third-Party Calendar Event
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             ▼                                                     ▼
      Retained Fields                                       Stripped Fields (Purged)
  ┌─────────────────────────────────┐                   ┌─────────────────────────────────┐
  │ • Start Time (ISO-8601)        │                   │ ✗ Attendee Names & Emails       │
  │ • End Time (ISO-8601)          │                   │ ✗ Event Description / Body Text │
  │ • Summary (Event Title)        │                   │ ✗ Video Conference Links (Meet) │
  │ • Location (Venue Name/Address)│                   │ ✗ Meeting Notes & Attachments   │
  └─────────────────────────────────┘                   │ ✗ Organizer Identity & Reminders│
                                                        └─────────────────────────────────┘
```

### 3.3 Temporal Query Horizon Bounding
- Real calendar queries are strictly bounded to the active planning window:
  $$\text{Query Range} = [\text{asOf}, \text{asOf} + 12\text{ hours}]$$
- Historical events ($< \text{asOf}$) are **never queried or stored**.
- Distant future events ($> 24\text{ hours}$) are ignored until their day arrives.

---

## 4. Consent UX & User Controls

### 4.1 Permission Presentation in `Me` View
Integration controls are presented in the `Me` tab under a dedicated **Connected Services** section:

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚙️ Connected Services (Real Context Providers)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 📅 Google Calendar                           [ Connect Calendar ]│
│    Syncs your upcoming appointments for today only.             │
│    Reads event titles, times, and destinations.                 │
│    Never reads attendee names, meeting notes, or emails.        │
│                                                                 │
│ 🗺️ Real Transit & Routes (OSRM)             [   Enable Routes  ]│
│    Estimates walking and driving durations to appointments.      │
│    Uses configured fixed anchors (Home / Downtown).              │
│    Never accesses your continuous device GPS location.          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Consent Disclosure Guarantees
1. **Explicit Opt-in:** Real calendar and route services are **OFF by default**. Enabling them requires an intentional user click.
2. **Per-Source Granularity:** A user may connect Calendar without enabling Routing, or vice versa.
3. **One-Click Revocation:** Clicking **"Disconnect Calendar"** immediately:
   - Deletes cached OAuth access and refresh tokens from dev-server memory.
   - Flushes all calendar events from in-memory context snapshots.
   - Clears any calendar-related plans from `NOW` and `AHEAD`.
   - Reverts the scene to the deterministic mock twin or honest quiet state.

---

## 5. Data-Flow Inventory & Lifecycle

```
[ User Browser ]                  [ Local Loopback Proxy ]              [ External Service ]
 (127.0.0.1:5173)                   (Dev-Server Node.js)             (Google API / OSRM)
        │                                    │                                    │
        │ 1. Click "Connect Calendar"        │                                    │
        │───────────────────────────────────>│                                    │
        │                                    │ 2. PKCE Authorization Flow         │
        │                                    │───────────────────────────────────>│
        │                                    │ 3. OAuth Token Exchange            │
        │                                    │<───────────────────────────────────│
        │                                    │ (Tokens stored in process memory)  │
        │                                    │                                    │
        │ 4. GET /api/calendar/upcoming      │                                    │
        │───────────────────────────────────>│ 5. Fetch events [now, now+12h]     │
        │                                    │───────────────────────────────────>│
        │                                    │ 6. Strip attendees, body, notes    │
        │ 7. Return minimized RealSignal[]   │<───────────────────────────────────│
        │<───────────────────────────────────│                                    │
        │ (Rendered into Living Context)     │                                    │
```

### Data Retention & Deletion Lifecycle:
- **Tokens:** Kept solely in dev-server process memory (or encrypted OS keychain). Never written to browser `localStorage`, `sessionStorage`, or cookies.
- **In-Flight Data:** Kept in memory only during the active browser session.
- **Storage Reset (INV-110):** Clicking "Reset All Data" in the `Me` tab purges all local storage and signals the proxy to revoke and delete all external provider credentials.

---

## 6. Signal Mapping onto Existing Core Contracts (INV-101, INV-102)

**Zero changes to `src/core/**` are required.** The existing core contracts in `src/core/contracts/` natively support real provider signals via the discriminated `source` union (`'real' | 'simulated'`):

### 6.1 Real Calendar Signal
```typescript
const realCalendarSignal: RealSignal<CalendarSignalValue> = createRealSignal({
  kind: 'calendar',
  value: {
    title: 'Executive Design Review',
    startTime: '2026-10-28T22:00:00.000Z', // 3:00 PM PDT
    endTime: '2026-10-28T23:00:00.000Z',   // 4:00 PM PDT
    location: '123 Harmony Way, San Francisco',
  },
  source: 'real',
  label: 'real',
  issuedAt: '2026-10-28T17:00:00.000Z',
  validFor: 3600000, // 1 hour validity
  confidence: 1.0,
  consentScope: 'local_only',
});
```

### 6.2 Real Route & Travel Signal
```typescript
const realTravelSignal: RealSignal<TravelSignalValue> = createRealSignal({
  kind: 'travel_estimate',
  value: {
    mode: 'drive',
    travelMinutes: 24,
    origin: 'Configured Home Anchor',
    destination: '123 Harmony Way, San Francisco',
    provider: 'osrm',
  },
  source: 'real',
  label: 'real',
  issuedAt: '2026-10-28T17:00:00.000Z',
  validFor: 1800000, // 30 minutes validity (traffic changes rapidly)
  confidence: 0.95,
  consentScope: 'local_only',
});
```

When evaluated by the pipeline preparers (`src/plugins/depart/preparer.ts`), these signals flow directly into the deterministic formulas (`leave = appt - travel - buffer`). In the Why sheet, `sig.source === 'real'` automatically renders the styled green `REAL` badge (`.badge-real`) without altering the derivation logic.

---

## 7. Fail-Closed Degradation & Fault Tolerance (INV-103, INV-106, D6)

| Fault Condition | Immediate Adapter Action | Resulting Pipeline Behavior | User Visible Output |
| :--- | :--- | :--- | :--- |
| **Provider Offline / Network Loss** | Catch error; return empty signal list `[]`. Never fabricate events or routes. | Missing signal policy evaluator triggers. | Calm notice: *"Your calendar isn't available right now, so I won't guess."* |
| **Token Expired / Refresh Failed** | Flag service as disconnected; return `[]`. | Missing signal notice; transition service status to "Disconnected". | Quiet state or missing notice; user prompted in `Me` tab to reconnect. |
| **Stale Signal (`now - issuedAt > validFor`)** | Emits signal with historical `issuedAt`. | Preparer discards expired signal (INV-106); policy marks signal stale. | Calm notice: *"Travel estimates are out of date, so recommendations may be limited."* |
| **Malformed JSON / Schema Mismatch** | Catch parse error; discard payload; return `[]`. | Fails closed; zero unhandled promise rejections. | Fails closed without crashing the UI. |

---

## 8. Threat Model & Security Safeguards

### 8.1 Threat Analysis
1. **Threat 1: Token Theft via Cross-Site Scripting (XSS)**
   - *Mitigation:* Tokens never enter browser JavaScript context. The loopback proxy holds tokens in Node.js server memory only. The browser makes local session calls to `/api/calendar/upcoming`.
2. **Threat 2: Cross-Site Request Forgery (CSRF) / Cross-Origin Hijacking**
   - *Mitigation:* Proxy enforces loopback host validation (`127.0.0.1` / `localhost` only), validates `Sec-Fetch-Site: same-origin`, and rejects untrusted external Referers.
3. **Threat 3: Continuous Location Surveillance**
   - *Mitigation:* The browser `navigator.geolocation` API is **strictly prohibited**. The routing engine operates solely on user-configured fixed anchors (e.g. Home, Office, Downtown) selected in settings.
4. **Threat 4: Private Notes / Email Leaks to LLM**
   - *Mitigation:* Ingress field minimization purges description bodies, attendee emails, and meeting notes before snapshot formation. The reasoning coordinator (`POST /api/model/reason`) receives only sanitized titles and computed times.

---

## 9. Verification & Architectural Invariant Gates

Under Slice D2, the repository enforces the following automated invariants:
- **Static Geolocation Gate (AC-204-2):** Static tests prove zero occurrences of `navigator.geolocation`, `getCurrentPosition`, or `watchPosition` across all source files in `src/`.
- **Zero Real Calendar/Route Code in `src/`:** Static test verifies that no third-party calendar or route API network clients exist in `src/` (only mock twins exist).
- **Core Diff Invariant:**
  ```bash
  git diff --stat f43c6c1d74c4bc1159300fed9d62aec9447b886e HEAD -- src/core
  # Must remain 100% EMPTY (0 files, 0 lines changed)
  ```

---

## 10. Explicit Owner Decisions Required Before Implementation

Before any engineer or agent writes code connecting live calendar or routing services, the project owner (**Han**) must resolve the following decision gates:

| # | Decision Item | Recommended Choice | Owner Action / Status |
| :-: | :--- | :--- | :--- |
| **OD-1** | **Calendar Provider Selection** | Google Calendar API (v3) via OAuth 2.0 PKCE | `[OWNER TO DECIDE]`: Choose Google, Microsoft, or Local Webcal. |
| **OD-2** | **Google Cloud Project Registration** | Self-registered Google Cloud Console project | `[OWNER TO DECIDE]`: Create OAuth Client ID (Desktop/Web) and configure redirect URI. |
| **OD-3** | **Route Provider Selection** | Open Source Routing Machine (OSRM) keyless | `[OWNER TO DECIDE]`: Choose OSRM public demo server (free) or ORS API key. |
| **OD-4** | **Location Anchor Strategy** | User-configured static anchors (Home / Work) | `[OWNER TO DECIDE]`: Approve static anchors vs manual city zone selection (Continuous GPS remains rejected). |
| **OD-5** | **Implementation Release Gate** | Keep disabled for PH-002; release in PH-003 | `[OWNER TO DECIDE]`: Confirm that PH-002 ships with design only and simulated calendar/route data. |
