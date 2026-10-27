/**
 * Core Contracts: Scenarios & Replay
 * Governed by Acceptance Criteria AC-101-1, AC-101-2.
 */

import type { ContextSignal } from './signal.js';

export interface ScenarioTimelineEvent {
  readonly at: string; // ISO 8601 string or timeline timestamp
  readonly signal: ContextSignal;
}

/**
 * Scenario
 * Replayable signal timeline under a fixed clock (AC-101-2).
 */
export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly timezone?: string;
  readonly timeline: readonly ScenarioTimelineEvent[];
}
