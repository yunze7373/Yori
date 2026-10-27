/**
 * Core Contracts: Plan Preparation & Explainable Why
 * Governed by Invariants INV-103, INV-104 and Section 3 of Architecture.
 */

import type { SignalSource } from './signal.js';
import type { ContextSnapshot } from './signal.js';
import type { MemoryFact, MemoryStatus } from './memory.js';
import type { IntentCandidate } from './intent.js';

export interface EvidenceCitation {
  readonly kind: string;
  readonly source: SignalSource;
  readonly issuedAt: string;
  readonly description?: string;
}

export interface MemoryCitation {
  readonly key: string;
  readonly value: unknown;
  readonly status: MemoryStatus;
}

/**
 * WhyExplanation
 * Every prepared plan must carry why: evidence signals with issuedAt,
 * memory facts used, and deterministic derivation (Section 3: No Why, no card).
 */
export interface WhyExplanation {
  readonly evidenceSignals: readonly EvidenceCitation[];
  readonly memoryFactsUsed: readonly MemoryCitation[];
  readonly derivation: string;
}

export interface PlanOption {
  readonly id: string;
  readonly label: string;
  readonly details?: string;
  readonly estimatedMinutes?: number;
  readonly cost?: string;
  readonly requiresConfirmation: boolean;
  readonly mode?: string;
  readonly leaveAt?: string;
  readonly travelMinutes?: number;
  readonly rankedByFactKey?: string;
  readonly name?: string;
  readonly cuisine?: string;
  readonly distanceMinutes?: number;
}

export interface PlanAction {
  readonly type: string;
  readonly label: string;
  readonly requiresConfirmation: boolean; // INV-104
  readonly payload?: Readonly<Record<string, unknown>>;
}

/**
 * PreparedPlan
 * The actionable proactive plan presented to the user.
 */
export interface PreparedPlan {
  readonly id: string;
  readonly intentId: string;
  readonly headline: string;
  readonly optionsOrSteps: readonly (PlanOption | string)[];
  readonly checklist?: readonly string[];
  readonly actions?: readonly PlanAction[];
  readonly requiresConfirmation: boolean; // INV-104: booking, payment, itinerary change
  readonly why: WhyExplanation;           // mandatory explainable proof
  readonly createdAt: string;
  readonly alreadyDue?: boolean;          // AC-102-3: prepareAt has already passed
  readonly subjectTitle?: string;
  readonly apptAt?: string;
  readonly prepareAt?: string;
  readonly leaveAt?: string;
  readonly timezone?: string;
}

/**
 * Preparer
 * Plugin component generating an actionable PreparedPlan from an unsuppressed candidate.
 */
export interface Preparer {
  readonly id: string;
  readonly targetIntent: string;
  prepare(
    candidate: IntentCandidate,
    snapshot: ContextSnapshot,
    memory: readonly MemoryFact[]
  ): Promise<PreparedPlan | null> | PreparedPlan | null;
}
