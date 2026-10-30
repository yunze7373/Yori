/**
 * Fuel Plugin Entry Point (V5-FUEL / LIVING_CONTEXT_V2.md §10.3)
 *
 * Demonstrates AC-EXT-1 zero-core-diff extensibility for fuel recommendations.
 */

import type { Plugin, SimulatedProviderAdapter } from '../../core/contracts/index.js';
import { fuelDetector } from './detector.js';
import { fuelPreparer } from './preparer.js';
import { mockFuelAdapter } from './adapter.js';

export * from './types.js';
export * from './detector.js';
export * from './preparer.js';
export * from './adapter.js';

export const fuelPlugin: Plugin<SimulatedProviderAdapter> & {
  readonly managedMemoryKeys?: readonly string[];
} = Object.freeze({
  id: 'fuel',
  name: 'Fuel Plugin',
  description: 'Proactive fuel recommendation planner finding nearby gas stations via PlacesProvider seam.',
  detector: fuelDetector,
  preparer: fuelPreparer,
  adapter: mockFuelAdapter,
  requiredSignals: Object.freeze(['location_status']),
  triggerSignalKinds: Object.freeze(['fuel_status', 'fuel_percent', 'user_request', 'user_command']),
  managedMemoryKeys: Object.freeze([]),
});
