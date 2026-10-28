# Yori (ヨリ)

> *A little ahead. By your side.*  
> A calm, privacy-first, proactive context-aware assistant.

[![Tests](https://img.shields.io/badge/tests-259%20unit%20%7C%2010%20golden%20%7C%2021%20drills%20%7C%2066%20e2e-brightgreen)](package.json)
[![Architecture](https://img.shields.io/badge/architecture-zero--diff%20core-blue)](docs/architecture/ARCHITECTURE.md)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 🌿 Overview

Most AI assistants today are either **reactive chatbots** waiting for prompts or **noisy notification engines** competing for attention. 

**Yori** is built on a different premise: **calm proactivity**. In this demo, Yori runs entirely locally using simulated scenario snapshots to demonstrate context synthesis across schedule, ambient weather, transit conditions, and confirmed personal memories into a clean **Living Context** (with real clock and keyless weather providers available behind optional flags):
- **At most 1 NOW Card**: Exactly one actionable item that needs your attention right now.
- **Ranked AHEAD Cards**: What is coming up later, clearly organized.
- **Honest Quiet State**: When you are busy or everything is handled, Yori stays completely quiet: *"Nothing needs your attention right now."*
- **Explainable Review Loop**: Tap **Why** on any card to see its full factual derivation in plain language without engineering jargon.
- **Confirm-Only Memory (INV-107)**: Yori never silently modifies your preferences or habits. Unconfirmed observations stay as pending proposals until you explicitly tap **Confirm**.

---

## 🏛️ Architectural Foundations

Yori is engineered with strict invariants governed by formal specifications:

1. **Pure Domain Core (`src/core/`)**:
   - Zero framework dependencies, zero network imports, and zero ambient clocks (`Date.now()`).
   - 100% frozen inputs and deterministic composition.
   - **Zero-Core-Diff Extensibility (AC-EXT-1)**: Plugins add new capabilities (such as the grocery stub plugin) without altering a single line of core domain code.
2. **Shared Policy (`src/core/policy/`)**:
   - Centralized enforcement of proactive prompt budgets (strictly capped at 3 per day), candidate ranking, and quiet-state suppression.
3. **Degradable Extension Ports**:
   - **`ModelPort` (Meta Muse Spark)**: Operates behind a local loopback-only dev server proxy (`127.0.0.1:5173`). Performs constrained natural language wording refinement and candidate reordering. Factual hallucination guards discard any output containing unlisted times, places, or citations for deterministic templates.
   - **`MemoryPort` (XMemo Integration)**: Server-side OAuth 2.0 PKCE + MCP data surface (`https://xmemo.dev/mcp`) with minimal scopes (`memory:read`, `memory:write`). Confirmed facts sync only upon user action. On any network or auth error, the system seamlessly falls back to `LocalMemoryAdapter` with zero UI disruption.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (tested on Node.js 20 & 22)
- npm 9+

### 1. Installation
```bash
git clone <owner-repo-url> # [OWNER TO CHOOSE]
cd Yori
npm install
```

### 2. Development Server
```bash
# Starts loopback-only dev server at http://127.0.0.1:5173
npm run dev
```
Open **[http://127.0.0.1:5173](http://127.0.0.1:5173)** in your browser.

### 3. Production Build & Preview
```bash
npm run build
npm run preview
```

---

## 🧪 Verification Suite

Yori includes a multi-tier test harness ensuring zero regressions, deterministic replayability, and offline verification:

```bash
# 1. Typecheck (TypeScript strict mode)
npm run typecheck

# 2. Unit and mock integration tests (231 tests)
npm test

# 3. Deterministic Golden Scenarios (D1–D6 + AC-EXT-1 grocery proof)
npm run test:golden

# 4. Degradation Drills (NFR-102/103 fault-injection invariance)
npm run test:drills

# 5. Playwright End-to-End Tests (38 tests across mobile 390x844 & desktop 1280x800)
npm run test:e2e
```

---

## 🎬 Simulated Demo Scenes

Use the **Demo Scenes** selector at the top-right of the navigation bar to test different context situations:

| Scene | Context | Yori Behavior |
|---|---|---|
| **D1: Clear Departure** | Piano lesson at 3:00 PM, 30 min travel, 20 min prep, clear skies. | Surfaces NOW card: *"Get ready at 2:05 PM, leave by 2:25 PM"*. |
| **D2: Rain Re-Plan** | Sudden rain forecast issued at 1:35 PM during departure window. | Adds **Umbrella** checklist chip and ranks Drive (2:30 PM) ahead of Bus (2:15 PM) based on confirmed habit. |
| **D3: Away Lunch** | User away at 12:10 PM with adequate schedule gap and no logged lunch. | Recommends up to 3 dining venues within walking distance matching confirmed taste memories (`Japanese`, `Salad`). |
| **D4: Busy Lunch** | User has back-to-back meetings or has already eaten. | Honest quiet state: *"Nothing needs your attention right now."* |
| **D5: User Dismissal** | User dismisses lunch with *"Don't suggest lunch today"*. | Suppresses lunch intent for the day; records pending preference proposal in **Me** tab. |
| **D6: Missing / Stale Weather** | Weather forecast signal is missing or expired. | Displays calm fail-closed degraded notice without inventing synthetic forecasts (INV-103). |

---

## 🔒 Privacy & Safety Model

- **No Tracking or Cloud Keys in Client**: All credentials reside solely in local dev-server process memory; zero keys or tokens exist in browser storage (`localStorage`, `sessionStorage`, cookies), client bundles (`dist/`), or git history.
- **Simulated Provider Data (INV-102)**: Calendar events, weather forecasts, location coordinates, routes, and venue names in demo scenes are mock fixtures. No real device GPS coordinates are transmitted.
- **Confirm-Only Write-Back (INV-107)**: Invariant enforced both client-side and server-side: only facts explicitly confirmed by the user can be persisted to long-term memory or synced to remote vaults.
- **Loopback Enforcement**: Dev proxy binds strictly to `127.0.0.1` and blocks non-local Host headers, cross-origin requests, and payloads larger than 8 KB.

---

## 📖 Documentation & Submission Resources

- **[Living Context Demo Guide](docs/DEMO.md)**: Comprehensive tour of scenes, review loops, and architecture.
- **[3-Minute Video Script](docs/submission/VIDEO_SCRIPT.md)**: Timed demonstration script walking the North Star loop.
- **[Project Description](docs/submission/PROJECT_DESCRIPTION.md)**: Hackathon overview, problem statement, and technical architecture.
- **[Submission Checklist](docs/submission/SUBMISSION_CHECKLIST.md)**: Explicit owner-gated checklist for public release and submission.
- **[Architecture Specification](docs/architecture/ARCHITECTURE.md)**: Complete system design, invariants, and component boundaries.

---

## 📄 License

This project is proposed under the [MIT License](LICENSE). Final license selection is an explicit owner decision prior to public release.
