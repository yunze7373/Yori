# HABIT-LEARN evidence (INBOX-20261104-1565F0, rework of review 472771f0)

Owner steering (Han, 2026-11-04):
- **13:25 JST:** Yori should learn your habits and recommend well, not ask about and confirm everything.
- **14:27 JST (addendum 2):** there should be no Why option at all. Users don't need to know why; Yori should simply understand them.

This slice replaces the confirm-only memory model (INV-107) with **learn-and-correct** memory. Yori
learns from your in-app choices and applies what it learns without asking or explaining. What you
tell it is saved as stated. You can always see what was learned, and forget it, on Me.

Screenshots are taken after motion settles, at 390x844 and 1280x800, by
`tests/e2e-live/habit-learn.spec.ts` (`UPDATE_EVIDENCE=1`). Every provider is a recorded route,
and the model answers as an offline fallback: zero billed calls.

## Screens

| File | What it shows |
|---|---|
| `01-home-lunch-learned-{390x844,1280x800}.png` | After ramen was accepted on two lunches, a search where a cafe is closer still puts Mid Ramen first. The card states no reason, and there is no Why action and no evidence rows (Accepted + Undo after Accept; Accept + Adjust before). |
| `02-detail-no-why-*.png` | The restaurant detail describes the place in plain words: no taste reason and no Why. |
| `03-ask-why-plain-*.png` | Ask no longer suggests "Why this restaurant?". Asked anyway, Yori answers in one plain sentence: "Mid Ramen, because you often pick ramen." |
| `04-me-learned-*.png` | Me > What Yori has learned: the habit, what it is based on, and a quiet Forget. This is user control, not an explanation on a card. |
| `05-me-after-forget-*.png` | After Forget: the habit is gone. |
| `06-home-after-forget-*.png` | The next search falls back to open now / distance (Near Cafe first). |
| `07-me-told-yori-390x844.png` | Ask "I'm vegetarian" is saved as stated: "Vegetarian · You told Yori". |

## Acceptance mapping

| Item | Where it is proven |
|---|---|
| 1. Observe Accept / Directions / Save (in-app only; no location, no model) | `src/core/memory/habit-journal.ts`. App hooks: `recordLunchChoice` in `app.ts`; Undo takes an Accept back. Unit `habit-journal.test.ts` checks the stored shape (no coordinates), refusals, tamper tolerance and the 200-choice bound. The e2e asserts the journal holds no coordinates. |
| 2. Deterministic learner | `src/core/memory/habit-learner.ts`. Unit `habit-learner.test.ts`: no learning from 1 choice, threshold, tie, 14-day window, future-dated choices, one choice per (plan, place). |
| Addendum 1: never learn sensitive characteristics | `isSensitiveLabel` / `normalizeCuisine`: vegetarian, vegan, halal, kosher, gluten-free, allergy, lactose / dairy-free, diabetic, low-salt / sugar / carb, keto, organic, health, medical, diet (incl. OSM `diet:*`), religious. Such labels are neither recorded nor learned; the learner also skips them in a tampered journal. Unit: repeated choices of each label give no learned fact, and a plain cuisine is still learned. Raw choices stay on-device; only the derived plain-cuisine fact writes through to XMemo when connected. Diet is only ever saved when stated (Ask "I'm vegetarian"). |
| 3. Ranking (user-stated outranks learned) | `src/core/memory/taste.ts`, `rankPlacesByConfirmedPreferences`, and the lunch preparer. Unit `taste.test.ts` and `nearby-now.test.ts`. Addendum 2: the habit shows only as the ordering (screen 01). |
| 4. No confirm steps | Confirm/Reject are removed everywhere. Adjust "Remember" and Ask statements are saved as `user_stated`; Dismiss queues nothing. The e2e asserts no Confirm/Reject control on Home, lunch, Ask or Me. |
| Addendum 2: no Why | (a) No Why action and no Why sheet on Home, the lunch card, restaurant / trip detail or the desktop rail; the action row is Accept + Adjust (Accepted + Undo after Accept). The context pill opens Settings › Connectors instead of a Sources sheet. (b) No WEATHER / CALENDAR / MEMORY evidence rows, no "Based on …" footer, and no basis lines on cards or the rail; the detail basis is a plain cuisine line. (c) Ask has no "Why this restaurant?" suggestion; asked anyway, the answer is one plain sentence. (d) Attributions and photo credits stay, along with one quiet demo label and Me + Forget. (e) VIDEO_SCRIPT scene 4 is "Yori Learns You"; Why steps and strings are removed from VIDEO_SCRIPT, `video-script.spec.ts` and PROJECT_DESCRIPTION. (f) The e2e asserts no Why button, no Why sheet and no evidence rows at 390 and 1280 (`expectNoWhy` in `habit-learn.spec.ts`). Existing specs are updated (see below). |
| 5. Me "What Yori has learned" + Forget | `me-view.ts` and the Forget handler. Unit: forget, the 30-day tombstone, explicit-statement override. e2e screens 04-06, plus the reload check. |
| 6. Write-through + proxy statuses | The adapters and `server-proxy.ts` accept `learned` (source `observed`) and user-stated facts. They reject `pending`, unknown statuses, learned-without-observed, observed-as-confirmed, malformed keys and values over 1000 characters with 400; unmanaged keys get 403. Unit `server-proxy.test.ts` and `composite-adapter.test.ts`. |
| 7. Narrative | PROJECT_DESCRIPTION ("Yori Learns You"), LIVING_CONTEXT_V2, VIDEO_SCRIPT and PRIVACY. |
| 8. Demo seed | `demo-habits.ts`: a labelled sample history run through the same learner, in the Demo lunch scenes and timeline only. It is never stored or sent, and Forget hides it (`ui-demo-fy.spec.ts`). |

## Specs updated for Addendum 2

None were deleted; existing specs were retained and updated to assert the absence of Why/Sources sheets, evidence rows, and basis lines across Home, Lunch, Trip Detail, and Desktop.

## Notes

- **Two lunches = two days.** A lunch Accept is remembered per day, so "Accept ramen twice" happens on two days (`page.clock`: lunch 1 yesterday, lunch 2 today).
- **Demo vs Live.** Live choices write the journal; Demo choices do not, so a demo session never teaches the Live profile.
- **The why-sheet module** (`src/ui/review/why-sheet.ts`) is no longer reachable from any user surface. Its humanisers are reused by Me.
