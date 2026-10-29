/**
 * OpenStreetMap Overpass Places Adapter (V5-FUEL / LIVING_CONTEXT_V2.md §10.2)
 *
 * Request & response mapping only for OpenStreetMap Overpass API.
 * Protected strictly behind PLACES_LIVE_ENABLED (default false).
 *
 * Invariant: ZERO network calls are executed unless PLACES_LIVE_ENABLED is true.
 * In this slice and all automated tests, live network calls are NON-GOALS and never run.
 */

import type { LocationCoords } from './location-port.js';
import type { PlaceItem, PlacesProvider, PlacesQuery } from './places-types.js';
import { computeHaversineDistanceMeters, formatStraightLineDistance } from './simulated-places-provider.js';

export function isPlacesLiveEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.PLACES_LIVE_ENABLED === 'true') {
    return true;
  }
  if (
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PLACES_LIVE_ENABLED === 'true'
  ) {
    return true;
  }
  return false;
}

/**
 * Builds Overpass QL query string for nearby POI search.
 */
export function buildOverpassQuery(query: PlacesQuery): string {
  const radius = query.radiusMeters ?? 3000;
  const lat = query.location.lat;
  const lng = query.location.lng;

  let amenityTag = 'fuel';
  if (query.category === 'restaurant') {
    amenityTag = 'restaurant';
  }

  return `[out:json][timeout:10];(node["amenity"="${amenityTag}"](around:${radius},${lat},${lng});way["amenity"="${amenityTag}"](around:${radius},${lat},${lng}););out center;`;
}

export interface OverpassElement {
  readonly id: number;
  readonly type: 'node' | 'way';
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { lat: number; lon: number };
  readonly tags?: {
    readonly name?: string;
    readonly amenity?: string;
    readonly brand?: string;
    readonly 'addr:street'?: string;
    readonly 'addr:housenumber'?: string;
    readonly [key: string]: unknown;
  };
}

/**
 * Parses raw Overpass JSON elements into typed PlaceItems.
 */
export function parseOverpassElements(
  elements: readonly OverpassElement[],
  category: string,
  userLocation: LocationCoords,
  fetchedAtIso: string
): readonly PlaceItem[] {
  const items: PlaceItem[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      continue;
    }

    const name = el.tags?.name || (el.tags?.brand ? `${el.tags.brand} Station` : 'Gas Station');
    const coords: LocationCoords = { lat, lng };
    const distMeters = computeHaversineDistanceMeters(userLocation, coords);

    let address: string | undefined;
    if (el.tags?.['addr:street']) {
      address = el.tags['addr:housenumber']
        ? `${el.tags['addr:housenumber']} ${el.tags['addr:street']}`
        : el.tags['addr:street'];
    }

    items.push({
      placeId: `overpass-${el.type}-${el.id}`,
      coords,
      name,
      category,
      source: 'live',
      fetchedAt: fetchedAtIso,
      address,
      straightLineDistanceMeters: distMeters,
      straightLineDistanceLabel: formatStraightLineDistance(distMeters),
      openingStatus: 'unknown',
      brand: el.tags?.brand,
    });
  }

  items.sort((a, b) => (a.straightLineDistanceMeters ?? 0) - (b.straightLineDistanceMeters ?? 0));
  return Object.freeze(items);
}

export interface OverpassPlacesAdapterOptions {
  readonly endpoint?: string;
  readonly fetchFn?: typeof fetch;
}

export class OverpassPlacesAdapter implements PlacesProvider {
  public readonly id = 'overpass-places';
  public readonly name = 'OpenStreetMap Overpass API';

  private readonly endpoint: string;
  private readonly fetchFn?: typeof fetch;

  constructor(options: OverpassPlacesAdapterOptions = {}) {
    this.endpoint = options.endpoint ?? 'https://overpass-api.de/api/interpreter';
    this.fetchFn = options.fetchFn;
  }

  public async searchNearby(query: PlacesQuery): Promise<readonly PlaceItem[]> {
    if (!isPlacesLiveEnabled() && !this.fetchFn) {
      throw new Error(
        'Places live provider is disabled (PLACES_LIVE_ENABLED=false). Real network calls are forbidden in this mode.'
      );
    }

    const body = buildOverpassQuery(query);
    const effectiveFetch = this.fetchFn ?? fetch;

    const res = await effectiveFetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(body)}`,
    });

    if (!res.ok) {
      throw new Error(`Overpass API responded with HTTP ${res.status}`);
    }

    const data = (await res.json()) as { elements?: readonly OverpassElement[] };
    const elements = data.elements ?? [];
    return parseOverpassElements(elements, query.category, query.location, new Date().toISOString());
  }
}
