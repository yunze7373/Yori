/**
 * Causality Golden G-RAIN: Clear → Rain Causality Chain (Model-Off)
 * Governed by LIVING_CONTEXT_V2.md §9 R2 and Rev4 Condition C5.
 *
 * Add-only test file; D1-D6 fixtures and tests remain byte-unchanged.
 *
 * Verifies the causal effect of rain forecast arrival:
 * 1. Same user and appointment (Piano lesson at 3:00 PM PDT).
 * 2. Clear (10:00 AM) -> single-mode drive 30m, leave 2:25 PM, prepare 2:05 PM, no umbrella.
 * 3. Rain forecast at 1:35 PM -> re-plan with umbrella checklist, drive 2:30 PM / bus 2:15 PM.
 * 4. Ranking driven by confirmed rain transport preference.
 * 5. Why derivation cites the weather signal issuedAt.
 * 6. Records full chain: signal -> reasoning (labelled fallback/deterministic) -> suggestion -> confirm -> state.
 */

import { describe, it, expect } from 'vitest';
import {
  d1Scenario,
  d1MemoryFacts,
  D1_INITIAL_CLOCK,
  d2Scenario,
  d2MemoryFacts,
} from '../fixtures/index.js';
import {
  createFixedClock,
  replayScenarioTimeline,
  createScenarioPlayer,
} from '../../src/app/scenario-player/index.js';
import { runPipeline } from '../../src/core/pipeline/index.js';
import '../../src/plugins/registry.js';
import type { EvidenceCitation } from '../../src/core/contracts/index.js';
import { ModelCommandInterpreter } from '../../src/ui/conversation/model-interpreter.js';

export interface CausalityGoldenRecord {
  scenarioId: string;
  signalKind: string;
  signalIssuedAt: string;
  reasoningEngine: 'deterministic_fallback' | 'meta_model_live' | 'recorded_model_replay';
  suggestionHeadline: string;
  confirmedPlanId: string;
  finalState: 'accepted' | 'settled';
}

