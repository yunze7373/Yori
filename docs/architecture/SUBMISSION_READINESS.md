# Yori — Submission Readiness (Phase R after PRE-S1 Closeout)

> Planning only (ARCH-SUBMIT-002 / PHASE_R_PRE_S1_001). No coding dispatch, no live calls,
> no publishing or submitting is authorized by this document.
> Deadlines: internal **2026-11-04**; external submission
> **2026-11-05 11:00 JST**.
> PRE-S1 closeout approved: Reviewer decision `c4a415ab-c68d-46cd-8c0d-e578d2bf487a` at commit `9007ccc6b0a4aae1345af4334713eaad3e6951b5`.
> AC-EXT-1 core diff vs `f43c6c1d` strictly empty (0 files, 0 lines).
> No owner sign-off is assumed anywhere below.

---

## 1. Status table (truthfully classified as of HEAD `9007ccc`)

| Capability | Class | Evidence / Decision IDs / Flags / Missing Checks |
|---|---|---|
| **Core Living Context Pipeline** (D1–D6 scenarios, living context view, Review/Why sheet, Me tab) | **DONE+LOCAL-TESTED** | Baseline PH-002 closeout approved by decision `2c9e058d` @ `bb87efaf`. Fully operable locally on loopback (`127.0.0.1:5173`). Clean-worktree full matrix verified at `9007ccc`: 540 unit tests, 18 golden acceptance tests, 56 degradation drills, 192 Playwright E2E tests across both mobile and desktop viewports with 0 Axe accessibility violations, 0 core diff lines vs `f43c6c1d`. |
| **Memory Evidence Provenance & Parity** (PRE-S1-A) | **DONE+LOCAL-TESTED** | Approved by Reviewer decision `8b279ba5-32a1-4ec0-a90a-1143e31b7b25` on request `ac6c6512-5d2b-4c1d-87ed-95a486a93116` @ commit `27f8ca8`. Bundles grounded only in MemoryPort facts + stored `user_confirmed` keys via `classifyFactSource`. Server/client parity tested including sample-vs-confirmed negative rejection. |
| **Slot-Aware DOM Grounding Audit & Instrumentation** (PRE-S1-B) | **DONE+LOCAL-TESTED** | Approved by Reviewer decision `738751af-dc9a-461e-8ce1-6bcf72daf523` on request `857783ff-3c74-4a1f-8d51-ab11a6c9eebe` @ commit `1556e93`. DOM slots instrumented with `data-source-ref`. Grounding audit verified 1300 rendered slots across 8 viewport dumps (388 domain grounded, 0 ungrounded, 912 chrome, 0 leaks); 10/10 adversarial negative self-tests passed. Evidence manifest `docs/evidence/pre-s1/MANIFEST.sha256` verified (9/9 OK). |
| **Production Build Gating** (PRE-S1-C) | **DONE+LOCAL-TESTED** | Approved by Reviewer decision `ed41965c-cb5b-4188-a04b-4a4c47502684` on request `e771709c-4ef7-4ad9-9c64-1efe92fdddac` @ commit `1ee4645`. All 13 `__YORI_*` window hooks, prefix tokens, and URL forcing parameters compile-time dead-code eliminated from shipping `dist/` bundle (0 hits). Inert in the shipping build regardless of `?test=1` (hooks exist only in dev/test builds). |
| **Exact 3:00 Storyboard & Submission Sync** (PRE-S1-D) | **DONE+LOCAL-TESTED** | Approved by Reviewer decision `878d33ba-75fd-4b54-9fe9-b7fee14f4a75` on request `e73ba5dc-c531-40ba-88aa-061ce1fcd19f` @ commit `6d2da2d`. Storyboard timings sum to exactly 3:00 (180s) across approved V4 owner loops, with optional V5 20s extension explicitly labelled. All 58 quoted UI strings mapped to passing e2e asserts. |
| **PRE-S1 Chapter Verification Closeout** (CLOSEOUT_PRE_S1) | **DONE+LOCAL-TESTED** | Approved by Reviewer decision `c4a415ab-c68d-46cd-8c0d-e578d2bf487a` on request `53e50e38-029b-428e-a694-5f6b0557d0ac` @ commit `9007ccc`. Report at `docs/evidence/pre-s1/CLOSEOUT_PRE_S1.md`. Clean worktree full matrix certified: build clean (251ms), typecheck 0 errors, unit 540, golden 18 (0 fixture diffs), drills 56, production gating 0 hits, slot audit 1300/1300 slots + 10/10 neg tests, Playwright full suite 192 passed with 0 axe violations across 14 spec files, core diff empty, all 5 manifests 42/42 OK. |
| **Muse Spark Reasoning** (rank/choose, constrained) | **IMPLEMENTED-BUT-OFF** | Flag: `MODEL_API_KEY` unset (diagnostics report `disabled`, `keySource: "none"`). Approved: B1 `dec2d875`, B2 `c42058b8`. Local scripted model fixtures only; deterministic fallback verified under model fault injection drills. |
| **Muse Spark Live Calls** | **LIVE-UNVERIFIED** | Never called live. Gated behind owner key + billed-call approval (`GATE-S1`), followed by bounded live verification slice (`S1-LIVE`, max 10 prompts, server-side only, `max_tokens` capped) with fact-check pass-rate report. Cross-plan precondition 2 (PRE-S1-A and B approved) is satisfied. |
| **XMemo Memory** (OAuth + MCP proxy) | **IMPLEMENTED-BUT-OFF** | Flag: `XMEMO_OAUTH_ENABLED=false`. Approved: C1 `9ec6fd22`, C2 `5540ae07`. Local memory (`localStorage` envelope) is the active source of truth. |
| **XMemo Live Mapping** (`recall`/`remember`) | **LIVE-UNVERIFIED** | Code marks live proxy endpoints `UNVERIFIED_XMEMO_MCP_MAPPING`. Gated behind owner-authorized dynamic client registration and consent click on owner's real account (`GATE-X1`), followed by bounded live verification slice (`S2-LIVE`). |
| **Live Weather** (Open-Meteo adapter) | **IMPLEMENTED-BUT-OFF** | Flag: `WEATHER_LIVE_ENABLED=false`. Approved: D1 `6a0cc56b`. Uses fixed demo-city coordinates (San Francisco); live device geolocation strictly disabled. |
| **Open-Meteo Terms Qualification** | **OWNER-ACTION-REQUIRED** | Owner confirms non-commercial qualification (<10k calls/day tier) or directs recorded-fixture use (`GATE-W1`). Unmet gate defaults to recorded, labelled weather fixtures. |
| **Geolocation / Device GPS** | **IMPLEMENTED-BUT-OFF** | Browser geolocation API calls strictly disabled and fail-closed (`P-LOC`). Demo operates exclusively on fixed scenario locations and manual location entry (`?geo=lat,lng` in test build only). |
| **Calendar / Route Provider** | **OWNER-ACTION-REQUIRED** | Design only (`CALENDAR_ROUTE_DESIGN.md`, D2 `1cf738a7`); zero provider code implemented. Decisions OD-1..OD-6 are reserved for the owner; nothing is scheduled before them. |
| **Visual Evidence Access** | **OWNER-ACTION-REQUIRED** | The ChatGPT coordinator lacks artifact scope / allowlisting for Yori; coordinator cannot view screenshot artifacts. Visuals verified by Reviewer AI via rendered evidence. Owner options under `GATE-V0`. |
| **3-Minute Video Walkthrough** | **OWNER-ACTION-REQUIRED** | Storyboard and script ready: `docs/submission/VIDEO_SCRIPT.md` (PRE-S1-D `878d33ba` @ `6d2da2d`). Recording and upload to YouTube/Loom are strictly owner actions (`GATE-V1`). |
| **Repository Licensing & Public Remote** | **OWNER-ACTION-REQUIRED** | `LICENSE` is MIT with holder placeholder `[OWNER TO CONFIRM]`; no remote repository exists yet. Owner confirms holder, creates remote, and sets visibility to public (`GATE-R1`). |
| **Hackathon Submission Form** | **OWNER-ACTION-REQUIRED** | Submission package drafted in `docs/submission/PROJECT_DESCRIPTION.md` and `SUBMISSION_CHECKLIST.md`. Final form submission is strictly the owner's responsibility by 2026-11-05 11:00 JST (`GATE-F1`). |

