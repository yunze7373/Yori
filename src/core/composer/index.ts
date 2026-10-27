/**
 * Core HomeComposer Implementation
 * Governed by Architecture Rev3 Section 5 and Acceptance Criteria AC-105-1.
 *
 * Enforces Living Context composition invariants:
 * - NOW: at most 1 item (single most relevant current plan or fallback; null quiet state is valid).
 * - AHEAD: at most 3 upcoming plans, ranked by shared policy.
 * - FOR YOU: memory insights and pending confirmations only.
 * - map: rendered ONLY when valid spatial evidence exists in the snapshot. No evidence, no map.
 * - Deterministic, pure output with zero ambient clock reads.
 */

import type {
  HomeComposer,
  LivingContext,
  PreparedPlan,
  MemoryFact,
  SpatialMapEvidence,
} from '../contracts/index.js';

export const MAX_AHEAD_ITEMS = 3;

export class CoreHomeComposer implements HomeComposer {
  public compose(
    now: PreparedPlan | null,
    ahead: readonly PreparedPlan[] = [],
    forYou: readonly MemoryFact[] = [],
    map?: SpatialMapEvidence | null,
    asOfOverride?: string
  ): LivingContext {
    // 1. NOW: at most 1 item (or null quiet state)
    const composedNow: PreparedPlan | null = now ? Object.freeze({ ...now }) : null;

    // 2. AHEAD: at most 3 items (enforcing cap <= 3)
    const composedAhead: readonly PreparedPlan[] = Object.freeze(
      ahead.slice(0, MAX_AHEAD_ITEMS).map(p => Object.freeze({ ...p }))
    );

    // 3. FOR YOU: pending memory proposals / insights awaiting confirmation (INV-107)
    const composedForYou: readonly MemoryFact[] = Object.freeze(
      forYou.filter(f => f.status === 'pending').map(f => Object.freeze({ ...f }))
    );

    // 4. MAP: Rendered ONLY when valid spatial evidence exists (no evidence -> null)
    let composedMap: SpatialMapEvidence | null = null;
    if (
      map &&
      map.spatialEvidence &&
      typeof map.spatialEvidence === 'object' &&
      map.placeOrRoute !== null &&
      map.placeOrRoute !== undefined
    ) {
      composedMap = Object.freeze({
        placeOrRoute: map.placeOrRoute,
        spatialEvidence: Object.freeze({ ...map.spatialEvidence }),
      });
    }

    const asOf = asOfOverride ?? composedNow?.createdAt ?? '1970-01-01T00:00:00.000Z';

    return Object.freeze({
      now: composedNow,
      ahead: composedAhead,
      forYou: composedForYou,
      map: composedMap,
      asOf,
    });
  }
}

export const homeComposer = new CoreHomeComposer();
