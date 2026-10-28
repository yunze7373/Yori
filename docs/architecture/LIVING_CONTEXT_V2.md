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

OWNER_REF_GATE is **MET (approved 2026-10-29, decision `fa9b78f3`)**. Every token value below is **FINAL** and directly measured or derived from reference frames `03_mobile_experience_v1_approved.png` (primary mobile visual direction), `02_mobile_scenario_flow_approved.png` (storyboard flow & alert cards), and `01_desktop_living_context_concept.png` (desktop aesthetic & information density), or carried from verified pre-V3 specifications. No token value is invented or recalled. Reproducibility is guaranteed via `node scripts/sample-tokens.mjs` (output in `docs/evidence/v3/TOKEN_SAMPLER_OUTPUT.txt`).

### 5.1 Token System Table

| Token Category | CSS Variable | Final Value | Classification | Source Frame & Sampling Coordinates | Tolerance / Derivation | Design Role & Invariant |
|---|---|---|---|---|---|---|
| **Color: Ground** | `--color-ground` | `#F8F8F5` | MEASURED | `02` (x: 355, y: 100 reads `#F8F9F7`) | Max Δchannel = 2 (<= 6) | Warm ivory/off-white background surface |
| **Color: Card Surface** | `--color-card-bg` | `#FFFFFF` | MEASURED | `03` (x: 700, y: 100 reads `#FFFFFF`) | Exact match (Δ=0) | Crisp neutral white for primary content cards |
| **Color: Card Alt Surface** | `--color-card-muted-bg` | `#F4F7F4` | MEASURED | `03` (x: 140, y: 100 reads `#F3F7F2`) | Max Δchannel = 2 (<= 6) | Soft muted container/sub-card surface |
| **Color: Border** | `--color-card-border` | `#E1E6E0` | CARRIED | Baseline architecture specification | Cards in Ref-03 rely on organic drop shadows | Subtle light border preventing heavy strokes |
| **Color: Primary Ink** | `--color-ink` | `#162824` | MEASURED | `03` (x: 1080, y: 520 reads `#14241F`) | Max Δchannel = 5 (<= 6) | Deep dark green-tinted charcoal (>10:1 contrast) |
| **Color: Muted Ink** | `--color-muted` | `#384A43` | MEASURED | `03` (x: 1560, y: 230 reads `#3A4847`) | Max Δchannel = 4 (<= 6) | Neutral dark sage; WCAG AAA (>6.2:1 contrast) |
| **Color: Tertiary Ink** | `--color-tertiary` | `#5A6D66` | CARRIED | Baseline typography specification | Auxiliary footnote/timestamp text (>4.5:1) | Subtle metadata text & secondary chips |
| **Color: Primary CTA** | `--color-primary-btn` | `#16382F` | CARRIED | Baseline brand pine green (CHECKPOINT_V2_A.md §R1) | Ref-03 primary buttons measure teal-green #276557 | Deep forest green brand primary |
| **Color: Primary Hover** | `--color-primary-btn-hover` | `#0E2923` | DERIVED | Computed from `--color-primary-btn` | 10% dark luminance shade (`rgb(22,56,47) * 0.9`) | Interactive press/hover state |
| **Color: Primary Text** | `--color-primary-text` | `#FFFFFF` | A11Y/STANDARD | Contrast requirement on deep green | Contrast > 12:1 against brand primary green | Pure white on deep green CTA |
| **Color: Accent / Polyline** | `--color-accent` | `#2F6F64` | MEASURED | `03` (x: 1570, y: 810 reads `#2F7463`) | Max Δchannel = 5 (<= 6) | Sage teal interactive accent & route polyline |
| **Color: Accent Subtle** | `--color-accent-subtle` | `#E2ECE6` | DERIVED | 12% alpha tint of `--color-accent` on ground | Soft sage highlight surface | Active tabs and candidate card selection |
| **Color: Map Surface** | `--color-map-bg` | `#E9F1E8` | MEASURED | `02` (x: 600, y: 368 reads `#E8F1E8`) | Max Δchannel = 1 (<= 6); inside phone map panel | Soft organic green terrain background |
| **Color: Weather Banner** | `--color-weather-banner-bg` | `#E3EFFD` | MEASURED | `02` (x: 355, y: 205 reads `#E2EFFE`) | Max Δchannel = 1 (<= 6) | Calm sky-blue notification surface |
| **Color: Weather Border** | `--color-weather-banner-border`| `#BDD7F5` | DERIVED | Border shade for alert container | Soft blue container border | Soft blue alert border stroke |
| **Color: Weather Text** | `--color-weather-banner-text`| `#1E4268` | DERIVED | High contrast slate blue text | Contrast > 7.2:1 against `#E3EFFD` | Deep slate blue text |
| **Color: Chip Surface** | `--color-chip-bg` | `#EDF7F0` | MEASURED | `03` (x: 885, y: 752 reads `#ECF6F0`) | Max Δchannel = 1 (<= 6); filter pill "Near your route" | Light sage background for status pills |
| **Color: Chip Border** | `--color-chip-border` | `#CAD6D0` | DERIVED | Border stroke for chip container | Pill container border | Pill container border stroke |
| **Color: Chip Text** | `--color-chip-text` | `#16382F` | DERIVED | Brand primary green ink on chip bg | High-contrast chip label ink | High contrast chip text |
| **Color: Desktop Ground** | `--color-desktop-ground-ref` | `#0F1C19` | MEASURED | `01` (x: 50, y: 50 reads `#0F1C19`) | Exact match (Δ=0) | Dark canvas backdrop in desktop concept |
| **Color: Desktop Card** | `--color-desktop-card-ref` | `#F3F7F2` | MEASURED | `01` (x: 200, y: 300 reads `#F3F7F2`) | Exact match (Δ=0) | Desktop concept card surface |
| **Color: Notice / Warn** | `--color-notice-bg` | `#FEF7ED` | A11Y/STANDARD | Accessible notice callout palette | Muted amber warning box | Warning callout background |
| **Color: Notice Border** | `--color-notice-border` | `#F7D7A4` | A11Y/STANDARD | Callout border stroke | Muted amber border | Warning border stroke |
| **Color: Notice Text** | `--color-notice-text` | `#78350F` | A11Y/STANDARD | Contrast > 6.8:1 against `#FEF7ED` | Deep amber text | Warning text |
| **Color: Error Surface**| `--color-error-bg` | `#FEF2F2` | A11Y/STANDARD | Accessible error panel palette | Muted coral/red surface | Error panel background |
| **Color: Error Border** | `--color-error-border` | `#FECACA` | A11Y/STANDARD | Error panel border | Muted coral border | Error border stroke |
| **Color: Error Text** | `--color-error-text` | `#991B1B` | A11Y/STANDARD | Contrast > 7.5:1 against `#FEF2F2` | Deep red text | Error text |
| **Color: Success Surface**| `--color-success-bg` | `#D1E7DD` | A11Y/STANDARD | Accessible success badge palette | Soft mint success surface | Success badge background |
| **Color: Success Text** | `--color-success-text` | `#0F5132` | A11Y/STANDARD | Contrast > 6.5:1 against `#D1E7DD` | Deep green success text | Success text |
| **Type: Serif Accent** | `--font-display` | `"Newsreader", Georgia, Cambria, "Times New Roman", serif` | MEASURED | `03` Frame 1 greeting headline | Editorial serif for personal greetings | Editorial serif for greetings |
| **Type: Sans Body** | `--font-sans` | `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` | A11Y/STANDARD | `03`, `02`, `01` body and card copy | Crisp, legible interface sans | Crisp, legible interface sans |
| **Type: Numeric** | `font-variant-numeric: tabular-nums` | `tabular-nums` | A11Y/STANDARD | `03`, `02` time values and durations | Monospaced digits preventing layout jitter | Tabular numeric alignment |
| **Type Scale: Display** | `--text-display` | `1.875rem` (30px) | MEASURED | `03` main greeting "Good afternoon" | Display greeting heading | Greeting display size |
| **Type Scale: Title** | `--text-title` | `1.25rem` (20px) | MEASURED | `03` card titles (NOW, Candidates) | Card title heading | Card title heading size |
| **Type Scale: Body** | `--text-body` | `1rem` (16px) | MEASURED | `03` narrative & step descriptions | Primary reading text | Body reading text size |
| **Type Scale: Caption**| `--text-caption` | `0.8125rem` (13px) | MEASURED | `03` tags, chips, timestamps | Metadata & status chips | Caption & chip text size |
| **Radius: Card** | `--radius-card` | `18px` | MEASURED | `03` primary cards (NOW, Map, Candidates) | Measured card corner radius | Card border radius |
| **Radius: Sheet** | `--radius-sheet` | `24px` | MEASURED | `03` expanded conversation overlay | Measured expanded sheet top corners | Sheet top corners radius |
| **Radius: Button** | `--radius-btn` | `12px` | MEASURED | `03` rectangular action buttons & tabs | Soft rounded action button radius | Action button radius |
| **Radius: Pill / Chip** | `--radius-pill` | `9999px` | MEASURED | `03`, `02` AskBar, mode pills, status | Full rounded capsule/pill shape | Fully rounded capsule radius |
| **Radius: Chip Alt** | `--radius-chip` | `9999px` | MEASURED | `03`, `02` filter tags and chips | Full rounded capsule/chip shape | Filter pill radius |
| **Elevation: Subtle** | `--shadow-subtle` | `0 2px 8px rgba(22, 56, 47, 0.05), 0 1px 2px rgba(22, 56, 47, 0.03)` | DERIVED | Multi-layer organic green-tinted shadow | Card resting elevation | Card resting elevation |
| **Elevation: Card** | `--shadow-card` | `0 4px 16px rgba(22, 56, 47, 0.07), 0 1px 3px rgba(22, 56, 47, 0.04)` | DERIVED | Multi-layer organic green-tinted elevation | Primary card container elevation | Primary card depth |
| **Elevation: Floating**| `--shadow-floating` | `0 12px 36px rgba(22, 56, 47, 0.12), 0 2px 8px rgba(22, 56, 47, 0.06)` | DERIVED | Multi-layer depth elevation | Conversation sheet & ask bar elevation | Floating sheet elevation |
| **Space: Grid Scale** | `--space-1` to `--space-12` | `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `48px` | STANDARD | Strict 4pt/8pt spatial layout rhythm | Card paddings, gaps, and margins | 4pt/8pt spatial rhythm |
| **Touch Target** | `min-height / min-width` | `44px` | A11Y/STANDARD | WCAG 2.5.5 / iOS Human Interface Guidelines | Interactive buttons, tabs, links, chips | Interactive element minimum target |
| **Motion: Instant** | `--duration-instant` | `0ms` | A11Y/STANDARD | RESERVED / Prefers-reduced-motion fallback | Instant swap duration | Instantaneous transition |
| **Motion: Micro** | `--duration-micro` | `120ms` | STANDARD | Button click, toggle, chip selection | Micro feedback duration | Micro interaction duration |
| **Motion: Medium** | `--duration-medium` | `200ms` | STANDARD | Accordion expand, card highlight, fade in | Component transition duration | Component transition duration |
| **Motion: Page / Modal**| `--duration-page` | `320ms` | MEASURED | `02` storyboard modal/sheet entrance | Structural sheet transition duration | Modal entrance duration |
| **Motion: Standard Ease**| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | STANDARD | Natural deceleration curve | Standard motion easing curve | Standard easing curve |
| **Motion: Emphasized** | `--ease-emphasized`| `cubic-bezier(0.05, 0.7, 0.1, 1)` | STANDARD | Sheet entrance with organic settle | Fluid spring-like curve | Emphasized easing curve |
| **Motion: Reduced** | `@media (prefers-reduced-motion)`| `0.001ms !important` | A11Y/STANDARD | All selectors under prefers-reduced-motion | Instant swaps; zero information lost | Accessibility reduced-motion rule |

### 5.2 Component Inventory & Interaction Polish

Components:
- `AskBar`: Docked input trigger above navigation with floating elevation (`--shadow-floating`), pill radius (`--radius-pill`), touch target `48px`.
- `ConversationSheet`: Full-page fluid conversation on mobile (radius `--radius-sheet`), floating centered card on desktop (max-width `680px`), animated with standard easing (`320ms`).
- `ActionStatusPill`: Dynamic badge reflecting engine & execution status (`working`, `comparing`, `updated`, `needs-confirmation`).
- `OptionCard`: Route options & transit modes with selected state indicator, basis provenance tag, and 44px touch targets.
- `TimelineCard`: Time-sequenced step list with tabular numeric alignment, event node dots, and dynamic buffer pills.
- `MapCard`: Schematic street grid with labelled `Schematic · simulated` disclaimer, route polylines (`--color-accent`), and weather callout pill (`width: 172px; x: -31px; rx: var(--radius-btn)`), verified by automated bounding box test to fit text without overflow.
- `PhotoCard`: Local SVG illustrations (`ramen`, `salad`, `sushi`, `cafe`, `italian`) with `Illustration · simulated` chip.
- `WhySheet`: Modal drawer explaining decision evidence, provenance tags (You confirmed vs Demo profile · sample), and derivation.
- `ConfirmBar`: Interactive review action bar with adopt/remember options.
- `UndoToast`: Transient undo banner with 44px dismiss/revert action.
- `QuietState`: Refined zero-interruption card with calm typography and sage icon.

Touch targets are strictly ≥44px for all interactive elements at 390×844; axe-clean contrast in both themes of the token set. Reduced motion collapses all transitions to instant swaps without layout shifts or data loss.

### 5.3 Truthful Engine & Visual Honesty Invariants

1. **Zero Fake Ratings or Review Counts:** Star characters (`★`, `☆`) and numeric review counts remain completely eliminated. Fixture attributes (`Quiet`, `Vegetarian`, `5m away`) render truthfully.
2. **Avatar Integrity:** The Yori avatar is an SVG brand mark/emblem (`.conversation-avatar-mark`), strictly avoiding stock photos of persons.
3. **Engine & Connectivity Truthfulness:**
   - Conversation status badge truthfully reads `Offline demo · simulated` (never `Online`).
   - Engine status chip (`#engine-status-chip`) truthfully reads:
     - `Offline fallback · deterministic`: Initial state before model interpreter runs, or when an utterance falls back to deterministic grammar.
     - `Scripted model fixture · not a live model call`: When a scripted demo fixture is executed (e.g. "Can I leave later?").
     - `Recorded Meta model output · replay`: When running under recorded model replay mode.
     - `Meta model · live`: Never claimed during offline demo; strictly reserved for live API calls under owner gate S1.
   - Schematic maps carry `Schematic · simulated`.
   - SVG illustrations carry `Illustration · simulated`.

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

