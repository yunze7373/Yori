# Yori Living Context V2 — Fluid Conversation UI (Design)

> Design-only package for ARCH-V2-001 (owner-approved 2026-10-28,
> relayed msg_ccdbefa070de4d29). No code is written by this document.
> Executable slices: `YORI_V2.plan.json`. This design does not reopen
> Rev3 contracts, the plugin architecture, or any owner gate.
>
> **Reference images R0–R3 have NOT been received on this Mac.** The
> Bridge cannot carry binaries and no files exist under
> `docs/design/v2-reference/`. This package therefore fixes
> architecture, state machines, grammar, view models, and token
> *structure* from the text spec. Token **values** and layout
> specifics are marked PROVISIONAL and their finalization is blocked
> until R1–R3 are placed at `docs/design/v2-reference/` (see §7).
> Concept images are never presented as implemented screens, and no
> road, rating, or venue data is copied from them (§4).

## 1. Architecture change list

Everything lands in the UI/plugin/mock layers. **`src/core/**` stays
at zero diff vs `f43c6c1d` (AC-EXT-1); no core change is needed, and
none is smuggled in.** If implementation later proves a core change
unavoidable, it stops and returns as a separate owner-level decision.

| Area | Change | Files |
|---|---|---|
| Action state | New shared action-state store + reducer (UI layer): one state shared by home, conversation, map, and cards | new `src/ui/action-state/` |
| Interaction shell | Home ↔ ask bar ↔ full-page Conversation transitions, focus/keyboard/safe-area management | `src/ui/living-context/app.ts`, new `src/ui/conversation/` |
| Home composition | Scene-driven composition; NOW/AHEAD/FOR YOU sized by information value, no empty fixed blocks; mobile-first dynamic home (not a shrunk desktop) | `src/ui/living-context/presentation.ts`, `app.ts`, `styles.css` |
| View models | Map/photo/timeline/option-card view models derived purely from plan + signal data with provenance | new `src/ui/view-models/` |
| Command grammar | Closed deterministic English grammar + interpreter seam (model off) | new `src/ui/conversation/grammar.ts` |
| Scene fixtures | Lunch fixtures gain `noiseLevel` / `vegetarian` attributes; depart fixtures expose mode options; photo placeholders as local labelled illustrations. All values fixture-sourced, SIMULATED-labelled | `src/adapters/mock/**`, `src/plugins/lunch/*`, `src/plugins/depart/*` (fixtures/preparer ranking inputs only) |
| Review flows | Why/adjust/dismiss reuse the existing review components inside both home cards and conversation | `src/ui/review/*` (presentation wiring only) |

Invariants protected: golden D1–D6 unchanged (fixtures only *add*
attributes; no existing value changes), INV-107 confirm-only memory
writes, INV-102 simulated labelling, prompt budget and suppression
remain core-owned and untouched.

## 2. Action-state model and interaction state machine

### 2.1 Action states (one shared store, every surface subscribes)

```text
idle ──command──▶ working ──result──▶ updated ──▶ settled
                     │                   │
                     ├─needs input─▶ needs-confirmation ──confirm──▶ updated
                     │                   └──reject──▶ idle (no change)
                     └──failure──▶ degraded (honest notice, home unchanged)
updated/needs-confirmation ──Undo (window)──▶ previous home state restored
```

- `working` substates: `comparing` when the result is an option set
  (leave-later comparison, re-ranked lunch candidates).
- Every transition is a real state change driven by preparer output —
  no decorative thinking animation divorced from work. `working`
  shows what is being recomputed (e.g. "Comparing departure options").
- **Undo** restores the exact prior home composition and plan state;
  it never un-writes a confirmed memory fact (that stays governed by
  the Me surface, INV-107).

### 2.2 Interaction states

```text
HOME ──tap ask bar──▶ CONVERSATION (full page, context + history kept)
CONVERSATION ──send executable command──▶ PROCESSING ──▶ auto-collapse ──▶ HOME (updated)
CONVERSATION ──send question/discussion──▶ CONVERSATION (answer in place, stays open)
CONVERSATION ──confirmation required──▶ CONVERSATION (stays; confirm/reject inline)
CONVERSATION ──pin──▶ CONVERSATION (pinned; no auto-collapse until unpinned)
CONVERSATION ──Esc / back / close──▶ HOME (focus returns to the ask bar)
```

Smart auto-collapse rules (exhaustive):

