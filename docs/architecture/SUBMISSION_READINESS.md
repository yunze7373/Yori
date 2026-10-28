# Yori — Submission Readiness (Phase R after PH-002)

> Planning only (ARCH-SUBMIT-001). No coding dispatch, no live calls,
> no publishing or submitting is authorized by this document.
> Deadlines: internal **2026-11-04**; external submission
> **2026-11-05 11:00 JST**. PH-002 closeout approved:
> Reviewer decision `2c9e058d` at commit `bb87efaf`; AC-EXT-1 core
> diff vs `f43c6c1d` empty. No owner sign-off is assumed anywhere
> below (owner-decision reads returned CAPABILITY_UNAVAILABLE).

## 1. Status table (exactly one class per capability)

| Capability | Class | Evidence / flag / missing check |
|---|---|---|
| Core demo pipeline (Living Context, D1–D6, Review/Why/Me) | DONE+LOCAL-TESTED | Closeout `2c9e058d` @ `bb87efaf`: golden 10/10, e2e 66/66 dual-width, 261 unit, drills 21/21, zero keys configured |
| Muse Spark reasoning (rank/choose, constrained) | IMPLEMENTED-BUT-OFF | Flag: `MODEL_API_KEY` unset (diagnostics `disabled`, keySource `none`). Approved: B1 `dec2d875`, B2 `c42058b8`. Offline fixtures only |
| Muse Spark live calls | LIVE-UNVERIFIED | Never called live. Missing: owner key + billed-call approval, then the bounded live verification slice (plan S1-LIVE) with fact-check pass-rate report |
| XMemo memory (OAuth + MCP proxy) | IMPLEMENTED-BUT-OFF | Flag: `XMEMO_OAUTH_ENABLED=false`. Approved: C1 `9ec6fd22`, C2 `5540ae07`. Local memory is the active truth |
| XMemo live mapping (`recall`/`remember`) | LIVE-UNVERIFIED | Code marks it `UNVERIFIED_XMEMO_MCP_MAPPING`. Missing: owner-authorized probe against the real MCP server on the owner's account (plan S2-LIVE) |
| Live weather (Open-Meteo) | IMPLEMENTED-BUT-OFF | Flag: `WEATHER_LIVE_ENABLED=false`. Approved: D1 `6a0cc56b`. Fixed demo-city coordinates; no device geolocation anywhere |
| Open-Meteo terms qualification | OWNER-ACTION-REQUIRED | Owner confirms non-commercial qualification (<10k calls/day tier) or directs recorded-fixture use (GATE-W1) |
| Calendar / route | OWNER-ACTION-REQUIRED | Design only (`CALENDAR_ROUTE_DESIGN.md`, D2 `1cf738a7`); zero provider code. Decisions OD-1..OD-6 are the owner's; nothing is scheduled before them |
| 3-minute video | OWNER-ACTION-REQUIRED | Script ready: `docs/submission/VIDEO_SCRIPT.md` (E2 `c5f04302`). Recording + upload are owner actions (GATE-V1) |
| Repo / licence | OWNER-ACTION-REQUIRED | `LICENSE` is MIT with holder `[OWNER TO CONFIRM]`; no remote exists yet. Owner confirms holder, creates remote, sets public (GATE-R1) |
| Hackathon submission | OWNER-ACTION-REQUIRED | Package drafted (`docs/submission/PROJECT_DESCRIPTION.md`, `SUBMISSION_CHECKLIST.md`). Final form submission is the owner's, by 2026-11-05 11:00 JST (GATE-F1) |

## 2. Owner gates (minimal human action; consequence if not done)

| Gate | Minimal owner action | If not done |
|---|---|---|
| GATE-S1 Spark key + billing | Put `MODEL_API_KEY` in Yori's `.env.local` (never copied from Muse Code private auth) and explicitly approve a small billed live-call budget | Demo and video run on the deterministic path, and say so honestly. Zero loss to the core demo |
| GATE-X1 XMemo live auth | Authorize dynamic client registration and complete one consent click on the owner's own XMemo account | XMemo stays OFF with local fallback; video shows local memory only |
| GATE-W1 Open-Meteo terms | Decide non-commercial qualification for live enablement in recordings | Recordings use recorded, labelled weather fixtures |
| GATE-V1 Video | Record the 3-minute walkthrough per script and upload it (YouTube/Loom) | No video exists; submission can still file with description + repo, materially weaker |
| GATE-R1 Repo/licence | Confirm LICENSE holder, create the remote, push, set visibility public | Judges cannot access code; submission incomplete |
| GATE-F1 Submission | Complete and send the official hackathon form | No submission, regardless of demo quality |

Slices S1-LIVE / S2-LIVE / S3-LIVE exist in `YORI_SUBMIT.plan.json`
only behind GATE-S1 / GATE-X1 / GATE-W1 respectively. Each is small:
fixed small call counts, server-side only, `max_tokens` capped,
focused tests, AC-EXT-1 core diff vs `f43c6c1d` stays empty, no
secrets committed. The three live tracks are **parallel optional
branches** off the fallback verification; the submission track
(repo → video → submission) depends only on the fallback path and
never on a live item. Every gate has an explicit terminal state —
done, or declined/not-done by its latest safe date (recorded, branch
skipped) — so an unanswered gate unblocks rather than stalls.

## 3. Guaranteed zero-credential demo path (video fallback)

Needs no owner credentials at all and is the default recording path
until a gate clears: deterministic offline scenes D1–D6; fixed-city
weather from recorded, labelled fixtures (`source: "real"` data is
never faked — recorded fixtures stay labelled as recorded/simulated);
local memory; model off. The video script already narrates this
honestly ("live integrations are implemented and verified locally;
live calls are owner-gated"). This path is never cut.

## 4. Visual evidence access (stated plainly)

The DevFlow grant available to the ChatGPT coordinator lacks
artifact scope and Yori is not allowlisted, so **the coordinator
cannot independently view the screenshots** in `docs/evidence/`.
No ChatGPT visual review is claimed anywhere. PH-002 visuals were
verified by the Reviewer via rendered evidence. Owner-only options
(GATE-V0 in the plan): (a) view `docs/evidence/` locally; (b) grant
artifact scope / allowlist Yori for the coordinator; (c) authorize
an executor Telegram image send of selected screenshots.

## 5. Schedule (latest safe dates, JST) and cut line

| Item | Latest safe date |
|---|---|
| GATE-S1 key + billing approval | 2026-10-31 (S1-LIVE verification 11-01) |
| GATE-X1 XMemo authorization | 2026-10-31 (S2-LIVE verification 11-01..02) |
| GATE-W1 Open-Meteo decision | 2026-11-02 (S3-LIVE enablement same day) |
| GATE-V1 video recorded + uploaded | 2026-11-03 |
| GATE-R1 repo public | 2026-11-03 |
| Internal freeze + submission package dry run | 2026-11-04 |
| GATE-F1 external submission | 2026-11-05 11:00 JST (hard) |

Cut line, in order: Spark live → XMemo live → live weather in
recordings → video polish beyond one clean take. The deterministic
demo, the video itself, and the submission are never cut.
