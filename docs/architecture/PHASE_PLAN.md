# Yori Rev3 — Phase Plan

> Companion to `ARCHITECTURE.md` Rev3 and `goals.yaml` (PH-001..003).
> Executable slices: `YORI_MVP.plan.json` (Rev3). Only PH-001 is sliced.

## PH-001 — Hackathon demo by 2026-11-04

Objective: prove the general proactive pipeline (not two one-off
features) with two demo scenes and a replayable scenario player.

| Slice | Content | Goals / fixtures | Est. |
|---|---|---|---|
| Slice 0 | Core contracts (signals/snapshot/scenario/memory) + plugin registry shape + D1–D6 & AC-EXT-1 golden harness failing on stubs. Zero behaviour. | G-101, G-104, G-107 | ~8h |
| Slice 1 | `depart` detector+preparer on the deterministic time engine; rain re-plan options | G-102 (D1, D2) | ~6h |
| Slice 2 | Shared suppression/ranking policy + owned `src/core/storage` + `lunch` detector/preparer + mock place adapter | G-103, G-104 (D3, D4, D5, D6) | ~8h |
| Slice 3 | HomeComposer + Living Context UI (NOW/AHEAD/FOR YOU), mobile+desktop, English i18n-ready strings | G-105 | ~9h |
| Slice 4 | Review/Why/Me memory loop + XMemo adapter (MemoryPort) + ModelPort constrained wording with deterministic fallback | G-105, G-106 | ~8h |
| Slice 5 | Scenario player + full e2e chapter closeout; AC-EXT-1 zero-core-diff proof; degradation drills (model/XMemo off) | G-101..G-107 | ~6h |

Total ≈ 45h + INBOX checkpoints against 7 days. Cut line (in order):
Spark wording → XMemo live write-back → map surface → grocery-stub UI.
Never cut: D1–D6, suppression reasons, Why, prompt cap, confirm-only
memory. Hard blockers HB-1/HB-3 confirm by 2026-10-30; both default to
the deterministic/local path, so a miss does not move the deadline.

Exit: PH-001 exit criteria in `goals.yaml`, including D1–D6 passing
with the model disabled. Skeleton/docs-only is not done.

## PH-002 — Minimal real closed loop (internal deadline 2026-11-04)

Per ARCH-PH002-001 (planning only; execution gated by Reviewer +
owner). One minimal real loop over breadth; the PH-001 demo is never
sacrificed for real providers. OS notifications are deferred out of
this phase. Executable slices: `YORI_PH002.plan.json`.

| Slice | Content | Goals | Est. |
|---|---|---|---|
| A (first) | Proxy hardening: server-side template ids + validated structured facts; PH-001 guards regression; AC-EXT-1 zero-core-diff preserved | G-201 | ~6h |
| B | Constrained Spark reasoning (rank/choose or intent proposal) with provenance, fact check, deterministic fallback, recorded fixtures | G-202 | ~10h |
| C | XMemo end-user OAuth loop, or verified no-path finding + owner action + fallback demo | G-203 | ~8h |
| E (prep first) | Demo narrative, 3-min video script, repo hygiene, submission package draft — scheduled before D so provider slip cannot consume it; all owner-gated, no auto-submit | G-205 | ~8h |
| D | Minimal real providers behind ports (real time + keyless weather with fixed demo-city coordinate, no device geolocation), mock twins, consent gates | G-204 | ~8h |
| E (visual) | Visual re-review after UI-affecting slices, dual-width retest | G-205 | (in E row above) |
| Closeout | Chapter tests: D1–D6 unchanged (model off), A–D acceptance, degradation drills | G-201..204 | ~4h |

Total ≈ 44h against ~6 days (external submission 2026-11-05 11:00
JST). Cut line, in order: D calendar/route increments → E video
polish beyond script → B intent-proposal mode (keep candidate
ranking) → C live OAuth (fallback demo path). Never cut: Slice A,
D1–D6 integrity, the core visual demo. Owner gates: MODEL_API_KEY
configuration, XMemo app registration, provider keys/costs, any
external submission — see the checklist tasks in the plan.

## PH-003 — Real providers (gated)

Real calendar/weather/place (OSM-offline seam kept) and any location
use, each behind the existing ports and each with its own go/no-go,
only after the privacy review gate (least privilege, on-demand,
consent, retention/deletion). Simulated paths and labelling remain.
