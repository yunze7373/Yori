/**
 * Lunch Plugin Entry Point
 * Governed by AC-103-1, AC-103-2, AC-103-3 and Architecture Rev3 Section 4.
 *
 * Combines detector, preparer, and mock place adapter.
 */

import type { Plugin, SimulatedProviderAdapter } from '../../core/contracts/index.js';
import { lunchDetector } from './detector.js';
import { lunchPreparer } from './preparer.js';
import { mockPlaceAdapter } from '../../adapters/mock/index.js';

export * from './detector.js';
export * from './preparer.js';
export * from './adapter.js';

export const lunchPlugin: Plugin<SimulatedProviderAdapter> & {
  readonly managedMemoryKeys?: readonly string[];
} = Object.freeze({
  id: 'lunch',
  name: 'Lunch Plugin',
  description: 'Proactive lunch recommendation planner matching confirmed taste memories.',
  detector: lunchDetector,
  preparer: lunchPreparer,
  adapter: mockPlaceAdapter,
  requiredSignals: Object.freeze(['location_status', 'schedule_window']),
  triggerSignalKinds: Object.freeze(['location_status']),
  managedMemoryKeys: Object.freeze([
    'taste_preference',
    'taste_preferences',
    'favorite_cuisine',
    'suppress_lunch',
    'suppress_lunch_recommendations',
  ]),
});
