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

## 5. Style tokens and component inventory (values FINAL, measured from references 03, 02, 01)

OWNER_REF_GATE is **MET (approved 2026-10-29, decision `fa9b78f3`)**. Every token value below is **FINAL** and directly measured from reference frames `03_mobile_experience_v1_approved.png` (primary mobile visual direction), `02_mobile_scenario_flow_approved.png` (storyboard flow & alert cards), and `01_desktop_living_context_concept.png` (desktop aesthetic & information density). No token value is invented or recalled.

### 5.1 Token System Table

| Token Category | CSS Variable | Final Value | Status | Source Frame | Measured Region / Element | Design Role & Invariant |
|---|---|---|---|---|---|---|
| **Color: Ground** | `--color-ground` | `#F8F8F5` | FINAL | `03` (primary), `01` | Frame 1 backdrop (x: 170, y: 150), `01` desktop canvas | Warm ivory/off-white background surface |
| **Color: Card Surface** | `--color-card-bg` | `#FFFFFF` | FINAL | `03` | Frame 1 main card body (x: 240, y: 320) | Crisp neutral white for primary content cards |
| **Color: Card Alt Surface** | `--color-card-muted-bg` | `#F4F7F4` | FINAL | `03`, `02` | Frame 1 candidate/art container (x: 230, y: 460) | Soft muted container/sub-card surface |
| **Color: Border** | `--color-card-border` | `#E1E6E0` | FINAL | `03`, `01` | Frame 1 card stroke (x: 186, y: 320) | Subtle light border preventing heavy strokes |
| **Color: Primary Ink** | `--color-ink` | `#162824` | FINAL | `03`, `01` | Frame 1 greeting headline "Good afternoon" | Deep dark green-tinted charcoal (>10:1 contrast) |
| **Color: Muted Ink** | `--color-muted` | `#384A43` | FINAL | `03` | Frame 1 subtitle & metadata labels | Neutral dark sage; WCAG AAA (>6.2:1 contrast) |
| **Color: Tertiary Ink** | `--color-tertiary` | `#5A6D66` | FINAL | `03`, `02` | Frame 2 auxiliary timestamps & footnotes | Subtle metadata text (>4.5:1 contrast) |
| **Color: Primary CTA** | `--color-primary-btn` | `#16382F` | FINAL | `03` (primary), `01` | Frame 1 mode pill & button, `01` top bar | Deep forest green brand primary |
| **Color: Primary Hover** | `--color-primary-btn-hover` | `#0E2923` | FINAL | `03` | Measured 10% dark shade of primary green | Interactive press/hover state |
| **Color: Primary Text** | `--color-primary-text` | `#FFFFFF` | FINAL | `03` | Text on primary button/badge | Pure white on deep green (>12:1 contrast) |
| **Color: Accent / Polyline** | `--color-accent` | `#2F6F64` | FINAL | `03`, `02` | Frame 1 route polyline & active pill border | Sage teal interactive accent |
| **Color: Map Surface** | `--color-map-bg` | `#E9F1E8` | FINAL | `02` | Frame 2 schematic map panel (x: 770, y: 512) | Soft organic green terrain background |
| **Color: Weather Banner** | `--color-weather-banner-bg` | `#E3EFFD` | FINAL | `02` | Frame 1 rain alert banner (x: 355, y: 205) | Calm sky-blue notification surface |
| **Color: Weather Border** | `--color-weather-banner-border`| `#BDD7F5` | FINAL | `02` | Frame 1 alert banner stroke | Soft blue container border |
| **Color: Weather Text** | `--color-weather-banner-text`| `#1E4268` | FINAL | `02` | Frame 1 rain notice title ink | Deep slate blue text (>7.2:1 contrast) |
| **Color: Chip Surface** | `--color-chip-bg` | `#E2EAE5` | FINAL | `03` | Frame 1 filter pill & tag background | Light sage background for status pills |
| **Color: Chip Border** | `--color-chip-border` | `#CAD6D0` | FINAL | `03` | Frame 1 filter pill stroke | Pill border line |
| **Color: Chip Text** | `--color-chip-text` | `#16382F` | FINAL | `03` | Frame 1 filter pill text | Deep green chip label ink |
| **Color: Notice / Warn** | `--color-notice-bg` | `#FEF7ED` | FINAL | `03`, `02` | Warning callout background | Muted amber warning box |
| **Color: Notice Border** | `--color-notice-border` | `#F7D7A4` | FINAL | `03`, `02` | Warning callout border | Muted amber border |
| **Color: Notice Text** | `--color-notice-text` | `#78350F` | FINAL | `03`, `02` | Warning callout text | Deep amber text (>6.8:1 contrast) |
| **Color: Error Surface**| `--color-error-bg` | `#FEF2F2` | FINAL | `03` | Error message panel | Muted coral/red surface |
| **Color: Error Border** | `--color-error-border` | `#FECACA` | FINAL | `03` | Error message border | Muted coral border |
| **Color: Error Text** | `--color-error-text` | `#991B1B` | FINAL | `03` | Error message text | Deep red text (>7.5:1 contrast) |
| **Type: Serif Accent** | `--font-display` | `"Newsreader", Georgia, Cambria, "Times New Roman", serif` | FINAL | `03` | Frame 1 greeting headline "Good afternoon" | Editorial serif for personal greetings |
| **Type: Sans Body** | `--font-sans` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | FINAL | `03`, `02`, `01` | Card headers, body copy, chips, buttons | Crisp, legible interface sans |
| **Type: Numeric** | `font-variant-numeric: tabular-nums` | `tabular-nums` | FINAL | `03`, `02` | Timeline times, durations, departure hours | Monospaced digits preventing layout jitter |
| **Type Scale: Display** | `--text-display` | `1.875rem` (mobile) / `2.75rem` (desktop) | FINAL | `03`, `01` | Frame 1 main greeting | Display greeting size (line-height 1.25) |
| **Type Scale: Title** | `--text-title` | `1.25rem` (20px) | FINAL | `03` | Frame 1 card titles (NOW, Candidate names) | Card title heading (line-height 1.3) |
| **Type Scale: Body** | `--text-body` | `0.9375rem` (15px) - `1rem` (16px) | FINAL | `03` | Frame 1 narrative & step descriptions | Primary reading text (line-height 1.5) |
| **Type Scale: Caption**| `--text-caption` | `0.75rem` (12px) - `0.8125rem` (13px) | FINAL | `03` | Tags, chips, timestamps, provenance notes | Metadata & chips (line-height 1.4) |
| **Radius: Card** | `--radius-card` | `18px` | FINAL | `03` | Frame 1 primary cards (NOW, Map, Candidates)| Measured card corner radius |
| **Radius: Sheet** | `--radius-sheet` | `24px` | FINAL | `03` | Full-page conversation overlay & modals | Measured expanded sheet top corners |
| **Radius: Button** | `--radius-btn` | `12px` | FINAL | `03` | Rectangular action buttons & mode tabs | Soft rounded action button radius |
| **Radius: Pill / Chip** | `--radius-pill` | `9999px` | FINAL | `03`, `02` | AskBar, mode pills, habit tags, status | Full rounded capsule/pill shape |
| **Elevation: Subtle** | `--shadow-subtle` | `0 2px 8px rgba(22, 56, 47, 0.05), 0 1px 2px rgba(22, 56, 47, 0.03)` | FINAL | `03` | Frame 1 card elevation | Soft organic green-tinted shadow |
| **Elevation: Floating**| `--shadow-floating` | `0 12px 36px rgba(22, 56, 47, 0.12), 0 2px 8px rgba(22, 56, 47, 0.06)` | FINAL | `03`, `01` | Conversation sheet & ask bar elevation | Floating overlay depth |
| **Space: Grid Scale** | `--space-1` to `--space-8` | `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px` | FINAL | `03`, `02` | Card paddings (20px), gaps (16px), margins | Strict 4pt/8pt spatial layout rhythm |
| **Touch Target** | `min-height / min-width` | `44px` | FINAL | WCAG / iOS Human Interface Guidelines | All interactive buttons, tabs, links, chips | Touch-accessible hit target at 390x844 |
| **Motion: Micro** | `--duration-micro` | `120ms` | FINAL | Interaction spec | Button click, toggle, chip selection | Micro feedback duration |
| **Motion: Medium** | `--duration-medium` | `200ms` | FINAL | Interaction spec | Accordion expand, card highlight, fade in | Component transition duration |
| **Motion: Page / Modal**| `--duration-page` | `320ms` | FINAL | `02` storyboard | Sheet slide up/down, route mode switch | Structural sheet transition duration |
| **Motion: Standard Ease**| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | FINAL | Interaction spec | Natural deceleration curve | Standard motion easing curve |
| **Motion: Emphasized** | `--ease-emphasized`| `cubic-bezier(0.05, 0.7, 0.1, 1)` | FINAL | Interaction spec | Sheet entrance with organic settle | Fluid spring-like curve |
| **Motion: Reduced** | `@media (prefers-reduced-motion)`| `0.001ms !important` | FINAL | A11y invariant | All selectors under prefers-reduced-motion | Instant swaps; zero information lost |

