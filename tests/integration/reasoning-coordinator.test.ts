/**
 * Integration Test: Living Context Reasoning Coordinator & Offline Fixtures
 * Governed by Architecture Rev3 Section 14.2 and AC-202-2, AC-202-3 (Plan yori_ph002_001 Slice B2).
 *
 * Enforces:
 * 1. Offline reproducible fixtures: zero live API calls, zero API keys required.
 * 2. Fallback invariance: on disabled, timeout (>2s), 5xx, malformed JSON or discard,
 *    deterministic order and plans remain 100% intact.
 * 3. Valid fixture reorder: candidate plans are reordered, plan times/actions/options are byte-for-byte untouched,
 *    and plain-language rationale is supplied for the Why sheet.
 * 4. Policy suppression bounding: model-proposed intent is evaluated against SharedPolicy;
 *    suppressed intents never compose (AC-202-3).
 * 5. Asynchronous, unblocking execution: coordinator handles failures silently.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  coordinateReasoning,
  type ModelReasoningApiResponse,
} from '../../src/app/reasoning-coordinator.js';
import type {
  PreparedPlan,
  ContextSnapshot,
  MemoryFact,
  LivingContext,
} from '../../src/core/contracts/index.js';
import { createSimulatedSignal, createMemoryFact } from '../../src/core/contracts/index.js';
import { renderWhySheet } from '../../src/ui/review/why-sheet.js';
import {
  FIXTURE_ACCEPTED_REORDER,
  FIXTURE_UNCITED_CLAIM,
  FIXTURE_INVENTED_TIME,
  FIXTURE_INVENTED_PLACE,
  FIXTURE_INVENTED_PRICE,
  FIXTURE_UNKNOWN_PLAN_ID,
  FIXTURE_UNREGISTERED_PROPOSED_INTENT,
  FIXTURE_POLICY_SUPPRESSED_PROPOSED_INTENT,
  FIXTURE_MALFORMED_JSON_STRING,
} from '../fixtures/reasoning-fixtures.js';

describe('Slice B2: Living Context Reasoning Coordinator & Offline Fixtures (AC-202-2, AC-202-3)', () => {
  const sampleSnapshot: ContextSnapshot = {
    id: 'snapshot-coord-test',
    asOf: '2026-10-28T12:00:00Z',
    timezone: 'Asia/Tokyo',
    signals: [
      createSimulatedSignal({
        kind: 'calendar',
        value: { title: 'Piano lesson at 3:00 PM' },
        issuedAt: '2026-10-28T09:00:00Z',
        validFor: 3600_000,
        confidence: 1.0,
        consentScope: 'local_only',
      }),
      createSimulatedSignal({
        kind: 'weather',
        value: { condition: 'rain', precipitationRisk: 0.8 },
        issuedAt: '2026-10-28T11:30:00Z',
        validFor: 7200_000,
        confidence: 0.9,
        consentScope: 'local_only',
      }),
      createSimulatedSignal({
        kind: 'location',
        value: { status: 'away', coordinates: [35.6895, 139.6917] },
        issuedAt: '2026-10-28T12:00:00Z',
        validFor: 600_000,
        confidence: 0.95,
        consentScope: 'device_only',
      }),
    ],
  };

  const sampleConfirmedFacts: MemoryFact[] = [
    createMemoryFact(
      'habit_rain_transit',
      'drive',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00Z' },
      '2026-10-27T10:00:00Z'
    ),
    createMemoryFact(
      'taste_lunch_japanese',
      'prefers ramen or sushi',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-27T10:00:00Z' },
      '2026-10-27T10:00:00Z'
    ),
  ];

  const planDepart: PreparedPlan = {
    id: 'plan-depart-piano',
    intentId: 'depart',
    headline: 'Piano lesson at 3:00 PM: Get ready at 2:05 PM, leave by 2:25 PM',
    optionsOrSteps: [
      { id: 'opt-drive', label: 'Drive', mode: 'drive', leaveAt: '2:30 PM', requiresConfirmation: false },
      { id: 'opt-bus', label: 'Bus', mode: 'bus', leaveAt: '2:15 PM', requiresConfirmation: false },
    ],
    subjectTitle: 'Piano Studio',
    apptAt: '3:00 PM',
    prepareAt: '2:05 PM',
    leaveAt: '2:25 PM',
    requiresConfirmation: false,
    createdAt: '2026-10-28T12:00:00Z',
    why: {
      evidenceSignals: [
        { kind: 'calendar', source: 'simulated', issuedAt: '2026-10-28T09:00:00Z' },
        { kind: 'weather', source: 'simulated', issuedAt: '2026-10-28T11:30:00Z' },
      ],
      memoryFactsUsed: [
        { key: 'habit_rain_transit', value: 'drive', status: 'confirmed' },
      ],
      derivation: 'Rain forecast triggers departure with umbrella',
    },
  };

  const planLunch: PreparedPlan = {
    id: 'plan-lunch-away',
    intentId: 'lunch',
    headline: 'Places matching what you like, within walking distance',
    optionsOrSteps: [
      { id: 'opt-ramen', label: 'Ramen Ichiban', name: 'Ramen Ichiban', cuisine: 'japanese', requiresConfirmation: false },
      { id: 'opt-salad', label: 'Green Bowl', name: 'Green Bowl', cuisine: 'salad', requiresConfirmation: false },
    ],
    subjectTitle: 'Green Bowl',
    requiresConfirmation: false,
    createdAt: '2026-10-28T12:00:00Z',
    why: {
      evidenceSignals: [
        { kind: 'location', source: 'simulated', issuedAt: '2026-10-28T12:00:00Z' },
      ],
      memoryFactsUsed: [
        { key: 'taste_lunch_japanese', value: 'prefers ramen or sushi', status: 'confirmed' },
      ],
      derivation: 'Away at lunch window matching confirmed taste',
    },
  };

  const deterministicLiving: LivingContext = {
    now: planDepart,
    ahead: [planLunch],
    forYou: [],
    asOf: '2026-10-28T12:00:00Z',
  };

  function createMockFetch(response: {
    status?: number;
    json?: () => Promise<unknown>;
    delayMs?: number;
    throws?: Error;
  }) {
    return vi.fn().mockImplementation(async () => {
      if (response.delayMs) {
        await new Promise(resolve => setTimeout(resolve, response.delayMs));
      }
      if (response.throws) {
        throw response.throws;
      }
      return {
        ok: (response.status ?? 200) >= 200 && (response.status ?? 200) < 300,
        status: response.status ?? 200,
        json: response.json ?? (async () => ({})),
      };
    }) as unknown as typeof fetch;
  }

  it('Fixture 1 (Accepted Reorder): reorders candidates, preserves plan integrity byte-for-byte, and maps rationales', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_ACCEPTED_REORDER,
      usedFallback: false,
    };
    const mockFetch = createMockFetch({
      json: async () => mockApiResponse,
    });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(true);
    // Reorder: lunch is now NOW, depart is now AHEAD
    expect(res.now?.id).toBe('plan-lunch-away');
    expect(res.ahead).toHaveLength(1);
    expect(res.ahead[0]?.id).toBe('plan-depart-piano');

    // Invariance: plan properties are 100% preserved
    expect(res.now?.headline).toBe(planLunch.headline);
    expect(res.now?.optionsOrSteps).toEqual(planLunch.optionsOrSteps);
    expect(res.ahead[0]?.apptAt).toBe(planDepart.apptAt);
    expect(res.ahead[0]?.leaveAt).toBe(planDepart.leaveAt);

    // Rationales populated
    expect(res.rationaleMap.get('plan-lunch-away')).toContain('Prioritize lunch');
    expect(res.rationaleMap.get('plan-depart-piano')).toContain('Departure for Piano Studio');
  });

  it('Fixture 2 (Uncited Claim): falls back and preserves deterministic order', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_UNCITED_CLAIM,
      usedFallback: true,
      fallbackReason: 'missing_citation',
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('missing_citation');
    expect(res.now?.id).toBe('plan-depart-piano');
    expect(res.ahead[0]?.id).toBe('plan-lunch-away');
  });

  it('Fixture 3 (Invented Time): falls back to deterministic ordering', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_INVENTED_TIME,
      usedFallback: true,
      fallbackReason: 'unlisted_fact_token',
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('unlisted_fact_token');
    expect(res.now?.id).toBe('plan-depart-piano');
  });

  it('Fixture 4 (Invented Place): falls back to deterministic ordering', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_INVENTED_PLACE,
      usedFallback: true,
      fallbackReason: 'unlisted_fact_token',
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('unlisted_fact_token');
    expect(res.now?.id).toBe('plan-depart-piano');
  });

  it('Fixture 5 (Invented Price): falls back to deterministic ordering', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_INVENTED_PRICE,
      usedFallback: true,
      fallbackReason: 'unlisted_fact_token',
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('unlisted_fact_token');
    expect(res.now?.id).toBe('plan-depart-piano');
  });

  it('Fixture 6 (Unknown Plan ID): falls back to deterministic ordering', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_UNKNOWN_PLAN_ID,
      usedFallback: true,
      fallbackReason: 'unknown_plan_id',
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('unknown_plan_id');
    expect(res.now?.id).toBe('plan-depart-piano');
  });

  it('Fixture 7 (Unregistered Proposed Intent): falls back to deterministic ordering', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_UNREGISTERED_PROPOSED_INTENT,
      usedFallback: true,
      fallbackReason: 'schema_invalid',
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('schema_invalid');
    expect(res.now?.id).toBe('plan-depart-piano');
  });

  it('Fixture 8 (Policy-Suppressed Proposed Intent, AC-202-3): proposed intent is blocked by SharedPolicy and never composes', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: FIXTURE_POLICY_SUPPRESSED_PROPOSED_INTENT,
      usedFallback: false,
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    // Context where daily prompt budget is already exhausted
    const policyContextBudgetExhausted = {
      snapshot: sampleSnapshot,
      memory: sampleConfirmedFacts,
      isProactivePrompt: true,
      promptCountToday: 3,
      maxDailyPrompts: 3,
    };

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
      policyContext: policyContextBudgetExhausted,
    });

    // Reorder itself is accepted
    expect(res.applied).toBe(true);
    // Proposed intent was evaluated against SharedPolicy and suppressed!
    expect(res.proposedIntentCandidate).toBeDefined();
    expect(res.proposedIntentCandidate?.intent).toBe('lunch');
    expect(res.proposedIntentSuppression).toBeDefined();
    expect(res.proposedIntentSuppression?.code).toBe('budget_exhausted');
  });

  it('Fixture 9 (Malformed JSON): handled gracefully, falls back to deterministic order', async () => {
    const mockFetch = createMockFetch({
      json: async () => {
        return JSON.parse(FIXTURE_MALFORMED_JSON_STRING);
      },
    });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('error');
    expect(res.now?.id).toBe('plan-depart-piano');
    expect(res.ahead[0]?.id).toBe('plan-lunch-away');
  });

  it('Fixture 10 (Timeout >2s): aborts and falls back silently to deterministic ordering', async () => {
    const mockFetch = vi.fn().mockImplementation(async (_url, init) => {
      return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
      timeoutMs: 50, // fast timeout for test
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('timeout');
    expect(res.now?.id).toBe('plan-depart-piano');
    expect(res.ahead[0]?.id).toBe('plan-lunch-away');
  });

  it('Fixture 11 (5xx Server Error): handled silently and falls back to deterministic ordering', async () => {
    const mockFetch = createMockFetch({
      status: 502,
      json: async () => ({ error: 'Bad Gateway' }),
    });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('http_502');
    expect(res.now?.id).toBe('plan-depart-piano');
  });

  it('Model Disabled Invariance: returns fallback immediately with zero mutation', async () => {
    const mockApiResponse: ModelReasoningApiResponse = {
      result: {
        orderedPlanIds: ['plan-depart-piano', 'plan-lunch-away'],
        rationale: [],
      },
      usedFallback: true,
      fallbackReason: 'disabled',
    };
    const mockFetch = createMockFetch({ json: async () => mockApiResponse });

    const res = await coordinateReasoning(deterministicLiving, sampleSnapshot, sampleConfirmedFacts, {
      fetchFn: mockFetch,
    });

    expect(res.applied).toBe(false);
    expect(res.fallbackReason).toBe('disabled');
    expect(res.now?.id).toBe('plan-depart-piano');
    expect(res.ahead[0]?.id).toBe('plan-lunch-away');
  });

  it('Why Sheet Integration: displays "Why this order" section with rationale text and zero engineering jargon', () => {
    const rationaleText = 'Prioritize lunch near Green Bowl matching confirmed taste while user is away';
    const htmlWithRationale = renderWhySheet(planLunch, rationaleText);

    expect(htmlWithRationale).toContain('id="why-order-section"');
    expect(htmlWithRationale).toContain('Why this order');
    expect(htmlWithRationale).toContain(rationaleText);

    // Free of internal codes and jargon
    expect(htmlWithRationale).not.toContain('INV-');
    expect(htmlWithRationale).not.toContain('AC-202');
    expect(htmlWithRationale).not.toContain('PH-002');
    expect(htmlWithRationale).not.toContain('plan-lunch-away');

    // When rationale is omitted, section is not rendered
    const htmlWithoutRationale = renderWhySheet(planLunch);
    expect(htmlWithoutRationale).not.toContain('id="why-order-section"');
    expect(htmlWithoutRationale).not.toContain('Why this order');
  });
});
