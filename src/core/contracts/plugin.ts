/**
 * Plugin Contract
 * Governed by Invariant INV-109.
 * Defines the static shape of plugins extending Yori.
 */

import type { IntentDetector } from './intent.js';
import type { Preparer } from './plan.js';
import type { ProviderAdapter } from './adapter.js';

export interface Plugin<TAdapter extends ProviderAdapter = ProviderAdapter> {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly detector: IntentDetector;
  readonly preparer: Preparer;
  readonly adapter?: TAdapter;
  readonly requiredSignals?: readonly string[];
  readonly triggerSignalKinds?: readonly string[];
}
