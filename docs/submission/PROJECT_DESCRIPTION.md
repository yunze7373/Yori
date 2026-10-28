# Yori (ヨリ) — Project Description

> **Submission for the Meta Global AI Developer Hackathon**  
> **Theme:** Build for Your World  
> **Track:** Startup Track [OWNER TO CONFIRM]  
> **Governed by Plan:** `yori_ph002_001` (Slice PH-002 E2, AC-205-2)  
> **Author:** DevFlow Resident Project Executor AI  

---

## 1. Executive Summary

**Yori** is a calm, proactive, context-aware AI assistant designed to help people plan ahead and act at the right moment without cognitive overload.

Unlike traditional AI assistants that either wait passively for prompts or flood users with disruptive notifications, Yori continually analyzes calendar commitments, ambient weather, transit conditions, and confirmed personal memories to generate a unified, calm **Living Context**. 

At any moment, Yori surfaces **at most one NOW Card** (what needs your attention right now), a prioritized list of **AHEAD Cards** (what is coming up), or an honest **Quiet State** (*"Nothing needs your attention right now"*).

---

## 2. Problem Statement

Modern smartphone and computer users suffer from two compounding assistant paradigms:
1. **The Chatbot Dilemma (Passive)**: Users must remember to ask, type out prompts, and formulate queries. In busy daily routines (running errands, catching trains, managing departures), typing prompts introduces friction.
2. **The Notification Trap (Noisy & Interruptive)**: Existing proactive assistants spam users with uncoordinated, unexplainable notifications, often hallucinating recommendations or assuming unwanted preferences without verification.

Users need an assistant that is:
- **Calm & Non-Intrusive**: Surfaces exactly what matters when it matters, and stays silent when nothing is needed.
- **Explainable**: Clear plain-language derivations for every recommendation (no "black-box" magic).
- **Privacy-Centric**: Respectful of user sovereignty; personal preferences must never be modified without explicit confirmation.

---

## 3. What Yori Does

### 1. Living Context Engine
Yori synthesizes structured context into an intuitive, glanceable card layout:
- **NOW Card**: Clear time windows (e.g. *"Get ready at 2:05 PM, leave by 2:25 PM"*) calculated from appointments, transit estimates, and personal preparation buffers.
- **Contextual Anticipation**: Adapts automatically to changing conditions (e.g. adding an **Umbrella** checklist chip and promoting driving over transit when rain is forecast).
- **Proactive Budgeting**: Daily proactive prompts are strictly capped (default: 3 per day) to preserve peace of mind.

### 2. Explainable Review Loop
Every recommendation is fully transparent:
- **Why Sheet**: Tap **Why** to inspect plain-language rationale (e.g. *"You usually prefer driving when it rains."*), citing scenario evidence signals alongside clearly labelled demo-profile and user-confirmed habits.
- **Adjust Dialog**: Adjust buffer times for *"This time only"* or choose *"Remember as preference"* to create a proposal.
- **Dismissals**: Dismissing a card silences it for the day and creates an explainable preference proposal.

### 3. User Sovereignty & The Me Tab
- **Confirm-Only Memory (INV-107)**: Invariant enforced both client-side and server-side: observations stay as pending proposals until the user explicitly taps **Confirm**. Rejected items remain archived for audit and are never re-applied.
- **Storage Sovereignty**: Users can export raw JSON data or perform a 2-step verified storage reset at any time.

---

## 4. Technical Architecture

Yori is built as a static TypeScript Single Page Application backed by a modular, layered architecture:

```
┌────────────────────────────────────────────────────────┐
│               Living Context Presentation              │
│       (Mobile 390×844 & Desktop 1280×800 UI)          │
└───────────────────────────┬────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│                    Living Composer                     │
│    (Deterministic Candidate Assembly & Ranking)        │
└───────┬───────────────────┬───────────────────┬────────┘
        │                   │                   │
┌───────▼───────┐   ┌───────▼───────┐   ┌───────▼────────┐
│ Depart Plugin │   │  Lunch Plugin │   │  Grocery Stub  │
│   (Transit)   │   │   (Dining)    │   │ (AC-EXT-1 Ext) │
└───────┬───────┘   └───────┬───────┘   └───────┬────────┘
        │                   │                   │
┌───────▼───────────────────▼───────────────────▼────────┐
│             Shared Policy Engine (Core)                │
│    (Prompt Budget, Cooldowns, Suppression Rules)       │
└───────┬───────────────────────────────────────┬────────┘
        │                                       │
┌───────▼───────────────────────┐       ┌───────▼────────┐
│       ModelPort Adapter       │       │   MemoryPort   │
│   (Meta Muse Spark Proxy)     │       │ (XMemo Adapter)│
└───────────────────────────────┘       └────────────────┘
```

