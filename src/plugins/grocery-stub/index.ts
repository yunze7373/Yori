/**
 * Grocery Stub Plugin
 * Governed by AC-EXT-1, INV-109, and Architecture Rev3 Section 4.
 *
 * Proves zero-core-diff extensibility: adding a new intent plugin
 * requires changes ONLY in src/plugins/* and never touches src/core/*.
 */

import type { Plugin, SimulatedProviderAdapter } from '../../core/contracts/index.js';
import { groceryDetector } from './detector.js';
import { groceryPreparer } from './preparer.js';
import { mockGroceryAdapter } from './adapter.js';

export * from './detector.js';
export * from './preparer.js';
export * from './adapter.js';

export const groceryStubPlugin: Plugin<SimulatedProviderAdapter> & {
  readonly managedMemoryKeys?: readonly string[];
} = Object.freeze({
  id: 'grocery-stub',
  name: 'Grocery Stub Plugin',
  description: 'Proactive grocery run recommendation planner demonstrating zero-core-diff plugin extension.',
  detector: groceryDetector,
  preparer: groceryPreparer,
  adapter: mockGroceryAdapter,
  requiredSignals: Object.freeze(['grocery_list']),
  triggerSignalKinds: Object.freeze(['grocery_list', 'grocery_status']),
  managedMemoryKeys: Object.freeze(['grocery_store_preference', 'preferred_grocery_store']),
});
