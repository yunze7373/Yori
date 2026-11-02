/**
 * OSRM Routing Adapter
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 *
 * Implements RoutingProvider using OSRM demo-server URL shape.
 * Runs strictly server-side behind the /api/route proxy endpoint.
 */

import type { RoutingProvider } from './routing-provider.js';
import {
  type Coordinate,
  type RouteMode,
  type RouteResult,
  OSRM_ATTRIBUTION,
} from './routing-types.js';
import { decodePolyline } from './polyline.js';

export interface OSRMRouteAdapterConfig {
  readonly baseUrl?: string;
  readonly footBaseUrl?: string | null;
  readonly fetchFn?: typeof fetch;
}

export class OSRMRouteAdapter implements RoutingProvider {
  private readonly baseUrl: string;
  private readonly footBaseUrl: string | null;
  private readonly fetchFn: typeof fetch;

  constructor(config?: OSRMRouteAdapterConfig) {
    this.baseUrl = config?.baseUrl ?? (typeof process !== 'undefined' ? process.env?.['OSRM_BASE_URL'] : undefined) ?? 'https://router.project-osrm.org';
    if (config?.footBaseUrl === null || config?.footBaseUrl === '') {
      this.footBaseUrl = null;
    } else {
      this.footBaseUrl =
        config?.footBaseUrl ??
        (typeof process !== 'undefined' ? process.env?.['OSRM_FOOT_BASE_URL'] : undefined) ??
        'https://routing.openstreetmap.de/routed-foot';
    }
    this.fetchFn = config?.fetchFn ?? globalThis.fetch;
  }

  /**
   * D2: the exact outbound hosts (host + path, no scheme) for the consent copy, read from the
   * configured base URLs so the disclosure always matches what is actually called.
   */
  public outboundHosts(): readonly { readonly purpose: string; readonly host: string }[] {
    const hosts = [{ purpose: 'driving routes', host: describeOutboundHost(this.baseUrl) }];
    if (this.footBaseUrl) {
      hosts.push({ purpose: 'walking routes', host: describeOutboundHost(this.footBaseUrl) });
    }
    return hosts;
  }

  async route(
    origin: Coordinate,
    destination: Coordinate,
    mode: RouteMode = 'driving'
  ): Promise<RouteResult> {
    const [originLat, originLng] = origin;
    const [destLat, destLng] = destination;

    let targetBaseUrl: string;
    let profileSegment: string;

    if (mode === 'walking') {
      if (!this.footBaseUrl) {
        const err = new Error('OSRM routing error: mode_unsupported (no foot-capable routing endpoint configured)');
        (err as any).code = 'mode_unsupported';
        throw err;
      }
      targetBaseUrl = this.footBaseUrl.replace(/\/+$/, '');
      profileSegment = 'foot';
    } else if (mode === 'cycling') {
      targetBaseUrl = this.baseUrl.replace(/\/+$/, '');
      profileSegment = 'bicycle';
    } else {
      targetBaseUrl = this.baseUrl.replace(/\/+$/, '');
      profileSegment = 'driving';
    }

    // OSRM coordinates are specified as lon,lat;lon,lat
    const coordsParam = `${originLng},${originLat};${destLng},${destLat}`;
    const url = `${targetBaseUrl}/route/v1/${encodeURIComponent(profileSegment)}/${coordsParam}?overview=full&geometries=geojson`;

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`OSRM provider HTTP ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();
    return this.parseResponse(data, mode);
  }

  parseResponse(data: any, mode: RouteMode = 'driving'): RouteResult {
    if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      const message = data?.message || data?.code || 'No route found in provider response';
      throw new Error(`OSRM routing error: ${message}`);
    }

    const firstRoute = data.routes[0];
    const geometryRaw = firstRoute.geometry;

    let geometry: Coordinate[] = [];
    if (typeof geometryRaw === 'string') {
      // Encoded polyline: try polyline5, or polyline6 if precision 6
      geometry = decodePolyline(geometryRaw, 5);
    } else if (
      typeof geometryRaw === 'object' &&
      geometryRaw !== null &&
      Array.isArray(geometryRaw.coordinates)
    ) {
      // GeoJSON LineString coordinates: [lon, lat] -> [lat, lon]
      geometry = geometryRaw.coordinates.map((pt: [number, number]) => [pt[1], pt[0]] as Coordinate);
    } else {
      throw new Error('OSRM routing error: unrecognized geometry format');
    }

    const distanceM = Math.round(Number(firstRoute.distance) || 0);
    const durationS = Math.round(Number(firstRoute.duration) || 0);

    return {
      geometry,
      distanceM,
      durationS,
      provider: 'osrm',
      fetchedAt: new Date().toISOString(),
      attribution: OSRM_ATTRIBUTION,
      mode,
    };
  }
}

/** "https://routing.openstreetmap.de/routed-foot/" -> "routing.openstreetmap.de/routed-foot". */
export function describeOutboundHost(url: string): string {
  try {
    const parsed = new URL(url);
    const pathPart = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.host}${pathPart}`;
  } catch {
    return url;
  }
}
