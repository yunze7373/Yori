# LIVE-FIRST Live Pipeline — Architecture Design (ARCH-LIVE-FIRST-PROVIDERS)

> Request: `ARCH-LIVE-FIRST-PROVIDERS` (architect_request_id `5b67b2dc…`), rationale cites owner override relayed msg_c6861efb (fixture demo no longer an acceptable end product), dual gate msg_536ba453 still binding, Reviewer evidence matrix plus critical path in `.progress/review/reports/LIVE_FIRST_PLAN_20261102.md`, North-Star re-audit `NORTH_STAR_REAUDIT_20261102.md` (live never runs pipeline, `app.ts:1917`).
> Constraints (binding): zero paid calls without owner budget; no OAuth or secrets handled by agents; no deploy, push, or submission. In-flight CONTEXT-TIMELINE (INBOX-20261101-070938) continues as the deterministic harness — this plan does not duplicate it. Executable ledger: `docs/architecture/LIVE_FIRST.plan.json`. Deadline: owner smoke before 2026-11-05 11:00 JST.
> Read-only invariant held: no production code touched by this design; all changes are future Executor work behind the Reviewer gate. AC-EXT-1 holds throughout (`git diff f43c6c1d -- src/core` stays empty).

## 1. N×M trade-off evaluation

| Criterion | A: Narrow gated live-first (recommended) | B: Full autonomy push | C: Harness-only product |
|---|---|---|---|
| Safety / fail-closed | Live renders verified inputs or honest empty states; fixtures test-only | Background agents plus billed providers widen blast radius | Safe but dishonest as a product |
| Concurrency / races | Single-flight refresh, one-shot fixes, no background writers | SW sync plus push races with foreground state | No live races (nothing live) |
| Billed spend | Zero unless owner approves (ledger-capped model calls) | Requires backend, billing, keys | Zero |
| Complexity | Ports plus proxy already exist; additive slices | New backend, push infra, OAuth clients | Smallest |
| 11/05 feasibility | Yes for zero-fee path; calendar and reason conditional | No | Yes, but violates owner override |
| North-Star fit | Proactivity runs on real signals | Overshoots constraints | Fails (simulation as product) |

Verdict: **A**. B violates the no-billing, no-secrets, and no-backend constraints and cannot be built honestly on the browser platform by 11/05. C directly contradicts the owner override. A reuses the verified seams (LocationPort, Open-Meteo, OSRM/ORS, Overpass, XMemo PKCE, model proxy) and turns each SIMULATED row real behind an explicit owner gate.

## 2. Slice order verdict (answers item 1)

Reviewer order **confirmed with two adjustments**: Slice 0 (contracts plus harness, zero behavior change) comes first, and LIVE-DEFAULT moves right after CORE so no narrative slice ever lands on a fixture default.

`S0-CONTRACTS → S1-CORE → S2-DEFAULT → S3-LUNCH → S4-DEPART → S5-REASON → S6-SMOKE → closeout → Phase R`

- S4-DEPART is owner-source-blocked: without the owner's calendar source it ships the connection-block state plus an ICS parser proven on synthetic samples, and reports BLOCKED — never fake events.
- S5-REASON is owner-budget-blocked: zero billed calls until the owner approves a ledger-capped budget.
- CONTEXT-TIMELINE stays the differential harness donor (change-moment UX layer, pipeline-per-tick wiring, goldens); LIVE-PIPELINE reuses its components with real signals.

## 3. Provider choices and ToS/privacy notes (answers item 2)

Server-side only for every secret; zero agent tokens or keys in the browser bundle or repo (HB-3, INV-107).

