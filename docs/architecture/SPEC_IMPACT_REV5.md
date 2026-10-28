# SPEC Impact Note — Rev5 Real-World Chain (ARCH-V2-004)

> Rev5 (owner requirement msg_71704251afe4499a) deliberately changes
> a standing boundary. This note names every affected anchor so the
> change is reviewed, not smuggled. Guarded autonomy: the SPEC-side
> updates below need owner acknowledgement at the Rev5 gate.

| Anchor | Conflict / change | Rev5 position |
|---|---|---|
| AC-204-2 (goals.yaml, PH-002) "never call device geolocation" + PH-001 static geolocation ban (INV-003 lineage, tests ban `navigator.geolocation` in `src/`) | Rev5 requires consented geolocation | Ban rescoped to a single consent-gated adapter (INV-111 in `LIVING_CONTEXT_V2.md` §10); the static guard is rewritten to fail on any geolocation reference **outside** that adapter. AC-204-2 should be superseded by a Rev5 acceptance at the next goals revision; until then the plan keeps the real chain OFF by default behind P-LOC |
| ASM-003 (no real calendar/location transmission; consent + least privilege) | Coordinates leave the device to a places provider | Only after P-LOC names the provider and the user consents in-app; one-shot, budgeted, no continuous watch. Calendar remains untouched |
| Rev3 D4 / G-204 honesty (no ratings without evidence) | Real POIs may carry ratings/open-now | Rendered only with provider evidence, labelled with source + fetchedAt; simulated cards keep the no-ratings rule. The two data classes are never blended |
| ASM-005 (integrations degrade without changing acceptance) | Real chain added | Unchanged in spirit: any unmet gate (P-LOC/P-BILL/P-HTTPS/S1/X1) leaves the simulated demo fully recordable via the explicit scenario switch |
| New goals | — | G-211 (consented geolocation), G-212 (PlacesProvider + fuel plugin + navigate handoff), G-213 (proactive real-POI lunch) added to `goals.yaml`; no approved anchor renumbered |
