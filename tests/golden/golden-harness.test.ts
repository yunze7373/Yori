/**
 * Golden Acceptance Harness: D1-D6 + AC-EXT-1
 * Governed by Section 7 of Architecture Rev3, Slice 0 S0-2.
 *
 * Architecture Invariants enforced:
 * - Shared core policy drives suppression, ranking, and notices (INV-108, INV-109).
 * - Snapshots are deeply frozen and replay is deterministic (AC-101-2, INV-101).
 * - Full Section-7 outcomes asserted on core pipeline entry (runPipeline).
 *
 * Acceptance Behavior in Slice 0 S0-2:
 * - Determinism check PASSES.
 * - D1-D6 fixtures and AC-EXT-1 FAIL against stubs with distinct failing assertions (sensitivity proven).
 */

import { describe, it, expect } from 'vitest';
import {
  d1Scenario,
  d1MemoryFacts,
  D1_INITIAL_CLOCK,
  d2Scenario,
  d2MemoryFacts,
  d3Scenario,
  d3MemoryFacts,
  d4ScenarioBusy,
  d4ScenarioAlreadyAte,
  d4MemoryFacts,
  d5Scenario,
  d5MemoryFacts,
  d5SameDaySuppressions,
  d6ScenarioStaleWeather,
  d6ScenarioMissingWeather,
  D6_EVALUATION_CLOCK,
} from '../fixtures/index.js';
import {
  createScenarioPlayer,
  createFixedClock,
  replayScenarioTimeline,
} from '../../src/app/scenario-player/index.js';
import { runPipeline } from '../../src/core/pipeline/index.js';
import { staticPluginRegistry } from '../../src/plugins/registry.js';
import type { PreparedPlan } from '../../src/core/contracts/index.js';

describe('Slice 0 S0-2: Deterministic Scenario Replay (AC-101-2)', () => {
  it('replaying the same scenario twice under a fixed clock yields deep-equal, frozen snapshot sequences', () => {
    const clock = createFixedClock(D1_INITIAL_CLOCK);

    const snapshotsRun1 = replayScenarioTimeline(d1Scenario, clock);
    const snapshotsRun2 = replayScenarioTimeline(d1Scenario, clock);

    // 1. Snapshot sequences must be deep-equal across independent replays
    expect(snapshotsRun1).toEqual(snapshotsRun2);

    // 2. Snapshot count must match distinct timestamps (grouped same-instant events)
    expect(snapshotsRun1.length).toBeGreaterThan(0);
    expect(snapshotsRun1.length).toBe(snapshotsRun2.length);

    // 3. All snapshots and their signals must be deeply frozen
    for (const snap of snapshotsRun1) {
      expect(Object.isFrozen(snap)).toBe(true);
      expect(Object.isFrozen(snap.signals)).toBe(true);
      for (const sig of snap.signals) {
        expect(Object.isFrozen(sig)).toBe(true);
        if (sig.value !== null && typeof sig.value === 'object') {
          expect(Object.isFrozen(sig.value)).toBe(true);
        }
      }
    }
  });

  it('scenario player retrieves accurate frozen snapshot at any target timestamp', () => {
    const player = createScenarioPlayer(d2Scenario, createFixedClock('2026-10-28T21:00:00.000Z'));
    const snapshotAtRain = player.getSnapshotAt('2026-10-28T20:35:00.000Z');

    expect(snapshotAtRain).toBeDefined();
    expect(snapshotAtRain.signals.length).toBeGreaterThanOrEqual(2);
    expect(Object.isFrozen(snapshotAtRain)).toBe(true);
  });
});

describe('Slice 0 S0-2: D1 Golden Depart Fixture (Fails on Stub)', () => {
  it('piano lesson 15:00 -> prepare 2:05 PM, leave 2:25 PM with clear weather and Why derivation', () => {
    const clock = createFixedClock(D1_INITIAL_CLOCK);
    const snapshots = replayScenarioTimeline(d1Scenario, clock);
    const latestSnapshot = snapshots[snapshots.length - 1]!;

    const result = runPipeline({
      snapshot: latestSnapshot,
      memory: d1MemoryFacts,
      clock: D1_INITIAL_CLOCK,
    });

    const now = result.livingContext.now;
    expect(
      now,
      'D1 assertion failed: livingContext.now must present depart plan (implemented in S1-1)'
    ).not.toBeNull();

    // Section 7 required outcomes
    expect(now?.headline).toContain('2:05 PM');
    expect(now?.headline).toContain('2:25 PM');
    expect(now?.why.derivation).toContain('14:25 leave');
    expect(now?.why.derivation).toContain('14:05 prepare');
  });
});