| Provider | Choice | Terms / privacy |
|---|---|---|
| Time | Device clock (`RealSystemClock`) | No permission, no transmission |
| Location | Consented one-shot `GeolocationAdapter` (budget 5/session, TTL 60s, stale 5min); manual entry fallback | Explicit tap consent, never auto-prompt; consent never persisted; coordinates never logged; P-LOC lineage disclosed wherever a fix leaves the device |
| Weather | Open-Meteo keyless, driven by the consented fix (T2 wiring) | Free non-commercial tier; CC BY 4.0 attribution `Weather data by Open-Meteo.com`; owner must OK non-commercial hackathon scope (W1); no identifiers sent |
| Route/ETA | OSRM public demo server first (G-ROUTE); OpenRouteService free-tier key as recommended default once the owner registers it | OSRM fair-use demo endpoint, no SLA; ORS key server-side with quota cap; ETA labelled free-flow (no traffic data) |
| Places/open-now | Overpass/OSM first (gate b); `opening_hours` parsed, never invented; ratings/photos shown as absent | ODbL attribution; fair-use rate limits; coordinates disclosed under P-LOC |
| Geocoder | Nominatim, 1 req/s, honest caching, attribution | OSM usage policy; event locations are user data — purpose-limited use disclosed |
| Calendar | **Secret-iCal first** (read-only URL, owner-pasted into `.env.local`, never chat/repo); Google OAuth deferred as heavier alternative | iCal URL is a bearer secret: proxy-only fetch, never client-visible; read-only parse to events; no write scope; no agent ever handles it |
| Memory | XMemo PKCE per `XMEMO_AUTH_DECISION.md`; local-first composite fallback; confirm-only writeback | Owner logs in personally (gate g); 3 C2 probe questions (loopback redirect, DCR expiry, MCP envelope) resolved in Slice 0 against docs, live probe only by owner action |
| Reasoning | Muse Spark via server proxy, schema-validated, timeout plus abort, consecutive-failure breaker, fact post-check, ledger-capped | Server-side key custody; ≤10 further calls (ledger ≤32/50) only after owner budget approval |
| Map tiles | Leaflet plus OSM (REAL-MAP, done) | Tile usage policy; attribution mandatory in every render |

## 4. Snapshot and provenance contract, core untouched (answers item 3)

New `LiveSignal` envelope built in adapters/UI only: `provider`, `asOf` (ISO), `validFor` (finite ms, INV-106), `confidence`, `provenance: live | simulated | user`, frozen before delivery (INV-101). `buildLiveSnapshot()` composes device clock, consented fix, enabled providers, and MemoryPort facts into the existing `ContextSnapshot` shape the core already consumes — so `runPipeline` needs no core change. Missing providers yield empty signal lists; policy emits human-first notices (INV-103), never substitutes. Failure without a source renders `empty | unavailable | permission-needed` with provider plus `fetchedAt`. Determinism preserved: identical signals give identical pipeline output; goldens D1–D6 unchanged.

## 5. Re-evaluation triggers and honest background limits (answers item 4)

Live re-runs `runPipeline` on real signals at: app open, `focus` / `visibilitychange` (visible only), a 60 s tick while open and visible, and on signal arrival (consent grant, provider refresh completion, memory writeback). Single-flight refresh: a run in progress suppresses overlapping triggers; one-shot fixes are never re-requested inside TTL. **Background limits (platform, stated in-product):** a web app has no background execution — no background geolocation, no silent refresh, no always-on sensing; background tabs throttle timers and the tick does not run unseen. The notifications connector reports `unavailable` with this reason instead of pretending. This matches existing code reality (`watchPosition` statically forbidden, zero polling loops).

## 6. Exact owner actions (answers item 5)

Zero-fee path: allow location when prompted; W1 OK Open-Meteo non-commercial hackathon scope; gate (a) OK OSRM demo limits or register a free ORS key; gate (b) OK a public Overpass instance; OK Nominatim 1 req/s policy; gate (g) personal XMemo PKCE login in-app; gate (d) live-default flip (this override counts as ACK once S2 dev-gates overrides); G-LIVE-RUN one authorized real-run session; per-viewport visual sign-off (Architect cannot view the mockup). Conditional: paste calendar secret-iCal into `.env.local` personally (never chat) for S4, or defer DEPART; approve a model call budget (≤10, ledger ≤32/50, key already in `.env.local`) for S5. No agent touches credentials, OAuth flows, billing, deploys, or submissions at any point.

