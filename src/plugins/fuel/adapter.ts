/**
 * Fuel Provider Adapter (V5-FUEL / LIVING_CONTEXT_V2.md §10.2)
 *
 * Implements plugin provider adapter backed by PlacesProvider seam.
 */

import type { SimulatedProviderAdapter, SimulatedSignal, ContextSnapshot } from '../../core/contracts/index.js';
import { createSimulatedSignal } from '../../core/contracts/index.js';
import type { LocationCoords } from '../../adapters/providers/location-port.js';
import { defaultLocationPort } from '../../adapters/providers/location-port.js';
import type { PlaceItem, PlacesProvider } from '../../adapters/providers/places-types.js';
import { defaultSimulatedPlacesProvider } from '../../adapters/providers/simulated-places-provider.js';

export interface PlacesFuelSignalValue {
  readonly status: 'ok' | 'empty' | 'error';
  readonly places: readonly PlaceItem[];
  readonly error?: string;
  readonly originCoords?: LocationCoords;
}

export class FuelPlacesAdapter implements SimulatedProviderAdapter<PlacesFuelSignalValue> {
  public readonly id = 'fuel-places-adapter';
  public readonly kind = 'mock_places';
  public readonly source = 'simulated' as const;
  private provider: PlacesProvider;

  constructor(provider: PlacesProvider = defaultSimulatedPlacesProvider) {
    this.provider = provider;
  }

  public signals(snapshot?: ContextSnapshot): readonly SimulatedSignal<PlacesFuelSignalValue>[] {
    const locSig = snapshot?.signals?.find(s => s.kind === 'location_status' || s.kind === 'location');
    let coords: LocationCoords | undefined;
    if (locSig && typeof locSig.value === 'object' && locSig.value !== null) {
      const val = locSig.value as Record<string, unknown>;
      if (typeof val.lat === 'number' && typeof val.lng === 'number') {
        coords = { lat: val.lat, lng: val.lng };
      }
    }
    if (!coords) {
      const loc = defaultLocationPort.getLocation();
      if (loc.status === 'available' && loc.coords) {
        coords = loc.coords;
      }
    }

    if (!coords) {
      return [];
    }

    const nowIso = snapshot?.asOf || new Date().toISOString();

    try {
      const places = this.provider.searchNearbySync
        ? this.provider.searchNearbySync({ location: coords, category: 'gas_station', radiusMeters: 10000 })
        : [];
      return [
        createSimulatedSignal<PlacesFuelSignalValue>({
          kind: 'places_fuel',
          value: {
            status: places.length > 0 ? 'ok' : 'empty',
            places,
            originCoords: coords,
          },
          issuedAt: nowIso,
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ];
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Places provider failure';
      return [
        createSimulatedSignal<PlacesFuelSignalValue>({
          kind: 'places_fuel',
          value: {
            status: 'error',
            error: errorMsg,
            places: [],
            originCoords: coords,
          },
          issuedAt: nowIso,
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        }),
      ];
    }
  }

  public setProvider(provider: PlacesProvider): void {
    this.provider = provider;
  }

  public getProvider(): PlacesProvider {
    return this.provider;
  }

  public async fetchNearbyFuel(coords?: LocationCoords, radiusMeters: number = 10000): Promise<readonly PlaceItem[]> {
    const loc = coords ?? defaultLocationPort.getLocation().coords;
    if (!loc) {
      return [];
    }

    return this.provider.searchNearby({
      location: loc,
      category: 'gas_station',
      radiusMeters,
    });
  }

  public fetchNearbyFuelSync(coords?: LocationCoords, radiusMeters: number = 10000): readonly PlaceItem[] {
    const loc = coords ?? defaultLocationPort.getLocation().coords;
    if (!loc) {
      return [];
    }

    if (this.provider.searchNearbySync) {
      return this.provider.searchNearbySync({
        location: loc,
        category: 'gas_station',
        radiusMeters,
      });
    }
    return [];
  }
}

export const mockFuelAdapter = new FuelPlacesAdapter();
