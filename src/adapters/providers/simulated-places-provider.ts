/**
 * Simulated PlacesProvider (V5-FUEL / AC-212-1, AC-212-2)
 *
 * Provides fixture-backed gas stations and places.
 * Computes exact straight-line distance from the provided query location.
 * Changing query coordinates returns matching nearby candidates.
 *
 * Invariant: Never fabricates merchants, distances, or ETAs.
 * Distances are explicitly labelled as straight-line.
 */

import type { LocationCoords } from './location-port.js';
import type { PlaceItem, PlacesProvider, PlacesQuery } from './places-types.js';

/**
 * Computes great-circle distance between two coordinates in meters using the Haversine formula.
 */
export function computeHaversineDistanceMeters(a: LocationCoords, b: LocationCoords): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLng2 = Math.sin(dLng / 2);

  const h = sinDLat2 * sinDLat2 + Math.cos(lat1) * Math.cos(lat2) * sinDLng2 * sinDLng2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return Math.round(R * c);
}

/**
 * Formats distance with honest "(straight-line)" label per LIVING_CONTEXT_V2.md §10.2.
 */
export function formatStraightLineDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m (straight-line)`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km} km (straight-line)`;
}

export interface SimulatedPlaceTemplate {
  readonly id: string;
  readonly name: string;
  readonly coords: LocationCoords;
  readonly category: 'gas_station' | 'restaurant';
  readonly address?: string;
  readonly brand?: string;
  readonly cuisine?: string;
  readonly noiseLevel?: 'quiet' | 'moderate' | 'lively';
  readonly vegetarian?: boolean;
}

/**
 * Pre-defined fixture places in multiple distinct geographic clusters.
 * Cluster 1: San Francisco (around 37.7749, -122.4194)
 * Cluster 2: Los Angeles (around 34.0522, -118.2437)
 * Cluster 3: Seattle (around 47.6062, -122.3321)
 */
export const FIXTURE_PLACE_TEMPLATES: readonly SimulatedPlaceTemplate[] = Object.freeze([
  // San Francisco Gas Stations
  {
    id: 'fuel-sf-1',
    name: 'Metro Gas & Go',
    coords: { lat: 37.7755, lng: -122.418 },
    category: 'gas_station',
    address: '850 Market St, San Francisco, CA',
    brand: 'Metro Gas',
  },
  {
    id: 'fuel-sf-2',
    name: 'Sunset Fuel Station',
    coords: { lat: 37.773, lng: -122.421 },
    category: 'gas_station',
    address: '420 9th St, San Francisco, CA',
    brand: 'Sunset Petroleum',
  },
  {
    id: 'fuel-sf-3',
    name: 'Bayfront Express Gas',
    coords: { lat: 37.778, lng: -122.415 },
    category: 'gas_station',
    address: '1100 Mission St, San Francisco, CA',
    brand: 'Bayfront',
  },

  // San Francisco Restaurants
  {
    id: 'lunch-sf-1',
    name: 'Pacific Ramen Bar',
    coords: { lat: 37.776, lng: -122.4175 },
    category: 'restaurant',
    address: '780 Market St, San Francisco, CA',
    brand: 'Pacific Ramen',
    cuisine: 'japanese',
    noiseLevel: 'lively',
    vegetarian: false,
  },
  {
    id: 'lunch-sf-2',
    name: 'Garden Fresh Bowls',
    coords: { lat: 37.774, lng: -122.4205 },
    category: 'restaurant',
    address: '350 9th St, San Francisco, CA',
    brand: 'Garden Fresh',
    cuisine: 'salad',
    noiseLevel: 'quiet',
    vegetarian: true,
  },
  {
    id: 'lunch-sf-3',
    name: 'Bay City Sushi',
    coords: { lat: 37.7775, lng: -122.416 },
    category: 'restaurant',
    address: '1050 Mission St, San Francisco, CA',
    brand: 'Bay City',
    cuisine: 'japanese',
    noiseLevel: 'quiet',
    vegetarian: false,
  },
  {
    id: 'lunch-sf-4',
    name: 'Mission Fast Bites',
    coords: { lat: 37.773, lng: -122.422 },
    category: 'restaurant',
    address: '500 Valencia St, San Francisco, CA',
    brand: 'Mission Bites',
    cuisine: 'american',
    noiseLevel: 'lively',
    vegetarian: false,
  },

  // Los Angeles Gas Stations
  {
    id: 'fuel-la-1',
    name: 'Pacific Coast Petrol',
    coords: { lat: 34.053, lng: -118.242 },
    category: 'gas_station',
    address: '200 N Main St, Los Angeles, CA',
    brand: 'Pacific Coast',
  },
  {
    id: 'fuel-la-2',
    name: 'Angel City Fuel',
    coords: { lat: 34.051, lng: -118.245 },
    category: 'gas_station',
    address: '500 S Broadway, Los Angeles, CA',
    brand: 'Angel City',
  },

  // Los Angeles Restaurants
  {
    id: 'lunch-la-1',
    name: 'Angel City Ramen',
    coords: { lat: 34.0535, lng: -118.2415 },
    category: 'restaurant',
    address: '250 N Main St, Los Angeles, CA',
    brand: 'Angel City',
    cuisine: 'japanese',
    noiseLevel: 'lively',
    vegetarian: false,
  },
  {
    id: 'lunch-la-2',
    name: 'Sunset Organic Greens',
    coords: { lat: 34.0515, lng: -118.2445 },
    category: 'restaurant',
    address: '450 S Broadway, Los Angeles, CA',
    brand: 'Sunset Greens',
    cuisine: 'salad',
    noiseLevel: 'quiet',
    vegetarian: true,
  },
  {
    id: 'lunch-la-3',
    name: 'Little Tokyo Handroll',
    coords: { lat: 34.0505, lng: -118.2405 },
    category: 'restaurant',
    address: '330 E 1st St, Los Angeles, CA',
    brand: 'Little Tokyo',
    cuisine: 'japanese',
    noiseLevel: 'quiet',
    vegetarian: false,
  },

  // Seattle Gas Stations
  {
    id: 'fuel-sea-1',
    name: 'Emerald City Gas',
    coords: { lat: 47.607, lng: -122.331 },
    category: 'gas_station',
    address: '1200 4th Ave, Seattle, WA',
    brand: 'Emerald Gas',
  },

  // Seattle Restaurants
  {
    id: 'lunch-sea-1',
    name: 'Emerald Noodle Workshop',
    coords: { lat: 47.608, lng: -122.33 },
    category: 'restaurant',
    address: '1400 4th Ave, Seattle, WA',
    brand: 'Emerald Noodles',
    cuisine: 'japanese',
    noiseLevel: 'moderate',
    vegetarian: false,
  },
]);

