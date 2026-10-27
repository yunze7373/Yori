/**
 * Fixture D2: Rain Re-plan Departure Scenario
 * Section 7 Architecture:
 * Same lesson; at 1:35 PM rain forecast arrives (issuedAt 1:35 PM, valid for travel window) ->
 * Re-plan: umbrella on checklist; options drive leave 2:30 / bus leave 2:15, ranked by confirmed rain habit;
 * Why cites forecast issuedAt; preferences unchanged.
 */

import {
  type Scenario,
  type MemoryFact,
  createSimulatedSignal,
  createMemoryFact,
} from '../../src/core/contracts/index.js';

export const D2_TIMEZONE = 'America/Los_Angeles';

export const d2MemoryFacts: readonly MemoryFact[] = [
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
  createMemoryFact(
    'rain_transport_preference',
    'drive_first', // Confirmed habit: prefers driving when it rains
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00.000Z' },
    '2026-10-27T10:00:00.000Z'
  ),
];

export const d2Scenario: Scenario = {
  id: 'fixture-d2-rain-replan',
  title: 'D2: Rain forecast at 1:35 PM triggers re-plan with umbrella',
  timezone: D2_TIMEZONE,
  description: 'Piano lesson 15:00 with sudden rain forecast at 13:35',
  timeline: [
    {
      // 10:00 AM local (17:00:00Z)
      at: '2026-10-28T17:00:00.000Z',
      signal: createSimulatedSignal({
        kind: 'calendar',
        value: {
          title: 'Piano lesson',
          startTime: '2026-10-28T15:00:00-07:00',
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
      // 1:35 PM local (20:35:00Z): Rain forecast arrives!
      at: '2026-10-28T20:35:00.000Z',
      signal: createSimulatedSignal({
        kind: 'weather',
        value: {
          condition: 'rain',
          precipProbability: 0.9,
          rainfall: 'moderate',
        },
        issuedAt: '2026-10-28T20:35:00.000Z', // 1:35 PM
        validFor: 7200000, // 2 hours: valid for the travel window
        confidence: 0.92,
        consentScope: 'device_only',
      }),
    },
    {
      // 1:35 PM local: updated multi-modal travel estimates
      at: '2026-10-28T20:35:00.000Z',
      signal: createSimulatedSignal({
        kind: 'travel_estimate',
        value: {
          driveMinutes: 25, // drive leave 2:30 (14:30) for 15:00 with 5m buffer
          busMinutes: 40,   // bus leave 2:15 (14:15) with 5m rain buffer
        },
        issuedAt: '2026-10-28T20:35:00.000Z',
        validFor: 7200000,
        confidence: 0.88,
        consentScope: 'device_only',
      }),
    },
  ],
};
