# UI-QUIET-PRECISION: UI review pack, first area (Home, Lunch, Settings > Connectors)

Owner directives 2026-11-03, TID `INBOX-20261103-A22CFB`:
- 17:05 JST: "the interface is too ugly";
- 17:08 JST: "especially HERE: make it STUNNING";
- 20:30 / 20:40 / 20:42 JST: the binding polish bar `04_owner_polish_target_home_connectors.jpg`, plus the 10-point refinement checklist for every surface.

This first submission covers **Home (depart and lunch), the Ask bar, the desktop rail and
Settings > Connectors** at 390x844 and 1280x800, against 04 first, then 03 / 01.

These surfaces are **not done yet** and are the next commits: the Why sheet, the Sources sheet
interior, the Ask panel and its replies, the decision log, the restaurant detail, the map panel,
consent prompts, toasts, and the designed loading / empty / offline / error states.

## Rework for review f4acae78 (CHANGES REQUESTED)

| Finding | Fix |
|---|---|
| P1-1 Rain state missing (the old "rain" capture was the clear scene: a recorded live weather reading replaced the demo rain) | Captured the **rain re-plan** at 390 and 1280 in the 04 structure, both on the Demo timeline (S3) and in Live (recorded Open-Meteo forecast plus your 10 min rain buffer): `rain-replan-demo-*.png`, `rain-replan-live-*.png`. The hero shows the serif "Leave by", the rain glyph, an "Updated plan ready" chip, one explanation line ("Rain expected 2:00–3:00 PM · take an umbrella; leaving 10 min earlier (2:35 → 2:25)."), the reason line, the muted schedule sentence and one caption row. |
| P1-2 Isolation in code | Commit `e689960` (see "Test isolation" below). |
| P2-3 Hero rhythm and map | One 6–8 px rhythm (card row gap, margins off). The subject is a quiet 15 px line, not a second headline. The map strip is a soft rounded strip **above the actions** (as in 04) with a duration callout ("25 min by car") taken only from the route's own `travelMinutes`; its provenance tag stays. The Live hero shows no empty "map not available" box. Accept / Not now stay hit-testable at 390 and 1280, including the rain re-plan (context-timeline (c), live-forecast). |
| P2-4 Signal tiles | A compact list ("what I used"): one line per value, no orphan wraps; 2 columns on wide screens. Home ends with bottom padding so nothing rests under the Ask bar. "Not connected" on Home now reads "No calendar linked yet"; the Sources sheet keeps the technical status. |
| P2-5 Lunch actions | The depart layout: three equal buttons (Accept / Adjust / Why), then Details / Not now as quiet text, at both widths. The 390 fold still holds (Not now at 653–697 px, Ask bar from 712 px). |
| P2-6 Connectors | One status per card. A detail line that only repeats the chip is visually quiet (still in the DOM). Human actions: "Use my location" (was "Connect" / "Acquire fix"), "Stop sharing" (was "Revoke session fix"). **No chevrons:** these cards open no detail view, so a chevron would promise navigation that does not exist. |
| P2-7 Header | A softer sage/ivory botanical (opacity 0.62, thin stem) clear of the avatar and the greeting. The Open-Meteo credit moved to a quiet credits line at the end of Home (still where the weather shows). The pill lists user-recognisable sources only ("Location · Calendar · Weather · Places · Memories", or "Nothing shared yet"); the device clock is listed in the Sources sheet. |
| P2-8 Desktop | Text leads the pick (176 px thumbnail, details right, footer at the bottom). The rail's duplicate distance line is gone. **Kept:** the rail's place tiles, because they are the working "tap a place to route there" control (live-lunch, desktop-parity). Turning the rail into a styled map panel is the next desktop pass. |
| P2-9 Demo header | The play / step / restart controls appear only with `?controls=1` or in dev mode; a recorded demo header shows the one "Demo · simulated" pill. `npm run demo:record` serves the shipping build, which opens in Live (no demo controls at all). |

## Tokens

`src/ui/living-context/quiet-precision.css` (custom properties, documented in its header):

