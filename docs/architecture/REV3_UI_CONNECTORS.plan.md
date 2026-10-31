# Rev3 UI — Settings > Connectors, Microinteractions, Agent-Depth Gaps

> Bounded design/plan for ARCH-REV3-UI-CONNECTORS (owner-approved
> Rev3 direction, relayed text-only in msg_6bce11fd; the mockup image
> is unavailable and **no pixel parity is claimed**). Slice 1
> (UI-HOME-QUIET, INBOX-20261031-24FF42) is already dispatched and is
> treated as fixed. This doc covers slices 2–3 and the agent-depth
> gap list. One slice at a time; each UI slice runs the full suite
> (tsc, unit, golden 18, drills 56, full Playwright, privacy) with
> 390×844 and 1280×800 evidence, because the shell is shared.

## Slice 2 — Settings > Connectors

Screen title: **"You control what Yori can access"** (Settings, from
Me). One row per connector: description, live status, and the flows
below. The screen never renders a status it did not just read.

### ConnectorStatus contract (UI adapter layer — NOT `src/core`)

```ts
type ConnectorState =
  | "not_connected"       // available, not yet connected/enabled
  | "permission_needed"   // needs a browser/OS permission decision
  | "connected"           // verified live this session
  | "denied"              // permission refused; recoverable
  | "unavailable"         // no adapter / platform cannot do this
  | "owner_gated";        // implemented but locked behind an owner gate
interface ConnectorStatus {
  id: "location" | "calendar" | "weather" | "xmemo" | "notifications";
  state: ConnectorState;
  detail: string;          // truthful, e.g. "Demo city (Aomori) · simulated"
  source: string;          // where the state was read from, for audit
  updatedAt: string;       // when read
}
interface ConnectorPort {  // UI adapter layer, e.g. src/ui/connectors/
  status(): Promise<ConnectorStatus>;
  connect?(): Promise<ConnectorStatus>;    // user-gesture flows only
  disconnect?(): Promise<ConnectorStatus>;
  revoke?(): Promise<ConnectorStatus>;
}
```

### Rows, truthful sources, flows

| Connector | Truthful source of state | Connect / Manage / Disconnect / Revoke |
|---|---|---|
| Location (GPS) | Browser Permissions API (`geolocation` permission state) **plus** a one-shot `getCurrentPosition` success/failure through the existing consented adapter (INV-111). No fix this session + permission `prompt` ⇒ `permission_needed`; `denied` ⇒ `denied` | Connect: consent step → one-shot fix. Manage: refresh fix, accuracy/timestamp shown. Revoke: forget the in-session fix and show instructions for the browser/OS setting (the app cannot revoke OS permission itself and says so). Never continuous, never `watchPosition` |
| Calendar | **No adapter exists.** State is permanently `unavailable` with detail "Not available yet" | No Connect affordance (a disabled/explanatory row, never a fake toggle). A calendar OAuth adapter is **out of hackathon scope**; if ever pursued it is a separate owner-gated slice with its own privacy review (PH-003 lineage) |
| Weather | `GET /api/weather/status` (exists today: enabled flag, demo-city disclosure, Open-Meteo terms) | Manage: shows enabled/disabled, demo city, terms note. Enabling live weather stays **owner-gated** (GATE-W1 in YORI_SUBMIT_R2): the row shows `owner_gated` while the flag is off, never a user toggle that silently spends or discloses |
| XMemo | Existing `/api/xmemo/status` (composite adapter already keys on `enabled=true && connected=true`); end-user OAuth/PKCE only, **no agent token anywhere** | Connect: starts the PKCE flow (only while GATE-X1 is owner-authorized; otherwise `owner_gated`). Disconnect: clears the local session/tokens and the row re-reads status before claiming disconnected |
| Notifications | `Notification.permission` per platform (`default` ⇒ `permission_needed`, `granted` ⇒ `connected`, `denied` ⇒ `denied`; API absent ⇒ `unavailable`) | Connect: `Notification.requestPermission()` from a user gesture only. Revoke: instructions for the browser/OS setting. No prompt is ever sent from this screen, and the shared prompt budget is untouched |

Negative cases (gate-tested): no phantom `connected` (status is
re-read after every flow and on screen open); a `denied` state is
recoverable (instructions + re-check button that re-reads the real
permission); revoke/disconnect is truthfully reflected (the row
shows the post-action read, not an optimistic claim); with every
flag off, all rows still render their honest states.

Scope/files: new `src/ui/connectors/` (ports + screen), Settings
entry from Me, strings externalized. **Zero `src/core` change**;
status contracts live in the UI adapter layer. Out of scope: any
live enablement (all existing owner gates unchanged), calendar
adapter, background location, notification sending.

Acceptance: full suite per above + connector-specific tests —
mocked Permissions/geolocation/Notification in each state, XMemo
and weather status fixtures (enabled/connected/off), and a
no-phantom-connected audit (every rendered `connected` traces to a
status read in the same session).

## Slice 3 — Microinteractions / action surfaces

Bounded and offline, on the approved action-state machine:

- **Accept / Adjust / Why / Dismiss transitions**: state-driven
  (working → updated / needs-confirmation), visible plan diff on
  update, Undo restores the prior composition; no decorative
  animation detached from real state changes (§2 of the V2 design).
- **Ask composer**: expand → context-aware chat (current plan and
  scene as labelled context) → smart collapse back to **live-
  updating cards** (the home reflects the confirmed result, not a
  static snapshot); pin, Esc/back, focus return, soft-keyboard
  safe-area per the approved state machine.
- **Motion**: tokenized durations/easing; `prefers-reduced-motion`
  collapses every transition to an instant swap; no information
  carried by motion alone.
- **Loading / empty / error states**: one honest pattern per surface
  — skeleton only while actually loading, quiet empty states ("0
  prompts" is a designed state), fail-closed error notices that
  name the degraded capability and keep the prior plan visible.

Scope/files: `src/ui/conversation/`, `src/ui/action-state/`,
living-context styles/presentation. Zero core change. Acceptance:
full suite + interaction e2e (home→chat→send→processing→updated
home, accept/adjust/dismiss/why, reduced-motion run) at both
viewports with screenshots per state.

## Agent-depth gap list (usable agent, not a screenshot makeover)

Mapped to existing audit rows (SUBMISSION_READINESS.md classes and
YORI_V2/YORI_SUBMIT slices). Each item: offline slice vs the
owner-gated live step, and acceptance.

| # | Capability | Audit mapping | Offline slice (now) | Owner-gated live step | Acceptance |
|---|---|---|---|---|---|
| 1 | muse-spark-1.3 bounded contextual decisions (not copy polish) | Spark reasoning: IMPLEMENTED-BUT-OFF; live: LIVE-UNVERIFIED | Decision-engine behaviour over recorded fixtures incl. G-RAIN/G-PREF/G-QUIET causality, fact-check discard path, redacted decision log (approved V2a/Rev4 design) | GATE-S1 (key + billed approval) → S1-LIVE (≤10 calls, pass-rate report; PRE-S1-A/B + G3-PARITY preconditions) | Fixtures reproduce decisions offline; live run bounded and reported; fallback identical with model off |
| 2 | Dwell/geolocation unfamiliar-city lunch (user away from Aomori) | Location: consent adapter approved (V5-GEO); real POIs behind P-LOC | Full loop on fixture/manual LocationPort with recorded POIs (V5-LUNCH pattern): away-from-home detection from dwell-labelled fixture signals, taste-ranked candidates, dedup suppression | GATE-P-LOC (+ P-HTTPS for phone) → V5-LIVE-POI real-run evidence | Offline: card appears only when away + mealtime + not eaten, suppressed on repeat; live: real POIs with source/fetchedAt labels |
| 3 | Future weather at route/time for the piano lesson | Weather: IMPLEMENTED-BUT-OFF (recorded); live terms: OWNER-ACTION | Forecast-for-travel-window fixture drives the depart re-plan (D2 lineage): the plan cites the forecast valid for the departure window, not current weather | GATE-W1 → S3-LIVE (fixed demo-city, labelled real, kill-switch drill) | Golden: plan changes only when the window forecast changes; stale forecast fails closed (D6) |
| 4 | Airport snow disruption (optional scene) | New scene on existing contracts (no audit row yet; extension proof) | A recorded disruption scenario (flight + snow signals) through the same pipeline: re-plan with provenance, grocery-stub-style zero-core proof if a new detector is needed | None for the recorded scene; any real flight/weather data follows rows 2–3 gates | Scene replays deterministically; Why cites the disruption signal; cut first if the deadline tightens |
| 5 | XMemo confirmed-memory feedback improves the next session | XMemo: IMPLEMENTED-BUT-OFF; mapping LIVE-UNVERIFIED | Local-memory loop already shipped: session 1 confirms a preference → session 2 (reload) suggestion visibly changes, with Why citing the confirmed fact (INV-107) | GATE-X1 → S2-LIVE (owner account, one labelled test fact, mapping verified/corrected) | E2E: the improvement is demonstrable across reload offline; live write-back only ever carries confirmed facts |

## Amendment need and AC-EXT-1 implications

- **No formal Rev3 amendment (plan_tracker / SPEC_IMPACT) is
  required** for slices 2–3: both stay inside the approved Rev3/V2
  contracts (UI adapter layer, existing ports, existing owner
  gates). The agent-depth items map onto already-approved slices
  and gates; item 4 (airport scene) is a fixture-level extension
  recorded in this doc, and only a *new detector plugin* for it
  would reuse the AC-EXT-1 path below.
- **AC-EXT-1 zero-core-diff is preserved**: ConnectorStatus and the
  connector ports live in `src/ui/connectors/`; no `src/core/**`
  file changes, so no new baseline is proposed (baseline `f43c6c1d`
  stands, verifiable by `git diff f43c6c1d -- src/core` staying
  empty). Calendar, if ever built, would be a provider adapter plus
  (for proactive use) a detector plugin — the same extension shape,
  still core-free.
- SPEC impact: none. No Gate-S anchor changes; the calendar row's
  honest `unavailable` state is precisely the ASM-003 boundary
  kept visible in-product.
