# HABIT-LEARN evidence (INBOX-20261104-1565F0)

Owner steering, 2026-11-04 13:25 JST: Yori should learn habits from what you do and recommend
well, not ask about and confirm everything. This slice replaces the confirm-only memory model
(INV-107) with **learn-and-correct** memory. Yori learns from your in-app choices and applies
what it learns without asking. What you tell it is saved as stated. You can always see what was
learned, and forget it.

All screenshots are taken after motion settles, at 390x844 and 1280x800, by
`tests/e2e-live/habit-learn.spec.ts` (`UPDATE_EVIDENCE=1`). Every provider is a recorded route,
and the model answers as an offline fallback: zero billed calls.

## Screens

| File | What it shows |
|---|---|
| `01-home-lunch-learned-{390x844,1280x800}.png` | After ramen was accepted on two lunches, a search where a cafe is closer still puts Mid Ramen first. Its basis on the card: "You often pick ramen · 2 of your last 2 lunches". |
| `02-why-sheet-learned-*.png` | Why sheet: the "Lunch habit" row has the same basis and the tag "Learned from your choices". |
| `03-ask-why-learned-*.png` | Ask "why this restaurant?": "Mid Ramen is first because you often pick ramen · 2 of your last 2 lunches." |
| `04-me-learned-*.png` | Me > What Yori has learned: the habit, its basis, and a quiet Forget. |
| `05-me-after-forget-*.png` | After Forget: the habit is gone. |
| `06-home-after-forget-*.png` | The next search falls back to open now / distance (Near Cafe first). No "You often pick" anywhere. |
| `07-me-told-yori-390x844.png` | Ask "I'm vegetarian" is saved as stated and listed as "Vegetarian · You told Yori". |

## Acceptance mapping

| Acceptance item | Where it is proven |
|---|---|
| 1. Observe Accept / Directions / Save (in-app only; no location, no model) | `src/core/memory/habit-journal.ts`. App hooks: `recordLunchChoice` in `src/ui/living-context/app.ts`, on Accept, card Directions and detail Save; Undo takes the Accept back. Unit `habit-journal.test.ts` checks the stored shape (no coordinates), refusals, tamper tolerance and the 200-choice bound. The e2e asserts the journal holds no coordinates. |
| 2. Deterministic learner (>= 2 in 14 days, strictly more than any other; applies at once) | `src/core/memory/habit-learner.ts`. Unit `habit-learner.test.ts`: no learning from 1 choice, threshold, tie, 14-day window, future-dated, one choice per (plan, place), status `learned` / source `observed`. |
| 3. Ranking + one basis everywhere (user-stated wins over learned) | `src/core/memory/taste.ts` (shared signals), `rankPlacesByConfirmedPreferences`, and the lunch preparer (per-option `habitBasis`). Card, Why and Ask all use that basis. Unit `taste.test.ts` and `nearby-now.test.ts` cover the explanation strings, the precedence, and pending facts being ignored. e2e screens 01-03. |
| 4. No confirm steps; Ask statements saved directly | Confirm/Reject controls are removed from Home For You, the For You tab, Me and legacy v1. Adjust "Remember" saves as stated. Dismiss no longer queues a "Skip lunch …?" proposal. Ask "I'm vegetarian" / "remember I like quiet places" / "I like ramen" are saved as `user_stated` (`memory-statements.ts`, unit `memory-statements.test.ts`). The e2e asserts that no Confirm/Reject control renders on Home, the lunch card, Ask or Me. The browser location permission and Accept / Adjust / Why stay. |
| 5. Me "What Yori has learned" + Forget (30-day tombstone; explicit statement overrides) | `src/ui/me/me-view.ts` and the Forget handler in `app.ts`. Unit `habit-learner.test.ts` covers forget, the tombstone, expiry and the override. e2e screens 04-06, plus the reload check and the tombstone in storage. |
| 6. Write-through + proxy statuses | Local and composite adapters accept `confirmed` / `learned` and still refuse `pending`; composite `forget` deletes remotely only when connected. `server-proxy.ts` accepts `learned` (source `observed`) and user-stated facts. It rejects `pending`, unknown statuses, learned-without-observed, observed-as-confirmed, malformed keys (`^[a-z0-9_]{1,60}$`) and values over 1000 characters with 400; unmanaged keys stay 403. Unit `server-proxy.test.ts` (HABIT-LEARN block) and `composite-adapter.test.ts`. |
| 7. Narrative | INV-107 wording is replaced in `docs/submission/PROJECT_DESCRIPTION.md`, `docs/architecture/LIVING_CONTEXT_V2.md`, `docs/submission/VIDEO_SCRIPT.md` (Part 5 and the quote tables, with `tests/e2e/video-script.spec.ts` asserting the new strings) and `docs/PRIVACY.md`. That covers what is observed, where it is stored, how to forget, and that XMemo write-through happens only when connected. Why tags: "Learned from your choices" / "You told Yori" / "Demo profile · sample preference". |
| 8. Demo seed | `src/ui/living-context/demo-habits.ts`: a labelled sample history (ramen 3, soba 1; every entry `demo: true`). It goes through the same learner and is shown as "Learned from sample choices · demo" in the Demo lunch scenes and the timeline. It is never stored and never sent to XMemo, and Forget hides it (`tests/e2e/ui-demo-fy.spec.ts`). |

## Notes

- **Two lunches = two days.** A lunch Accept is remembered per day (the existing
  `isPlanAccepted` rule), so "Accept ramen twice" happens on two days. The e2e runs lunch 1
  yesterday with `page.clock` and lunch 2 today.
- **Demo vs Live.** Live choices write to the journal. Demo choices do not: Demo shows the
  labelled sample history instead, so a demo session never teaches the Live profile.
- **Model.** The candidates model receives the learned habit as one short fact
  ("ramen (picked 3 of last 4 lunches)"). The choice history is never sent.
