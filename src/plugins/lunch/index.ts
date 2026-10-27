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

export const lunchPlugin: Plugin<SimulatedProviderAdapter> = Object.freeze({
  id: 'lunch',
  name: 'Lunch Plugin',
  description: 'Proactive lunch recommendation planner matching confirmed taste memories.',
  detector: lunchDetector,
  preparer: lunchPreparer,
  adapter: mockPlaceAdapter,
});
