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

export type PlaceNoiseLevel = 'quiet' | 'moderate' | 'lively';

export interface MockPlaceItem {
  readonly id?: string;
  readonly name: string;
  readonly cuisine: string;
  readonly distanceMinutes: number;
  readonly noiseLevel?: PlaceNoiseLevel;
  readonly vegetarian?: boolean;
  readonly coords?: { readonly lat: number; readonly lng: number };
  readonly straightLineDistanceMeters?: number;
  readonly straightLineDistanceLabel?: string;
}

export const DEFAULT_MOCK_PLACES: readonly MockPlaceItem[] = Object.freeze([
  Object.freeze({
    id: 'mock-place-1',
    name: 'Demo Place A · Ramen',
    cuisine: 'japanese',
    distanceMinutes: 5,
    noiseLevel: 'lively',
    vegetarian: false,
  }),
  Object.freeze({
    id: 'mock-place-2',
    name: 'Demo Place B · Salad',
    cuisine: 'salad',
    distanceMinutes: 7,
    noiseLevel: 'quiet',
    vegetarian: true,
  }),
  Object.freeze({
    id: 'mock-place-3',
    name: 'Demo Place C · Sushi',
    cuisine: 'japanese',
    distanceMinutes: 10,
    noiseLevel: 'quiet',
    vegetarian: false,
  }),
  Object.freeze({
    id: 'mock-place-4',
    name: 'Demo Place D · Fast Food',
    cuisine: 'fast_food',
    distanceMinutes: 8,
    noiseLevel: 'moderate',
    vegetarian: false,
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

  public getEvidenceRecords(asOfIso?: string): readonly {
    readonly id: string;
    readonly provider: string;
    readonly kind: 'poi';
    readonly fetchedAt: string;
    readonly provenance: 'simulated';
    readonly fields: Record<string, unknown>;
  }[] {
    const fetchedAt = this.options.issuedAt ?? asOfIso ?? '2026-10-28T19:10:00.000Z';
    return this.getPlaces().map((place, idx) => {
      const placeId = place.id || `mock-place-${idx + 1}`;
      return Object.freeze({
        id: placeId,
        provider: 'mock-place-adapter',
        kind: 'poi' as const,
        fetchedAt,
        provenance: 'simulated' as const,
        fields: Object.freeze({
          id: placeId,
          name: place.name,
          cuisine: place.cuisine,
          distanceMinutes: place.distanceMinutes,
          distanceText: `${place.distanceMinutes}m away`,
          noiseLevel: place.noiseLevel,
          vegetarian: place.vegetarian,
        }),
      });
    });
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
