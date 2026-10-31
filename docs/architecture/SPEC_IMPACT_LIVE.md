# SPEC Impact Note — Live-Default Direction (Owner Update 2026-11-01)

> Prepared for plan review with `REV3_LIVE_ROADMAP.plan.md`. The
> owner's hard acceptance update (msg_6147854c) makes Live the
> production default; that supersedes parts of the simulated-first
> boundary. Guarded autonomy: the SPEC-side updates below need
> owner acknowledgement at the roadmap gate.

| Anchor | Change | Position |
|---|---|---|
| ASM-002 (demo = replayable labelled mocks; manual entry one adapter) | Production default becomes Live with truthful empty states; fixtures behind `?dev=1` only | Supersede ASM-002's demo-default wording at the next SPEC revision; until then the offline slices change no runtime default |
| ASM-003 (no real calendar/location transmission in PH-001; consent + least privilege) | Live route/places transmit coordinates to owner-chosen providers | Only behind G-ROUTE / P-LOC-lineage consent with the roadmap's truthfulness model; calendar remains untouched and `unavailable` in-product |
| Rev5 SPEC_IMPACT (real chain OFF by default until P-LOC) | Live states become the default surface (with honest empties when no source) | The OFF-by-default *data* posture stands until the owner gates pass; what changes is the default *surface* (Live states first, Demo behind `?dev=1`) |
| AC-204-2 lineage (AC-EXT-1 core-free) | Unchanged | All roadmap work stays in adapters/plugins/UI; `git diff f43c6c1d -- src/core` empty |
