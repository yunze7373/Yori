/**
 * OpenRouteService (ORS) Routing Adapter Stub
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 *
 * Compiles cleanly but remains unused until the owner registers an ORS key (G-ROUTE).
 * Key name is ORS_API_KEY (server-side only, never VITE_-prefixed).
 * Never exposed to the client bundle.
 */

import type { RoutingProvider } from './routing-provider.js';
import type { Coordinate, RouteMode, RouteResult } from './routing-types.js';

export interface ORSRouteAdapterConfig {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export class ORSRouteAdapter implements RoutingProvider {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(config?: ORSRouteAdapterConfig) {
    // Strictly server-side environment key. Never use VITE_-prefixed variable.
    this.apiKey =
      config?.apiKey ??
      (typeof process !== 'undefined' && process.env ? process.env['ORS_API_KEY'] : undefined);
    this.baseUrl = config?.baseUrl ?? 'https://api.openrouteservice.org';
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async route(
    _origin: Coordinate,
    _destination: Coordinate,
    _mode?: RouteMode
  ): Promise<RouteResult> {
    if (!this.apiKey) {
      throw new Error('OpenRouteService API key not configured (ORS_API_KEY)');
    }
    // Stub implementation reserved for owner gate G-ROUTE approval.
    throw new Error('OpenRouteService live routing is pending owner key registration and gate G-ROUTE approval');
  }
}
