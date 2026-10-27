/**
 * Fixture D6: Fail-Closed Stale or Missing Signal Scenarios
 * Section 7 Architecture:
 * Weather signal missing or stale (expired validFor) ->
 * Required outcome: Fail-closed notice; no invented forecast; no plan built on stale data.
 */

import {
  type Scenario,
  createSimulatedSignal,
} from '../../src/core/contracts/index.js';

export const D6_TIMEZONE = 'America/Los_Angeles';

// Weather signal issued at 10:00 AM with validFor = 30 minutes (expires at 10:30 AM)
// Current evaluation clock is 2:00 PM (14:00) -> stale by 3.5 hours
export const D6_EXPIRED_SIGNAL_TIME = '2026-10-28T17:00:00.000Z'; // 10:00 AM local
export const D6_EVALUATION_CLOCK = '2026-10-28T21:00:00.000Z';    // 2:00 PM local

export const d6ScenarioStaleWeather: Scenario = {
  id: 'fixture-d6-stale-weather',
  title: 'D6: Stale weather signal degrades fail-closed with visible notice',
  timezone: D6_TIMEZONE,
  timeline: [
    {
      at: D6_EXPIRED_SIGNAL_TIME,
      signal: createSimulatedSignal({
        kind: 'weather',
        value: {
          condition: 'sunny',
          temp: 24,
        },
        issuedAt: D6_EXPIRED_SIGNAL_TIME,
        validFor: 1800000, // 30 minutes in ms -> expired at 17:30:00Z!
        confidence: 0.9,
        consentScope: 'device_only',
      }),
    },
    {
      at: D6_EXPIRED_SIGNAL_TIME,
      signal: createSimulatedSignal({
        kind: 'calendar',
        value: {
          title: 'Piano lesson',
          startTime: '2026-10-28T15:00:00-07:00',
        },
        issuedAt: D6_EXPIRED_SIGNAL_TIME,
        validFor: 36000000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
    },
  ],
};

export const d6ScenarioMissingWeather: Scenario = {
  id: 'fixture-d6-missing-weather',
  title: 'D6: Missing weather signal degrades fail-closed with visible notice',
  timezone: D6_TIMEZONE,
  timeline: [
    {
      at: D6_EVALUATION_CLOCK,
      signal: createSimulatedSignal({
        kind: 'calendar',
        value: {
          title: 'Piano lesson',
          startTime: '2026-10-28T15:00:00-07:00',
        },
        issuedAt: D6_EVALUATION_CLOCK,
        validFor: 36000000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
    },
  ],
};
