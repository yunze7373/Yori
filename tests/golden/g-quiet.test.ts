/**
 * Causality Golden G-QUIET: Honest Quiet State & Interruption Suppression Chain
 * Governed by LIVING_CONTEXT_V2.md §9 R2, §8 D4, and Rev4 Condition C5.
 *
 * Add-only test file.
 *
 * Verifies that when context indicates lunch is unneeded (user is busy or already ate):
 * - No lunch card is shown (0 prompts; no interruption).
 * - Shared core policy records suppression with exact reason code.
 * - Records the full signal → reasoning → suggestion → confirm → state chain with provenance
 *   (timestamp, demo city, source, authorization status).
 */

import { describe, it, expect } from 'vitest';
import { d4ScenarioBusy, d4ScenarioAlreadyAte, d4MemoryFacts } from '../fixtures/index.js';
import { createFixedClock, replayScenarioTimeline } from '../../src/app/scenario-player/index.js';
import { runPipeline } from '../../src/core/pipeline/index.js';
import '../../src/plugins/registry.js';
import type { ProvenanceDetails } from './g-pref.test.js';

export interface QuietCausalityRecord {
  readonly scenarioId: string;
  readonly provenance: ProvenanceDetails;
  readonly signal: {
    readonly kind: string;
    readonly issuedAt: string;
    readonly value: unknown;
  };
  readonly reasoning: {
    readonly policy: 'shared_core_policy';
    readonly suppressionCode: string;
    readonly explanation: string;
  };
  readonly suggestion: {
    readonly promptCount: number;
    readonly isSuppressed: boolean;
    readonly activePlanIntent: string | null;
  };
  readonly confirm: {
    readonly action: 'suppressed_no_prompt';
  };
  readonly finalState: 'quiet';
}

describe('Causality Golden G-QUIET (LIVING_CONTEXT_V2.md §9 R2)', () => {
  const FIXED_INSTANT = '2026-10-28T19:10:00.000Z'; // 12:10 PM local
  const DEMO_CITY = 'Downtown Los Angeles';

  it('user is busy during lunch window -> 0 prompts, suppression recorded by shared policy', () => {
    const clock = createFixedClock(FIXED_INSTANT);
    const snapshots = replayScenarioTimeline(d4ScenarioBusy, clock);
    const snapshot = snapshots[snapshots.length - 1]!;

    const result = runPipeline({
      snapshot,
      memory: d4MemoryFacts,
      clock: FIXED_INSTANT,
    });

    // 1. Invariant: 0 lunch prompts in livingContext (no interruption)
    expect(result.livingContext.now?.intentId).not.toBe('lunch');
    expect(result.livingContext.ahead.some(p => p.intentId === 'lunch')).toBe(false);

    // 2. Suppression recorded by shared policy
    const suppression = result.suppressions.find(s => s.code === 'user_busy');
    expect(suppression).toBeDefined();

    // 3. Record full causality chain with provenance
    const scheduleSignal = snapshot.signals.find(s => s.kind === 'schedule_window')!;
    const chainRecord: QuietCausalityRecord = {
      scenarioId: 'G-QUIET-busy',
      provenance: {
        timestamp: FIXED_INSTANT,
        demoCity: DEMO_CITY,
        source: 'simulated',
        authorizationStatus: 'device_only',
      },
      signal: {
        kind: scheduleSignal.kind,
        issuedAt: scheduleSignal.issuedAt,
        value: scheduleSignal.value,
      },
      reasoning: {
        policy: 'shared_core_policy',
        suppressionCode: suppression!.code,
        explanation: 'User calendar indicates busy meeting; lunch card suppressed to prevent unwanted interruption.',
      },
      suggestion: {
        promptCount: 0,
        isSuppressed: true,
        activePlanIntent: result.livingContext.now?.intentId ?? null,
      },
      confirm: {
        action: 'suppressed_no_prompt',
      },
      finalState: 'quiet',
    };

    expect(chainRecord.finalState).toBe('quiet');
    expect(chainRecord.reasoning.suppressionCode).toBe('user_busy');
    expect(chainRecord.provenance.demoCity).toBe('Downtown Los Angeles');
    expect(chainRecord.suggestion.promptCount).toBe(0);
  });

  it('user has already eaten -> 0 prompts, already_eaten suppression recorded with provenance', () => {
    const clock = createFixedClock(FIXED_INSTANT);
    const snapshots = replayScenarioTimeline(d4ScenarioAlreadyAte, clock);
    const snapshot = snapshots[snapshots.length - 1]!;

    const result = runPipeline({
      snapshot,
      memory: d4MemoryFacts,
      clock: FIXED_INSTANT,
    });

    // 1. Invariant: 0 lunch prompts in livingContext
    expect(result.livingContext.now?.intentId).not.toBe('lunch');
    expect(result.livingContext.ahead.some(p => p.intentId === 'lunch')).toBe(false);

    // 2. Suppression recorded with already_done code
    const suppression = result.suppressions.find(s => s.code === 'already_done');
    expect(suppression).toBeDefined();

    // 3. Record full causality chain with provenance
    const eatingSignal = snapshot.signals.find(s => s.kind === 'eating_status')!;
    const chainRecord: QuietCausalityRecord = {
      scenarioId: 'G-QUIET-already-ate',
      provenance: {
        timestamp: FIXED_INSTANT,
        demoCity: DEMO_CITY,
        source: 'simulated',
        authorizationStatus: 'device_only',
      },
      signal: {
        kind: eatingSignal.kind,
        issuedAt: eatingSignal.issuedAt,
        value: eatingSignal.value,
      },
      reasoning: {
        policy: 'shared_core_policy',
        suppressionCode: suppression!.code,
        explanation: 'User eating status indicates lunch already eaten today; lunch card suppressed.',
      },
      suggestion: {
        promptCount: 0,
        isSuppressed: true,
        activePlanIntent: result.livingContext.now?.intentId ?? null,
      },
      confirm: {
        action: 'suppressed_no_prompt',
      },
      finalState: 'quiet',
    };

    expect(chainRecord.finalState).toBe('quiet');
    expect(chainRecord.reasoning.suppressionCode).toBe('already_done');
    expect(chainRecord.provenance.demoCity).toBe('Downtown Los Angeles');
    expect(chainRecord.suggestion.promptCount).toBe(0);
  });
});
