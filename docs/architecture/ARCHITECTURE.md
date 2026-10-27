# Yori — Architecture Rev3: General Proactive Agent

> Status: Rev3 design, submitted for Reviewer plan gate. Supersedes the
> Rev2 simulated-MVP baseline (`yori_mvp_001`, Reviewer decision
> `030502ae`) by owner direction (ARCH-REV3-001). Rev2 contracts are NOT
> carried forward; this document is the single Rev3 baseline together
> with `goals.yaml`, `PHASE_PLAN.md`, and `YORI_MVP.plan.json`.
> SPEC impact of this supersession: `SPEC_IMPACT_REV3.md`.
> Authority: owner-approved Rev3 rationale (ARCH-REV3-001) >
> `.progress/spec/*` (Gate-S, see SPEC_IMPACT for required changes) >
> long-term vision `SOURCE_XMEMO_IDEA.md`. Design + plan only: no
> executor code, deploy, paid resources, API keys, or real location
> transmission is authorized by this design.

## 1. North Star (blocking)

> **Yori is a proactive personal AI agent that thinks ahead for you.**

Always thinking ahead, not always interrupting. Yori is never reduced
to a weather app, a reminder app, or a restaurant app: those are
scenario plugins on one general pipeline. Every design decision below
is checked against this star — a feature that only makes sense inside
one scenario belongs in a plugin; a behaviour every scenario needs
belongs in the shared core.

## 2. Pipeline

```text
Perception ─▶ ContextSnapshot ─▶ Intent detection ─▶ Suppression ─▶ Preparation
(signals)     (immutable,        (per-plugin          (shared        (per-plugin
               as-of, sourced)    detectors)           policy)        preparers)
                                                                      │
Review ◀─ Why ◀─ HomeComposer (Living Context) ◀──────────────────────┘
(accept/     (evidence,        NOW ≤ 1 · AHEAD ≤ 3 · FOR YOU
 adjust/      provenance)            │
 dismiss)                           ▼
        └─▶ Memory update — only on user confirm (pending otherwise)
```

### Stable contracts (frozen in Slice 0)

```ts
ContextSignal { kind, value, source: "simulated" | "real",
  issuedAt, validFor, confidence, consentScope }
ContextSnapshot { id, asOf, signals: ContextSignal[] }   // immutable
Scenario { id, title, timeline: { at, signal }[] }        // replayable
MemoryFact { key, value, status: "confirmed" | "pending" | "rejected",
  provenance }
IntentDetector.detect(snapshot, memory)
  -> IntentCandidate { intent, confidence, evidence, suppressedBy? }
Preparer.prepare(candidate, snapshot, memory)
  -> PreparedPlan { headline, optionsOrSteps, checklist, actions,
       requiresConfirmation, why }
HomeComposer.compose(now, ahead, forYou) -> LivingContext
UserFeedback { planId, action: "accept" | "adjust" | "dismiss",
  suppressScope?, note? }
```

Contracts are scenario-agnostic. A contract change requires a design
revision; plugins may not extend contracts privately.

## 3. Shared policies (core only, never per-plugin)

| Policy | Rule |
|---|---|
| Ranking | Candidates ranked by confidence × recency of evidence × user-confirmed preference fit; deterministic tie-break by intent id |
| Suppression / mutual exclusion | A candidate is suppressed with a recorded reason when: already done, user busy, previously declined (cooldown), quiet hours, duplicate of a shown plan, below confidence threshold, or daily prompt budget exhausted. Suppression is data (`suppressedBy`), never silent dropping |
| Notification cap | Default max **3 proactive prompts/day** (measurable budget, user-visible in Me). NOW/AHEAD composition is on-open, not a prompt |
| Preference confirmation | Memory writes only on user confirm. Feedback creates `pending` proposals; `rejected` proposals are retained for audit, never applied |
| Why | Every plan carries `why`: evidence signals with `issuedAt`, memory facts used, and the deterministic derivation. No Why, no card |
| Fail-closed degradation | Missing/stale/low-confidence signal ⇒ explicit notice, reduced plan, or no card. Never invented data (INV-103) |
| Action authorization | Booking, payment, or itinerary change always `requiresConfirmation: true`; no plugin may execute such actions autonomously |
| Storage | Versioned envelope, write-read-back verify, corruption ⇒ explicit error + export/reset (carried from Rev2 INV-006) |

