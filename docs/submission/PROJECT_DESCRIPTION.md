# Yori (ヨリ) — Project Description

> **Submission for the Meta Global AI Developer Hackathon**  
> **Theme:** Build for Your World  
> **Track:** Startup Track [OWNER TO CONFIRM]  
> **Governed by Plan:** `yori_ph002_001` (Slice PH-002 E2, AC-205-2)  
> **Author:** [OWNER TO CONFIRM]  

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
- **Understanding**: Learns from what you actually do and simply gets it right next time, without asking you to explain or confirm anything.
- **Privacy-Centric**: Respectful of user sovereignty; everything Yori has learned is visible on Me and can be forgotten in one tap.

---

## 3. What Yori Does

### 1. Living Context Engine
Yori synthesizes structured context into an intuitive, glanceable card layout:
- **NOW Card**: Clear time windows (e.g. *"Get ready at 2:05 PM, leave by 2:25 PM"*) calculated from appointments, transit estimates, and personal preparation buffers.
- **Contextual Anticipation**: Adapts automatically to changing conditions (e.g. adding an **Umbrella** checklist chip and promoting driving over transit when rain is forecast).
- **Proactive Budgeting**: Daily proactive prompts are strictly capped (default: 3 per day) to preserve peace of mind.

### 2. Yori Learns You
Cards recommend; they don't explain themselves:
- **Learning from choices**: Pick ramen a couple of times and the next search puts ramen first, with no question asked and no reason line on the card. Only plain cuisine labels are learned; diet, allergy, health or religion-related labels are never inferred, only saved when you state them.
- **Adjust Dialog**: Adjust buffer times for *"This time only"* or choose *"Remember as preference"*, which is remembered at once.
- **Dismissals**: Dismissing a card silences it for the day; nothing follows up asking you to confirm.
- **Me > What Yori has learned**: every habit and everything you told Yori, each with a one-tap **Forget**.