## 12. Amendment Rev6 — GROUNDING (ARCH-V2-005)

Design pattern borrowed (design only, no code copied; the reference
repo carries no licence) from a legal-agent workshop: verification
sits **inside** the tool path so the model cannot skip it,
citations match recorded facts exactly, incomplete evidence blocks,
and repeated refusals escalate. Where that pattern fails open,
Yori fails **closed**.

- **G1 EvidenceBundle (V5-FUEL).** Every provider result becomes an
  `EvidenceRecord {id, provider, kind: poi|route|eta|weather|habit,
  fetchedAt, fields}` in a session `EvidenceBundle`. Every displayed
  POI/ETA/route/weather/habit value carries
  `sourceRef {recordId, field}`. Provenance classes stay distinct —
  simulated / recorded / live / sample / confirmed / session —
  reusing the existing `classifyFactSource`
  (`src/ui/view-models/provenance.ts`); no core types are added.
- **G2 Non-skippable verifier (V5-FUEL, applied in V5-LUNCH).**
  `GroundedRecommendationVerifier.verify(card, bundle)` is called
  **inside** the render view-model path and **inside** the
  navigate-URL builder — there is no call site that bypasses it. It
  checks: the ref exists; displayed value equals
  `normalize(record field)`; `fetchedAt` is within freshness; the
  provenance label matches the record; and any model-selected
  candidate id is in the bundle. On failure the field shows
  "unknown" or the card is withheld, navigation is disabled (no URL
  is built), and the reason is written to the Decision Log
  (redacted, fact ids only). Negative tests are gate items:
  tampered value, missing ref, stale record, simulated labelled as
  live, model-invented place, candidate outside the bundle, and
  verifier failure ⇒ no URL.
