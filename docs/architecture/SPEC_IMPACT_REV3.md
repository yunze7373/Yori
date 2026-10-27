# SPEC Impact Note — Rev3 Supersession

> Companion to ARCH-REV3-001. Rev3 (owner-approved design direction)
> supersedes the Rev2 baseline. This note lists which Gate-S anchors
> and Rev2 acceptance anchors must change. Under `guarded` autonomy
> the SPEC revision itself requires owner approval; this note is the
> input to that revision, not the revision.

## Gate-S anchors that must change (`.progress/spec/`)

| Anchor | Current (Gate-S approved) | Required Rev3 change |
|---|---|---|
| REQ-001 (requirements.md) | Single template capability anchor | Split into Rev3 capabilities: perception/contracts, intent+suppression, preparation (depart/lunch), Living Context composition, review/memory loop. Until split, Rev3 goals trace to REQ-001 (recorded debt, as in Rev2 R-1) |
| ASM-002 | MVP = simulated demo, manual entry; real calendar/location next phase | Partially superseded: demo signals remain replayable/source-labelled mocks, but the product is now a general agent pipeline, not a single-scenario demo. Manual entry is one provider adapter, not the product boundary |
| ASM-003 | No real calendar/location in v1; preferences visible/editable/deletable | Calendar/GPS prohibition stands for PH-001. New surface must be added: network AI (Muse Spark) and memory (XMemo) integrations are in-scope as degradable ports (HB-1..HB-3); real location transmission remains not authorized |
| ASM-001 / ASM-004 | Web responsive; habitual-appointment individuals; no collaboration/trip-planning/background tracking | Unchanged, except the target-user framing widens from appointment-only to proactive-assistant users; non-goals unchanged |

## Rev2 acceptance anchors that do not survive

- Rev2 `AC-002-1` (manual-entry-first appointment record) — demoted:
  manual/simulated entry becomes the demo provider adapter behind the
  Rev3 perception contract (G-101), not a product-level acceptance.
- Rev2 INV-001..007 / G-001..006 / ADR-001..005 numbering — retired.
  Rev3 uses INV-101..109 / G-101..107 / ADR-101..105 to prevent the
  ID-meaning collisions found in Reviewer decision `5e711b31`.
- Rev2 propose-then-confirm for preference adjustment — preserved in
  strengthened form as INV-107 (confirm-only memory writes for all
  feedback-derived changes, not only preference edits).
- Rev2 deterministic time formula, DST discipline, fail-closed input
  handling, `alreadyDue` — preserved as the `depart` preparer core
  (G-102), re-anchored to D1/D2 fixtures.
- `RECOMMENDATIONS.md` (Rev2) — superseded record, not in the Rev3
  baseline.

## New assumptions needing persisted answers (SPEC revision input)

- ASM-005 (proposed): Demo integrations Muse Spark + XMemo are
  enhancement-only behind ports; absence of keys/auth degrades to
  deterministic/local paths without changing acceptance outcomes.
- ASM-006 (proposed): English UI first with externalized strings
  (i18n-ready); no locale is promised for PH-001.
- ASM-007 (proposed): Proactive prompt budget defaults to 3/day,
  user-visible and adjustable in Me; composition on open is not a
  prompt.
