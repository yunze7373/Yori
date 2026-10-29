/**
 * Fixture D3: Lunch Recommendation Away from Home
 * Section 7 Architecture:
 * Away signal 12:10, free until 1:30, not eaten ->
 * Lunch card with <=3 options; each Why cites confirmed taste memory.
 */

import {
  type Scenario,
  type MemoryFact,
  createSimulatedSignal,
  createMemoryFact,
} from '../../src/core/contracts/index.js';

export const D3_TIMEZONE = 'America/Los_Angeles';

export const d3MemoryFacts: readonly MemoryFact[] = [
  createMemoryFact(
    'taste_preference',
    'ramen_or_salad',
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
    '2026-10-25T10:00:00.000Z'
  ),
  createMemoryFact(
    'favorite_cuisine',
    'japanese',
    'confirmed',
    { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
    '2026-10-25T10:00:00.000Z'
  ),
];

export const d3Scenario: Scenario = {
  id: 'fixture-d3-lunch-away',
  title: 'D3: Lunch recommendation away from home during free window',
  timezone: D3_TIMEZONE,
  timeline: [
    {
      // 12:10 PM local (19:10:00Z): user is away from home
      at: '2026-10-28T19:10:00.000Z',
      signal: createSimulatedSignal({
        kind: 'location_status',
        value: {
          isHome: false,
          currentArea: 'Downtown',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.95,
        consentScope: 'device_only',
      }),
    },
    {
      // 12:10 PM local: free window until 1:30 PM (20:30:00Z)
      at: '2026-10-28T19:10:00.000Z',
      signal: createSimulatedSignal({
        kind: 'schedule_window',
        value: {
          freeUntil: '2026-10-28T13:30:00-07:00',
          nextEvent: 'Team Sync at 13:30',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
    },
    {
      // 12:10 PM local: user has not eaten lunch
      at: '2026-10-28T19:10:00.000Z',
      signal: createSimulatedSignal({
        kind: 'eating_status',
        value: {
          eatenToday: false,
          lastMeal: 'Breakfast 08:30',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.9,
        consentScope: 'device_only',
      }),
    },
    {
      // 12:10 PM local: mock places nearby
      at: '2026-10-28T19:10:00.000Z',
      signal: createSimulatedSignal({
        kind: 'mock_places',
        value: [
          {
            id: 'mock-place-1',
            name: 'Demo Place A · Ramen',
            cuisine: 'japanese',
            distanceMinutes: 5,
            noiseLevel: 'lively',
            vegetarian: false,
          },
          {
            id: 'mock-place-2',
            name: 'Demo Place B · Salad',
            cuisine: 'salad',
            distanceMinutes: 7,
            noiseLevel: 'quiet',
            vegetarian: true,
          },
          {
            id: 'mock-place-3',
            name: 'Demo Place C · Sushi',
            cuisine: 'japanese',
            distanceMinutes: 10,
            noiseLevel: 'quiet',
            vegetarian: false,
          },
          {
            id: 'mock-place-4',
            name: 'Demo Place D · Fast Food',
            cuisine: 'fast_food',
            distanceMinutes: 8,
            noiseLevel: 'moderate',
            vegetarian: false,
          },
        ],
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.85,
        consentScope: 'device_only',
      }),
    },
  ],
};
