/**
 * Core Pipeline Entry
 * Governed by Architecture Rev3 Section 2 & 3.
 *
 * S1-1 minimal wiring:
 * Iterate registered plugins -> detect -> (policy pass-through stub) -> prepare -> NOW = highest-confidence unsuppressed plan.
 */

import type {
  ContextSnapshot,
  MemoryFact,
  LivingContext,
  SuppressionReason,
  Plugin,
  PreparedPlan,
  IntentCandidate,
} from '../contracts/index.js';
import { staticPluginRegistry } from '../../plugins/registry.js';
import type { FailClosedNotice } from '../policy/index.js';
import { sharedPolicyStub } from '../policy/index.js';

export interface PipelineInput {
  readonly snapshot: ContextSnapshot;
  readonly memory: readonly MemoryFact[];
  readonly clock?: { now(): string } | string;
  readonly plugins?: readonly Plugin[];
}

export interface PipelineResult {
  readonly livingContext: LivingContext;
  readonly suppressions: readonly SuppressionReason[];
  readonly notices: readonly FailClosedNotice[];
}

/**
 * Runs the central proactive agent pipeline.
 * S1-1 wiring: runs registered plugins, checks suppression, prepares plans,
 * and sets NOW to the highest-confidence unsuppressed plan.
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  const plugins = input.plugins ?? staticPluginRegistry.getAll();
  const suppressions: SuppressionReason[] = [];
  const notices: FailClosedNotice[] = [];
  const candidatePlans: Array<{ candidate: IntentCandidate; plan: PreparedPlan }> = [];

  for (const plugin of plugins) {
    // 1. Detect candidate
    const rawCandidate = plugin.detector.detect(input.snapshot, input.memory);
    if (!rawCandidate || typeof (rawCandidate as Promise<unknown>).then === 'function') {
      continue;
    }
    const candidate = rawCandidate as IntentCandidate;

    // 2. Policy suppression check (stub pass-through in S1-1; full shared policy in S2-1)
    const suppression =
      candidate.suppressedBy ?? sharedPolicyStub.checkSuppression(candidate);
    if (suppression) {
      suppressions.push(suppression);
      continue; // Suppressed candidates never reach preparation (INV-108)
    }

    // 3. Prepare plan
    const rawPlan = plugin.preparer.prepare(candidate, input.snapshot, input.memory);
    if (rawPlan && typeof (rawPlan as Promise<unknown>).then !== 'function') {
      candidatePlans.push({ candidate, plan: rawPlan as PreparedPlan });
    }
  }

  // 4. Rank and choose NOW = highest-confidence unsuppressed plan
  candidatePlans.sort((a, b) => b.candidate.confidence - a.candidate.confidence);

  const now: PreparedPlan | null = candidatePlans.length > 0 ? candidatePlans[0]!.plan : null;
  const ahead: PreparedPlan[] = candidatePlans.slice(1).map(c => c.plan);

  return Object.freeze({
    livingContext: Object.freeze({
      now,
      ahead: Object.freeze(ahead),
      forYou: Object.freeze([]),
      map: null,
      asOf: input.snapshot.asOf,
    }),
    suppressions: Object.freeze(suppressions),
    notices: Object.freeze(notices),
  });
}
