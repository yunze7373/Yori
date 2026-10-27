/**
 * Mock Place Adapter
 * Governed by Invariants INV-101, INV-102, INV-103 and AC-101-3.
 *
 * Source-labelled mock places with placeholder names.
 * Never invents or fabricates real commercial venues, real business hours, or real prices.
 * Returns SimulatedSignal only (source: 'simulated', label: 'simulated').
 */

import {
  createSimulatedSignal,
  type SimulatedProviderAdapter,
  type SimulatedSignal,
} from '../../core/contracts/index.js';

export interface MockPlaceItem {
  readonly id: string;
  readonly name: string;
  readonly cuisine: string;
  readonly distanceMinutes: number;
}

export const DEFAULT_MOCK_PLACES: readonly MockPlaceItem[] = Object.freeze([
  Object.freeze({
    id: 'mock-place-1',
    name: 'Placeholder Place Alpha (Ramen)',
    cuisine: 'japanese',
    distanceMinutes: 5,
  }),
  Object.freeze({
    id: 'mock-place-2',
    name: 'Placeholder Place Beta (Salad)',
    cuisine: 'salad',
    distanceMinutes: 7,
  }),
  Object.freeze({
    id: 'mock-place-3',
    name: 'Placeholder Place Gamma (Japanese Cuisine)',
    cuisine: 'japanese',
    distanceMinutes: 10,
  }),
  Object.freeze({
    id: 'mock-place-4',
    name: 'Placeholder Place Delta (General Dining)',
    cuisine: 'fast_food',
    distanceMinutes: 8,
  }),
]);

export interface MockPlaceAdapterOptions {
  readonly places?: readonly MockPlaceItem[];
  readonly issuedAt?: string;
  readonly validFor?: number;
}

export class MockPlaceAdapter implements SimulatedProviderAdapter {
  public readonly kind = 'mock-place-adapter';
  public readonly source = 'simulated' as const;

  constructor(private readonly options: MockPlaceAdapterOptions = {}) {}

  public getPlaces(): readonly MockPlaceItem[] {
    return this.options.places ?? DEFAULT_MOCK_PLACES;
  }

  public signals(asOfIso?: string): readonly SimulatedSignal[] {
    const issuedAt = this.options.issuedAt ?? asOfIso ?? '1970-01-01T00:00:00.000Z';
    const validFor = this.options.validFor ?? 3600000;

    const signal = createSimulatedSignal({
      kind: 'mock_places',
      value: this.getPlaces(),
      issuedAt,
      validFor,
      confidence: 0.9,
      consentScope: 'device_only',
    });

    return Object.freeze([signal]);
  }
}

export const mockPlaceAdapter = new MockPlaceAdapter();