### 5.2 Component Inventory & Interaction Polish

Components:
- `AskBar`: Docked input trigger above navigation with subtle green elevation, pill radius (`9999px`), touch target `48px`.
- `ConversationSheet`: Full-page fluid conversation on mobile (radius `24px`), floating centered card on desktop (max-width `680px`), animated with standard easing (`320ms`).
- `ActionStatusPill`: Dynamic badge reflecting engine & execution status (`working`, `comparing`, `updated`, `needs-confirmation`).
- `OptionCard`: Route options & transit modes with selected state indicator, basis provenance tag, and 44px touch targets.
- `TimelineCard`: Time-sequenced step list with tabular numeric alignment, event node dots, and dynamic buffer pills.
- `MapCard`: Schematic street grid with labelled `Schematic · simulated` disclaimer, route polylines (`#2D6A4F`), and weather badge.
- `PhotoCard`: Local SVG illustrations (`ramen`, `salad`, `sushi`, `cafe`, `italian`) with `Illustration · simulated` chip.
- `WhySheet`: Modal drawer explaining decision evidence, provenance tags (You confirmed vs Demo profile · sample), and derivation.
- `ConfirmBar`: Interactive review action bar with adopt/remember options.
- `UndoToast`: Transient undo banner with 44px dismiss/revert action.
- `QuietState`: Refined zero-interruption card with calm typography and sage icon.

