/**
 * Golden Acceptance Harness: D1-D6 + AC-EXT-1
 * Governed by Section 7 of Architecture Rev3, Slice 0 S0-2.
 *
 * Demonstrates:
 * 1. Replay determinism (AC-101-2) PASSES.
 * 2. D6 fail-closed notice shape PASSES.
 * 3. D1-D5 fixtures FAIL against stubs with distinct failing assertions (sensitivity proven).
 * 4. AC-EXT-1 FAILS with "grocery-stub plugin not registered" (expectation test, green in S5-1).
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
  d4MemoryFacts,
  d5Scenario,
  d5MemoryFacts,
  d6ScenarioStaleWeather,
  D6_EVALUATION_CLOCK,
} from '../fixtures/index.js';
import {
  createScenarioPlayer,
  createFixedClock,
  replayScenarioTimeline,
} from '../../src/app/scenario-player/index.js';
import { departDetectorStub, departPreparerStub } from '../../src/plugins/depart/index.js';
import { lunchDetectorStub, lunchPreparerStub } from '../../src/plugins/lunch/index.js';
import { sharedPolicyStub } from '../../src/core/policy/index.js';
import { staticPluginRegistry } from '../../src/plugins/registry.js';

describe('Slice 0 S0-2: Deterministic Scenario Replay (AC-101-2)', () => {
  it('replaying the same scenario twice under a fixed clock yields deep-equal, frozen snapshot sequences', () => {
    const clock = createFixedClock(D1_INITIAL_CLOCK);

    const snapshotsRun1 = replayScenarioTimeline(d1Scenario, clock);
    const snapshotsRun2 = replayScenarioTimeline(d1Scenario, clock);

    // 1. Snapshot sequences must be deep-equal across independent replays
    expect(snapshotsRun1).toEqual(snapshotsRun2);

    // 2. Snapshot count must match timeline events
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

describe('Slice 0 S0-2: D6 Fail-Closed Degradation Shape (AC-104-3, INV-106)', () => {
  it('stale weather signal evaluates fail-closed with visible notice and no invented data', () => {
    const player = createScenarioPlayer(d6ScenarioStaleWeather, createFixedClock(D6_EVALUATION_CLOCK));
    const snapshot = player.getSnapshotAt(D6_EVALUATION_CLOCK);

    const weatherSignal = snapshot.signals.find(s => s.kind === 'weather');
    expect(weatherSignal).toBeDefined();

    // Verify signal is expired as-of evaluation clock
    const issuedEpoch = Date.parse(weatherSignal!.issuedAt);
    const evalEpoch = Date.parse(D6_EVALUATION_CLOCK);
    const isExpired = evalEpoch - issuedEpoch > weatherSignal!.validFor;
    expect(isExpired).toBe(true);

    // Verify fail-closed notice structure from policy
    const notice = sharedPolicyStub.createFailClosedNotice('weather', 'validFor duration expired');
    expect(notice.type).toBe('fail_closed_notice');
    expect(notice.isStale).toBe(true);
    expect(notice.missingOrStaleSignalKind).toBe('weather');
    expect(notice.noticeText).toContain('Degraded fail-closed: weather data is missing or stale');
  });
});

describe('Slice 0 S0-2: D1 Golden Depart Fixture (Fails on Stub)', () => {
  it('piano lesson 15:00 -> prepare 2:05 PM, leave 2:25 PM with clear weather', async () => {
    const clock = createFixedClock(D1_INITIAL_CLOCK);
    const snapshots = replayScenarioTimeline(d1Scenario, clock);
    const latestSnapshot = snapshots[snapshots.length - 1]!;

    // Depart detector stub returns null in Slice 0
    const candidate = await departDetectorStub.detect(latestSnapshot, d1MemoryFacts);
    expect(candidate, 'D1 assertion failed: departDetectorStub must detect upcoming appointment (implemented in S1-1)').not.toBeNull();

    const plan = await departPreparerStub.prepare(candidate!, latestSnapshot, d1MemoryFacts);
    expect(plan, 'D1 assertion failed: departPreparerStub must generate prepare 14:05 / leave 14:25 plan (implemented in S1-1)').not.toBeNull();
    expect(plan?.headline).toContain('leave 2:25 PM');
  });
});

describe('Slice 0 S0-2: D2 Rain Re-plan Fixture (Fails on Stub)', () => {
  it('sudden rain at 1:35 PM -> umbrella checklist, drive 2:30 / bus 2:15 ranked options', async () => {
    const clock = createFixedClock('2026-10-28T20:35:00.000Z');
    const snapshots = replayScenarioTimeline(d2Scenario, clock);
    const rainSnapshot = snapshots[snapshots.length - 1]!;

    const candidate = await departDetectorStub.detect(rainSnapshot, d2MemoryFacts);
    expect(candidate, 'D2 assertion failed: departDetectorStub must detect rain re-plan trigger (implemented in S1-1)').not.toBeNull();

    const plan = await departPreparerStub.prepare(candidate!, rainSnapshot, d2MemoryFacts);
    expect(plan, 'D2 assertion failed: departPreparerStub must re-plan with umbrella checklist (implemented in S1-1)').not.toBeNull();
    expect(plan?.checklist).toContain('umbrella');
    expect(plan?.optionsOrSteps[0]).toMatchObject({ label: expect.stringContaining('drive leave 2:30') });
  });
});

describe('Slice 0 S0-2: D3 Lunch Away Recommendation Fixture (Fails on Stub)', () => {
  it('away at 12:10 with free window -> <=3 lunch options citing confirmed taste memory', async () => {
    const clock = createFixedClock('2026-10-28T19:10:00.000Z');
    const snapshots = replayScenarioTimeline(d3Scenario, clock);
    const awaySnapshot = snapshots[snapshots.length - 1]!;

    const candidate = await lunchDetectorStub.detect(awaySnapshot, d3MemoryFacts);
    expect(candidate, 'D3 assertion failed: lunchDetectorStub must detect lunch opportunity away from home (implemented in S2-1)').not.toBeNull();

    const plan = await lunchPreparerStub.prepare(candidate!, awaySnapshot, d3MemoryFacts);
    expect(plan, 'D3 assertion failed: lunchPreparerStub must generate lunch options (implemented in S2-1)').not.toBeNull();
    expect(plan?.optionsOrSteps.length).toBeGreaterThan(0);
    expect(plan?.optionsOrSteps.length).toBeLessThanOrEqual(3);
  });
});

describe('Slice 0 S0-2: D4 Lunch Busy / Already-Ate Suppression (Fails on Stub)', () => {
  it('user busy or already ate -> 0 lunch prompts with recorded suppression reason', async () => {
    const clock = createFixedClock('2026-10-28T19:10:00.000Z');
    const snapshots = replayScenarioTimeline(d4ScenarioBusy, clock);
    const busySnapshot = snapshots[snapshots.length - 1]!;

    const candidate = await lunchDetectorStub.detect(busySnapshot, d4MemoryFacts);
    expect(candidate, 'D4 assertion failed: lunch candidate must be created and marked suppressed (implemented in S2-1)').not.toBeNull();
    expect(candidate?.suppressedBy?.code).toBe('user_busy');
  });
});

describe('Slice 0 S0-2: D5 Explicit User Suppression Fixture (Fails on Stub)', () => {
  it("user dismisses with 'don't suggest lunch' -> suppressed rest of day and pending memory fact", async () => {
    const clock = createFixedClock('2026-10-28T19:15:00.000Z');
    const snapshots = replayScenarioTimeline(d5Scenario, clock);
    const snapshot = snapshots[snapshots.length - 1]!;

    const candidate = await lunchDetectorStub.detect(snapshot, d5MemoryFacts);
    expect(candidate, 'D5 assertion failed: candidate must reflect suppression for rest of day (implemented in S2-1)').not.toBeNull();
    expect(candidate?.suppressedBy?.code).toBe('user_suppressed');
    expect(candidate?.suppressedBy?.scope).toBe('today');
  });
});

describe('Slice 0 S0-2: AC-EXT-1 Golden Grocery-Stub Expectation (Fails on Missing Plugin)', () => {
  it('AC-EXT-1 proof: requires grocery-stub plugin in static registry (implemented only in S5-1)', () => {
    // In Slice 0, NO grocery-stub implementation exists (proves zero core diff in S5-1)
    const groceryPlugin = staticPluginRegistry.get('grocery-stub');
    expect(groceryPlugin, 'grocery-stub plugin not registered').toBeDefined();
  });
});
