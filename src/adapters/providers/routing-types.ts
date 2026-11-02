/**
 * Routing Provider Types and Invariants
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 */

export type Coordinate = readonly [lat: number, lng: number];

export type RouteMode = 'driving' | 'walking' | 'cycling';

export type NoRouteReason =
  | 'no_destination'
  | 'location_not_shared'
  | 'provider_disabled'
  | 'provider_error'
  | 'stale'
  | 'mode_unsupported';

export const NO_ROUTE_REASON_LABELS: Readonly<Record<NoRouteReason, string>> = Object.freeze({
  no_destination: 'no destination set',
  location_not_shared: 'location not shared',
  provider_disabled: 'provider disabled',
  provider_error: 'provider error',
  stale: 'data is stale',
  mode_unsupported: 'mode unsupported',
});

export const OSRM_ATTRIBUTION = 'Route © OSRM · data © OpenStreetMap contributors';

export const ROUTE_VALID_FOR_MS = 10 * 60 * 1000; // 10 minutes validity window

export interface RouteResult {
  readonly geometry: readonly Coordinate[];
  readonly distanceM: number;
  readonly durationS: number;
  readonly provider: string;
  readonly fetchedAt: string;
  readonly attribution: string;
  readonly mode?: RouteMode;
}

export interface RouteUnavailable {
  readonly status: 'unavailable';
  readonly reason: NoRouteReason;
  readonly message: string;
}

export interface RouteStatus {
  readonly enabled: boolean;
  readonly provider?: string;
  readonly attribution?: string;
  readonly tilesEnabled?: boolean;
}

export interface DestinationInfo {
  readonly coordinate: Coordinate;
  readonly name: string;
  readonly address?: string;
  readonly osmId?: number | string;
  readonly source?: string;
}

export function isRouteStale(
  route: { readonly fetchedAt: string },
  now: number = Date.now(),
  validForMs: number = ROUTE_VALID_FOR_MS
): boolean {
  if (!route?.fetchedAt) return true;
  const fetchedTime = new Date(route.fetchedAt).getTime();
  if (Number.isNaN(fetchedTime)) return true;
  return now - fetchedTime > validForMs;
}
