/**
 * PlacesProvider Seam Types (V5-FUEL / LIVING_CONTEXT_V2.md §10.2)
 *
 * Governs place search results (gas stations, restaurants, etc.) with explicit
 * provenance, coordinates, and straight-line distance labelling.
 */

import type { LocationCoords } from './location-port.js';

export interface PlaceItem {
  readonly id?: string;
  readonly placeId: string;
  readonly osmId?: number | string;
  readonly coords: LocationCoords;
  readonly name: string;
  readonly category: 'gas_station' | 'restaurant' | string;
  readonly source: 'simulated' | 'recorded' | 'live';
  readonly fetchedAt: string;
  readonly address?: string;
  readonly distanceMeters?: number;
  readonly straightLineDistanceMeters?: number;
  readonly straightLineDistanceLabel?: string;
  readonly openingStatus?: 'open' | 'closed' | 'unknown';
  readonly brand?: string;
  readonly cuisine?: string;
  readonly noiseLevel?: 'quiet' | 'moderate' | 'lively' | string;
  readonly vegetarian?: boolean;
  readonly attribution?: string;
}

export interface PlacesQuery {
  readonly location: LocationCoords;
  readonly category: 'gas_station' | 'restaurant' | string;
  readonly radiusMeters?: number;
}

export interface PlacesProvider {
  readonly id: string;
  readonly name: string;
  searchNearby(query: PlacesQuery): Promise<readonly PlaceItem[]>;
  searchNearbySync?(query: PlacesQuery): readonly PlaceItem[];
}
