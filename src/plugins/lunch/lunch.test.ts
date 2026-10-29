/**
 * Lunch Plugin Unit Tests
 * Governed by AC-103-1, AC-103-2, AC-103-3, Invariants INV-101, INV-102, INV-103, INV-108.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { lunchDetector, LunchDetector } from './detector.js';
import { lunchPreparer, LunchPreparer } from './preparer.js';
import { lunchPlugin } from './index.js';
import { LunchPlacesAdapter } from './adapter.js';
import { SimulatedPlacesProvider } from '../../adapters/providers/simulated-places-provider.js';
import { mockPlaceAdapter } from '../../adapters/mock/index.js';
import {
  createSimulatedSignal,
  createMemoryFact,
  type ContextSnapshot,
  type MemoryFact,
} from '../../core/contracts/index.js';

describe('Lunch Detector (AC-103-1, INV-108)', () => {
  it('detects lunch candidate when away from home with free schedule window', () => {
    const snapshot: ContextSnapshot = {
      id: 'snap-lunch-1',
      asOf: '2026-10-28T19:10:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'location_status',
          value: { isHome: false, currentArea: 'Downtown' },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'schedule_window',
          value: { freeUntil: '2026-10-28T13:30:00-07:00' },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    };

    const candidate = lunchDetector.detect(snapshot, []);
    expect(candidate).not.toBeNull();
    expect(candidate?.intent).toBe('lunch');
    expect(candidate?.suppressedBy).toBeUndefined(); // Plugins never suppress (INV-108)
    expect(candidate?.evidence.length).toBe(2);
  });

  it('detects candidate even if busy or already ate (delegates suppression to shared policy per INV-108)', () => {
    const busySnapshot: ContextSnapshot = {
      id: 'snap-busy',
      asOf: '2026-10-28T19:10:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'schedule_window',
          value: { isBusy: true, currentEvent: 'Meeting' },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    };

    const candidate = lunchDetector.detect(busySnapshot, []);
    expect(candidate).not.toBeNull();
    expect(candidate?.intent).toBe('lunch');
    expect(candidate?.suppressedBy).toBeUndefined(); // Must NOT suppress in plugin
  });

  it('returns null when explicitly at home, including in the evening at 20:00 (Probe R5)', () => {
    const homeEveningSnapshot: ContextSnapshot = {
      id: 'snap-home-evening',
      asOf: '2026-10-29T03:00:00.000Z', // 20:00 local in America/Los_Angeles (-07:00)
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'location_status',
          value: { isHome: true },
          issuedAt: '2026-10-29T03:00:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'schedule_window',
          value: { freeUntil: '2026-10-29T05:00:00.000Z' },
          issuedAt: '2026-10-29T03:00:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    };

    const candidate = lunchDetector.detect(homeEveningSnapshot, []);
    expect(candidate).toBeNull();
  });

  it('returns null when outside lunch window even if away (Finding 4)', () => {
    // 08:30 AM morning in America/Los_Angeles (-07:00 is 15:30Z)
    const morningSnapshot: ContextSnapshot = {
      id: 'snap-morning',
      asOf: '2026-10-28T15:30:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'location_status',
          value: { isHome: false },
          issuedAt: '2026-10-28T15:30:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    };

    expect(lunchDetector.detect(morningSnapshot, [])).toBeNull();
  });

  it('returns null when free window is too short for lunch (< 20 mins) (Finding 4)', () => {
    // 12:10 PM in America/Los_Angeles (19:10Z), free until 12:20 PM (19:20Z = 10 mins free)
    const shortWindowSnapshot: ContextSnapshot = {
      id: 'snap-short',
      asOf: '2026-10-28T19:10:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'location_status',
          value: { isHome: false },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'schedule_window',
          value: { freeUntil: '2026-10-28T19:20:00.000Z' }, // 10 minutes only!
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 0.9,
          consentScope: 'device_only',
        }),
      ],
    };

    expect(lunchDetector.detect(shortWindowSnapshot, [])).toBeNull();
  });

  it('returns null when snapshot has no relevant signals', () => {
    const emptySnapshot: ContextSnapshot = {
      id: 'snap-empty',
      asOf: '2026-10-28T19:10:00.000Z',
      signals: [],
    };

    expect(lunchDetector.detect(emptySnapshot, [])).toBeNull();
  });
});

describe('Lunch Preparer (AC-103-1, INV-103, INV-104)', () => {
  const validSnapshot: ContextSnapshot = {
    id: 'snap-prep-1',
    asOf: '2026-10-28T19:10:00.000Z',
    timezone: 'America/Los_Angeles',
    signals: [
      createSimulatedSignal({
        kind: 'location_status',
        value: { isHome: false },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.9,
        consentScope: 'device_only',
      }),
      createSimulatedSignal({
        kind: 'mock_places',
        value: [
          {
            name: 'Ramen Ichiko',
            cuisine: 'japanese',
            distanceMinutes: 5,
            noiseLevel: 'lively',
            vegetarian: false,
          },
          {
            name: 'Green Salad Co',
            cuisine: 'salad',
            distanceMinutes: 7,
            noiseLevel: 'quiet',
            vegetarian: true,
          },
          {
            name: 'Sushi Kura',
            cuisine: 'japanese',
            distanceMinutes: 10,
            noiseLevel: 'quiet',
            vegetarian: false,
          },
          {
            name: 'Burger Joint',
            cuisine: 'fast_food',
            distanceMinutes: 8,
            noiseLevel: 'moderate',
            vegetarian: false,
          },
        ],
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.9,
        consentScope: 'device_only',
      }),
    ],
  };

  const confirmedMemory: readonly MemoryFact[] = [
    createMemoryFact(
      'taste_preference',
      'ramen_or_salad',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
      '2026-10-25T10:00:00.000Z'
    ),
  ];

  it('prepares <=3 lunch options citing confirmed taste memory', () => {
    const candidate = lunchDetector.detect(validSnapshot, confirmedMemory)!;
    const plan = lunchPreparer.prepare(candidate, validSnapshot, confirmedMemory);

    expect(plan).not.toBeNull();
    expect(plan?.intentId).toBe('lunch');
    expect(plan?.optionsOrSteps.length).toBeGreaterThan(0);
    expect(plan?.optionsOrSteps.length).toBeLessThanOrEqual(3);

    // Assert Why citations
    const citedFact = plan?.why.memoryFactsUsed.find(f => f.key === 'taste_preference');
    expect(citedFact).toBeDefined();
    expect(citedFact?.status).toBe('confirmed');

    // RequiresConfirmation must be false for informational recommendation
    expect(plan?.requiresConfirmation).toBe(false);
  });

  it('fails closed (returns null) when no confirmed taste facts exist (AC-103-1)', () => {
    const candidate = lunchDetector.detect(validSnapshot, [])!;
    const plan = lunchPreparer.prepare(candidate, validSnapshot, []);

    expect(plan).toBeNull();
  });

  it('fails closed when taste facts exist only as pending proposals (INV-107)', () => {
    const pendingMemory: readonly MemoryFact[] = [
      createMemoryFact(
        'taste_preference',
        'ramen_or_salad',
        'pending',
        { source: 'user_feedback', recordedAt: '2026-10-25T10:00:00.000Z' },
        '2026-10-25T10:00:00.000Z'
      ),
    ];

    const candidate = lunchDetector.detect(validSnapshot, pendingMemory)!;
    const plan = lunchPreparer.prepare(candidate, validSnapshot, pendingMemory);

    expect(plan).toBeNull();
  });

  it('is deterministic: repeated executions yield deep-equal plans', () => {
    const candidate = lunchDetector.detect(validSnapshot, confirmedMemory)!;
    const plan1 = lunchPreparer.prepare(candidate, validSnapshot, confirmedMemory);
    const plan2 = lunchPreparer.prepare(candidate, validSnapshot, confirmedMemory);

    expect(plan1).toEqual(plan2);
  });

  describe('UserRequestOverride & prepareWithRequest (LIVING_CONTEXT_V2.md §2.3, §8 D1/D4, V2b)', () => {
    const memoryWithJapanese: readonly MemoryFact[] = [
      ...confirmedMemory,
      createMemoryFact(
        'favorite_cuisine',
        'japanese',
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
        '2026-10-25T10:00:00.000Z'
      ),
    ];

    it('re-ranks candidates when quieter + vegetarian filters are applied via request override', () => {
      const candidate = lunchDetector.detect(validSnapshot, memoryWithJapanese)!;
      // Base plan without override: Ramen Ichiko is #1 (same score 3 as Green Salad Co, but closer: 5m vs 7m)
      const basePlan = lunchPreparer.prepare(candidate, validSnapshot, memoryWithJapanese)!;
      expect(basePlan).not.toBeNull();
      const baseFirst = basePlan.optionsOrSteps[0] as any;
      expect(baseFirst.name).toContain('Ramen Ichiko');

      // Override with quieter and vegetarian filters
      const override = {
        kind: 'lunch_filter' as const,
        filters: ['quieter', 'vegetarian'] as const,
        provenance: {
          source: 'user_request' as const,
          at: '2026-10-28T19:15:00.000Z',
          scope: 'this_time_only' as const,
        },
      };

      const filteredPlan = lunchPreparer.prepareWithRequest(
        candidate,
        validSnapshot,
        memoryWithJapanese,
        override
      )!;

      expect(filteredPlan).not.toBeNull();
      const filteredFirst = filteredPlan.optionsOrSteps[0] as any;
      // Green Salad Co is quiet and vegetarian, so it becomes #1
      expect(filteredFirst.name).toContain('Green Salad Co');
      expect(filteredFirst.vegetarian).toBe(true);
      expect(filteredFirst.noiseLevel).toBe('quiet');

      // Sushi Kura is quiet but not vegetarian, so it is #2
      const filteredSecond = filteredPlan.optionsOrSteps[1] as any;
      expect(filteredSecond.name).toContain('Sushi Kura');

      // Ramen Ichiko is neither quiet nor vegetarian, so it ranks #3
      const filteredThird = filteredPlan.optionsOrSteps[2] as any;
      expect(filteredThird.name).toContain('Ramen Ichiko');

      // Why cites user_request provenance
      const userReqSignal = filteredPlan.why.evidenceSignals.find(s => s.kind === 'user_request');
      expect(userReqSignal).toBeDefined();
      expect(userReqSignal!.description).toContain('Because you asked: quieter, vegetarian · this time only');
      expect(filteredPlan.why.derivation).toContain('Because you asked: quieter, vegetarian · this time only');
    });

    it('enforces non-resurrection invariant (C1): unadmitted places are never resurrected by filters', () => {
      const candidate = lunchDetector.detect(validSnapshot, confirmedMemory)!;
      const override = {
        kind: 'lunch_filter' as const,
        filters: ['nearer'] as const,
        provenance: {
          source: 'user_request' as const,
          at: '2026-10-28T19:15:00.000Z',
          scope: 'this_time_only' as const,
        },
      };

      const plan = lunchPreparer.prepareWithRequest(
        candidate,
        validSnapshot,
        confirmedMemory,
        override
      )!;

      expect(plan).not.toBeNull();
      // Burger Joint has 0 match with taste and must never appear
      for (const opt of plan.optionsOrSteps) {
        expect((opt as any).name).not.toContain('Burger Joint');
        expect((opt as any).cuisine).not.toBe('fast_food');
      }
    });

    it('does not mutate confirmed memory facts (INV-107)', () => {
      const candidate = lunchDetector.detect(validSnapshot, confirmedMemory)!;
      const memoryBefore = JSON.stringify(confirmedMemory);

      const override = {
        kind: 'lunch_filter' as const,
        filters: ['quieter', 'vegetarian'] as const,
        provenance: {
          source: 'user_request' as const,
          at: '2026-10-28T19:15:00.000Z',
          scope: 'this_time_only' as const,
        },
      };

      lunchPreparer.prepareWithRequest(candidate, validSnapshot, confirmedMemory, override);

      const memoryAfter = JSON.stringify(confirmedMemory);
      expect(memoryAfter).toBe(memoryBefore);
    });
  });
});

describe('Mock Place Adapter (INV-101, INV-102)', () => {
  it('returns simulated signals only with source: simulated and label: simulated', () => {
    const signals = mockPlaceAdapter.signals('2026-10-28T19:10:00.000Z');
    expect(signals.length).toBeGreaterThan(0);
    for (const sig of signals) {
      expect(sig.source).toBe('simulated');
      expect(sig.label).toBe('simulated');
    }
  });

  it('plugin exposes detector, preparer, and mock adapter', () => {
    expect(lunchPlugin.id).toBe('lunch');
    expect(lunchPlugin.detector).toBeInstanceOf(LunchDetector);
    expect(lunchPlugin.preparer).toBeInstanceOf(LunchPreparer);
    expect(lunchPlugin.adapter).toBe(mockPlaceAdapter);
  });
});

describe('LunchPlacesAdapter & PlacesProvider Seam (V5-LUNCH / AC-213-1, AC-213-2)', () => {
  it('emits places_lunch signal with nearby restaurants from provider', () => {
    const adapter = new LunchPlacesAdapter();
    const snapshot: ContextSnapshot = {
      id: 'snap-sf',
      asOf: '2026-10-28T19:10:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'location_status',
          value: { lat: 37.7749, lng: -122.4194, isHome: false },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    };

    const signals = adapter.signals(snapshot);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.kind).toBe('places_lunch');
    expect(signals[0]!.value.status).toBe('ok');
    expect(signals[0]!.value.places.length).toBeGreaterThan(0);
    expect(signals[0]!.value.places.every((p: any) => p.category === 'restaurant')).toBe(true);
  });

  it('fails closed and returns error status when provider search fails', () => {
    const errorProvider = new SimulatedPlacesProvider({ simulateError: true });
    const adapter = new LunchPlacesAdapter(errorProvider);
    const snapshot: ContextSnapshot = {
      id: 'snap-err',
      asOf: '2026-10-28T19:10:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'location_status',
          value: { lat: 37.7749, lng: -122.4194 },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    };

    const signals = adapter.signals(snapshot);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.value.status).toBe('error');
    expect(signals[0]!.value.places).toHaveLength(0);
  });

  const testMemory: readonly MemoryFact[] = [
    createMemoryFact(
      'taste_preference',
      'ramen_or_salad',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
      '2026-10-25T10:00:00.000Z'
    ),
  ];

  const testSnapshot: ContextSnapshot = {
    id: 'snap-lunch-test',
    asOf: '2026-10-28T19:10:00.000Z',
    timezone: 'America/Los_Angeles',
    signals: [
      createSimulatedSignal({
        kind: 'location_status',
        value: { lat: 37.7749, lng: -122.4194, isHome: false },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
      createSimulatedSignal({
        kind: 'schedule_window',
        value: { freeUntil: '2026-10-28T22:00:00.000Z' },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      }),
    ],
  };

  it('prepares lunch plan from places_lunch signal with proper recordId', () => {
    const adapter = new LunchPlacesAdapter();
    const candidate = lunchDetector.detect(testSnapshot, testMemory)!;
    const placesSignals = adapter.signals(testSnapshot);

    const snapshotWithPlaces: ContextSnapshot = {
      ...testSnapshot,
      signals: [...testSnapshot.signals, ...placesSignals],
    };

    const plan = lunchPreparer.prepare(candidate, snapshotWithPlaces, testMemory);
    expect(plan).not.toBeNull();
    expect(plan?.optionsOrSteps.length).toBeGreaterThan(0);
    const firstOpt = plan?.optionsOrSteps[0] as any;
    expect(firstOpt.recordId).toBeDefined();
    expect(firstOpt.recordId).toMatch(/^lunch-sf-/);
  });

  it('fails closed (returns null) when places_lunch signal has error or empty status', () => {
    const candidate = lunchDetector.detect(testSnapshot, testMemory)!;
    const errorSnapshot: ContextSnapshot = {
      ...testSnapshot,
      signals: [
        ...testSnapshot.signals,
        createSimulatedSignal({
          kind: 'places_lunch',
          value: { status: 'error', error: 'Database timeout', places: [] },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    };

    expect(lunchPreparer.prepare(candidate, errorSnapshot, testMemory)).toBeNull();

    const emptySnapshot: ContextSnapshot = {
      ...testSnapshot,
      signals: [
        ...testSnapshot.signals,
        createSimulatedSignal({
          kind: 'places_lunch',
          value: { status: 'empty', places: [] },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ],
    };

    expect(lunchPreparer.prepare(candidate, emptySnapshot, testMemory)).toBeNull();
  });
});

describe('Static Audit: Zero Ambient Clock in Lunch Plugin', () => {
  it('ensures src/plugins/lunch contains zero ambient clock calls', () => {
    const lunchDir = path.resolve('src/plugins/lunch');
    const files = fs.readdirSync(lunchDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));

    for (const file of files) {
      const content = fs.readFileSync(path.join(lunchDir, file), 'utf-8');
      expect(content).not.toMatch(/\bDate\.now\(\)/);
      expect(content).not.toMatch(/\bnew\s+Date\(\)/);
    }
  });
});