---

## 2. Minimal Owner-Action List & Deadlines

> [!IMPORTANT]
> **Authority Boundary**: Never assume ChatGPT, the coordinator, or any AI agent can satisfy a payment, API key, OAuth registration, publication, or HMAC-signed gate. All gates below require explicit human owner execution.

| Gate | Minimal Owner Action | Latest Safe Date | Consequence If Unmet / Not Done |
|:---|:---|:---:|:---|
| **GATE-S1** (Spark Key & Billing) | Place `MODEL_API_KEY` in Yori's local `.env.local` (never copied from Muse Code private auth) and explicitly approve a small billed live-call budget (~$1.00 cap) for `S1-LIVE`. | **2026-10-31** | `S1-LIVE` is skipped; demo and video run entirely on the deterministic offline path and state so honestly. Zero loss to core submission score. |
| **GATE-X1** (XMemo Live Auth) | Authorize dynamic client registration and complete one browser consent click on the owner's own XMemo cloud account. | **2026-10-31** | `S2-LIVE` is skipped; XMemo stays OFF with local storage fallback; video shows local memory only. |
| **GATE-W1** (Open-Meteo Qualification) | Confirm non-commercial qualification (<10k calls/day tier) for live weather enablement during recordings. | **2026-11-02** | `S3-LIVE` is skipped; demo and recordings continue to use labelled, recorded weather fixtures. |
| **GATE-V0** (Visual Evidence Access) | Select preferred coordinator visual review option: (a) view `docs/evidence/` locally; (b) grant artifact scope / allowlist Yori for coordinator; (c) authorize Telegram screenshot dispatch. | **2026-11-02** | Coordinator operates without visual screenshot inspection; Reviewer AI independent verification stands. |
| **GATE-R1** (Repo & License) | Confirm MIT license copyright holder, create remote GitHub repository, push `main`, and set repository visibility to Public. | **2026-11-03** | Judges cannot access source code; hackathon submission is disqualified. |
| **GATE-V1** (3-Minute Video) | Record screen walkthrough following `docs/submission/VIDEO_SCRIPT.md` (exactly 3:00) and upload video to YouTube/Loom (public or unlisted). | **2026-11-03** | No video link provided in submission form; submission materially weakened. |
| **GATE-F1** (Final Submission) | Complete and submit the official hackathon submission form with project description, public GitHub URL, and video link. | **2026-11-05 11:00 JST** | Project is not submitted, regardless of implementation quality. Hard stop deadline. |

