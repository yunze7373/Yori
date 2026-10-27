/**
 * Fixture D5: Explicit User Suppression Scenario
 * Section 7 Architecture:
 * User feedback: "don't suggest lunch" ->
 * Required outcome: Lunch suppressed for the rest of the day; memory change exists only as a pending proposal.
 */

import {
  type Scenario,
  type MemoryFact,
  type UserFeedback,
  createSimulatedSignal,
  createMemoryFact,
} from '../../src/core/contracts/index.js';

export const D5_TIMEZONE = 'America/Los_Angeles';

export const d5UserFeedback: UserFeedback = {
  planId: 'lunch-plan-d5',
  action: 'dismiss',
  suppressScope: 'today',
  note: "don't suggest lunch",
  timestamp: '2026-10-28T19:15:00.000Z',
};

// Feedback only creates a pending proposal, never direct mutation (INV-107)
export const d5PendingMemoryProposal: MemoryFact<string> = createMemoryFact(
  'suppress_lunch_recommendations',
  'user_requested_today',
  'pending', // Pending user confirmation!
  {
    source: 'user_feedback',
    recordedAt: '2026-10-28T19:15:00.000Z',
    note: "User dismissed lunch plan: don't suggest lunch",
  },
  '2026-10-28T19:15:00.000Z'
);

export const d5MemoryFacts: readonly MemoryFact[] = [d5PendingMemoryProposal];

export const d5Scenario: Scenario = {
  id: 'fixture-d5-user-suppression',
  title: 'D5: User explicitly dismisses lunch recommendation',
  timezone: D5_TIMEZONE,
  timeline: [
    {
      at: '2026-10-28T19:10:00.000Z',
      signal: createSimulatedSignal({
        kind: 'location_status',
        value: { isHome: false },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.9,
        consentScope: 'device_only',
      }),
    },
  ],
};
