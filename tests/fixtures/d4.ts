/**
 * Fixture D4: Busy / Already-Ate Suppression Scenario
 * Section 7 Architecture:
 * Same as D3 but busy, or already ate ->
 * Required outcome: No lunch card (0 prompts); NOW falls back.
 */

import {
  type Scenario,
  type MemoryFact,
  createSimulatedSignal,
  createMemoryFact,
} from '../../src/core/contracts/index.js';

export const D4_TIMEZONE = 'America/Los_Angeles';

export const d4MemoryFacts: readonly MemoryFact[] = [
  createMemoryFact(
    'taste_preference',
    'ramen_or_salad',
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
    '2026-10-25T10:00:00.000Z'
  ),
];

export const d4ScenarioBusy: Scenario = {
  id: 'fixture-d4-lunch-busy',
  title: 'D4 Variant A: User is busy during lunch window (0 prompts)',
  timezone: D4_TIMEZONE,
  timeline: [
    {
      at: '2026-10-28T19:10:00.000Z',
      signal: createSimulatedSignal({
        kind: 'schedule_window',
        value: {
          isBusy: true,
          currentEvent: 'Client Negotiation 12:00-13:30',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
    },
  ],
};

export const d4ScenarioAlreadyAte: Scenario = {
  id: 'fixture-d4-lunch-already-ate',
  title: 'D4 Variant B: User has already eaten lunch (0 prompts)',
  timezone: D4_TIMEZONE,
  timeline: [
    {
      at: '2026-10-28T19:10:00.000Z',
      signal: createSimulatedSignal({
        kind: 'eating_status',
        value: {
          eatenToday: true,
          lunchFinishedAt: '2026-10-28T11:45:00-07:00',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.95,
        consentScope: 'device_only',
      }),
    },
  ],
};