Touch targets are strictly ≥44px for all interactive elements at 390×844; axe-clean contrast in both themes of the token set. Reduced motion collapses all transitions to instant swaps without layout shifts or data loss.

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

## 8. Amendment Rev3 — verified references folded in (ARCH-V2-002)

Arrival receipt (Architect-verified by opening every file, not
transcribed): all four PNGs and the handoff doc are at
`docs/design/v2-reference/`, SHA-256 and dimensions exactly matching
the coordinator manifest (`00 9b11cb66…bd396 1537×834`,
`01 7c7f6fc6…0a7a 1448×1086`, `02 efa2d9b6…c317 1536×1024`,
`03 257a988c…403b 1672×941`, handoff `116f0742…`). The images are
git-excluded concept art and are never committed. `03` is the
primary visual reference, supported by `02` (storyboard) and `01`
(desktop). OWNER_REF_GATE is therefore **arrived**; token values in
§5 are now derived from the references (ivory/off-white surfaces,
deep green primary, serif display greeting, rounded cards with soft
elevation, green primary action buttons, pale blue rain banner) and
are finalized in slice V3 with side-by-side evidence.

Decisions added by this amendment (slices in `YORI_V2.plan.json`):

- **D1 Detail views (new slice V1b, after V1).** Rain: TripDetail
  with mode tabs (drive, bus; walk only if a fixture exists), large
  schematic map, current/recommended plan row, "Why this plan?".
  Lunch: RestaurantDetail with a local labelled illustration,
  attribute chips, Save, and in-app Directions showing the schematic
  route only — external maps are never opened. `TripDetailVM` /
  `RestaurantDetailVM` join §4. Back navigation returns focus to the
  originating card.
- **D2 Nav decided.** Bottom nav is **Home / Plans / For You / Me**
  — four tabs, every one functional (Plans = upcoming AHEAD list;
  no Explore, since no explore surface exists). The ask bar
  ("Ask Yori anything…") docks above the nav. No disabled
  placeholders anywhere; **no mic icon** (voice input does not
  exist in the demo).
- **D3 Honest processing copy.** Working-state copy names the actual
  recomputation and never claims real-time data:
  "Checking forecast · simulated", "Comparing departure options",
  "Updating your plan". The reference wording ("Checking real-time
  weather/traffic") is explicitly not adopted.
- **D4 Data honesty (gate-enforced).** Only fixture values render:
  appointment 3:00 PM, drive 25 min, bus 40 min, buffer/prep from
  confirmed facts. The references' own numbers (02: 28/32/40;
  03: 44/52/18) are concept artefacts and are never copied. Star
  ratings and review counts are **omitted** (fixture attributes —
  quiet, vegetarian, distance — show instead). Restaurant names are
  fictional fixture data, labelled. Weather values (temperature)
  come only from the mock weather fixture, labelled. The Yori
  avatar is a **mark/logo, never a person's photo**. The chat header
  reads **"Offline demo · simulated"**, never "Online".