export interface SimulatedPlacesOptions {
  readonly fixedFetchedAt?: string;
  readonly simulateError?: boolean;
  readonly templates?: readonly SimulatedPlaceTemplate[];
  readonly maxRadiusMeters?: number;
}

export class SimulatedPlacesProvider implements PlacesProvider {
  public readonly id = 'simulated-places';
  public readonly name = 'Simulated Places Fixture Provider';

  private readonly templates: readonly SimulatedPlaceTemplate[];
  private readonly fixedFetchedAt?: string;
  private simulateError: boolean;
  private readonly maxRadiusMeters: number;

  constructor(options: SimulatedPlacesOptions = {}) {
    this.templates = options.templates ?? FIXTURE_PLACE_TEMPLATES;
    this.fixedFetchedAt = options.fixedFetchedAt;
    this.simulateError = options.simulateError ?? false;
    this.maxRadiusMeters = options.maxRadiusMeters ?? 10000; // 10km radius default
  }

  public setSimulateError(shouldError: boolean): void {
    this.simulateError = shouldError;
  }

  public searchNearbySync(query: PlacesQuery): readonly PlaceItem[] {
    if (this.simulateError) {
      throw new Error('Simulated places provider failure (network/service error)');
    }

    const radius = query.radiusMeters ?? this.maxRadiusMeters;
    const nowIso = this.fixedFetchedAt ?? new Date().toISOString();

    const matches: PlaceItem[] = [];

    for (const t of this.templates) {
      if (t.category !== query.category) {
        continue;
      }

      const distMeters = computeHaversineDistanceMeters(query.location, t.coords);
      if (distMeters <= radius) {
        matches.push({
          id: t.id,
          placeId: t.id,
          coords: t.coords,
          name: t.name,
          category: t.category,
          source: 'simulated',
          fetchedAt: nowIso,
          address: t.address,
          straightLineDistanceMeters: distMeters,
          straightLineDistanceLabel: formatStraightLineDistance(distMeters),
          openingStatus: 'open',
          brand: t.brand,
          cuisine: t.cuisine,
          noiseLevel: t.noiseLevel,
          vegetarian: t.vegetarian,
        });
      }
    }

    // Sort by straight-line distance ascending
    matches.sort((a, b) => (a.straightLineDistanceMeters ?? 0) - (b.straightLineDistanceMeters ?? 0));

    return Object.freeze(matches);
  }

  public async searchNearby(query: PlacesQuery): Promise<readonly PlaceItem[]> {
    return this.searchNearbySync(query);
  }
}

export const defaultSimulatedPlacesProvider = new SimulatedPlacesProvider();
