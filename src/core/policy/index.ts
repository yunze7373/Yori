/**
 * Shared Core Policy Surface (Stub for S0-2)
 * Full implementation scheduled for S2-1.
 * Governed by Section 3 of Architecture (Core only, never per-plugin).
 */

import type { IntentCandidate, SuppressionReason } from '../contracts/index.js';

export interface FailClosedNotice {
  readonly type: 'fail_closed_notice';
  readonly reason: string;
  readonly missingOrStaleSignalKind: string;
  readonly isStale: boolean;
  readonly noticeText: string;
}

export interface SharedPolicySurface {
  rankCandidates(candidates: readonly IntentCandidate[]): readonly IntentCandidate[];
  checkSuppression(candidate: IntentCandidate): SuppressionReason | null;
  getDailyPromptBudget(): { readonly maxDaily: number; readonly usedToday: number };
  createFailClosedNotice(signalKind: string, reason: string): FailClosedNotice;
}

export const sharedPolicyStub: SharedPolicySurface = {
  rankCandidates(candidates: readonly IntentCandidate[]): readonly IntentCandidate[] {
    // Stub implementation: returns unmodified candidates
    return candidates;
  },
  checkSuppression(_candidate: IntentCandidate): SuppressionReason | null {
    // Stub implementation: returns null (unsuppressed)
    return null;
  },
  getDailyPromptBudget() {
    // Default cap: 3 proactive prompts/day (INV-105)
    return { maxDaily: 3, usedToday: 0 };
  },
  createFailClosedNotice(signalKind: string, reason: string): FailClosedNotice {
    return Object.freeze({
      type: 'fail_closed_notice',
      reason,
      missingOrStaleSignalKind: signalKind,
      isStale: true,
      noticeText: `Degraded fail-closed: ${signalKind} data is missing or stale (${reason}).`,
    });
  },
};