| Situation | Behaviour |
|---|---|
| Executable command with a determinate result (leave later, take the bus, re-rank lunch) | Collapse to updated home |
| Result is `needs-confirmation` (preference save, permission) | Stay open until confirm/reject |
| Long-form answer, Why explanation, or multi-turn discussion | Stay open |
| Unsupported ask | Stay open with the honest capability answer (§3) |
| User pinned the conversation | Never auto-collapse |
| Degraded/failure | Stay open with the notice; home provably unchanged |

Platform rules: on open, focus moves into the conversation input;
on collapse/close, focus returns to the ask bar. Esc and system back
close. The soft keyboard must not cover the latest message or the
composer (safe-area insets; the message list scrolls, the composer
docks above the keyboard). All transitions honour
`prefers-reduced-motion`: cross-fades/slides become instant state
swaps, and no information is carried by motion alone.

### 2.3 "This time only" vs "Remember → Confirm"

An adjust inside conversation defaults to **this time only** (the
current plan changes; memory does not). Choosing **Remember** creates
a `pending` MemoryFact proposal; the conversation stays open in
`needs-confirmation` until the user confirms or rejects — the exact
PH-001 boundary (INV-107), now reachable from chat as well as cards.
Nothing is ever written on send alone.

**Override mechanism (exact, no forgery).** The depart and lunch
preparers read only `status === "confirmed"` memory facts and fail
closed otherwise (verified in `src/plugins/depart/preparer.ts`).
A this-time-only command therefore travels as a **plugin-level
request override**, never as memory or signal data:

```ts
UserRequestOverride {
  kind: "leave_later" | "route_preference" | "lunch_filter",
  deltaMinutes?, mode?, filters?,
  provenance: { source: "user_request", at, scope: "this_time_only" }
}
```

- The UI action-state store holds the override, session-scoped. The
  plugin's concrete preparer exposes an extended entry (e.g.
  `prepareWithRequest(candidate, snapshot, memory, override)`)
  alongside its core-contract `prepare`; core contracts are not
  modified. For `leave_later`, the chosen departure shifts by
  `deltaMinutes` and prepare shifts equally; the arrival margin is
  recomputed and shown, and a delta that arrives after the
  appointment start yields `needs-confirmation`, never a silent
  late plan. For lunch, filters re-rank fixture candidates.
- The resulting plan carries the override in its Why as
  **"Because you asked: leave 15 min later · this time only"** —
  visually and structurally distinct from confirmed-fact evidence.
- Forbidden, explicitly: synthetic `MemoryFact`s, fake snapshot
  signals, any status forging. Overrides are **never persisted**
  (storage is not written), and **Undo clears the override** and
  restores the pre-command plan.
- Gate test (negative): after a this-time-only command, storage
  contains no new or changed confirmed fact, and Why shows the
  `user_request` provenance. This test is part of slice V2a's gate.

## 3. Closed command grammar (offline, deterministic, model off)

A small closed grammar parsed deterministically in
`src/ui/conversation/grammar.ts`. Anything outside it receives an
honest capability answer (what this demo *can* do), never a faked
execution. The parser is total: every input maps to exactly one
intent or to `UNSUPPORTED`.

| Intent | Example utterances | Slots | Effect (via existing preparers) |
|---|---|---|---|
| `LEAVE_LATER` | "Can I leave later?" / "Leave 15 minutes later" | optional delta minutes | Recompute depart options; home enters `working/comparing`, then shows the comparison (new prepare/leave, arrival margin) for confirm |
| `CHANGE_ROUTE` | "Take the bus" / "Change route to driving" | mode ∈ fixture modes (bus, drive) | Select the fixture mode option; times from the engine, never invented |
| `FIND_LUNCH` | "Find a quieter vegetarian lunch spot" / "Find a lunch spot" | filters ⊆ {quieter, vegetarian, nearer} | Re-rank fixture places by fixture attributes; ≤3 options with per-option Why |
| `WHY` | "Why?" / "Why this one?" | — | Opens the Why view for the current plan (stays in conversation) |
| `ACCEPT` / `UNDO` | "Looks good" / "Undo" | — | Same semantics as the card buttons |
| `UNSUPPORTED` | anything else | — | Honest answer: states the demo's actual capabilities and offers the closest supported action |

Grammar rules: case-insensitive; slot values must resolve against
fixture data (an unknown mode or filter is `UNSUPPORTED`, not a
guess). No free-form entity extraction: places, times, and ratings
come only from fixtures/preparer output (INV-103).

**Model seam (future, owner-gated):** the grammar sits behind a
`CommandInterpreter` interface in the UI layer. Muse Spark
constrained reasoning may later implement the same interface —
mapping utterances to the same closed intent set with schema
validation and fact checking — behind the existing S1 owner gate.
It may widen *coverage* of phrasings; it may not widen the intent
set, originate facts, or become a copywriter. The state machines in
§2 do not change when the interpreter is swapped.

