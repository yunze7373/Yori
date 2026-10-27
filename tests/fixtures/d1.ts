/**
 * Fixture D1: Standard Depart Scenario
 * Section 7 Architecture:
 * Piano lesson 15:00, clear; travel 30, buffer 5, prep 20 ->
 * Required outcome: prepare 2:05 PM (14:05), leave 2:25 PM (14:25); NOW shows depart plan.
 */

import {
  type Scenario,
  type MemoryFact,
  createSimulatedSignal,
  createMemoryFact,
} from '../../src/core/contracts/index.js';

export const D1_TIMEZONE = 'America/Los_Angeles';

// 2026-10-28T10:00:00-07:00
export const D1_INITIAL_CLOCK = '2026-10-28T17:00:00.000Z';

export const d1MemoryFacts: readonly MemoryFact[] = [
  createMemoryFact(
    'prep_buffer_minutes',
    5,
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
    '2026-10-27T10:00:00.000Z'
  ),
  createMemoryFact(
    'prep_duration_minutes',
    20,
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
    '2026-10-27T10:00:00.000Z'
  ),
];

export const d1Scenario: Scenario = {
  id: 'fixture-d1-depart-clear',
  title: 'D1: Piano lesson clear sky departure',
  timezone: D1_TIMEZONE,
  description: 'Piano lesson at 15:00 with 30m travel, 5m buffer, 20m prep',
  timeline: [
    {
      // 10:00 AM local
      at: '2026-10-28T17:00:00.000Z',
      signal: createSimulatedSignal({
        kind: 'calendar',
        value: {
          title: 'Piano lesson',
          startTime: '2026-10-28T15:00:00-07:00', // 22:00:00Z
          endTime: '2026-10-28T16:00:00-07:00',
          location: 'Piano Studio',
        },
        issuedAt: '2026-10-28T17:00:00.000Z',
        validFor: 36000000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
    },
    {
      // 10:00 AM local: clear weather
      at: '2026-10-28T17:00:00.000Z',
      signal: createSimulatedSignal({
        kind: 'weather',
        value: {
          condition: 'clear',
          precipProbability: 0.0,
        },
        issuedAt: '2026-10-28T17:00:00.000Z',
        validFor: 36000000,
        confidence: 0.95,
        consentScope: 'device_only',
      }),
    },
    {
      // 10:00 AM local: travel estimation
      at: '2026-10-28T17:00:00.000Z',
      signal: createSimulatedSignal({
        kind: 'travel_estimate',
        value: {
          mode: 'drive',
          travelMinutes: 30,
        },
        issuedAt: '2026-10-28T17:00:00.000Z',
        validFor: 36000000,
        confidence: 0.9,
        consentScope: 'device_only',
      }),
    },
  ],
};
