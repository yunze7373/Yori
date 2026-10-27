/**
 * Core Contracts: Living Context & HomeComposer
 * Governed by Section 5 of Architecture.
 */

import type { PreparedPlan } from './plan.js';
import type { MemoryFact } from './memory.js';
import type { ContextSignal } from './signal.js';

export interface SpatialMapEvidence {
  readonly placeOrRoute: unknown;
  readonly spatialEvidence: ContextSignal;
}

/**
 * LivingContext
 * Composed view presented on the home surface:
 * - NOW: at most 1 item (single most relevant current plan or honest fallback; 0 prompts is valid per D4)
 * - AHEAD: at most 3 upcoming plans, ranked by shared policy
 * - FOR YOU: memory insights and pending confirmations
 * - map: rendered ONLY when spatial evidence exists
 */
export interface LivingContext {
  readonly now: PreparedPlan | null;
  readonly ahead: readonly PreparedPlan[];
  readonly forYou: readonly MemoryFact[];
  readonly map?: SpatialMapEvidence | null;
  readonly asOf: string;
}

/**
 * HomeComposer
 * Composes living context from NOW, AHEAD, and FOR YOU plans.
 */
export interface HomeComposer {
  compose(
    now: PreparedPlan | null,
    ahead: readonly PreparedPlan[],
    forYou: readonly MemoryFact[],
    map?: SpatialMapEvidence | null
  ): LivingContext;
}