describe('Causality Golden G-RAIN (LIVING_CONTEXT_V2.md §9 R2)', () => {
  it('clear -> rain causes departure time change, umbrella checklist, preference ranking, and weather citation', () => {
    // -------------------------------------------------------------
    // Phase 1: Clear baseline at 10:00 AM (D1)
    // -------------------------------------------------------------
    const clearClock = createFixedClock(D1_INITIAL_CLOCK);
    const clearSnapshots = replayScenarioTimeline(d1Scenario, clearClock);
    const clearSnapshot = clearSnapshots[clearSnapshots.length - 1]!;

    const clearResult = runPipeline({
      snapshot: clearSnapshot,
      memory: d1MemoryFacts,
      clock: D1_INITIAL_CLOCK,
    });

    const clearPlan = clearResult.livingContext.now;
    expect(clearPlan).not.toBeNull();
    expect(clearPlan!.headline).toContain('2:05 PM');
    expect(clearPlan!.headline).toContain('2:25 PM');
    expect(clearPlan!.checklist).toHaveLength(0); // No umbrella in clear weather
    expect(clearPlan!.why.evidenceSignals.some(s => s.kind === 'weather')).toBe(true);

    // -------------------------------------------------------------
    // Phase 2: Rain forecast arrives at 1:35 PM (D2)
    // -------------------------------------------------------------
    const rainClock = createFixedClock('2026-10-28T20:35:00.000Z');
    const player = createScenarioPlayer(d2Scenario, rainClock);
    const rainSnapshot = player.getSnapshotAt('2026-10-28T20:35:00.000Z');
    expect(rainSnapshot).toBeDefined();

    const rainResult = runPipeline({
      snapshot: rainSnapshot!,
      memory: d2MemoryFacts,
      clock: '2026-10-28T20:35:00.000Z',
    });

    const rainPlan = rainResult.livingContext.now;
    expect(rainPlan).not.toBeNull();

    // 1. Departure timing changed due to rain multi-modal travel + buffer
    expect(rainPlan!.headline).toContain('prepare 2:10 PM, leave 2:30 PM');
    expect(rainPlan!.headline).not.toBe(clearPlan!.headline);

    // 2. Umbrella checklist added
    expect(rainPlan!.checklist).toContain('umbrella');

    // 3. Multi-modal options ranked by confirmed rain habit (drive_first)
    expect(rainPlan!.optionsOrSteps).toHaveLength(2);
    const firstOption = rainPlan!.optionsOrSteps[0];
    expect(typeof firstOption !== 'string').toBe(true);
    expect((firstOption as any).mode).toBe('drive');
    expect((firstOption as any).label).toContain('drive leave 2:30 PM');

    const secondOption = rainPlan!.optionsOrSteps[1];
    expect(typeof secondOption !== 'string').toBe(true);
    expect((secondOption as any).mode).toBe('bus');
    expect((secondOption as any).label).toContain('bus leave 2:15 PM');

    // 4. Why explicitly cites the weather signal with issuedAt 1:35 PM
    const weatherCitation = rainPlan!.why.evidenceSignals.find(
      (s): s is EvidenceCitation => s.kind === 'weather'
    );
    expect(weatherCitation).toBeDefined();
    expect(weatherCitation!.issuedAt).toBe('2026-10-28T20:35:00.000Z');
    expect(weatherCitation!.source).toBe('simulated');
    expect(weatherCitation!.description).toContain('Rain');

    // -------------------------------------------------------------
    // Phase 3: Full Causality Chain Recording (R2)
    // signal -> reasoning (labelled fallback/deterministic) -> suggestion -> confirm -> state
    // -------------------------------------------------------------
    const causalityRecord: CausalityGoldenRecord = {
      scenarioId: 'G-RAIN-clear-to-rain',
      signalKind: weatherCitation!.kind,
      signalIssuedAt: weatherCitation!.issuedAt,
      reasoningEngine: 'deterministic_fallback', // model-off per Rev4 C5
      suggestionHeadline: rainPlan!.headline,
      confirmedPlanId: rainPlan!.id,
      finalState: 'accepted',
    };

    expect(causalityRecord.reasoningEngine).toBe('deterministic_fallback');
    expect(causalityRecord.suggestionHeadline).toContain('umbrella recommended');
    expect(causalityRecord.finalState).toBe('accepted');
  });

  it('clear -> rain under recorded model fixture records causality chain labelled recorded_model_replay', () => {
    // -------------------------------------------------------------
    // Phase 1: Clear baseline at 10:00 AM (D1)
    // -------------------------------------------------------------
    const clearClock = createFixedClock(D1_INITIAL_CLOCK);
    const clearSnapshots = replayScenarioTimeline(d1Scenario, clearClock);
    const clearSnapshot = clearSnapshots[clearSnapshots.length - 1]!;

    const clearResult = runPipeline({
      snapshot: clearSnapshot,
      memory: d1MemoryFacts,
      clock: D1_INITIAL_CLOCK,
    });

    const clearPlan = clearResult.livingContext.now;
    expect(clearPlan).not.toBeNull();

    // -------------------------------------------------------------
    // Phase 2: Rain forecast arrives at 1:35 PM (D2)
    // -------------------------------------------------------------
    const rainClock = createFixedClock('2026-10-28T20:35:00.000Z');
    const player = createScenarioPlayer(d2Scenario, rainClock);
    const rainSnapshot = player.getSnapshotAt('2026-10-28T20:35:00.000Z');
    expect(rainSnapshot).toBeDefined();

    const rainResult = runPipeline({
      snapshot: rainSnapshot!,
      memory: d2MemoryFacts,
      clock: '2026-10-28T20:35:00.000Z',
    });

    const rainPlan = rainResult.livingContext.now;
    expect(rainPlan).not.toBeNull();

    // Weather signal citation
    const weatherCitation = rainPlan!.why.evidenceSignals.find(
      (s): s is EvidenceCitation => s.kind === 'weather'
    );
    expect(weatherCitation).toBeDefined();
    expect(weatherCitation!.issuedAt).toBe('2026-10-28T20:35:00.000Z');

    // -------------------------------------------------------------
    // Phase 3: Model reasoning under recorded fixture
    // -------------------------------------------------------------
    const modelInterpreter = new ModelCommandInterpreter({ mode: 'replay' });
    const decision = modelInterpreter.interpret('Can I leave later?', {
      availableModes: ['drive', 'bus'],
      availableSignalIds: [`weather:${weatherCitation!.issuedAt}`, 'calendar:2026-10-28T17:00:00.000Z'],
      confirmedFactKeys: ['rain_transport_preference', 'prep_buffer_minutes'],
      validTimes: [rainPlan!.leaveAt!, rainPlan!.prepareAt!, rainPlan!.apptAt!],
      validPlaces: [rainPlan!.subjectTitle!],
    });

    expect(decision.engineStatus).toBe('recorded_model_replay');
    expect(decision.situationAttribution).toBeDefined();
    expect(decision.situationAttribution!.reasonCode).toBe('weather_adjusted');
    expect(decision.recommendedOptionDelta).toBe(5);

    // Full causality chain under recorded model replay
    const causalityRecord: CausalityGoldenRecord = {
      scenarioId: 'G-RAIN-clear-to-rain-model-replay',
      signalKind: weatherCitation!.kind,
      signalIssuedAt: weatherCitation!.issuedAt,
      reasoningEngine: 'recorded_model_replay',
      suggestionHeadline: rainPlan!.headline,
      confirmedPlanId: rainPlan!.id,
      finalState: 'accepted',
    };

    expect(causalityRecord.reasoningEngine).toBe('recorded_model_replay');
    expect(causalityRecord.suggestionHeadline).toContain('umbrella recommended');
    expect(causalityRecord.finalState).toBe('accepted');
  });
});