### Terminal Gate Invariant
Every owner gate has an explicit terminal state: **DONE**, or **DECLINED/UNMET** by its latest safe date. If an owner gate is unmet by its safe date, its corresponding branch is marked **SKIPPED** rather than stalling the submission track. The submission track (`GATE-R1` → `GATE-V1` → `GATE-F1`) depends solely on the deterministic fallback path and never on live API credentials.

---

## 3. Guaranteed Zero-Credential Demo Path (Video Fallback)

The guaranteed zero-credential demo path requires **zero external API keys, zero cloud logins, and zero live network calls**:
- **Deterministic Scenarios**: D1 (Clear/Piano), D2 (Rain/Umbrella), D3 (Away Lunch), D4 (Busy Lunch), D5 (Quiet Preference), D6 (Degraded Weather).
- **Offline Weather**: Fixed San Francisco coordinates with labelled recorded fixtures (`source: "real"`, labelled simulated/recorded).
- **Offline Memory**: Local browser storage envelope with cryptographic versioning and reset capability.
- **Offline Model**: Scripted model interpreter fixtures (`MODEL_API_KEY` unset); fails closed to deterministic fallback on any error.
- **Integrity Bar**: Certified by 540 unit tests, 18 golden acceptance tests, 56 drills, and 192 Playwright E2E tests with 0 accessibility violations.

This guaranteed path is the primary default for video recording (`GATE-V1`) and is never cut.

---

## 4. Submission Schedule & Cut Line (JST)

| Milestone / Gate | Latest Safe Date | Nature |
|:---|:---:|:---|
| **GATE-S1** (Muse Spark key & billing) | 2026-10-31 | Owner Action (Live Branch) |
| **GATE-X1** (XMemo live authorization) | 2026-10-31 | Owner Action (Live Branch) |
| `S1-LIVE` bounded verification | 2026-11-01 | Engineering (if GATE-S1 cleared) |
| `S2-LIVE` bounded verification | 2026-11-01..02 | Engineering (if GATE-X1 cleared) |
| **GATE-W1** (Open-Meteo terms decision) | 2026-11-02 | Owner Action (Live Branch) |
| `S3-LIVE` live weather enablement | 2026-11-02 | Engineering (if GATE-W1 cleared) |
| **GATE-V0** (Visual evidence access) | 2026-11-02 | Owner Action (Coordinator Scope) |
| Pre-Gate Hygiene (BACKLOG P3s: build/recording) | 2026-11-02 | Engineering (Owner-approved only) |
| **GATE-R1** (Public repo & license) | 2026-11-03 | Owner Action (Submission Track) |
| **GATE-V1** (3-minute video recorded & uploaded) | 2026-11-03 | Owner Action (Submission Track) |
| **Internal Freeze & Dry Run** | 2026-11-04 | Internal Deadline (Zero further changes) |
| **GATE-F1** (External hackathon submission) | **2026-11-05 11:00 JST** | **Hard External Deadline** |

### Priority Cut Line (in order of sacrifice)
1. **Muse Spark live calls** (`S1-LIVE`): First to cut if key/billing unavailable.
2. **XMemo live mapping** (`S2-LIVE`): Second to cut if OAuth registration unavailable.
3. **Live weather in recordings** (`S3-LIVE`): Third to cut; recorded weather fixtures are fully sufficient.
4. **Video post-production polish**: Cut to a single clean take.
5. **NEVER CUT**: The deterministic core demo pipeline, public repository publication (`GATE-R1`), video walkthrough (`GATE-V1`), and final form submission (`GATE-F1`).