## 4. Scenario plugins (static registry, no marketplace)

A plugin is exactly three parts: a **detector**, a **preparer**, and a
**provider adapter**. It owns no ranking, suppression, confirmation,
Why, notification, or storage logic. The registry is a static list at
`src/plugins/registry.ts` — explicitly **outside** the core pipeline
paths, so registering a plugin never edits a core file. Dynamic
loading is out of scope.

| Plugin | Detector | Preparer core | Provider adapter (demo) |
|---|---|---|---|
| `depart` | Upcoming appointment inside planning horizon | Rev2 deterministic time engine: `leave = appt − travel − buffer`, `prepare = leave − prep`, DST-safe, fail-closed, `alreadyDue` flag | Replayable simulated calendar/travel/weather signals |
| `lunch` | Away-from-home + free window + not yet eaten | Rank ≤3 places by confirmed taste memory; travel-time feasible within free window | Mock place adapter (source-labelled, offline data) |
| `grocery-stub` | (AC-EXT-1 proof only) low-stock signal | Minimal restock plan | Mock signal; exists to prove zero-core-diff extensibility |

Real-provider seams kept, not built: OSM-offline/real place adapter,
real calendar, real weather — all PH-003 after privacy review.

## 5. HomeComposer — Living Context

The home surface is a composed view, not a feed of plugin cards:

- **NOW** — at most 1 item: the single most relevant current plan or
  an honest fallback (next AHEAD item, or a quiet "nothing needs you"
  state). Zero prompts is a valid, designed state (D4).