### 3. User Sovereignty & The Me Tab
- **Learn-and-Correct Memory (INV-107)**: Yori learns habits from what you do in the app (Accept a lunch pick, Directions, Save a restaurant) and applies them right away, with no Confirm prompt: a cuisine you pick on at least 2 of your recent lunches (last 14 days), more than any other, comes first, with its basis shown ("You often pick ramen · 3 of your last 4 lunches"). Things you tell Yori in Ask ("I'm vegetarian", "remember I like quiet places") are saved as stated. Me > **What Yori has learned** lists every habit with its basis and a quiet **Forget**; forgetting removes the habit and its recorded choices and keeps it from being re-learned for 30 days.
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
   - **Zero-Core-Diff Extensibility (AC-EXT-1)**: Scenario plugins add new capabilities (proven by the grocery stub plugin `src/plugins/grocery-stub/`) without touching `src/core/`.
   - **Targeted Pure Memory Core Additions**: Under owner direction (`b056a22`, `c6c3e55`), habit learning intentionally introduced pure modules under `src/core/memory/` (`habit-journal`, `habit-learner`, `taste`) and a `MemoryFact` contract extension (`src/core/contracts/memory.ts`). The real diff vs baseline `f43c6c1d` is strictly confined to these memory additions (`git diff --stat f43c6c1d..HEAD -- src/core`: 7 files changed, 634 insertions, 4 deletions), while all core pipeline scheduling and decision code remains untouched.
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
- **Learn-and-Correct Memory (INV-107, AC-106-3)**:
  - Client adapters and the server-side proxy accept only what the user told Yori (`status 'confirmed'`, source `user_stated`) or what Yori learned from the user's own choices (`status 'learned'`, provenance source `observed`). Pending, unknown statuses, malformed keys and oversized values are rejected with HTTP 400; keys outside the closed Yori-managed registry get 403. Learned facts are written through to XMemo only when it is connected.

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
| **Core Living Context Pipeline** | `DONE + LOCAL-TESTED` | Fully operable locally on loopback (`127.0.0.1:5173` / `:4173`). 1,431 unit tests across 78 files, 18 golden acceptance fixtures across 4 files, 56 degradation drills across 4 files, AC-EXT-1 zero-core-diff plugin extensibility, and pure memory additions under `src/core/memory/` and `src/core/contracts/memory.ts`. |
| **Meta Muse Spark Reasoning (S1)** | `LIVE-ACCEPTED (Refine & Reason); LIVE-GATED (Command)` | Live-accepted under owner authorizations S1-LIVE-2 and S1-LIVE-3 (lifetime ledger strictly locked at 22/50 calls, SHA256 `5a65c5fc...`). Phrasing refinement (`[REFINE]`) and candidate ranking rationale (`[REASON]`) passed live fact-checking against `https://api.meta.ai/v1/chat/completions` using `muse-spark-1.3`. S1-LIVE-3 command verification run completed with reports (`742ea65`, `c8a1c47`: 3 accepted, 1 timeout hard stop); completion of remaining ≤4 billed calls per runbook §2.2 remains owner-gated (AUDIT §4 f). Demonstrations default to deterministic offline fallback with transparent engine disclosure. |
| **XMemo Cloud Memory (X1)** | `IMPLEMENTED-BUT-OFF (Local Sovereign); LIVE-GATED (S2-LIVE)` | Flag `XMEMO_OAUTH_ENABLED=false` by default. Local browser storage is the active and sovereign source of truth. Read-only integration harness implemented and verified offline ([`docs/evidence/s2-ro/S2_RO_REPORT.md`](../evidence/s2-ro/S2_RO_REPORT.md)). Live remote vault connection against owner's personal XMemo account via real PKCE flow remains owner-gated (S2-LIVE). Calendar is honestly unavailable ("Not available yet") with no adapter. Confirm-only memory (INV-107) strictly enforced client-side and server-side. |
| **Live Weather (Open-Meteo)** | `IMPLEMENTED-BUT-OFF (Offline Verified)` | Live toggle implemented (`WEATHER_LIVE_ENABLED=true`) and offline-verified across dual viewports ([`tests/e2e/live-weather-ui.spec.ts`](../../tests/e2e/live-weather-ui.spec.ts), [`docs/evidence/ph2-d1/`](../evidence/ph2-d1/)). Flag `WEATHER_LIVE_ENABLED=false` by default; all demo scenes run on recorded, labelled fixtures with fixed city coordinates. Zero device geolocation or GPS calls anywhere. Commercial/terms qualification is owner action (GATE-W1). |
| **Device Geolocation & Live POI** | `IMPLEMENTED-BUT-OFF` | Zero device GPS calls. Transparent consent gating with explicit flag-off notice; manual coordinate input supported with straight-line distance calculations only. Zero real geotracking or live place network calls. |
| **Routing Engine (G-ROUTE)** | `RECORDED-FIXTURE / LIVE-GATED` | Real in-session route computation offline with recorded fallback; displays "No Route" fail-closed notice when destination unconfigured; external routing engine selection (OSRM / OpenRouteService / GraphHopper) is owner-gated (a). |
| **Nearby Places & Tile Policy** | `IMPLEMENTED-BUT-OFF / LIVE-GATED` | Loopback proxy seam (`/api/places`) with coordinate rounding and caching; external live Overpass instance and vector tile host selection are owner-gated (b, c). Displays "Owner Gated" when offline. |
| **Application Mode Default** | `DEMO-DEFAULT / LIVE-GATED` | Defaults to Demo mode; live mode requires `?mode=live` or `VITE_YORI_DEFAULT_MODE=live`; flipping default is owner-gated (d). |
| **Desktop Three-Zone IA** | `DONE + VERIFIED` | Desktop viewports (≥1024px, 1280×800, 1440×900) feature three-zone responsive IA: 240px nav sidebar, ≤680px main column, and 380px contextual right panel. |

---

## 8. Hackathon Evaluation Rubric Mapping

Every criterion is mapped strictly to demonstrable, recorded, and verifiable code evidence—using official hackathon criteria names and weights verbatim:

| Evaluation Criterion | Weight | Demonstrable & Verifiable Evidence |
|---|---|---|
| **Impact** | **30%** | • Solves real-world cognitive overload: replaces passive chat prompting and noisy notification feeds with a proactive, calm Living Context.<br>• At most one actionable NOW card with clear travel and preparation windows.<br>• Calm Quiet State (*"Nothing needs your attention right now."*) respects user peace of mind.<br>• Proactive prompt budget (max 3/day) prevents notification fatigue.<br>• Accessibility-first: 0 Axe violations across WCAG contrast, touch targets (≥44px), and reduced-motion instant duration collapse. |
| **Use of Meta AI Tooling** | **25%** | • Architecture designed around Meta Muse Spark 1.3 (`muse-spark-1.3`) for contextual ranking and conversational natural language command interpretation.<br>• Ask replies written live by Meta Muse Spark and fact-checked against the card, template fallback.<br>• Server-side dev proxy implements factual hallucination filtering, input schema validation, and closed decision intents.<br>• Strict fact-key parity (G3-PARITY): validates citations against confirmed memory keys, preventing synthetic fact invention.<br>• Live billed verification (S1-LIVE-2) accepted phrasing refinement and ranking rationale on 2026-10-31.<br>• Transparent UI engine badge: displays truthful `'Offline fallback · deterministic'` and `'Scripted model fixture · not a live model call'` when running in offline mode. |
| **Technical Depth & Execution** | **20%** | • Layered architecture with pure domain core: AC-EXT-1 grocery plugin adds capabilities without touching `src/core/`; owner-directed habit learning introduces pure modules in `src/core/memory/` (habit-journal, habit-learner, taste) with real diff vs baseline `f43c6c1d` of 7 files, 634 insertions, 4 deletions.<br>• Test-driven rigor: 1,431 unit tests across 78 files, 18 golden acceptance fixtures across 4 files, 56 degradation drills across 4 files.<br>• Deterministic replay: core domain has zero ambient clock calls (`Date.now()`) and zero network imports.<br>• Storage envelope with corruption detection, recovery reset, and raw JSON export.<br>• Strict design token system verified by Playwright pixel sampler (10/10 PASS). |
| **Demo** | **25%** | • Fully synchronized video demonstration script ([`docs/submission/VIDEO_SCRIPT.md`](VIDEO_SCRIPT.md)) with every on-screen string and flow sequence asserted verbatim by automated Playwright E2E walkthrough ([`tests/e2e/video-script.spec.ts`](../../tests/e2e/video-script.spec.ts)).<br>• Two comprehensive interactive user loops: Rain Re-Plan (transit adaptation + umbrella) and Away Lunch (candidate cards + local illustrations + dietary filters).<br>• In-conversation location permission with Allow / Not now.<br>• Autonomous lunch-habit learning with Forget, no sensitive-trait inference.<br>• Sovereign Me tab demonstrates explicit Confirm-Only memory (INV-107) and live timing recomputation. |

---

## 9. Built During the Hackathon Statement, Provenance & Feature Delta

### Project Provenance & Development Transparency
- **Independent Pre-Existing Service (XMemo)**: XMemo is an independent, pre-existing external memory service (owner entity: `[OWNER TO CONFIRM]`). Yori integrates with XMemo as an optional remote vault over standard OAuth 2.0 PKCE and Model Context Protocol (MCP); XMemo itself is not part of the submitted Yori repository.
- **Concept Origin**: The initial conceptual idea memory for Yori was recorded on 2026-10-14 (documenting the motivation for a calm, proactive assistant).
- **Git History & First Commit**: Verifiable git repository history begins with initial scaffolding commit `f7dd63d` at 2026-10-27T18:56Z (2026-10-28 03:56+09:00).
- **Hackathon Authorship Window**: All Yori application code and tests in this repository were authored during the hackathon period `[OWNER TO CONFIRM]`.
- **Development & Ownership**: Application code, tests, and documentation were developed through AI-agent-assisted engineering, directed and reviewed by the owner, who holds sole ownership and rights over all project deliverables `[OWNER TO CONFIRM]`.

### Hackathon Commit Statement
> **Verified Commit Range (PRE-S1 Closeout Baseline):** `f7dd63d..6d2da2d` (101 commits, verified via `git log --oneline f7dd63d..6d2da2d | wc -l`), with approved closeout report at `9007ccc` (103 commits via `git log --oneline f7dd63d..9007ccc | wc -l`)  
> **Initial Scaffolding Commit:** `f7dd63de5f74d285f6eef6ae44258d79650004d4` on Wed Oct 28 03:56:28 2026 +0900  
> **Closeout Baseline Commit:** `6d2da2dd8f80030481f139e7f60f41c8b273bcd9` on Fri Oct 30 02:46:46 2026 +0900  
> 
> *Attestation that all commits across `f7dd63d..HEAD` were authored and committed within the Meta Global AI Developer Hackathon period: `[OWNER TO CONFIRM]`.*

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
| **LLM-REPLY-GROUNDED** | **Live Model Replies & Fact Checker** | Ask replies written live by Meta Muse Spark and fact-checked against the card, template fallback. |
| **ASK-INLINE-PERMISSION** | **In-Conversation Permission** | In-conversation location permission with Allow / Not now. |
| **HABIT-LEARNING** | **Autonomous Habit Learning** | Autonomous lunch-habit learning with Forget, no sensitive-trait inference. |

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
