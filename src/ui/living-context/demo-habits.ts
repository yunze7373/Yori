/**
 * HABIT-LEARN item 8: the offline Demo shows a learned habit without any confirm step.
 * A seeded, clearly demo-labelled choice history (every observation carries demo: true; the fact's
 * note reads "Demo profile · sample choices") is run through the SAME learner as Live. Never
 * written to storage or to XMemo; a Forget in Demo tombstones it like any other habit.
 */

import type { MemoryFact } from '../../core/contracts/index.js';
import {
  learnLunchCuisine,
  toLearnedFact,
  type HabitObservation,
  type HabitTombstone,
} from '../../core/memory/habit-learner.js';

/** The Demo day (the continuous timeline's date); the sample history is the week before it. */
export const DEMO_HABIT_NOW = '2026-10-28T19:00:00.000Z';

export const DEMO_CHOICE_HISTORY: readonly HabitObservation[] = Object.freeze([
  { kind: 'lunch_choice', cuisine: 'ramen', placeId: 'demo-ramen-1', planId: 'demo-plan-1021', action: 'accept', at: '2026-10-21T03:10:00.000Z', demo: true },
  { kind: 'lunch_choice', cuisine: 'soba', placeId: 'demo-soba-1', planId: 'demo-plan-1022', action: 'accept', at: '2026-10-22T03:05:00.000Z', demo: true },
  { kind: 'lunch_choice', cuisine: 'ramen', placeId: 'demo-ramen-2', planId: 'demo-plan-1023', action: 'directions', at: '2026-10-23T03:20:00.000Z', demo: true },
  { kind: 'lunch_choice', cuisine: 'ramen', placeId: 'demo-ramen-1', planId: 'demo-plan-1027', action: 'accept', at: '2026-10-27T03:00:00.000Z', demo: true },
] as HabitObservation[]);

/** The Demo's learned habit (ramen · 3 of the last 4 lunches), or null once forgotten. */
export function demoLearnedFact(tombstones: readonly HabitTombstone[]): MemoryFact | null {
  const learned = learnLunchCuisine(DEMO_CHOICE_HISTORY, tombstones, DEMO_HABIT_NOW);
  return learned ? toLearnedFact(learned) : null;
}
