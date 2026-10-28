/**
 * Recorded Reasoning Fixtures for Offline Verification (PH-002 B2, AC-202-2)
 * Governed by Plan yori_ph002_001.
 *
 * All fixtures are completely offline and deterministic with zero live API calls.
 */

import type { ReasoningOutput } from '../../src/adapters/model/index.js';

/**
 * 1. Accepted Reorder:
 * Fully cited rationale using valid signal IDs and fact keys, with factual tokens matching inputs.
 */
export const FIXTURE_ACCEPTED_REORDER: ReasoningOutput = {
  orderedPlanIds: ['plan-lunch-away', 'plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-lunch-away',
      citedSignalIds: ['location:2026-10-28T12:00:00Z'],
      citedFactKeys: ['taste_lunch_japanese'],
      reasonCode: 'matches_confirmed_preference',
    },
    {
      planId: 'plan-depart-piano',
      citedSignalIds: ['calendar:2026-10-28T09:00:00Z', 'weather:2026-10-28T11:30:00Z'],
      citedFactKeys: ['habit_rain_transit'],
      reasonCode: 'time_critical',
    },
  ],
};

/**
 * 2. Uncited Claim:
 * Missing signal and fact citations in rationale entry.
 */
export const FIXTURE_UNCITED_CLAIM: ReasoningOutput = {
  orderedPlanIds: ['plan-lunch-away', 'plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-lunch-away',
      citedSignalIds: [],
      citedFactKeys: [],
      text: 'Prioritize lunch near Green Bowl because it is lunchtime',
    },
  ],
};

/**
 * 3. Invented Time:
 * Rationale text mentions a hallucinated time token not present in candidate times.
 */
export const FIXTURE_INVENTED_TIME: ReasoningOutput = {
  orderedPlanIds: ['plan-lunch-away', 'plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-depart-piano',
      citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
      citedFactKeys: ['habit_rain_transit'],
      text: 'Departure scheduled for 4:45 PM to avoid rush hour',
    },
  ],
};

/**
 * 4. Invented Place:
 * Rationale text mentions a hallucinated venue/place not present in candidate places.
 */
export const FIXTURE_INVENTED_PLACE: ReasoningOutput = {
  orderedPlanIds: ['plan-lunch-away', 'plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-lunch-away',
      citedSignalIds: ['location:2026-10-28T12:00:00Z'],
      citedFactKeys: ['taste_lunch_japanese'],
      text: 'Prioritize dining at Tokyo Tower Cafe near your location',
    },
  ],
};

/**
 * 5. Invented Price:
 * Rationale text introduces an unsupplied price token.
 */
export const FIXTURE_INVENTED_PRICE: ReasoningOutput = {
  orderedPlanIds: ['plan-lunch-away', 'plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-lunch-away',
      citedSignalIds: ['location:2026-10-28T12:00:00Z'],
      citedFactKeys: ['taste_lunch_japanese'],
      text: 'Affordable lunch option costing $25 per person',
    },
  ],
};

/**
 * 6. Unknown Plan ID:
 * orderedPlanIds includes a plan id that was not in the candidate set.
 */
export const FIXTURE_UNKNOWN_PLAN_ID: ReasoningOutput = {
  orderedPlanIds: ['plan-nonexistent-999', 'plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-depart-piano',
      citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
      citedFactKeys: ['habit_rain_transit'],
      text: 'Departure for Piano Studio scheduled',
    },
  ],
};

/**
 * 7. Unregistered Proposed Intent:
 * Proposes an intent not matching any registered plugin.
 */
export const FIXTURE_UNREGISTERED_PROPOSED_INTENT: ReasoningOutput = {
  orderedPlanIds: ['plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-depart-piano',
      citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
      citedFactKeys: ['habit_rain_transit'],
      text: 'Departure for Piano Studio scheduled',
    },
  ],
  proposedIntent: {
    intent: 'unregistered_custom_intent_xyz',
    confidence: 0.9,
    citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
  },
};

/**
 * 8. Proposed Intent Suppressed by Policy (AC-202-3):
 * Proposes a valid registered intent ('lunch'), but policy suppresses it (e.g. daily prompt budget exhausted or user dismissed).
 */
export const FIXTURE_POLICY_SUPPRESSED_PROPOSED_INTENT: ReasoningOutput = {
  orderedPlanIds: ['plan-depart-piano'],
  rationale: [
    {
      planId: 'plan-depart-piano',
      citedSignalIds: ['calendar:2026-10-28T09:00:00Z'],
      citedFactKeys: ['habit_rain_transit'],
      text: 'Departure for Piano Studio scheduled',
    },
  ],
  proposedIntent: {
    intent: 'lunch',
    confidence: 0.85,
    citedSignalIds: ['location:2026-10-28T12:00:00Z'],
  },
};

/**
 * 9. Malformed JSON Response string
 */
export const FIXTURE_MALFORMED_JSON_STRING = '{"orderedPlanIds": ["plan-depart-piano", incomplete...';
