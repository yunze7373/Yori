# SPEC Impact Note — PH-002

> Companion to ARCH-PH002-001. PH-002 stays inside the Rev3 SPEC as
> revised by ARCH-SPEC-REV3 with two exceptions that require owner
> acknowledgement at the PH-002 gate; nothing here silently widens
> the Gate-S contract.

| Anchor | PH-002 relation | Action |
|---|---|---|
| ASM-002 (replayable labelled mocks; manual entry = one adapter) | Workstream D adds a first **real** time/weather signal behind the same ports, mock twin retained | Real-provider signals must stay `source: "real"` labelled and consent-gated; enabling them by default would exceed ASM-002 and needs an owner-approved SPEC update. Plan default: mock path remains the demo default until the owner enables real signals |
| ASM-003 (no real calendar/GPS in PH-001; ports in scope) | Calendar/route increment (D2) is design-only behind an explicit owner gate | No SPEC change while the gate holds. Any future enablement updates ASM-003 first |
| ASM-003 / HB-3 (XMemo end-user OAuth existence spike) | Workstream C confirms existence of official RFC 8414 OAuth 2.0 PKCE flow (`memory:read`, `memory:write`); local adapter remains default truth source | Verified via XMEMO_AUTH_DECISION.md; frontend clients hold zero agent tokens or client secrets |
| ASM-005/006/007 | Unchanged; B/C degrade per ASM-005, UI stays English-first per ASM-006, prompt budget per ASM-007 (notifications deferred, so no new interruption surface) | None |
| REQ-002/003/005/006 | PH-002 goals G-201..G-205 trace to these anchors; no new REQ required | None |

OS-level notifications (the earlier PH-002 sketch in Rev3) are
deferred beyond PH-002 by the 2026-11-04 deadline; if revived they
need a SPEC note against ASM-007 (prompt budget) before planning.
