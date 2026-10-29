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

## 7. Model & Integration Status (Honest Readiness Disclosure)

Every integration's live/off status is stated truthfully exactly as classified in [`docs/architecture/SUBMISSION_READINESS.md`](../architecture/SUBMISSION_READINESS.md):

| Integration | Classification | Status & Enforcement |
|---|---|---|
| **Core Living Context Pipeline** | `DONE + LOCAL-TESTED` | Fully operable locally on loopback (`127.0.0.1:5173`). 540 unit tests, 18 golden acceptance fixtures, 56 degradation drills, 192 Playwright E2E tests from the PRE-S1 chapter closeout verification run ([`docs/evidence/pre-s1/CLOSEOUT_PRE_S1.md`](../evidence/pre-s1/CLOSEOUT_PRE_S1.md) @ `6d2da2d` / `9007ccc`), zero core diff vs baseline anchor `f43c6c1d`. |
| **Meta Muse Spark Reasoning (S1)** | `IMPLEMENTED-BUT-OFF` | `MODEL_API_KEY` unset, diagnostics `disabled`, keySource `none`. Zero live calls run. Model interpreter executes strictly against verified offline fixtures with engine status `'Scripted model fixture · not a live model call'`. Strict parity between server validator and client interpreter (G3-PARITY). |
| **Muse Spark Live Calls** | `LIVE-UNVERIFIED` | Never called live in production or recordings. Missing: owner key + billed-call approval (GATE-S1) and live verification slice (S1-LIVE). |
| **XMemo Cloud Memory (X1)** | `IMPLEMENTED-BUT-OFF` | Flag `XMEMO_OAUTH_ENABLED=false`. Local browser storage is the active and sovereign source of truth. Confirm-only memory (INV-107) enforced client-side and server-side. |
| **XMemo Live Mapping (`recall`/`remember`)** | `LIVE-UNVERIFIED` | Code marks proxy mapping `UNVERIFIED_XMEMO_MCP_MAPPING`. Missing: owner-authorized probe against the real MCP server on the owner's account (GATE-X1, S2-LIVE). |
| **Live Weather (Open-Meteo)** | `IMPLEMENTED-BUT-OFF` | Flag `WEATHER_LIVE_ENABLED=false`. All scenes run on recorded, labelled fixtures with fixed city coordinates. Zero device geolocation or GPS calls anywhere. Commercial/terms qualification is owner action (GATE-W1). |
| **Device Geolocation & Live POI** | `IMPLEMENTED-BUT-OFF` | Zero device GPS calls. Transparent consent gating with explicit flag-off notice; manual coordinate input supported with straight-line distance calculations only. Zero real geotracking or live place network calls. |

---

## 8. Hackathon Evaluation Rubric Mapping

Every criterion is mapped strictly to demonstrable, recorded, and verifiable code evidence—with zero aspirational claims:

| Evaluation Criterion | Weight | Demonstrable & Recorded Evidence |
|---|---|---|
| **Impact & Value** | **30 pts** | • Solves real-world cognitive overload: replaces passive chat prompting and noisy notification feeds with a proactive, calm Living Context.<br>• At most one actionable NOW card with clear travel and preparation windows.<br>• Calm Quiet State (*"Nothing needs your attention right now."*) respects user peace of mind.<br>• Proactive prompt budget (max 3/day) prevents notification fatigue.<br>• Accessibility-first: 0 Axe violations across WCAG contrast, touch targets (≥44px), and reduced-motion instant duration collapse. |
| **Meta Tooling Integration** | **25 pts** | • Architecture designed around Meta Muse Spark 1.3 (`muse-spark-1.3`) for contextual ranking and conversational natural language command interpretation.<br>• Server-side dev proxy implements factual hallucination filtering, input schema validation, and closed decision intents.<br>• Strict fact-key parity (G3-PARITY): validates citations against confirmed memory keys, preventing synthetic fact invention.<br>• Transparent UI engine badge: displays truthful `'Offline fallback · deterministic'` and `'Scripted model fixture · not a live model call'` rather than faking live model connectivity. |
| **Quality of Demo & Presentation** | **25 pts** | • Fully synchronized 3-minute video demonstration script ([`docs/submission/VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md)) with every on-screen string and flow sequence asserted verbatim by automated Playwright E2E tests.<br>• Two comprehensive interactive user loops: Rain Re-Plan (transit adaptation + umbrella) and Away Lunch (candidate cards + local illustrations + dietary filters).<br>• Fully explainable review loop: Why Sheet displays plain-language evidence derivations without raw timestamps or technical jargon.<br>• Sovereign Me tab demonstrates explicit Confirm-Only memory (INV-107) and live timing recomputation. |
| **Technical Execution & Architecture** | **20 pts** | • Layered architecture with pure domain core (`src/core/`) frozen with zero diffs (`git diff --stat f43c6c1d HEAD -- src/core` 100% empty).<br>• Test-driven rigor: 540 unit & integration tests, 18 golden acceptance fixtures, 56 degradation drills, 192 Playwright E2E tests across full suite from the point-in-time PRE-S1 closeout verification matrix ([`docs/evidence/pre-s1/CLOSEOUT_PRE_S1.md`](../evidence/pre-s1/CLOSEOUT_PRE_S1.md) @ `6d2da2d` / `9007ccc`).<br>• Deterministic replay: core domain has zero ambient clock calls (`Date.now()`) and zero network imports.<br>• Storage envelope with corruption detection, recovery reset, and raw JSON export.<br>• Strict design token system verified by Playwright pixel sampler (10/10 PASS). |
| **Best Agentic Workflow (Bonus)** | **Bonus** | • Autonomous agentic loop: proactive context synthesis -> habit-informed candidate ranking -> conversational command adjustment -> user proposal generation -> confirm-only promotion -> deterministic re-planning.<br>• Full-page conversational shell (Ask Yori) seamlessly integrates natural language commands with structured Living Context cards.<br>• Complete user sovereignty: AI suggests, user controls, memory only learns on explicit confirmation. |

---

## 9. Built During the Hackathon Statement & Feature Delta

### Hackathon Commit Statement
> **Verified Commit Range (PRE-S1 Closeout Baseline):** `f7dd63d..6d2da2d` (101 commits, verified via `git log --oneline f7dd63d..6d2da2d | wc -l`), with approved closeout report at `9007ccc` (103 commits via `git log --oneline f7dd63d..9007ccc | wc -l`)  
> **Initial Scaffolding Commit:** `f7dd63de5f74d285f6eef6ae44258d79650004d4` on Wed Oct 28 03:56:28 2026 +0900  
> **Closeout Baseline Commit:** `6d2da2dd8f80030481f139e7f60f41c8b273bcd9` on Fri Oct 30 02:46:46 2026 +0900  
> 
> *All commits in the Yori codebase across `f7dd63d..HEAD` were authored and committed entirely within the Meta Global AI Developer Hackathon period, beginning from initial repository scaffolding through feature implementation, testing, and documentation.*

### Feature Delta List (Shipped & Approved Slices)

| Slice ID | Title | Scope & Shipped Deliverables |
|---|---|---|
| **Slice 0** | **Foundation & Contracts** | Pure domain core contracts (`PreparedPlan`, `ContextSignal`, `MemoryFact`), deterministic living composer, shared policy engine (budget caps, cooldowns), and static checks. |
| **Slice 1** | **Phase 1 Living Context Core** | Six deterministic demo scenes (D1 Clear, D2 Rain, D3 Away Lunch, D4 Busy Lunch, D5 Missing Weather, D6 Corrupt Storage), Why Sheet evidence citations, Adjust Dialog, and Me tab. |
| **Slice 1b** | **Degradation Hardening** | Fault-injection degradation drills (NFR-102/103), storage envelope verification with recovery reset workflow, and Zero-Core-Diff enforcement (AC-EXT-1). |
| **Slice 2a-1** | **V2 Shell Preview & Action Store** | Action-State store managing HOME, DETAIL, and CONVERSATION interaction states; docked Ask Bar; full-page conversation overlay with focus trap, pin toggle, and Esc navigation. |
| **Slice 2a-2** | **V2a Model Interpreter & Proxy** | Conversational model interpreter supporting natural language departure time shifts (`leave-later`), pre-model command schema validation, and transparent engine status disclosure. |
| **Slice 2b** | **Lunch Loop & Candidates Hero** | Candidates Hero view for dining recommendations, local labelled SVG illustrations for food categories, dietary filter chips (quieter, vegetarian), and restaurant detail views. |
| **Slice 3 (V3)** | **Tokens & Micro-Motion Polish** | Finalized design token system: warm ivory ground (`#F8F8F5`), crisp card surface (`#FFFFFF`), pine brand (`#162824` / `#16382F`), serif display typography, 44px touch targets, and micro-motion easing. |
| **Slice 5 (G3-PARITY)** | **Validator & Interpreter Parity** | Server proxy pre-model validator and client interpreter fact-key parity (`knownFactKeys`, subset checking against confirmed facts, closed intents set, prototype pollution protection). |
| **Slice 4 (V4 Loops)** | **Closed Owner Loops** | Complete interactive loops for Rain Re-Plan (D2) and Away Lunch (D3/D4) with Why Sheet provenance, candidate card illustrations, and deterministic quiet state. |
| **Slice 5a (V5-GEO)** | **Transparent Geolocation Notice** | Honest location notice banner with consent gating, manual coordinate input, and explicit flag-off disclosure (zero device GPS). |
| **Slice 5b (V5-FUEL)** | **Low Fuel Context & Handoff** | Contextual low fuel warning, simulated candidate stations with straight-line distance, and verified external navigation modal handoff. |
| **Slice 5c (V5-LUNCH)** | **Dynamic Lunch Re-Ranking** | Dynamic lunch candidate re-ranking with conversational dietary filters, straight-line distance bounds, and quiet-state fallback. |
| **PRE-S1 (A–D) & Closeout** | **Submission Readiness & Closeout Matrix** | Confirmed-only memory provenance classification, slot-aware DOM audit verification, compile-time test hook tree-shaking from shipping production builds, synchronized 3:00 storyboard, and clean-worktree full verification matrix ([`docs/evidence/pre-s1/CLOSEOUT_PRE_S1.md`](../evidence/pre-s1/CLOSEOUT_PRE_S1.md)). |

---

## 10. North Star Roadmap & Next Steps

1. **Phase 3 (Physical Integration)**:
   - Real system calendar provider integration via native Web Calendar APIs.
   - Real-time weather provider integration (e.g. Open-Meteo or Apple WeatherKit).
   - Real geofencing and travel duration queries via OpenStreetMap / Valhalla routing engine.
2. **Phase 4 (Multi-Surface Experience)**:
   - Operating system push notifications and Apple Watch / WearOS glanceable complications.
   - Live end-user OAuth consent flow for XMemo multi-device synchronization.
   - Voice audio readout using localized speech synthesis.