- **D5 Desktop conversation.** On desktop the conversation expands
  from the input as a floating/overlay panel (reference 01), never a
  permanent column. Map overlays (rain area, route options with
  durations) and context chips are derived only from plan data.
- **D6 Tokens.** Derived per §5 from `03` (primary), `02`, `01`;
  V3 evidence must include side-by-side comparisons against the
  reference frames.

Time impact: V1b adds ≈5h after V1 and before V2a. The 11/1 noon
cut line is unchanged and remains achievable: V1 is already
executing under rev2, and V2a/V2b simply shift behind V1b.

## 9. Amendment Rev4 — Meta model as constrained decision engine (ARCH-V2-003)

Stage 1 of the hackathon requires a substantive Meta model role.
Rev4 promotes Muse Spark from wording/ranking assistant to the
**decision engine behind the existing server-side ModelPort** —
without widening any fact boundary. Deterministic behaviour remains
the fallback and the demo stays recordable with the model off.

- **R1 Decision engine (amends V2a/V2b).** Behind the existing
  ModelPort (server-side template ids, strict facts schema,
  fact-checker, loopback proxy, key only in `.env.local`), Muse
  Spark implements the `CommandInterpreter` seam: it maps utterances
  to the closed intent set with slots under schema; performs
  situation attribution (which signal changed and why it matters);
  resolves preference/constraint conflicts; and selects and ranks
  candidates **among preparer-produced options only**, with
  enumerated reason codes. Output is schema-validated and
  fact-checked; the model never originates times, places, or facts.
  The deterministic grammar and ranking remain the fallback. The UI
  carries a visible engine status — **"Meta model · live"** vs
  **"Offline fallback · deterministic"** — and a **redacted decision
  log** (template id, input fact ids, output codes, validation
  result; never secrets, never raw personal content) is inspectable.
  Tests replay recorded fixtures; live calls happen only behind the
  S1 owner gate (key + billed-call approval; no credit assumed).
- **R2 Causality goldens (add-only; D1–D6 unchanged).** G-RAIN:
  same user/lesson, clear → rain changes departure and ranking, Why
  cites the weather signal. G-PREF: same city/time, different
  confirmed preferences change the lunch choice and its explanation.
  G-QUIET: nothing needed ⇒ no interruption (suppression recorded).
  Each golden records the full chain: signal → reasoning (model or
  fallback, labelled) → suggestion → confirm → state.
- **R3 Before-you-ask (V2a).** A replayable clear → rain scene
  change transitions the home into the prepared plan with **no
  typing** — a real state transition, reduced-motion safe. This is
  the demo's first 10–20 seconds.
- **R4 Provenance chain (Why, V2a/V2b).** Every cited signal shows
  timestamp, location (demo city), source (provider or simulated
  fixture), and authorization status. No invented roads, distances,
  opening hours, or transit data.
- **R5 Agentic completion.** Accept/confirm changes state visibly;
  XMemo write-back is shown honestly (local-only while X1 is
  unauthorized — cloud success is never claimed); booking, spending,
  or external actions would require explicit confirmation (none
  exist in the demo).
- **R6 Generality evidence (V4).** The AC-EXT-1 grocery-stub
  zero-core-diff code diff and its tests are surfaced in the V4
  evidence and docs, not merely asserted.
- **R7 Rubric mapping (DOC-RESYNC).** A rubric-to-evidence table
  (Impact 30, Meta AI Tooling 25, Demo 25, Technical 20, Best
  Agentic bonus) mapping each criterion to demonstrable evidence; a
  "built during hackathon" statement over commit range
  `f7dd63d..HEAD` (all commits 2026-10-28 JST onward); and a
  feature-delta list.

Time impact: V2a +3h, V2b +1h, DOC-RESYNC +1h, V4 +2h (≈ +7h).
Cut order if the 11/1 noon line tightens: model intent-proposal
breadth (keep candidate ranking) → R7 polish → R3 staging extras.
Never cut: causality goldens, the deterministic fallback, or the
model-vs-fallback honesty status.

