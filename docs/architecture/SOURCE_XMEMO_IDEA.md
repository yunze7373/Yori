# Source: XMemo recalled product idea (pinned)

> Provenance: XMemo memory `c4cbf53a-7778-4629-a7b9-c91de25cf5a5@v1`
> (Projects / Realworld-assistant / Idea, created 2026-10-14).
> Pinned 2026-10-28 at human request to start ARCH_START.
> Scope note: only product content is pinned. Personal registration
> data from related memories is intentionally excluded.
> Authority note: this is the long-term vision source. The approved
> MVP contract is `.progress/spec/requirements.md` (Gate-S approved,
> completeness 95). Where they conflict, the SPEC wins for Phase 1.

## One line

A proactive real-world assistant that is ready before the user asks:
it fuses GPS, calendar, time, and long-term preference memory so the
user feels like a local anywhere.

## Core mechanisms (vision)

1. GPS + dwell time -> behavior inference (e.g. long dwell in a
   supermarket implies shopping there).
2. Behavior settles into long-term preference memory that follows the
   user across sessions, devices, and places.
3. Proactive prompts when the user passes a relevant place again
   (e.g. "you usually buy milk here — need some?").
4. Travel mode: live GPS fused with nearby merchants, signs, transit,
   and travel info, with preference-shaped choices.

## Why proactive is the wedge

- Business trip: the agent pre-plans meals, lodging, work schedule,
  and destinations; the user accepts/rejects in place instead of
  opening a chat to ask.
- Calendar + GPS + time: a 3pm piano lesson with the user still home
  at 2:50 triggers a leave-now prompt, route, and navigation.

## Differentiation

- Ordinary location apps know what is nearby; this agent knows what
  *you* usually want in such a place.
- Memory follows the user, not the place.
- Cross-app, cross-platform, long-horizon preference accumulation,
  unlike OS-level proactive suggestions.

## Constraints carried into design

- Privacy is a first-class design input: user authorization,
  on-demand collection, least privilege for calendar/location.
- Demo convergence advice from the source: do not build the whole
  vision at once; focus on 1–2 scenarios (trip pre-planning /
  lesson leave-reminder). The approved MVP narrows this further to
  the appointment prepare/leave scenario with simulated data first.
