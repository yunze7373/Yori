/**
 * Scenario Player: Deterministic Timeline Replay
 * Governed by G-101 and Acceptance Criteria AC-101-2.
 *
 * Replays Scenario timelines under an injected clock into frozen ContextSnapshots.
 * Groups same-instant timeline events so each distinct timestamp produces exactly one snapshot.
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
 * Groups events sharing identical `at` timestamps into single distinct snapshots,
 * collects all active signals as of that event, and produces deeply frozen, immutable ContextSnapshots.
 */
export function replayScenarioTimeline(
  scenario: Scenario,
  clock: Clock
): readonly ContextSnapshot[] {
  const maxTime = Date.parse(clock.now());

  // Filter events up to clock.now() and sort chronologically
  const eligibleEvents = [...scenario.timeline]
    .filter(event => Date.parse(event.at) <= maxTime)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // Group events by distinct timestamp
  const eventsByTimestamp = new Map<string, ContextSignal[]>();
  for (const event of eligibleEvents) {
    const existing = eventsByTimestamp.get(event.at) ?? [];
    existing.push(event.signal);
    eventsByTimestamp.set(event.at, existing);
  }

  const snapshots: ContextSnapshot[] = [];
  const accumulatedSignals: ContextSignal[] = [];
  let index = 1;

  for (const [timestamp, signals] of eventsByTimestamp.entries()) {
    accumulatedSignals.push(...signals);

    const snapshotId = `${scenario.id}-snap-${index++}`;
    const rawSnapshot: ContextSnapshot = {
      id: snapshotId,
      asOf: timestamp,
      timezone: scenario.timezone,
      signals: [...accumulatedSignals],
    };

    snapshots.push(freezeSnapshot(rawSnapshot));
  }

  // If no timeline events exist before maxTime, produce at least one initial empty snapshot
  if (snapshots.length === 0) {
    const emptySnapshot: ContextSnapshot = {
      id: `${scenario.id}-initial`,
      asOf: clock.now(),
      timezone: scenario.timezone,
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
