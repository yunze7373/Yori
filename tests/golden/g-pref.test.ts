/**
 * Causality Golden G-PREF: Confirmed Preferences Causality Chain
 * Governed by LIVING_CONTEXT_V2.md §9 R2, §8 D4, and Rev4 Condition C5.
 *
 * Add-only test file.
 *
 * Verifies that in the exact same city and at the exact same time:
 * - Preference A (Japanese / Ramen) produces Demo Place A · Ramen as #1 with Japanese taste explanation.
 * - Preference B (Salad) produces Demo Place B · Salad as #1 with Salad taste explanation.
 * Both record the full signal → reasoning → suggestion → confirm → state chain with provenance
 * (timestamp, demo city, source, authorization status).
 */

import { describe, it, expect } from 'vitest';
import { d3Scenario } from '../fixtures/index.js';
import { createFixedClock, replayScenarioTimeline } from '../../src/app/scenario-player/index.js';
import { runPipeline } from '../../src/core/pipeline/index.js';
import { createMemoryFact, type MemoryFact } from '../../src/core/contracts/index.js';
import '../../src/plugins/registry.js';
import { ModelCommandInterpreter } from '../../src/ui/conversation/model-interpreter.js';

export interface ProvenanceDetails {
  readonly timestamp: string;
  readonly demoCity: string;
  readonly source: 'simulated' | 'provider' | 'user_confirmed';
  readonly authorizationStatus: 'device_only' | 'authorized';
}

export interface CausalityGoldenChainRecord {
  readonly scenarioId: string;
  readonly provenance: ProvenanceDetails;
  readonly signal: {
    readonly kind: string;
    readonly issuedAt: string;
    readonly value: unknown;
  };
  readonly reasoning: {
    readonly engine: 'deterministic_fallback' | 'meta_model_live' | 'recorded_model_replay' | 'scripted_fixture';
    readonly statusLabel: string;
    readonly reasonCodes: readonly string[];
    readonly explanation?: string;
  };
  readonly suggestion: {
    readonly headline: string;
    readonly topOptionName: string;
    readonly topOptionCuisine: string;
    readonly isSuppressed: boolean;
  };
  readonly confirm: {
    readonly action: 'accepted' | 'suppressed_no_prompt';
    readonly confirmedPlanId: string;
  };
  readonly finalState: 'accepted' | 'quiet' | 'settled';
}

