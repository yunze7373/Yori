/**
 * Scenario Player: Deterministic Timeline Replay
 * Governed by G-101 and Acceptance Criteria AC-101-2.
 *
 * Replays Scenario timelines under an injected clock into frozen ContextSnapshots.
 */

import {
  type Scenario,
  type ContextSnapshot,
  type ContextSignal,
  freezeSnapshot,
} from '../../core/contracts/index.js';

export interface Clock {
  now(): string; // ISO 8601 string
}

export interface ScenarioReplayOptions {
  readonly fixedClock?: string;
  readonly timezone?: string;
}

export interface ScenarioPlayer {
  readonly scenario: Scenario;
  readonly clock: Clock;
  getSnapshots(): readonly ContextSnapshot[];
  getSnapshotAt(isoTimestamp: string): ContextSnapshot;
}

/**
 * Creates a deterministic clock anchored at a fixed timestamp.
 */
export function createFixedClock(isoTimestamp: string): Clock {
  const fixed = new Date(isoTimestamp).toISOString();
  return {
    now: () => fixed,
  };
}

/**
 * Replays a scenario timeline under a given Clock.
 * For each timeline event up to clock.now(), collects all active signals as of that event,
 * and produces deeply frozen, immutable ContextSnapshots.
 */
export function replayScenarioTimeline(
  scenario: Scenario,
  clock: Clock
): readonly ContextSnapshot[] {
  const maxTime = Date.parse(clock.now());

  // Sort timeline events chronologically
  const sortedEvents = [...scenario.timeline]
    .filter(event => Date.parse(event.at) <= maxTime)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const snapshots: ContextSnapshot[] = [];
  const accumulatedSignals: ContextSignal[] = [];

  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i]!;
    accumulatedSignals.push(event.signal);

    const snapshotId = `${scenario.id}-snap-${i + 1}`;
    const rawSnapshot: ContextSnapshot = {
      id: snapshotId,
      asOf: event.at,
      signals: [...accumulatedSignals],
    };

    snapshots.push(freezeSnapshot(rawSnapshot));
  }

  // If no timeline events exist before maxTime, produce at least one initial empty snapshot
  if (snapshots.length === 0) {
    const emptySnapshot: ContextSnapshot = {
      id: `${scenario.id}-initial`,
      asOf: clock.now(),
      signals: [],
    };
    snapshots.push(freezeSnapshot(emptySnapshot));
  }

  return Object.freeze(snapshots);
}

/**
 * Creates a ScenarioPlayer instance for replaying a given scenario.
 */
export function createScenarioPlayer(
  scenario: Scenario,
  clock: Clock = createFixedClock(new Date(0).toISOString())
): ScenarioPlayer {
  return {
    scenario,
    clock,
    getSnapshots() {
      return replayScenarioTimeline(scenario, clock);
    },
    getSnapshotAt(isoTimestamp: string) {
      const fixed = createFixedClock(isoTimestamp);
      const snaps = replayScenarioTimeline(scenario, fixed);
      return snaps[snaps.length - 1]!;
    },
  };
}
