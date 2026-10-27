# Yori — Recommendations (Adopted / Rejected)

> **Superseded by Rev3** (`ARCHITECTURE.md` Rev3, ARCH-REV3-001). This
> file is a Rev2 decision record, retained for history only; it is not
> part of the current baseline.

> Decision record companion to the N×M trade-off matrix in
> `ARCHITECTURE.md` §2. Scores cited there are MVP-fitness scores
> (1 worst – 5 best) for validating the prepare/leave hypothesis with
> simulated data.

## Adopted

### R-001 — Option A: client-only SPA + localStorage for MVP (Phase 1–2)

- **Decision:** Build the MVP as a static/client-only SPA. All domain logic
  in the browser; preferences/feedback in `localStorage` behind repository
  ports (ADR-002, ADR-004).
- **Why:** Highest MVP totals in the matrix (27/30): safety/privacy 5
  (nothing leaves the device; INV-003 structurally true), complexity 5,
  cost 5, dev ergonomics 5. The MVP question — are prepare/leave
  suggestions useful, does feedback improve them — needs no server.
- **Accepted cost:** localStorage durability (browser clearing deletes
  data). Mitigated honestly: UI discloses on-device-only storage
  (AC-006-3), Phase 2 adds export/import. Cross-device preference
  portability (vision) is deferred, not denied.

### R-002 — Pure, framework-free time-computation core (ADR-003)

- **Decision:** One pure function; injected `now` and IANA timezone; no
  ambient clock, I/O, or framework dependency.
- **Why:** Determinism (INV-005) makes the MVP's core correctness claim
  fully testable, including DST fixed-clock cases, and lets a future
  backend reuse the code verbatim.

### R-003 — Repository ports from day one (ADR-002/ADR-004)

- **Decision:** `PreferenceRepository` / `FeedbackRepository` ports with a
  localStorage adapter in MVP; versioned storage envelope.
- **Why:** Converts the known Phase 3 cost of Option A (adding a thin
  backend for calendar OAuth) into an adapter swap. Direct `localStorage`
  calls scattered through UI code were rejected (see X-003).

### R-004 — Feedback as propose-then-confirm (ADR-005)

- **Decision:** Feedback creates an `AdjustmentProposal`; preferences
  change only after explicit user confirmation (INV-007).
- **Why:** Product principle (README, PROJECT_IDEA): preferences are
  user-confirmed, visible, editable, deletable. Auto-tuning from feedback
  would silently mutate the very state the user must control (see X-004).

### R-005 — Simulated-first boundary with real adapters deferred (ADR-001)

- **Decision:** MVP domain accepts only explicitly simulated inputs,
  type-labelled `dataKind: "simulated"` (INV-002); real calendar/location
  adapters are Phase 3 exploration behind the same input ports, gated on
  privacy review (NFR-005).
- **Why:** Exactly the Gate-S approved boundary (ASM-002/ASM-003). Keeps
  the MVP demonstrable without permissions, and prevents simulated/real
  confusion later.

## Rejected (for MVP)

### X-001 — Option B: SPA + thin backend API as the MVP starting point

- **Rejected for MVP; adopted as the Phase 3 migration target.**
- **Why not now:** Matrix total 20/30. It pays server privacy duties
  (storage, retention, deletion, transport security), API/idempotency
  design, and two-deployable complexity before the suggestion hypothesis
  is validated. Its one decisive advantage — migration path 5 (OAuth
  token handling home) — is only needed in Phase 3, and R-003 keeps that
  path open at adapter cost.

### X-002 — Option C: backend-first with accounts/sync

- **Rejected for MVP (not rejected as a long-term possibility).**
- **Why:** Matrix total 17/30. Accounts + multi-device sync are the
  hardest concurrency problem in the matrix (race/concurrency 2) and the
  largest privacy surface (2), spent on machinery the approved contract
  explicitly excludes (no multi-user collaboration; ASM-004). It designs
  for the cross-device vision before the single-device value is proven.
  Revisit only on Phase 3 go/no-go evidence.

### X-003 — Direct localStorage access from UI components (no ports)

- **Rejected.** Scattered storage calls would weld the MVP to Option A,
  break the versioned-envelope guarantee (INV-006), and turn the Phase 3
  backend migration into a rewrite. The port costs one small interface.

### X-004 — Automatic preference tuning from feedback (no confirmation)

- **Rejected.** Violates the user-confirmed-preference principle and
  INV-007; a mistimed auto-change is invisible to the user and undermines
  trust in every later suggestion. Proposals keep the loop inspectable.

### X-005 — Real calendar or GPS access inside the MVP “to make it realistic”

- **Rejected.** Directly contradicts the Gate-S approved contract
  (ASM-002/ASM-003) and INV-003, adds permission/privacy burden, and
  confuses the validation question. Realism in MVP comes from honest
  simulated labelling (INV-002), not from real data.

### X-006 — Fabricated defaults for missing inputs (e.g. “typical” travel time)

- **Rejected.** Violates fail-closed INV-001: a suggestion computed from
  invented inputs looks authoritative and teaches the user to distrust —
  or worse, trust — numbers Yori made up. Missing input ⇒ actionable
  reason, never a guess.

## Open risks carried forward

1. localStorage loss on browser-storage clearing (accepted, disclosed; export/import in Phase 2).
2. Multi-tab preference write races (guarded in MVP; full conflict UX out of scope).
3. DST/timezone arithmetic correctness (mitigated by explicit IANA timezone + fixed-clock tests).
4. Feedback signal may be too coarse to improve suggestions (evaluated in Phase 2; no ML in scope).
5. Phase 3 privacy posture change for real calendar/location (gated; not pre-built).
6. Trademark/domain/app-store availability pending (outside architecture; README).