## 7. Test strategy (answers item 6)

Proxy-boundary mocks only: network is mocked at the `/api/*` seam to provoke denied, stale, timeout, and provider-error paths — never canned scenes as product. Per slice: deterministic unit plus golden tests (D1–D6 add-only, core diff 0), differential live-change e2e (Playwright geolocation mock plus clock: intent appears, honest gated states, suppression respected), cross-session preference persistence, static gates (no fixture render in Live outside `?dev=1`; single `navigator.geolocation` owner; no secrets in bundle), 390×844 and 1280×800 evidence with dual-gate review. Gated real smoke (S6) runs on the owner's device with owner consent, login, and budgeted calls; evidence is captured and reviewed, never auto-passed.

## 8. Invariants, failure modes, rollback

Non-negotiable: INV-101 frozen signals; INV-102 source isolation (`live` vs `simulated` typing); INV-103 fail-closed, never fabricate; INV-106 bounded validity with stale degradation; INV-107 confirm-only memory writeback; INV-110 storage ownership; AC-EXT-1 zero core diff; single-flight refresh; server-side-only secrets. Failure modes addressed: denied/timeout/stale providers → honest states; expired signals → unavailable; model failure or budget exhaustion → deterministic grammar fallback with visible engine status; overlapping triggers → single-flight suppression; missing calendar/budget → explicit BLOCKED report, never silent substitution. Rollback per slice: each slice is additive behind flags (`GEO_LIVE_ENABLED`, `WEATHER_LIVE_ENABLED`, `ROUTE_LIVE_ENABLED`, `PLACES_LIVE_ENABLED`, `XMEMO_OAUTH_ENABLED`, `MODEL_LIVE_ENABLED`) plus the `?dev=1` Demo entry — any slice can be disabled back to honest empty states with zero core change.

## 9b. BLOCKED-terminal rules (revision 2, per Reviewer)

A slice reporting BLOCKED is terminal, never pending: the report names the owner gate, ships the connection-block or honest-empty UX for that module, and proves it with tests. Gating semantics: a downstream slice is satisfied by each dependency in `completed` OR `terminally-BLOCKED` state. Concretely, S6-OWNER-SMOKE is never deadlocked by owner-gated S4/S5 — it smokes completed slices live and verifies the blocked slices' honest blocked UX instead of waiting past the smoke date. CLOSEOUT records per-module ACCEPTED (real evidence) or BLOCKED (named gate) with equal finality.

## 10. Scope binding (revision 2, per Reviewer)

Executor in-flight WIP owned by INBOX-20261101-070938 (recorded 2026-11-02, do not touch from this plan): `src/ui/living-context/app.ts`, `src/ui/living-context/styles.css`, `src/ui/living-context/v2-home-view.ts`, `src/ui/view-models/home-vm.ts`, `src/ui/view-models/types.ts`, `src/app/timeline/`. Rules: (a) no LIVE_FIRST `files` entry spans these paths — directory scopes replaced with exact owned files; (b) S1 proves snapshot-to-composer through the S0 harness plus new modules only, with zero edits to WIP files; (c) the `app.ts` live-wiring and mode-override hunks (S1/S2 integration) are authored against post-timeline-merge HEAD, after the timeline slice passes its own gate — the timeline slice owns `app.ts` until then; shared components are otherwise reused read-only. UI review of the WIP paths happens under the timeline slice's own gate, never under this plan.

## 9. Reviewer coordination note

This design accepts the Reviewer's evidence matrix and critical path as the baseline and answers all six requested items. Recorded risk outside this plan's control: Reviewer capacity was reported quota-exhausted at the last sentinel check — if review bandwidth is short before 11/05, the requester should sequence S0–S2 first (they unblock everything and need no owner spend) and hold S4/S5 on their explicit owner gates. Formal submission follows via `architect_reply.py --completed --submit-for-review`.
