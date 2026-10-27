/**
 * Core Contracts: Provider Adapters & Source Isolation
 * Governed by Invariants INV-102 and Acceptance Criteria AC-101-3.
 *
 * Ensures mock/simulated adapters cannot construct or return real-source signals.
 */

import type { SimulatedSignal, RealSignal } from './signal.js';

export interface SimulatedProviderAdapter<T = unknown> {
  readonly kind: string;
  readonly source: 'simulated';
  signals(...args: unknown[]): Promise<readonly SimulatedSignal<T>[]> | readonly SimulatedSignal<T>[];
}

export interface RealProviderAdapter<T = unknown> {
  readonly kind: string;
  readonly source: 'real';
  signals(...args: unknown[]): Promise<readonly RealSignal<T>[]> | readonly RealSignal<T>[];
}

export type ProviderAdapter = SimulatedProviderAdapter | RealProviderAdapter;
