/**
 * Core Contracts: Intent Detection & Suppression
 * Governed by Invariants INV-108 and Section 2/3 of Architecture.
 */

import type { ContextSignal, ContextSnapshot } from './signal.js';
import type { MemoryFact } from './memory.js';

export type SuppressionCode =
  | 'already_done'
  | 'user_busy'
  | 'previously_declined'
  | 'quiet_hours'
  | 'duplicate_plan'
  | 'low_confidence'
  | 'budget_exhausted'
  | 'user_suppressed'
  | 'stale_signal'
  | 'other';

export type SuppressionScope = 'today' | 'this_event' | 'always';

export interface SuppressionReason {
  readonly code: SuppressionCode;
  readonly reason: string;
  readonly scope: SuppressionScope;
  readonly recordedAt: string;
}

/**
 * IntentCandidate
 * Result of intent detection. If suppressed, suppressedBy is mandatory (INV-108).
 */
export interface IntentCandidate {
  readonly intent: string;
  readonly confidence: number; // 0.0 to 1.0
  readonly evidence: readonly ContextSignal[];
  readonly suppressedBy?: SuppressionReason;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * IntentDetector
 * Plug-in component responsible for detecting intent from a snapshot and memory.
 */
export interface IntentDetector {
  readonly id: string;
  readonly targetIntent: string;
  detect(
    snapshot: ContextSnapshot,
    memory: readonly MemoryFact[]
  ): Promise<IntentCandidate | null> | IntentCandidate | null;
}
