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

## PH-002 — Notifications, more detectors, evaluation

Real notification delivery under the shared prompt budget and quiet
hours; additional detectors through the same plugin contract;
acceptance/disturbance evaluation of proactive suggestions. Entry:
PH-001 exit met. No notification path may bypass shared policy.

## PH-003 — Real providers (gated)

Real calendar/weather/place (OSM-offline seam kept) and any location
use, each behind the existing ports and each with its own go/no-go,
only after the privacy review gate (least privilege, on-demand,
consent, retention/deletion). Simulated paths and labelling remain.
