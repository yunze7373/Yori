/**
 * Depart Simulated Provider Adapter
 * Governed by Invariants INV-101, INV-102 and AC-101-3.
 *
 * Statically guarantees that all emitted signals carry 'simulated' source and label.
 */

import type {
  SimulatedProviderAdapter,
  SimulatedSignal,
} from '../../core/contracts/index.js';

export interface DepartSimulatedData {
  readonly calendarSignals?: readonly SimulatedSignal[];
  readonly travelSignals?: readonly SimulatedSignal[];
  readonly weatherSignals?: readonly SimulatedSignal[];
}

export class SimulatedDepartAdapter implements SimulatedProviderAdapter {
  public readonly kind = 'depart-simulated-adapter';
  public readonly source = 'simulated' as const;

  constructor(private readonly data: DepartSimulatedData = {}) {}

  public signals(): readonly SimulatedSignal[] {
    return Object.freeze([
      ...(this.data.calendarSignals ?? []),
      ...(this.data.travelSignals ?? []),
      ...(this.data.weatherSignals ?? []),
    ]);
  }
}

export const departAdapter = new SimulatedDepartAdapter();
