/**
 * LocationPort Seam (V5-FUEL / LIVING_CONTEXT_V2.md §10.2)
 *
 * Provides a clean seam for current user location without ANY dependency
 * on browser geolocation (which is strictly forbidden repo-wide).
 *
 * Location is fed exclusively from:
 * 1. Scenario fixtures (e.g. simulated demo coordinates)
 * 2. Manual setting / testing overrides
 *
 * If location is unavailable or denied, returns explicit status without fabricating coordinates.
 */

export type LocationStatusKind = 'available' | 'unavailable' | 'denied';

export interface LocationCoords {
  readonly lat: number;
  readonly lng: number;
}

export interface LocationStatus {
  readonly status: LocationStatusKind;
  readonly coords?: LocationCoords;
  readonly source: 'fixture' | 'manual';
  readonly updatedAt: string;
}

export interface LocationPort {
  getLocation(): LocationStatus;
  setLocation(status: LocationStatusKind, coords?: LocationCoords): void;
}

/**
 * Default demo city coordinates (San Francisco Civic Center / Market St).
 * Consistent with demo scenarios across Yori.
 */
export const DEFAULT_DEMO_COORDS: LocationCoords = Object.freeze({
  lat: 37.7749,
  lng: -122.4194,
});

/**
 * In-memory location port backed by scenario fixture or manual configuration.
 * Never accesses browser geolocation.
 */
export class FixtureLocationPort implements LocationPort {
  private currentStatus: LocationStatus;

  constructor(initialStatus: LocationStatusKind = 'available', initialCoords: LocationCoords = DEFAULT_DEMO_COORDS) {
    this.currentStatus = {
      status: initialStatus,
      coords: initialStatus === 'available' ? initialCoords : undefined,
      source: 'fixture',
      updatedAt: new Date().toISOString(),
    };
  }

  public getLocation(): LocationStatus {
    return this.currentStatus;
  }

  public setLocation(status: LocationStatusKind, coords?: LocationCoords): void {
    this.currentStatus = {
      status,
      coords: status === 'available' ? (coords ?? DEFAULT_DEMO_COORDS) : undefined,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Singleton shared location port for the application runtime.
 */
export const defaultLocationPort = new FixtureLocationPort();
