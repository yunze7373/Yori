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
2. **The map follows the actions** instead of sitting above them as in 04. With the map above,
   the rain re-plan (banner plus change moment) pushes Accept / Not now under the Ask bar at 390
   and at 1280, which breaks the D3 floor; the floor wins. There is no duration callout yet: the
   demo route strip has no travel-time fact the callout could cite truthfully, so it comes with
   the map panel pass.
3. **Signal tiles remain** below the actions (the honest "what I used" row); 04 has no
   equivalent.
4. **No pager dots.** There is one Now card; no pager is shown for a single item.
5. **Demo (dev/test) keeps compact timeline controls** next to its "Demo · simulated" pill.
6. The **mic** is a send arrow (see above).
7. The **other surfaces** (Why, Sources interior, Ask panel, decision log, detail, map panel,
   consent, toasts, states) are the next commits.

## Defects fixed in this submission

- **(a) Muse Spark call #38 billed, then discarded.** Its raw reply was never recorded.
  - Every billed candidates answer now leaves a usage line with `outcome`, `rejectReason`,
    `rejectDetail` and `finishReason` (codes only).
  - The post-check is strict on facts, tolerant of honest phrasing: rounded distances, km,
    walking minutes consistent with the distance, rounded counts or ratings, a name instead of
    an id, JSON inside prose, and a long reason cut at a sentence end.
  - Proven on synthetic replies (`tests/proxy-boundary/candidate-postcheck-soft.test.ts`; 18 of
    20 fail on the old code).
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