describe('Slice 0 S0-2: D2 Rain Re-plan Fixture (Fails on Stub)', () => {
  it('sudden rain at 1:35 PM -> umbrella checklist, drive 2:30 / bus 2:15 ranked options, Why cites issuedAt, memory unchanged', () => {
    const clock = createFixedClock('2026-10-28T20:35:00.000Z');
    const snapshots = replayScenarioTimeline(d2Scenario, clock);
    const rainSnapshot = snapshots[snapshots.length - 1]!;

    const memorySnapshotBefore = JSON.stringify(d2MemoryFacts);

    const result = runPipeline({
      snapshot: rainSnapshot,
      memory: d2MemoryFacts,
      clock: '2026-10-28T20:35:00.000Z',
    });

    const now = result.livingContext.now;
    expect(
      now,
      'D2 assertion failed: livingContext.now must re-plan for rain (implemented in S1-1)'
    ).not.toBeNull();

    // Section 7 required outcomes
    expect(now?.checklist).toContain('umbrella');

    // Multi-modal options: drive leave 2:30 ranked first by confirmed rain habit, bus leave 2:15 second
    const options = now?.optionsOrSteps as unknown as Array<{ label: string }> | undefined;
    expect(options?.[0]?.label).toContain('drive leave 2:30');
    expect(options?.[1]?.label).toContain('bus leave 2:15');

    // Why citations: cites rain forecast issuedAt
    const weatherCitation = now?.why.evidenceSignals.find(s => s.kind === 'weather');
    expect(weatherCitation).toBeDefined();
    expect(weatherCitation?.issuedAt).toBe('2026-10-28T20:35:00.000Z');

    // Invariant INV-107: preferences unchanged (no direct mutation)
    const memorySnapshotAfter = JSON.stringify(d2MemoryFacts);
    expect(memorySnapshotAfter).toBe(memorySnapshotBefore);
  });
});

describe('Slice 0 S0-2: D3 Lunch Away Recommendation Fixture (Fails on Stub)', () => {
  it('away at 12:10 with free window -> <=3 lunch options each citing confirmed taste memory', () => {
    const clock = createFixedClock('2026-10-28T19:10:00.000Z');
    const snapshots = replayScenarioTimeline(d3Scenario, clock);
    const awaySnapshot = snapshots[snapshots.length - 1]!;

    const result = runPipeline({
      snapshot: awaySnapshot,
      memory: d3MemoryFacts,
      clock: '2026-10-28T19:10:00.000Z',
    });

    // Check lunch plan in livingContext (NOW or AHEAD)
    const plans: readonly PreparedPlan[] = [
      ...(result.livingContext.now ? [result.livingContext.now] : []),
      ...result.livingContext.ahead,
    ];
    const lunchPlan = plans.find(p => p.intentId === 'lunch');

    expect(
      lunchPlan,
      'D3 assertion failed: livingContext must contain lunch options citing confirmed taste memory (implemented in S2-1)'
    ).toBeDefined();

    // Section 7 required outcomes: <=3 options
    expect(lunchPlan?.optionsOrSteps.length).toBeGreaterThan(0);
    expect(lunchPlan?.optionsOrSteps.length).toBeLessThanOrEqual(3);

    // Each option's Why cites a confirmed taste memory
    const tasteFact = lunchPlan?.why.memoryFactsUsed.find(
      f => f.key === 'taste_preference' || f.key === 'favorite_cuisine'
    );
    expect(tasteFact).toBeDefined();
    expect(tasteFact?.status).toBe('confirmed');
  });
});

describe('Slice 0 S0-2: D4 Lunch Busy / Already-Ate Suppression (Fails on Stub)', () => {
  it('user busy or already ate -> 0 lunch prompts with suppression reasons recorded by shared policy', () => {
    const clock = createFixedClock('2026-10-28T19:10:00.000Z');

    // Variant A: User is busy
    const busySnapshots = replayScenarioTimeline(d4ScenarioBusy, clock);
    const busyResult = runPipeline({
      snapshot: busySnapshots[busySnapshots.length - 1]!,
      memory: d4MemoryFacts,
      clock: '2026-10-28T19:10:00.000Z',
    });

    // 0 prompts for lunch in NOW or AHEAD (D4 carried binding)
    expect(busyResult.livingContext.now?.intentId).not.toBe('lunch');
    expect(busyResult.livingContext.ahead.some(p => p.intentId === 'lunch')).toBe(false);

    // Suppression must be recorded by core policy with 'user_busy' code
    const busySuppression = busyResult.suppressions.find(s => s.code === 'user_busy');
    expect(
      busySuppression,
      'D4 assertion failed: shared policy suppressions must record user_busy reason (implemented in S2-1)'
    ).toBeDefined();

    // Variant B: User already ate lunch
    const ateSnapshots = replayScenarioTimeline(d4ScenarioAlreadyAte, clock);
    const ateResult = runPipeline({
      snapshot: ateSnapshots[ateSnapshots.length - 1]!,
      memory: d4MemoryFacts,
      clock: '2026-10-28T19:10:00.000Z',
    });

    expect(ateResult.livingContext.now?.intentId).not.toBe('lunch');
    expect(ateResult.livingContext.ahead.some(p => p.intentId === 'lunch')).toBe(false);
    const ateSuppression = ateResult.suppressions.find(s => s.code === 'already_done');
    expect(
      ateSuppression,
      'D4 assertion failed: shared policy suppressions must record already_done reason (implemented in S2-1)'
    ).toBeDefined();
  });
});

