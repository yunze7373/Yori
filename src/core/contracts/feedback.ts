/**
 * Core Contracts: User Feedback Loop
 * Governed by Invariants INV-107 and Section 6 of Architecture.
 */

export type UserFeedbackAction = 'accept' | 'adjust' | 'dismiss';

/**
 * UserFeedback
 * Feedback on a prepared plan:
 * - accept: plan actions proceed
 * - adjust: user edits become a pending MemoryFact proposal (INV-107)
 * - dismiss: suppression for chosen scope plus pending proposal
 */
export interface UserFeedback {
  readonly planId: string;
  readonly action: UserFeedbackAction;
  readonly suppressScope?: 'today' | 'this_event' | 'always' | string;
  readonly note?: string;
  readonly timestamp: string;
}