| Token family | Values |
|---|---|
| Colour | `--qp-canvas` #F7F5EF, `--qp-surface` #FFF, `--qp-ink` #15302A, `--qp-ink-soft`, `--qp-ink-quiet`, `--qp-forest` #1E4A3B, `--qp-sage`, `--qp-sage-wash`, `--qp-line` (warm hairline), `--qp-rain-*`, `--qp-ok`, `--qp-warn` |
| Type | Newsreader (display serif) + Inter. Wordmark 34 (30 on phone), greeting 28 (36 on desktop), card title 24–26, body 15–16, caption 13, eyebrow 11 uppercase +0.08em. Tabular numerals on times, distances and ratings. `text-wrap: balance` / `pretty` on headings and descriptions. |
| Spacing | 8-pt scale `--qp-s1..s7` (4–32); card padding 20 (16 on phone) |
| Radii | card 20, tile 16, button 14, pills full |
| Elevation | `--qp-shadow-card`, `--qp-shadow-float`, `--qp-shadow-press` |
| Motion | `--qp-ease`, 160–220 ms hover / press / focus-visible on every control; `prefers-reduced-motion` turns transitions off |

## What changed (against 04)

| 04 trait | App |
|---|---|
| Serif "Yori" wordmark, avatar, botanical leaf bleeding off the top right | Done. The leaf is an inline SVG (crisp at 2x). The avatar is a neutral glyph; there is no stock face and no fictional name. |
| Greeting with a quiet subline | Done ("Good evening." plus "I've already looked ahead for you."). |
| ONE "Live context ›" pill listing the sources | Done. The pill lists only sources delivering data right now. It opens the Sources sheet, which holds the engine status (`#model-status-pill`, with latency). The status line, LIVE badge, engine pill and connector chips are gone from Home. |
| Hero: eyebrow with icon and relative time, serif "Leave by …", one-line reason, muted explanation, weather glyph, map, Accept / Adjust / Why? | Done. The eyebrow is TRAVEL / LUNCH / FUEL; Simulated or Live sits beside the time. The muted explanation is the existing schedule sentence ("Get ready at 2:10 PM, leave by 2:30 PM"). The rain glyph appears when rain drives the plan. Accept is filled forest; Adjust and Why are outlined. Details / Not now are quiet text. |
| Ahead row card with photo, serif title and "min away" | Lunch is a row of photo cards with real Google photos when fetched, and an honest illustration tile otherwise. On desktop the selected pick is a horizontal card (photo left), like 04's Ahead card. |
| Floating "Ask Yori anything…" bar with sparkle and a green action | Done. The action is a **send arrow, not a mic**: voice (D10) does not exist, so a mic would be a fake affordance. |
| Settings > Connectors | Serif title, privacy reassurance, one rounded card per connector (tinted icon tile, title, description, status chip). Status details are plain lines, no grey boxes. |

## Honesty kept

- The time / weather / place line (`#living-header-line`) stays in the DOM for assistive tech,
  visually hidden.
- `(straight-line)` and "Open now · from Google opening hours" are visually quiet on the phone
  card but stay in the text (screen readers, tooltip) and in details.
- "Powered by Google" appears once per surface, plus each photo's author credit.
- The Open-Meteo credit stays beside the pill whenever live weather is shown.

## Acceptance checks (automated, `tests/e2e-live/ui-quiet-precision.spec.ts`)

- Header: one Live context pill (title and source list), no connector chips, no engine pill,
  no jargon (`N/A`, `Disconnected`, `deterministic`, `ms`).
- Fold at 390: the hero card starts ≤ 260 px and its title ≤ 300 px. **Deviation:** 04 itself
  places the hero title at about 282 px, so the earlier 180 px budget cannot hold with a 04
  header. At most one status pill above the fold. **Accept and Not now are hit-testable at
  scroll top** (`elementFromPoint`), on depart and on lunch.
- No visible `deterministic`, `…ms`, `fallback ·` or `(straight-line)` on the cards. The same
  facts are one tap away (Sources sheet engine status; the distance qualifier in the chip's
  text and title).