describe('Slice 0 S0-2: D5 Explicit User Suppression Fixture (Fails on Stub)', () => {
  it("user dismisses with 'don't suggest lunch' -> suppressed rest of day and memory change only as pending proposal", () => {
    const clock = createFixedClock('2026-10-28T19:15:00.000Z');
    const snapshots = replayScenarioTimeline(d5Scenario, clock);

    const result = runPipeline({
      snapshot: snapshots[snapshots.length - 1]!,
      memory: d5MemoryFacts,
      suppressions: d5SameDaySuppressions,
      clock: '2026-10-28T19:15:00.000Z',
    });

    // Core policy records rest-of-day suppression
    const suppression = result.suppressions.find(s => s.code === 'user_suppressed');
    expect(
      suppression,
      'D5 assertion failed: shared policy must record user_suppressed today (implemented in S2-1)'
    ).toBeDefined();
    expect(suppression?.scope).toBe('today');

    // Invariant INV-107 & D5 carried binding: livingContext.forYou contains the pending proposal and no confirmed fact was written
    const forYouProposal = result.livingContext.forYou.find(f => f.key === 'suppress_lunch_recommendations');
    expect(forYouProposal).toBeDefined();
    expect(forYouProposal?.status).toBe('pending');
    expect(result.livingContext.forYou.some(f => f.key === 'suppress_lunch_recommendations' && f.status === 'confirmed')).toBe(false);
  });
});

describe('Slice 0 S0-2: D6 Fail-Closed Stale or Missing Signal (Fails on Stub)', () => {
  it('stale weather signal evaluates fail-closed: notices contain fail-closed notice, no plan built on stale data', () => {
    const player = createScenarioPlayer(d6ScenarioStaleWeather, createFixedClock(D6_EVALUATION_CLOCK));
    const snapshot = player.getSnapshotAt(D6_EVALUATION_CLOCK);

    const result = runPipeline({
      snapshot,
      memory: [],
      clock: D6_EVALUATION_CLOCK,
    });

    // Core policy generates visible fail-closed notice
    const notice = result.notices.find(
      n => n.missingOrStaleSignalKind === 'weather' && n.isStale
    );
    expect(
      notice,
      'D6 assertion failed: notices must contain fail_closed_notice for stale weather signal (implemented in S2-1)'
    ).toBeDefined();

    // No PreparedPlan in LivingContext cites the expired signal
    const allPlans: readonly PreparedPlan[] = [
      ...(result.livingContext.now ? [result.livingContext.now] : []),
      ...result.livingContext.ahead,
    ];
    for (const plan of allPlans) {
      const citedWeather = plan.why.evidenceSignals.find(s => s.kind === 'weather');
      expect(citedWeather, 'D6 violation: no plan may be built on stale weather data').toBeUndefined();
    }
  });

  it('missing weather signal evaluates fail-closed: produces fail-closed notice and does not invent forecast (INV-103)', () => {
    const player = createScenarioPlayer(d6ScenarioMissingWeather, createFixedClock(D6_EVALUATION_CLOCK));
    const snapshot = player.getSnapshotAt(D6_EVALUATION_CLOCK);

    const result = runPipeline({
      snapshot,
      memory: [],
      clock: D6_EVALUATION_CLOCK,
    });

    const notice = result.notices.find(n => n.missingOrStaleSignalKind === 'weather');
    expect(
      notice,
      'D6 assertion failed: notices must contain fail_closed_notice for missing weather signal (implemented in S2-1)'
    ).toBeDefined();
  });
});

describe('Slice 0 S0-2: AC-EXT-1 Golden Grocery-Stub Expectation (Fails on Missing Plugin)', () => {
  it('AC-EXT-1 proof: requires grocery-stub plugin in static registry (implemented only in S5-1)', () => {
    // In Slice 0, NO grocery-stub implementation exists (proves zero core diff in S5-1)
    const groceryPlugin = staticPluginRegistry.get('grocery-stub');
    expect(groceryPlugin, 'grocery-stub plugin not registered').toBeDefined();
  });
});
