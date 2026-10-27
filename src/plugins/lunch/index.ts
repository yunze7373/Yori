/**
 * Lunch Plugin (Stub for S0-2)
 * Full implementation scheduled for S2-1.
 */

import type {
  IntentDetector,
  Preparer,
  IntentCandidate,
  PreparedPlan,
  ContextSnapshot,
  MemoryFact,
  SimulatedProviderAdapter,
} from '../../core/contracts/index.js';
import type { Plugin } from '../registry.js';

export const lunchDetectorStub: IntentDetector = {
  id: 'lunch-detector-stub',
  targetIntent: 'lunch',
  detect(_snapshot: ContextSnapshot, _memory: readonly MemoryFact[]): IntentCandidate | null {
    // Stub implementation: returns null until S2-1 implements real detection
    return null;
  },
};

export const lunchPreparerStub: Preparer = {
  id: 'lunch-preparer-stub',
  targetIntent: 'lunch',
  prepare(
    _candidate: IntentCandidate,
    _snapshot: ContextSnapshot,
    _memory: readonly MemoryFact[]
  ): PreparedPlan | null {
    // Stub implementation: returns null until S2-1 implements real preparation
    return null;
  },
};

export const lunchAdapterStub: SimulatedProviderAdapter = {
  kind: 'lunch-adapter-stub',
  source: 'simulated',
  signals: () => [],
};

export const lunchPluginStub: Plugin<SimulatedProviderAdapter> = {
  id: 'lunch',
  name: 'Lunch Plugin (Stub)',
  detector: lunchDetectorStub,
  preparer: lunchPreparerStub,
  adapter: lunchAdapterStub,
};
