/**
 * Fuel Provider Adapter (V5-FUEL / LIVING_CONTEXT_V2.md §10.2)
 *
 * Implements plugin provider adapter backed by PlacesProvider seam.
 */

import type { SimulatedProviderAdapter, SimulatedSignal } from '../../core/contracts/index.js';
import type { LocationCoords } from '../../adapters/providers/location-port.js';
import { defaultLocationPort } from '../../adapters/providers/location-port.js';
import type { PlaceItem, PlacesProvider } from '../../adapters/providers/places-types.js';
import { defaultSimulatedPlacesProvider } from '../../adapters/providers/simulated-places-provider.js';

export class FuelPlacesAdapter implements SimulatedProviderAdapter {
  public readonly id = 'fuel-places-adapter';
  public readonly kind = 'mock_places';
  public readonly source = 'simulated' as const;
  private provider: PlacesProvider;

  constructor(provider: PlacesProvider = defaultSimulatedPlacesProvider) {
    this.provider = provider;
  }

  public signals(): readonly SimulatedSignal<unknown>[] {
    return [];
  }

  public setProvider(provider: PlacesProvider): void {
    this.provider = provider;
  }

  public getProvider(): PlacesProvider {
    return this.provider;
  }

  public async fetchNearbyFuel(coords?: LocationCoords, radiusMeters: number = 5000): Promise<readonly PlaceItem[]> {
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
}

export const mockFuelAdapter = new FuelPlacesAdapter();