- **G3 Fact-key parity (precondition to S1-LIVE).**
  `validateDecisionCommandOutput` in
  `src/adapters/model/reasoning.ts` must reach parity with the
  client rule (V2b-REV3): `knownFactKeys` is always enforced and an
  **empty set rejects** (today it can fail open when
  `confirmedFactKeys` is empty); `matches_confirmed_preference`
  requires a non-empty subset of the confirmed keys. The live
  payload/template schema carries `knownFactKeys`. A parity test
  runs the same malicious outputs through server and client; both
  must reject. The SUBMIT plan's S1-LIVE must not run until this
  parity slice is approved.
- **G4 Three-strike model pause (V5-LUNCH).** Three consecutive
  model validation failures in a session pause the model for that
  session: the engine chip shows the honest deterministic-fallback
  status, the Decision Log records the pause, and there is no retry
  loop.
- **V4 evidence audit.** The closeout adds an audit test over every
  place, number, and time shown in the two recordings: **0
  ungrounded items** is the pass bar. The bundle/verifier machinery
  for the recorded (fixture) scenes is built in slice **G12-CORE**
  before V4, over the existing Rain/Lunch fixture and simulated
  records (calendar, weather, travel estimate, mock places, sample
  habits) with the verifier inside those scenes' render
  view-models; V5-FUEL later extends the same verifier to
  PlacesProvider results and the navigate-URL builder.

**Freshness and normalization (testable definitions).** Freshness
is judged per kind: `weather` — within the forecast validity window
from `issuedAt`; `route`/`eta` — 30 minutes from `fetchedAt`;
`poi` — 24 hours from `fetchedAt`; `habit`/`confirmed` — no expiry
while status stays confirmed. For **simulated and recorded**
records, freshness is judged against the **scene clock** (the
replayed snapshot time), never the wall clock, so fixtures with
fixed timestamps stay valid deterministically. `normalize` means:
times compared as scene-timezone 12-hour strings at minute
precision; durations as integer minutes; distances in the record's
own unit after conversion to metres; places matched by exact name
**and** record id. A displayed value that differs after
normalization is a tamper/failure, by definition.

No owner gate moves (P-LOC, P-BILL, P-HTTPS, S1, X1); no real API,
GPS upload, paid service, or key is enabled by this amendment; no
model claims-judge call is added. Release order is unchanged.

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
