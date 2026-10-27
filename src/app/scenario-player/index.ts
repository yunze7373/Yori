/**
 * Scenario Player Contracts & Interfaces
 * Governed by G-101 and Acceptance Criteria AC-101-2.
 *
 * Provides the contract for deterministic scenario replay under a fixed clock.
 */

import type { Scenario, ContextSnapshot } from '../../core/contracts/index.js';

export interface Clock {
  now(): string; // ISO 8601 string
}

export interface ScenarioReplayOptions {
  readonly fixedClock?: string;
  readonly timezone?: string;
}

export interface ScenarioPlayer {
  readonly scenario: Scenario;
  getSnapshots(): readonly ContextSnapshot[];
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
