/**
 * Depart Plugin (Stub for S0-2)
 * Full implementation scheduled for S1-1.
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

export const departDetectorStub: IntentDetector = {
  id: 'depart-detector-stub',
  targetIntent: 'depart',
  detect(_snapshot: ContextSnapshot, _memory: readonly MemoryFact[]): IntentCandidate | null {
    // Stub implementation: returns null until S1-1 implements real detection
    return null;
  },
};

export const departPreparerStub: Preparer = {
  id: 'depart-preparer-stub',
  targetIntent: 'depart',
  prepare(
    _candidate: IntentCandidate,
    _snapshot: ContextSnapshot,
    _memory: readonly MemoryFact[]
  ): PreparedPlan | null {
    // Stub implementation: returns null until S1-1 implements real preparation
    return null;
  },
};

export const departAdapterStub: SimulatedProviderAdapter = {
  kind: 'depart-adapter-stub',
  source: 'simulated',
  signals: () => [],
};

export const departPluginStub: Plugin<SimulatedProviderAdapter> = {
  id: 'depart',
  name: 'Depart Plugin (Stub)',
  detector: departDetectorStub,
  preparer: departPreparerStub,
  adapter: departAdapterStub,
};