## 10. Amendment Rev5 — real-world map/merchant chain (ARCH-V2-004)

Owner requirement (msg_71704251afe4499a): connect Yori to real
nearby merchants, not only UI. Design only; every real-world step
sits behind an explicit owner gate, and the simulated-scenario
switch keeps the recorded demo reproducible without ever passing
simulated data off as live. This amendment **changes a standing
boundary** and says so: PH-001 banned device geolocation outright
(static guard, AC-204-2). Rev5 replaces that blanket ban with a
consented, single-adapter path (INV-111 below); the guard is
rescoped, not removed. See `SPEC_IMPACT_REV5.md`.

### 10.1 Geolocation consent (G-a)

One adapter module owns `navigator.geolocation`; nothing else in
the codebase may reference it (rescoped static guard proves this).
Flow: explicit in-app consent step (what is sent, to whom, why) →
one-shot position with accuracy + timestamp → signals labelled
`source: "real"` with consent scope. Denied, timeout, and stale
(older than the refresh threshold) each degrade to a clear notice
plus a **manual location** option (demo-city or user-typed place).
Discipline: debounce, cached fix, refresh threshold, and a request
budget per session; **no `watchPosition`, ever**. Secure context:
localhost on the Mac is fine; a phone over LAN needs HTTPS, so any
tunnel/deploy is gate **P-HTTPS**.

### 10.2 PlacesProvider seam and provider decision (G-b)

`PlacesProvider` in `src/adapters/providers`, shared by the lunch
detector (real mode) and the new fuel detector. Results carry
`placeId, coords, name, source, fetchedAt`, and opening status
**only when the provider supplies it**. Provider-unavailable is
shown prominently. Merchants, distances, ETAs, and streets are
never fabricated; ETAs come only from a real routing provider
(OSRM, fair-use/terms noted) or are shown as straight-line distance
labelled as such — "fastest" is never claimed without route data.

| Candidate | Cost/key | Obligations | Verdict |
|---|---|---|---|
| OpenStreetMap Overpass | Free, no key | ODbL attribution; fair-use rate limits; coordinates still disclosed to a third party (gate P-LOC) | **Recommended first**: no billing gate, demo can run free |
| Google Places API (New) | Billed; key + billing account (gate P-BILL) | Key server-side behind the loopback proxy only; field-masked Nearby Search (`restaurant`, `gas_station`) | Owner-gated alternative if data quality demands it |

### 10.3 Fuel plugin and FIND_FUEL (G-c)

A `fuel` plugin (detector + preparer + adapter) demonstrating the
AC-EXT-1 extension path with real data: zero `src/core` diff, same
as grocery-stub. The closed grammar gains `FIND_FUEL`
("gas" / "find gas" / "加油"). Disambiguation is explicit: "加油"
also means encouragement, so the intent fires only with travel/
location context or an explicit station reference; when ambiguous,
the conversation asks ("Did you mean: find a gas station?") in the
`needs-confirmation` state instead of guessing.

### 10.4 Navigate handoff (G-d)

Only on a user click, never auto-launched. Auditable URL builders,
unit-tested for exact coordinates and encoding: Google Maps
`https://www.google.com/maps/dir/?api=1&destination=<lat,lng>` (or
`destination_place_id`, `travelmode=driving`; no key) and Apple Maps
`https://maps.apple.com/?daddr=<lat,lng>&dirflg=d`, with
iOS/Android/desktop fallback selection.

### 10.5 Proactive lunch on real POIs (G-e)

GPS fix + local mealtime + MemoryPort preferences (XMemo only if
X1 is authorized; otherwise local and labelled) + nearby candidates
from PlacesProvider. Muse Spark (behind S1, Rev4 rules) ranks and
explains; the deterministic ranking is the fallback; shared
suppression prevents duplicate reminders. Open-now, ratings, and
route times render **only with provider evidence** — this is the
real-data counterpart of Rev3's fixture honesty, and real results
are labelled with source + `fetchedAt`, never blended with
simulated cards.

### 10.6 Owner gates and invariants

