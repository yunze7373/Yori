/**
 * Core Pipeline Entry (Stub for S0-2)
 * Full implementation scheduled for S2-1 / S3-1.
 *
 * Architecture Rev3 Section 2 & 3:
 * Pipeline drives Perception -> Snapshot -> Intent Detection -> Suppression (Shared Policy) -> Preparation -> HomeComposer.
 */

import type {
  ContextSnapshot,
  MemoryFact,
  LivingContext,
  SuppressionReason,
} from '../contracts/index.js';
import type { Plugin } from '../../plugins/registry.js';
import type { FailClosedNotice } from '../policy/index.js';

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
 * Stub in S0-2 returns empty livingContext, suppressions, and notices.
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  return Object.freeze({
    livingContext: Object.freeze({
      now: null,
      ahead: Object.freeze([]),
      forYou: Object.freeze([]),
      for_you: Object.freeze([]),
      map: null,
      asOf: input.snapshot.asOf,
    }),
    suppressions: Object.freeze([]),
    notices: Object.freeze([]),
  });
}
