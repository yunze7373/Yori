# D8-BASETEN-FALLBACK UI review pack

All renders come from `tests/e2e-live/live-baseten-fallback.spec.ts`. They are **recorded**
`/api/model/candidates` responses in the D8 proxy's exact shape after a proven Muse Spark timeout.
That shape is proven against the real handler with a fake fetch in
`tests/proxy-boundary/baseten-fallback.test.ts`. **No live Muse Spark or Baseten call was made.**

| File | What it shows |
|---|---|
| `d8-baseten-fallback-390x844.png`, `d8-baseten-fallback-1280x800.png` | The lunch card's reason line is labelled `Baseten fallback · gpt-oss-120b` (`data-engine="baseten_fallback"`). The header engine pill reads `Baseten fallback` (`data-engine-status="baseten_fallback"`, `data-provenance="fallback_engine"`). `Meta Muse Spark` appears nowhere on the page |
| `d8-ask-why-390x844.png` | Ask "why" is answered by the same engine, ending `· Baseten fallback · gpt-oss-120b`. The Ask header keeps one status line |

## Review notes

- **Never impersonated:** the fallback engine has its own status (`baseten_fallback`), its own label
  and its own pill provenance. It is distinct from `Meta Muse Spark · live` and from `Reasoned
  locally` / `Offline fallback · deterministic`. The decision log records `engineStatus:
  baseten_fallback` for both `candidates_rank` and `candidates_why`, asserted through the dev
  inspector.
- **D3 floor at 390 (first paint, scroll top):** the hero candidate's name, distance, open state,
  basis, labelled reason line and Directions all end above the docked Ask bar, at 390 and 1280.
  This is the same criterion as `d3-visual-floor` (f).
- **Pill label:** the header pill label is short (`Baseten fallback`) so it fits at 390 and keeps the
  Ask header's Pin button on screen; the spec asserts that the pill is not clipped. The model family
  is shown on the card and in the answer.