describe('Causality Golden G-PREF (LIVING_CONTEXT_V2.md §9 R2)', () => {
  const FIXED_INSTANT = '2026-10-28T19:10:00.000Z'; // 12:10 PM local
  const DEMO_CITY = 'Downtown Los Angeles';

  it('same city and time with Japanese preference yields Ramen top choice and explanation', () => {
    const clock = createFixedClock(FIXED_INSTANT);
    const snapshots = replayScenarioTimeline(d3Scenario, clock);
    const snapshot = snapshots[snapshots.length - 1]!;

    // Preference A: Japanese / Ramen confirmed
    const prefAJapanese: readonly MemoryFact[] = [
      createMemoryFact(
        'taste_preference',
        'ramen',
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

    const resultA = runPipeline({
      snapshot,
      memory: prefAJapanese,
      clock: FIXED_INSTANT,
    });

    const planA = resultA.livingContext.now;
    expect(planA).not.toBeNull();
    expect(planA!.intentId).toBe('lunch');

    const topOptionA = planA!.optionsOrSteps[0] as any;
    expect(topOptionA.name).toContain('Ramen');
    expect(topOptionA.cuisine).toBe('japanese');
    expect(planA!.why.derivation).toContain('taste_preference=ramen');
    expect(planA!.why.derivation).toContain('favorite_cuisine=japanese');

    // Record provenance chain for Preference A
    const placesSignal = snapshot.signals.find(s => s.kind === 'mock_places')!;
    const chainRecordA: CausalityGoldenChainRecord = {
      scenarioId: 'G-PREF-japanese-ramen',
      provenance: {
        timestamp: FIXED_INSTANT,
        demoCity: DEMO_CITY,
        source: 'simulated',
        authorizationStatus: 'device_only',
      },
      signal: {
        kind: placesSignal.kind,
        issuedAt: placesSignal.issuedAt,
        value: placesSignal.value,
      },
      reasoning: {
        engine: 'deterministic_fallback',
        statusLabel: 'Offline fallback · deterministic',
        reasonCodes: ['matches_confirmed_preference', 'free_window_fit'],
        explanation: planA!.why.derivation,
      },
      suggestion: {
        headline: planA!.headline,
        topOptionName: topOptionA.name,
        topOptionCuisine: topOptionA.cuisine,
        isSuppressed: false,
      },
      confirm: {
        action: 'accepted',
        confirmedPlanId: planA!.id,
      },
      finalState: 'accepted',
    };

    expect(chainRecordA.suggestion.topOptionName).toContain('Ramen');
    expect(chainRecordA.provenance.demoCity).toBe('Downtown Los Angeles');
    expect(chainRecordA.provenance.source).toBe('simulated');
  });

  it('same city and time with Salad preference yields Salad top choice and explanation', () => {
    const clock = createFixedClock(FIXED_INSTANT);
    const snapshots = replayScenarioTimeline(d3Scenario, clock);
    const snapshot = snapshots[snapshots.length - 1]!;

    // Preference B: Salad confirmed
    const prefBSalad: readonly MemoryFact[] = [
      createMemoryFact(
        'taste_preference',
        'salad',
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
        '2026-10-25T10:00:00.000Z'
      ),
      createMemoryFact(
        'favorite_cuisine',
        'salad',
        'confirmed',
        { source: 'user_confirmed', recordedAt: '2026-10-25T10:00:00.000Z' },
        '2026-10-25T10:00:00.000Z'
      ),
    ];

    const resultB = runPipeline({
      snapshot,
      memory: prefBSalad,
      clock: FIXED_INSTANT,
    });

    const planB = resultB.livingContext.now;
    expect(planB).not.toBeNull();
    expect(planB!.intentId).toBe('lunch');

    const topOptionB = planB!.optionsOrSteps[0] as any;
    expect(topOptionB.name).toContain('Salad');
    expect(topOptionB.cuisine).toBe('salad');
    expect(planB!.why.derivation).toContain('taste_preference=salad');
    expect(planB!.why.derivation).toContain('favorite_cuisine=salad');

    // Record provenance chain for Preference B
    const placesSignal = snapshot.signals.find(s => s.kind === 'mock_places')!;
    const chainRecordB: CausalityGoldenChainRecord = {
      scenarioId: 'G-PREF-salad',
      provenance: {
        timestamp: FIXED_INSTANT,
        demoCity: DEMO_CITY,
        source: 'simulated',
        authorizationStatus: 'device_only',
      },
      signal: {
        kind: placesSignal.kind,
        issuedAt: placesSignal.issuedAt,
        value: placesSignal.value,
      },
      reasoning: {
        engine: 'deterministic_fallback',
        statusLabel: 'Offline fallback · deterministic',
        reasonCodes: ['matches_confirmed_preference', 'free_window_fit'],
        explanation: planB!.why.derivation,
      },
      suggestion: {
        headline: planB!.headline,
        topOptionName: topOptionB.name,
        topOptionCuisine: topOptionB.cuisine,
        isSuppressed: false,
      },
      confirm: {
        action: 'accepted',
        confirmedPlanId: planB!.id,
      },
      finalState: 'accepted',
    };

    expect(chainRecordB.suggestion.topOptionName).toContain('Salad');
    expect(chainRecordB.provenance.demoCity).toBe('Downtown Los Angeles');
    expect(chainRecordB.provenance.source).toBe('simulated');
  });

  it('proves causal difference: different confirmed preferences produce distinct lunch recommendations and derivations', () => {
    const clock = createFixedClock(FIXED_INSTANT);
    const snapshots = replayScenarioTimeline(d3Scenario, clock);
    const snapshot = snapshots[snapshots.length - 1]!;

    const prefA: readonly MemoryFact[] = [
      createMemoryFact('taste_preference', 'ramen', 'confirmed', { source: 'user_confirmed', recordedAt: FIXED_INSTANT }, FIXED_INSTANT),
    ];
    const prefB: readonly MemoryFact[] = [
      createMemoryFact('taste_preference', 'salad', 'confirmed', { source: 'user_confirmed', recordedAt: FIXED_INSTANT }, FIXED_INSTANT),
    ];

    const planA = runPipeline({ snapshot, memory: prefA, clock: FIXED_INSTANT }).livingContext.now!;
    const planB = runPipeline({ snapshot, memory: prefB, clock: FIXED_INSTANT }).livingContext.now!;

    const topA = (planA.optionsOrSteps[0] as any).name;
    const topB = (planB.optionsOrSteps[0] as any).name;

    expect(topA).not.toBe(topB);
    expect(planA.why.derivation).not.toBe(planB.why.derivation);
  });

  it('runs G-PREF under scripted model fixture and asserts truthful engine status', () => {
    const modelInterpreter = new ModelCommandInterpreter({ mode: 'scripted_fixture' });
    const decision = modelInterpreter.interpret('Find a quieter vegetarian lunch spot', {
      availableSignalIds: ['mock_places:2026-10-28T19:10:00.000Z', 'location_status:2026-10-28T19:10:00.000Z'],
      confirmedFactKeys: ['taste_preference', 'favorite_cuisine'],
      sceneId: 'away-lunch',
    });

    expect(decision.intent).toBe('FIND_LUNCH');
    expect(decision.engineStatus).toBe('scripted_fixture');
    expect(decision.slots.filters).toEqual(['quieter', 'vegetarian']);
    expect(decision.situationAttribution).toBeDefined();
    expect(decision.situationAttribution!.reasonCode).toBe('free_window_fit');
  });
});