## 4. Scene-driven home and view models

Home composition is driven by the current scene's information value:
the most informative carrier (map, photo cards, timeline, option
cards) gets the space; there is no fixed map/chat ratio and no
permanent dual-column layout. Mobile gets its own dynamic home;
desktop expands the conversation on demand.

| View model | Derived from | Rules |
|---|---|---|
| `TimelineVM` | PreparedPlan steps + signal times | All times from the engine/fixtures with provenance chips |
| `OptionCardVM` | Preparer options (depart modes, lunch places) | Ranking reason per option (Why); selected state follows action state |
| `MapVM` | Spatial fixture data only | Rendered only with spatial evidence. Geometry is a **schematic** fixture polyline labelled "Schematic · simulated" — never presented as road-accurate, never copied from concept images |
| `PhotoVM` | Local placeholder assets | Licence-clean local illustrations/SVG placeholders, visibly labelled "Illustration". External image fetching is forbidden |

Both owner loops are expressed entirely in these view models:
(rain) change detected → route preparation → large map/Why →
full-page "leave later" → comparison → confirm → collapse → home,
map, and times updated → Undo; (lunch) proactive card → photos/
candidates/basis → full-page "quieter + vegetarian" → re-ranked
candidates → selected result written back to home. Fixture
provenance rides on every rendered value (INV-101/102).

## 5. Style tokens and component inventory (values PROVISIONAL)

Structure is fixed now; exact values finalize only after R1–R3
arrive (§7). Direction from the text spec: off-white surfaces, deep
green primary, warm and light, refined typographic hierarchy,
natural micro-motion, no generic AI-template card monotony.

```text
color:  surface/off-white · ink · primary/deep-green · accent (sparingly)
        semantic: warn / danger / success (muted, colour-blind safe pairs)
type:   display / title / body / caption / numeric (tabular figures for times)
space:  4pt scale · card padding · section gaps
radius: card / sheet / pill
motion: durations 120/200/320ms, standard + emphasized easing;
        reduced-motion: all transitions collapse to instant swaps
```

Components: AskBar, ConversationSheet (full page), ActionStatusPill
(working/comparing/updated/needs-confirmation), OptionCard,
TimelineCard, MapCard (schematic), PhotoCard (illustration),
WhySheet (existing), ConfirmBar (this-time/remember), UndoToast,
QuietState. Touch targets ≥44px; axe-clean contrast in both themes
of the token set.

## 6. Time plan and cut line

Today 2026-10-28; internal freeze 2026-11-04; external hard
deadline 2026-11-05 11:00 JST. Dual track (Reviewer addendum
msg_0d62f8e2d97f49a2): a usable rough cut with real e2e of both
loops by **11/2**; **11/3–11/4** reserved for re-record and final
polish; if the new UI is what gets recorded, the owner video
recording (SUBMIT plan GATE-V1) happens in that window. Before any
V2 slice lands, a fallback anchor is set: annotated tag
`yori-approved-ui` on the last approved commit (`908abee`) plus a
`VITE_YORI_UI=v1|v2` build flag, so every approved slice leaves a
recordable app and the approved UI is always one flag/tag away.
Slices in `YORI_V2.plan.json` run V-anchor → V0 → V1 → V2a → V2b →
gates → V3 → cut-line check → doc re-sync → V4 closeout, each with
an independent Reviewer gate requiring: core zero diff, golden
10/10, affected e2e + axe, real 390×844 and 1280×800 screenshots,
per-slice recordability, and (for interaction slices) a
home→chat→send→processing→updated-home e2e.

**Cut line (explicit): if the two core loops are not Reviewer-
approved by 2026-11-01 noon JST, stop V2 UI work and record the
already-approved PH-001/PH-002 UI.** The fallback is a decision
point in the plan, not an improvisation.

## 7. Blocked visual finalization and image channel

R0–R3 are not on this Mac and the Bridge cannot carry binaries.
**Proposed private channel:** the owner/coordinator places the four
PNGs at `docs/design/v2-reference/` in this repo (local filesystem
drop). **Verifiable receipt:** on arrival the Architect replies in
the architect chat lane with each file's SHA-256 and byte size, so
the sender can confirm integrity before any token/layout value is
finalized against them. Until then: token values and layout
specifics stay PROVISIONAL, visual-dependent acceptance in the plan
is gated on the reference-arrival task, and no concept image is
described as an implemented screen.