1. **Pure Domain Core (`src/core/`)**:
   - Zero framework dependencies, zero network imports, and zero ambient system clocks (`Date.now()`).
   - All state derives from injected frozen snapshots, enabling 100% deterministic replay and testing.
   - **Zero-Core-Diff Invariant (AC-EXT-1)**: Core domain contracts remain untouched even when adding new capabilities.
2. **Shared Policy (`src/core/policy/`)**:
   - Enforces business rules: budget caps, suppressed intents, and candidate qualification.
3. **Degradable Extension Ports**:
   - **`ModelPort` (Meta Muse Spark 1.3)**: Constrained wording refinement and candidate ranking. All outputs pass through strict factual hallucination checkers.
   - **`MemoryPort` (XMemo Integration)**: Server-side OAuth 2.0 PKCE + MCP data surface (`https://xmemo.dev/mcp`) with minimal scopes (`memory:read`, `memory:write`). Confirmed facts sync only on user confirmation.

---

## 5. Safety, Privacy, & Anti-Relay Safeguards

Yori treats user privacy and credential security as non-negotiable architectural constraints:

- **Loopback Dev-Server Proxy (`127.0.0.1:5173`)**:
  - Dev server proxy strictly binds to loopback; LAN, Tailscale, and external interfaces are rejected with HTTP 403 Forbidden.
  - Cross-origin (`Origin`) and cross-site (`Sec-Fetch-Site: cross-site`) requests are blocked with HTTP 403.
  - Payloads are capped at 8 KB (HTTP 413) with per-minute rate limiting (HTTP 429).
- **Zero Credentials in Browser**:
  - API keys (`MODEL_API_KEY`) and OAuth access tokens are held strictly in server-side process memory.
  - Zero tokens or secret credentials exist in browser storage (`localStorage`, `sessionStorage`, cookies), client bundles (`dist/`), or git history.
- **Factual Hallucination Guard**:
  - Muse Spark reasoning outputs must cite valid available signal IDs and confirmed fact keys.
  - Phrasing outputs are checked for factual token leakage: any unlisted time or place token causes the entire output to be safely discarded for the deterministic template.
- **Confirm-Only Memory (INV-107, AC-106-3)**:
  - Both client-side adapter and server-side dev proxy strictly enforce that only facts with `status === 'confirmed'` can be written to long-term memory or synced to remote vaults. Any pending or unconfirmed write is rejected with HTTP 400.

---

## 6. What is Real vs What is Simulated (INV-102)

To ensure honesty and transparent demonstration:
- **Simulated Fixtures**:
  - Calendar appointments, weather sensor readings, location coordinates, transit routes, and dining venue names are mock fixtures.
  - Every card displays an explicit **Demo · simulated context** chip and **SIMULATED** badge.
  - No real device GPS coordinates are accessed or transmitted.
- **Real Capabilities**:
  - Real living context pipeline execution, candidate ranking, and shared policy enforcement.
  - Real browser storage persistence with versioned envelopes and recovery workflows.
  - Real server-side dev proxies for Meta Muse Spark and XMemo OAuth 2.0 PKCE / MCP.
  - Real Playwright E2E verification across mobile (390×844) and desktop (1280×800) viewports.

---

## 7. Model & Integration Details

- **Event**: Meta Global AI Developer Hackathon
- **Theme**: Build for Your World
- **Track**: Startup Track [OWNER TO CONFIRM]
- **AI Model**: Meta Muse Spark 1.3 (`muse-spark-1.3`) via `https://api.meta.ai/v1` [OWNER TO CONFIRM]
- **Memory Infrastructure**: XMemo Cloud Memory via OAuth 2.0 PKCE (`https://xmemo.dev`) and MCP (`https://xmemo.dev/mcp`)
- **Default State**: Both integrations are **OFF by default**; Yori runs 100% deterministically and offline without requiring external API keys.

---

## 8. North Star Roadmap & Next Steps

1. **Phase 3 (Physical Integration)**:
   - Real system calendar provider integration via native Web Calendar APIs.
   - Real-time weather provider integration (e.g. Open-Meteo or Apple WeatherKit).
   - Real geofencing and travel duration queries via OpenStreetMap / Valhalla routing engine.
2. **Phase 4 (Multi-Surface Experience)**:
   - Operating system push notifications and Apple Watch / WearOS glanceable complications.
   - Live end-user OAuth consent flow for XMemo multi-device synchronization.
   - Voice audio readout using localized speech synthesis.