Gates, never assumed: **P-LOC** (send device coordinates to the
chosen provider, and which provider), **P-BILL** (Google Places key
+ billing, if chosen), **P-HTTPS** (tunnel/deploy for phone
testing), **S1** (model key + billed calls), **X1** (XMemo auth).
New invariant **INV-111**: device coordinates are obtained only
through the single consent-gated adapter, one-shot, budgeted, and
leave the device only to the P-LOC-approved provider; the demo's
simulated switch disables the whole real chain. Slices (plan):
GEO consent → PLACES+FUEL+NAVIGATE (no key needed, first) →
REAL-LUNCH. Time impact ≈ 15h after V2b; against the 11/1 noon cut
line these slices are **first in the cut order** — the line protects
V2a/V2b, and Rev5 work never delays the recordable simulated demo.

Dependency correction (Rev5 rev2): acquiring a consented location
discloses nothing to third parties, so V5-GEO and V5-FUEL build and
test **without** waiting for P-LOC, against mocked geolocation and
a recorded/simulated Places fixture (labelled). Only the live
provider call discloses coordinates; it sits in the separate small
slice **V5-LIVE-POI** behind GATE-P-LOC, which also collects the
real-run evidence. V5-LUNCH likewise does not wait for P-HTTPS
(localhost is a secure context); phone evidence is optional and
applies only if P-HTTPS is DONE. Release order after the cut-line
check: **V3 → DOC-RESYNC → V4 first** (recordable demo), with the
V5 chain interleaved only while time permits before the 11/4
freeze — the coordinator decides the interleaving at the
CUTLINE_CHECK_V2 decision point.

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

### 7.1 OWNER_REF_GATE Executor Receipt (2026-10-29)

Executor verified all five reference files at `docs/design/v2-reference/`:
- `00_current_yori_baseline.png`: SHA-256 `9b11cb6633edba5f14dccbfa04798e7bc76241cde6a8ac499f1ee51ae3bbd396`, 1537×834
- `01_desktop_living_context_concept.png`: SHA-256 `7c7f6fc637dd4db5ce8dc1ae9067c0270163de8a8fb651c46133141a67320a7a`, 1448×1086
- `02_mobile_scenario_flow_approved.png`: SHA-256 `efa2d9b61ecb575a68ff0b5971cf736946c79ea1253e4feeabed14e6d327c317`, 1536×1024
- `03_mobile_experience_v1_approved.png`: SHA-256 `257a988c9ad14eb5e650ae15e09b032e6ff1590d62564207e3b4e33dc7b9403b`, 1672×941
- `YORI_LIVING_CONTEXT_V2_UI_HANDOFF.md`: SHA-256 `116f07422cc6c1b03b8116603305b1c3b0916e9f881c6f1a935562f11b975747`

All names, hashes, and pixel dimensions match the plan exactly with zero mismatch. Git status, `git ls-files`, and `git log` confirm zero staged or committed reference files; files remain strictly git-excluded (.git/info/exclude). OWNER_REF_GATE is fulfilled (passed).

## 11. Cut-Line Decision Record (CUTLINE_CHECK_V2)

- **Date:** 2026-10-29 (evaluated ahead of the 2026-11-01 12:00 JST deadline).
- **Gate Results & Reviewer Decisions:**
  - **V2a-1:** Approved (decision `fcfaf197` @ commit `0f9f5d7`).
  - **V2a-2:** Approved (decision `ccd3c033` @ commit `d8b4a3f`).
  - **V2b:** Approved (decision `a08c3164-792d-4217-a23d-243012f9e7ef` on review request `8d3dbbfd-3526-4a6b-b01f-1c0809e9ec47` @ commit `f3d3740`).
- **Outcome:** **CONTINUE** with Living Context V2 UI. Both core loops (leave-later/transit switch and lunch filter/re-rank) are formally Reviewer-approved with zero core diff, causality goldens (G-RAIN, G-PREF, G-QUIET), and full Playwright e2e passes. No fallback to the `yori-approved-ui` (V-ANCHOR) is required.
- **Release Order:** `V3 → DOC-RESYNC → V4` first (recordable demo), with the V5 chain (`V5-GEO → V5-FUEL → V5-LIVE-POI / V5-LUNCH`) interleaved only while time permits before the 2026-11-04 freeze.
- **Coordinator Interleaving:** Default order stands unless the coordinator explicitly instructs otherwise.
- **Milestone Schedule Targets:**
  - Rough-cut target: real e2e of both loops usable by **2026-11-02**.
  - Re-record & final polish window: **2026-11-03 – 2026-11-04**.
  - Internal freeze: **2026-11-04**.
  - External deadline: **2026-11-05 11:00 JST**.