- Zero console errors and CLS 0.000 after load on depart, lunch and Connectors at 390 and 1280.
- Contrast ≥ 4.5:1 (computed) for the greeting line, the pill's source list, the hero title, the
  subject, the explanation, Accept and Not now.
- Defect (b): no fix names the missing location; a fix from Connectors gets its weather request
  at once; after consent, the first paint shows the weather.
- Evidence written by the spec:
  - connectors at 390 and 1280;
  - 2x component crops: header, hero card, lunch row, Ask bar, connector card;
  - `screen-recording-390x844.webm` (≤ 20 s: press, row scroll, Sources sheet).

## Remaining deviations from 04 (and why)

1. **No user name** in the greeting. The app does not know it, and 04's "Yuna" is fictional.
2. **The Live hero has no map strip** (the home strip has no live map; the empty box is hidden).
   The demo strip is schematic and says so.
3. **Signal tiles remain** below the actions (the honest "what I used" row); 04 has no
   equivalent.
4. **No pager dots.** There is one Now card; no pager is shown for a single item.
5. **Demo (dev/test) keeps compact timeline controls** next to its "Demo · simulated" pill.
6. The **mic** is a send arrow (see above).
7. The **other surfaces** (Why, Sources interior, Ask panel, decision log, detail, map panel,
   consent, toasts, states) are the next commits.

## Test isolation (Reviewer 21:20 JST, incident at :4173)

- **(a)** `playwright.config.ts` never reuses a running server on the test or shipping port
  (`reuseExistingServer: false`, `--strictPort`).
  - Negative proof: with a server already on the test port, the run aborts with
    "http://localhost:4283 is already used".
- **(b)** `production-gating` and `live-default-env` read their URLs from the config, which
  publishes `YORI_TEST_BUILD_URL` / `YORI_SHIPPING_URL`; they fail if those are unset. No
  hard-coded 4173/4174 is left in any spec.
- **(c)** `tests/env/isolation-guard.spec.ts` fails when a target server reports a live provider
  (weather, places or route `enabled:true`) or a live model (`diagnostics.status === 'enabled'`).
  - Unit proof: `src/ui/isolation-guard.test.ts`.
  - Live negative proof: a preview with live flags on 5173 was flagged on all four (weather,
    places, route, model); the isolated preview returned `[]`.
- The contaminated PNGs under `docs/evidence/{live-default,live-depart,live-lunch,live-reason,ui-polish}`
  are restored. This slice re-captures only its own folder, from its own isolated test build.

## Defects fixed in this submission

- **(a) Muse Spark call #38 billed, then discarded.** Its raw reply was never recorded.
  - Every billed candidates answer now leaves a usage line with `outcome`, `rejectReason`,
    `rejectDetail` and `finishReason` (codes only).
  - The post-check is strict on facts, tolerant of honest phrasing: rounded distances, km,
    walking minutes consistent with the distance, rounded counts or ratings, a name instead of
    an id, JSON inside prose, and a long reason cut at a sentence end.
  - **Fail soft for unverifiable numbers:** the clause carrying the number is dropped and the rest
    re-checked ("Soba Ichi is open now, only 30 m away." shows "Soba Ichi is open now."). The
    usage log records `outcome: accepted, rejectDetail: numeral_stripped`. Nothing honest left
    means a rejection. Out-of-set ids stay strictly rejected.
  - Proven on synthetic replies (`tests/proxy-boundary/candidate-postcheck-soft.test.ts`; the
    honest-phrasing cases fail on the old code).
- **(b) "Weather unavailable" with location shared.** A fix acquired outside the consent sheet
  never triggered a weather request.
  - Now any consented fix without a weather request gets one.
  - With no fix the header says "Weather needs location".
  - Failures are logged by reason code only.
  - No fix is taken without the in-session consent tap.

## Comparison images

`node scripts/ui-qp-compare.mjs` writes `compare-*.png` (reference crop | app):
- 04 Home vs depart;
- 04 Home vs lunch;
- 04 Connectors;
- 03 Home rain;
- 03 Lunch;
- 01 desktop.