- **AHEAD** — at most 3 upcoming plans, ranked by the shared policy.
- **FOR YOU** — memory insights and pending confirmations (proposals
  awaiting the user's decision). Nothing here applies itself.
- **Map** — rendered only when spatial evidence exists in the
  snapshot (a place/route signal). No evidence, no map.

Composition runs the shared suppression policy first; suppressed
candidates never reach the composer. English UI first; all user-facing
strings externalized for i18n (NFR-105).

## 6. Review and memory loop

Every plan offers **accept / adjust / dismiss** plus **Why**. Feedback
effects: accept ⇒ plan actions proceed (confirmation-gated per
Section 3); adjust ⇒ user edits become a `pending` MemoryFact
proposal; dismiss with a reason (e.g. "don't suggest lunch") ⇒
suppression for the chosen scope plus a `pending` proposal. Memory
changes status only when the user confirms in FOR YOU / Me
(INV-107). The Me surface shows: confirmed facts, pending proposals,
prompt budget used today, and data controls (export/delete).

## 7. Golden scenarios (acceptance fixtures, Slice 0)

All fixtures replay a `Scenario` signal timeline under a fixed clock.
Times below are wall-clock in the fixture's IANA timezone.

| ID | Fixture | Required outcome |
|---|---|---|
| D1 | Piano lesson 15:00, clear; travel 30, buffer 5, prep 20 | prepare **2:05 PM**, leave **2:25 PM**; NOW shows the depart plan |
| D2 | Same lesson; at **1:35 PM** a rain forecast (issuedAt 1:35, valid for the travel window) arrives | Re-plan: umbrella on checklist; options drive leave **2:30** / bus leave **2:15**, ranked by confirmed rain habit; Why cites forecast `issuedAt`; no preference mutation |
| D3 | Away signal 12:10, free until 1:30, not eaten | Lunch card with **≤3** options; each Why cites confirmed taste memory |
| D4 | Same as D3 but busy, or already ate | **No** lunch card (0 prompts); NOW falls back |
| D5 | User: "don't suggest lunch" | Lunch suppressed for the rest of the day; memory change exists only as a `pending` proposal |
| D6 | Weather signal missing or stale (expired `validFor`) | Fail-closed notice; no invented forecast; no plan built on the stale signal |
| AC-EXT-1 | New `grocery-stub` plugin added **only in the closeout slice** (Slice 0 holds just a failing harness expectation, no stub code) | Passes NOW composition, suppression, and Why with **zero diff** to core pipeline files (contracts, composer, shared policies, storage) against the tree approved at the Review/memory slice, proven by `git diff` in the closeout task |

## 8. Invariants (Rev3)

| ID | Invariant |
|---|---|
| INV-101 | Every signal is sourced (`simulated`/`real`), timestamped (`issuedAt`), and validity-bounded (`validFor`); snapshots are immutable |
| INV-102 | Mock/simulated data is labelled everywhere it appears; simulated and real data are never indistinguishable |
| INV-103 | No fabricated real-world data: times from the deterministic engine, weather/places only from signals/adapters. The LLM invents nothing (Section 9) |
| INV-104 | Booking, payment, or itinerary change requires explicit user confirmation |
| INV-105 | The daily proactive prompt cap (default 3) is enforced by shared policy and measurable in tests and in Me |
| INV-106 | Stale or missing signals degrade fail-closed with a visible notice (D6) |
| INV-107 | Memory writes only on user confirm; feedback creates pending proposals, never direct mutation |
| INV-108 | Suppression always records its reason; a user's "don't suggest" is honoured for its scope without a memory write |
| INV-109 | Scenario plugins touch only detector/preparer/adapter; core pipeline files are closed to plugin changes (AC-EXT-1) |
| INV-110 | Persistence is owned solely by `src/core/storage` (versioned envelope, write-read-back verify). Corrupt or unknown-version data surfaces an explicit error with export/reset — never a silent wipe or default. Memory facts, proposals, same-day suppressions, and the daily prompt-budget counter survive reload. No plugin or UI module persists state privately |

## 9. Model and memory integrations (evaluated, gated)

### 9.1 Meta Muse Spark — behind `ModelPort`

Intended role: constrained situational reasoning and recommendation
**wording only**, over facts supplied by signals/engine. Hard rules:
the model never originates times, weather, places, routes, or prices;
its output is schema-validated, and every factual token (time, place
name) is post-checked against the supplied fact set — mismatch ⇒
output discarded, deterministic template used.

Feasibility: a Meta Model API is publicly reported as self-serve and
OpenAI-compatible, so a minimal integration is technically plausible
within the deadline. **Hard blockers, explicit:**

- **HB-1 (blocker, confirm by 2026-10-30):** no project API key/credits
  exist and creating paid resources is not authorized. Without a key,
  the demo runs deterministic-only — D1–D6 must pass with the model
  disabled; model wording is an enhancement, never a dependency.
- **HB-2 (blocker for client-only shape):** API keys cannot live in a
  browser client. Real model calls need a thin server-side proxy
  (PH-001 spike, local/demo only) or are skipped. Shipping a key in
  the SPA is forbidden.
- Degradation: model down/timeout/invalid ⇒ deterministic PreparedPlan
  templates + local memory path; the failure is invisible to
  correctness and visible in diagnostics.

### 9.2 XMemo — behind `MemoryPort`

Intended role: preference recall and confirmed write-back. Local
memory is the demo's source of truth; XMemo is an adapter, not a
dependency. **Hard blocker:**

- **HB-3 (blocker, confirm by 2026-10-30):** XMemo access in this
  workspace is agent-side MCP with agent tokens. An end-user web-app
  integration (per-user auth, CORS, write API) is unverified and those
  agent tokens must never ship in a client. Until an app-integration
  path is confirmed, the adapter target is local storage with an
  XMemo-shaped fact format, and write-back is exercised only through
  the agent-side path in evaluation, not in the demo client.
- Degradation: XMemo unreachable ⇒ local memory only; no behaviour
  loss for D1–D6. Only `confirmed` facts are ever written back.

Privacy/consent for both: signal `consentScope` gates what may leave
the device; no real location is transmitted (not authorized); model
payloads contain derived context labels, never raw coordinates or
calendar contents beyond the scenario at hand.

## 10. Option evaluation (N×M)

Scored 1 (worst) – 5 (best) for the PH-001 hackathon demo (deadline
2026-11-04), not for the long-term product.

| Criterion | A. Client-only SPA + ports | B. SPA + thin proxy/backend | C. Backend-first + accounts/sync |
|---|---|---|---|
| Safety / privacy | 5 — nothing leaves device; HB-2 moot for core demo | 3 — proxy holds keys; more surface | 2 — accounts + synced behaviour pre-validation |
| Deadline feasibility | 5 — one deployable, all demo paths local | 3 — proxy + key provisioning on critical path (HB-1) | 1 — auth/sync cannot land credibly by 11-04 |
| Race / concurrency | 4 — single-user local state, versioned | 3 — idempotency/versioning needed | 2 — sync conflicts are the hard problem |
| Extensibility (AC-EXT-1) | 5 — plugin proof is client-side anyway | 4 | 3 |
| Integration readiness (Spark/XMemo) | 3 — adapters stubbed behind ports | 5 — natural home for keys/adapters | 5 |
| Dev ergonomics | 5 | 3 | 2 |

**Decision: Option A for PH-001**, with `ModelPort`/`MemoryPort`
adapters designed so Option B is an adapter swap (the Rev2 ADR-004
migration logic, preserved). Option B's proxy may be spiked locally
for a model-wording demo if HB-1 clears; it is never on the D1–D6
critical path. Option C remains rejected pre-validation.

## 11. Effort vs deadline and cut line

PH-001 budget (see `YORI_MVP.plan.json` for per-task estimates):
Slice 0 ≈ 8h, depart ≈ 6h, lunch+policy ≈ 8h, composer/UI ≈ 9h,
Review/memory/adapters ≈ 8h, scenario player/closeout ≈ 6h — ≈ 45h
plus checkpoints, against 7 calendar days to 2026-11-04. Feasible
only with the cut line enforced, in order:

1. Model wording (Spark) — first cut; deterministic templates remain.
2. XMemo live write-back — cut to local adapter (HB-3 default).
3. Map surface — cut unless spatial fixtures are already green.
4. Grocery-stub **UI** — cut; AC-EXT-1 zero-diff proof (pipeline-level)
   is NOT cut, it is the extensibility claim of the demo.

Never cut: D1–D6 golden coverage, suppression reasons, Why, the
prompt cap, or memory-confirm discipline.

## 12. Risks

- R-1: HB-1/HB-3 confirmations may not arrive by 2026-10-30; the plan
  treats both integrations as enhancements so the demo is unaffected.
- R-2: The reviewer prototype (V2 page, Clear/Rain/Away-lunch scenes)
  was not retrievable at design time (artifact shell only); D1–D6 as
  specified in the request are the normative fixtures.
- R-3: Rev3 broadens scope beyond the Gate-S contract; Gate-S anchors
  must be revised — see `SPEC_IMPACT_REV3.md`. Guarded autonomy: the
  SPEC revision itself needs owner approval outside this plan.

## 13. Decision index

Machine-readable decisions: `goals.yaml` (ADR-101..105). Phases:
`PHASE_PLAN.md` (PH-001 hackathon, PH-002 notifications/detectors/
eval, PH-003 real providers after privacy review). Executable slices:
`YORI_MVP.plan.json`. `RECOMMENDATIONS.md` is a superseded Rev2
record and is not part of this baseline.

## 14. PH-002 design (ARCH-PH002-001, planning only)

PH-001 is complete (Reviewer-approved, commit `bfb1c446`). PH-002
keeps the North Star, INV-101..110, and the plugin/shared-policy
architecture. It prioritises one minimal **real** closed loop over
breadth, and never sacrifices the PH-001 visual/end-to-end demo.
OS-level notifications (the earlier PH-002 sketch) are deferred out
of this phase by deadline; see `PHASE_PLAN.md`.

### 14.1 Workstream A — security-first proxy (first slice)

The PH-001 dev proxy accepts client-supplied `templateWording` text.
PH-002 removes free-text prompt carriage:

- The client sends only `{ templateId, facts }`. Prompt text lives in
  a **server-side template registry** (`src/adapters/model/`), keyed
  by fixed template ids; unknown ids are rejected (400).
- `facts` is validated against a strict structured schema (bounded
  arrays, bounded string lengths, no extra keys). Schema-invalid ⇒
  400, no model call.
- All PH-001 guards remain and are regression-tested: loopback host,
  local origin/referer, cross-site rejection, 415/413/429.
- **AC-EXT-1 impact: none.** Templates and schemas live in
  `src/adapters/model/*` and proxy wiring; no `src/core/**` file
  changes, so the AC-EXT-1 zero-core-diff baseline (`f43c6c1d`) is
  preserved and no new baseline is proposed.

### 14.2 Workstream B — constrained Spark reasoning

Beyond wording: the model may **rank or choose among
engine-produced candidate plans**, or **propose an intent with a
confidence**, over supplied structured facts. It still originates no
times, weather, places, routes, or prices. Outputs are
schema-validated; every claim cites supplied signal/fact ids
(provenance); the fact checker rejects uncited or fabricated tokens;
any failure ⇒ deterministic ranking/fallback. Tests replay recorded
fixtures/mocks offline — no live key needed in CI. Golden D1–D6 are
byte-identical with the model off. A model-proposed intent enters the
same shared suppression policy as any detector candidate; it gets no
privileged path to the user.

### 14.3 Workstream C — XMemo via end-user app OAuth

Target loop: OAuth sign-in → read preferences → write back only
user-confirmed facts, minimal scopes, tokens held server-side only,
local memory remains the fallback and the offline truth. If no
end-user app auth path exists in XMemo, the plan does not invent one:
the slice delivers the verified finding, the minimal owner action
(app registration), and a fallback demo path (local adapter +
agent-side confirmed write-back demonstration outside the client).

### 14.4 Workstream D — minimal real providers

Incremental, behind the existing ports, each with a mock twin
carried within the existing `ContextSignal` shape — PH-002 makes
**zero `src/core/**` changes** (Reviewer option (a); the AC-EXT-1
baseline stands). Signal records keep `source/issuedAt/validFor` and
consent gating; keyless/free sources preferred, with cost and ToS
stated per provider. First increment: real clock/time and one
keyless weather source queried with a **configured fixed demo-city
coordinate only** — the device geolocation API is never called, and
any real device location requires a separate explicit owner gate.
Calendar and route providers, and anything transmitting real GPS or
private calendar content, likewise require explicit owner
authorization and are not in the default path. Demo/submission
preparation (Workstream E) is scheduled **before** the real-provider
increments so deadline slip in D can never consume it.

### 14.5 Workstream E — demo and submission preparation

UI visual re-review against `docs/evidence/s5-1`, demo narrative,
3-minute video script, public-repo hygiene (secret scan, licence,
README). Every external action (recording publication, repo
visibility change, hackathon submission) sits behind an explicit
owner gate. There is no auto-submission anywhere in the plan.

### 14.6 Owner-action checklist (plan appendix)

`YORI_PH002.plan.json` carries the checklist as gated tasks:
MODEL_API_KEY in `.env.local`; XMemo OAuth/app registration decision;
any provider keys; any external cost approval; video recording and
submission steps. Each names the owner action, what it unblocks, and
what happens if it is not done (the fallback that keeps the demo
whole).
