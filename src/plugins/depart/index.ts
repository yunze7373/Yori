/**
 * Depart Plugin Entry Point
 * Governed by AC-102-1, AC-102-2, AC-102-3 and Section 4 of Architecture.
 *
 * Combines detector, deterministic preparer, and simulated provider adapter.
 */

import type { Plugin, SimulatedProviderAdapter } from '../../core/contracts/index.js';
import { departDetector } from './detector.js';
import { departPreparer } from './preparer.js';
import { departAdapter } from './adapter.js';

export * from './engine.js';
export * from './detector.js';
export * from './preparer.js';
export * from './adapter.js';
export * from './request-override.js';

export const departPlugin: Plugin<SimulatedProviderAdapter> & {
  readonly managedMemoryKeys?: readonly string[];
} = Object.freeze({
  id: 'depart',
  name: 'Depart Plugin',
  description: 'Proactive departure planner with pure deterministic time engine and rain re-planning.',
  detector: departDetector,
  preparer: departPreparer,
  adapter: departAdapter,
  requiredSignals: Object.freeze(['calendar', 'weather']),
  triggerSignalKinds: Object.freeze(['calendar']),
  managedMemoryKeys: Object.freeze([
    'prep_buffer_minutes',
    'prep_duration_minutes',
    'prep_buffer_preference',
    'rain_transport_preference',
    // D5: the user's confirmed extra minutes to leave earlier when rain is expected (S4c).
    'rain_buffer_minutes',
  ]),
});
