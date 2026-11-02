/**
 * Weather Provider Dev-Server Proxy Middleware
 * Governed by G-204, Acceptance Criteria AC-204-1, AC-204-2, and Invariants INV-101, INV-102, INV-103.
 *
 * Security & Invariant Guarantees:
 * 1. Loopback-only binding: only local requests (127.0.0.1, localhost) are accepted.
 * 2. Origin/Referer guard: rejects cross-site requests.
 * 3. Feature-flagged: WEATHER_LIVE_ENABLED (boolean, default: false).
 * 4. Privacy: uses strictly configured fixed demo-city coordinates.
 *    Never requests device geolocation or forwards user identifiers.
 * 5. Returns attribution metadata for Open-Meteo (CC BY 4.0).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DEFAULT_DEMO_CITY,
  OPEN_METEO_ATTRIBUTION,
  type DemoCityCoordinate,
} from './weather-types.js';
import { OpenMeteoWeatherAdapter } from './open-meteo-adapter.js';
import { isAllowlistedLoopbackHost } from '../xmemo/loopback-allowlist.js';
import {
  OSRM_ATTRIBUTION,
  type Coordinate,
  type RouteMode,
} from './routing-types.js';
import type { RoutingProvider } from './routing-provider.js';
import { OSRMRouteAdapter } from './osrm-route-adapter.js';
import type { PlacesProvider } from './places-types.js';
import {
  OverpassPlacesAdapter,
  OVERPASS_ATTRIBUTION,
  OVERPASS_MAX_RADIUS_METERS,
  OVERPASS_MIN_OUTBOUND_INTERVAL_MS,
  roundCoordinate3Decimals,
  isAllowedAmenity,
  ALLOWED_AMENITIES,
} from './overpass-places-adapter.js';
import {
  IcsCalendarAdapter,
} from './ics-calendar-adapter.js';
import {
  NominatimGeocoder,
  NOMINATIM_ATTRIBUTION,
} from './nominatim-geocoder.js';

export type ProxyFailureMode = 'denied' | 'stale' | 'timeout' | 'error' | 'none';
export type ProxyEndpoint = 'weather' | 'route' | 'places' | 'calendar' | 'geocode';

export interface ProxyTestSeamConfig {
  readonly forceMode?: ProxyFailureMode;
  readonly forceStatusCode?: number;
  readonly forceDelayMs?: number;
  readonly staleAgeMs?: number;
  readonly errorMessage?: string;
  readonly payload?: unknown;
}

const activeProxyTestSeams: Record<ProxyEndpoint, ProxyTestSeamConfig | null> = {
  weather: null,
  route: null,
  places: null,
  calendar: null,
  geocode: null,
};

export function setProxyTestSeam(
  endpoint: ProxyEndpoint,
  config: ProxyTestSeamConfig | null
): void {
  activeProxyTestSeams[endpoint] = config;
}

export function resetProxyTestSeams(): void {
  activeProxyTestSeams.weather = null;
  activeProxyTestSeams.route = null;
  activeProxyTestSeams.places = null;
  activeProxyTestSeams.calendar = null;
  activeProxyTestSeams.geocode = null;
}

export function getProxyTestSeam(
  endpoint: ProxyEndpoint
): ProxyTestSeamConfig | null {
  return activeProxyTestSeams[endpoint] ?? null;
}

export interface WeatherProxyConfig {
  readonly enabled: boolean;
  readonly demoCity: DemoCityCoordinate;
}

export function resolveWeatherConfig(
  env: NodeJS.ProcessEnv = process.env
): WeatherProxyConfig {
  const enabledVal = env['WEATHER_LIVE_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';

  const latStr = env['DEMO_CITY_LAT'];
  const lonStr = env['DEMO_CITY_LON'];
  const name = env['DEMO_CITY_NAME'] ?? DEFAULT_DEMO_CITY.name;
  const timezone = env['DEMO_CITY_TIMEZONE'] ?? DEFAULT_DEMO_CITY.timezone;

  const latitude = latStr ? parseFloat(latStr) : DEFAULT_DEMO_CITY.latitude;
  const longitude = lonStr ? parseFloat(lonStr) : DEFAULT_DEMO_CITY.longitude;

  return {
    enabled,
    demoCity: {
      latitude: Number.isFinite(latitude) ? latitude : DEFAULT_DEMO_CITY.latitude,
      longitude: Number.isFinite(longitude) ? longitude : DEFAULT_DEMO_CITY.longitude,
      name,
      timezone,
    },
  };
}

export function isLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const cleanHost = (hostHeader.split(':')[0] || '').toLowerCase();
  return cleanHost === '127.0.0.1' || cleanHost === 'localhost';
}

export function isLocalOriginOrReferer(headerVal: string | undefined): boolean {
  if (!headerVal) return false;
  try {
    const parsed = new URL(headerVal);
    const hostname = parsed.hostname.toLowerCase();
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

export function createWeatherProxyMiddleware(
  configOverride?: Partial<WeatherProxyConfig>,
  adapterOverride?: OpenMeteoWeatherAdapter
) {
  const baseConfig = resolveWeatherConfig();
  const config: WeatherProxyConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    demoCity: configOverride?.demoCity ?? baseConfig.demoCity,
  };

  const weatherAdapter =
    adapterOverride ??
    new OpenMeteoWeatherAdapter({
      enabled: config.enabled,
      coordinate: config.demoCity,
    });

  return async function weatherProxyMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const urlStr = req.url || '';
    const rawPathname = urlStr.split('?')[0] || '';

    if (!rawPathname.startsWith('/api/weather')) {
      return next();
    }

    // --- TEST SEAM INJECTION (provokes denied / stale / timeout / error) ---
    const weatherSeam = getProxyTestSeam('weather');
    if (weatherSeam && weatherSeam.forceMode && weatherSeam.forceMode !== 'none') {
      if (weatherSeam.forceMode === 'denied') {
        const code = weatherSeam.forceStatusCode || 403;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error:
              weatherSeam.errorMessage ||
              'Access denied: provider disabled or unconsented (provoked by test seam)',
            code: 'permission_denied',
            provider: 'open-meteo',
          })
        );
        return;
      }
      if (weatherSeam.forceMode === 'timeout') {
        if (weatherSeam.forceDelayMs && weatherSeam.forceDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, weatherSeam.forceDelayMs));
        }
        const code = weatherSeam.forceStatusCode || 504;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: weatherSeam.errorMessage || 'Gateway timeout (provoked by test seam)',
            code: 'timeout',
            provider: 'open-meteo',
          })
        );
        return;
      }
      if (weatherSeam.forceMode === 'error') {
        const code = weatherSeam.forceStatusCode || 500;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: weatherSeam.errorMessage || 'Internal provider error (provoked by test seam)',
            code: 'provider_error',
            provider: 'open-meteo',
          })
        );
        return;
      }
      if (weatherSeam.forceMode === 'stale') {
        const staleOffset = weatherSeam.staleAgeMs || 7200000;
        const staleAsOf = new Date(Date.now() - staleOffset).toISOString();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        const payload =
          weatherSeam.payload ||
          (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
            ? {
                enabled: true,
                stale: true,
                signals: [
                  {
                    kind: 'weather',
                    value: { condition: 'Clear', temperature: 20 },
                    provider: 'open-meteo',
                    asOf: staleAsOf,
                    issuedAt: staleAsOf,
                    validFor: 3600000,
                    confidence: 0.9,
                    provenance: 'live',
                    consentScope: 'device_only',
                    status: 'available',
                    source: 'real',
                    label: 'real',
                  },
                ],
                attribution: OPEN_METEO_ATTRIBUTION,
              }
            : { enabled: true, stale: true, signals: [] });
        res.end(JSON.stringify(payload));
        return;
      }
    }

    const hostHeader = req.headers['host'];
    let baseUrl = 'http://127.0.0.1:5173';
    if (hostHeader) {
      if (!isAllowlistedLoopbackHost(hostHeader) && process.env.DEV_DEVICE_TESTING !== 'true') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access forbidden: allowlisted loopback host required' }));
        return;
      }
      if (isAllowlistedLoopbackHost(hostHeader)) {
        baseUrl = `http://${hostHeader.trim()}`;
      }
    }
    const parsedUrl = new URL(urlStr, baseUrl);
    const pathname = parsedUrl.pathname;

    // Security Guard: Sec-Fetch-Site / Cross-site check
    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite === 'cross-site') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cross-site requests forbidden' }));
      return;
    }

    // Security Guard: Referer check
    const referer = req.headers['referer'];
    if (referer && !isLocalOriginOrReferer(referer) && process.env.DEV_DEVICE_TESTING !== 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Untrusted referer' }));
      return;
    }

    // Route 1: GET /api/weather/status
    if (pathname === '/api/weather/status' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          enabled: config.enabled,
          provider: 'open-meteo',
          demoCity: config.demoCity,
          attribution: OPEN_METEO_ATTRIBUTION,
        })
      );
      return;
    }

    // Route 2: GET /api/weather/current
    if (pathname === '/api/weather/current' && req.method === 'GET') {
      if (!config.enabled) {
        res.writeHead(403, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: false,
            error: 'Live weather is disabled (set WEATHER_LIVE_ENABLED=true)',
          })
        );
        return;
      }

      try {
        const signals = await weatherAdapter.signals();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: true,
            signals,
            attribution: OPEN_METEO_ATTRIBUTION,
          })
        );
      } catch (err: any) {
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: err?.message || 'Failed to fetch weather' }));
      }
      return;
    }

    // Method Not Allowed / Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  };
}

export interface RouteProxyConfig {
  readonly enabled: boolean;
  readonly tilesEnabled: boolean;
  readonly provider: string;
  readonly footBaseUrl?: string | null;
}

export function resolveRouteConfig(
  env: NodeJS.ProcessEnv = process.env
): RouteProxyConfig {
  const enabledVal = env['ROUTE_LIVE_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';

  const tilesVal = env['TILES_ENABLED'];
  const tilesEnabled = tilesVal === 'true' || tilesVal === '1';

  const provider = env['ROUTE_PROVIDER'] || 'osrm';
  const footBaseUrl = env['OSRM_FOOT_BASE_URL'] !== undefined
    ? (env['OSRM_FOOT_BASE_URL'] === '' ? null : env['OSRM_FOOT_BASE_URL'])
    : 'https://routing.openstreetmap.de/routed-foot';

  return {
    enabled,
    tilesEnabled,
    provider,
    footBaseUrl,
  };
}

export function createRouteProxyMiddleware(
  configOverride?: Partial<RouteProxyConfig>,
  adapterOverride?: RoutingProvider
) {
  const baseConfig = resolveRouteConfig();
  const config: RouteProxyConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    tilesEnabled: configOverride?.tilesEnabled ?? baseConfig.tilesEnabled,
    provider: configOverride?.provider ?? baseConfig.provider,
    footBaseUrl: configOverride?.footBaseUrl !== undefined ? configOverride.footBaseUrl : baseConfig.footBaseUrl,
  };

  const routeAdapter = adapterOverride ?? new OSRMRouteAdapter({ footBaseUrl: config.footBaseUrl });

  return async function routeProxyMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const urlStr = req.url || '';
    const rawPathname = urlStr.split('?')[0] || '';

    // Path-first guard: only intercept /api/route paths
    if (!rawPathname.startsWith('/api/route')) {
      return next();
    }

    // --- TEST SEAM INJECTION (provokes denied / stale / timeout / error) ---
    const routeSeam = getProxyTestSeam('route');
    if (routeSeam && routeSeam.forceMode && routeSeam.forceMode !== 'none') {
      if (routeSeam.forceMode === 'denied') {
        const code = routeSeam.forceStatusCode || 403;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error:
              routeSeam.errorMessage ||
              'Access denied: routing disabled (provoked by test seam)',
            code: 'permission_denied',
            provider: config.provider,
          })
        );
        return;
      }
      if (routeSeam.forceMode === 'timeout') {
        if (routeSeam.forceDelayMs && routeSeam.forceDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, routeSeam.forceDelayMs));
        }
        const code = routeSeam.forceStatusCode || 504;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: routeSeam.errorMessage || 'Routing gateway timeout (provoked by test seam)',
            code: 'timeout',
            provider: config.provider,
          })
        );
        return;
      }
      if (routeSeam.forceMode === 'error') {
        const code = routeSeam.forceStatusCode || 500;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: routeSeam.errorMessage || 'Routing provider error (provoked by test seam)',
            code: 'provider_error',
            provider: config.provider,
          })
        );
        return;
      }
      if (routeSeam.forceMode === 'stale') {
        const staleOffset = routeSeam.staleAgeMs || 7200000;
        const staleAsOf = new Date(Date.now() - staleOffset).toISOString();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        const payload =
          routeSeam.payload ||
          (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
            ? {
                enabled: true,
                stale: true,
                route: {
                  durationSeconds: 1200,
                  distanceMeters: 5000,
                  geometry: [],
                  asOf: staleAsOf,
                  validFor: 300000,
                },
                attribution: OSRM_ATTRIBUTION,
              }
            : { enabled: true, stale: true, route: null });
        res.end(JSON.stringify(payload));
        return;
      }
    }

    const hostHeader = req.headers['host'];
    let baseUrl = 'http://127.0.0.1:5173';
    if (hostHeader) {
      if (!isAllowlistedLoopbackHost(hostHeader) && process.env.DEV_DEVICE_TESTING !== 'true') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access forbidden: allowlisted loopback host required' }));
        return;
      }
      if (isAllowlistedLoopbackHost(hostHeader)) {
        baseUrl = `http://${hostHeader.trim()}`;
      }
    }

    // Security Guard: Sec-Fetch-Site / Cross-site check
    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite === 'cross-site') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cross-site requests forbidden' }));
      return;
    }

    // Security Guard: Referer check
    const referer = req.headers['referer'];
    if (referer && !isLocalOriginOrReferer(referer) && process.env.DEV_DEVICE_TESTING !== 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Untrusted referer' }));
      return;
    }

    const parsedUrl = new URL(urlStr, baseUrl);
    const pathname = parsedUrl.pathname;

    // Route 1: GET /api/route/status
    if (pathname === '/api/route/status' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          enabled: config.enabled,
          provider: config.provider,
          attribution: OSRM_ATTRIBUTION,
          tilesEnabled: config.tilesEnabled,
        })
      );
      return;
    }

    // Route 2: GET /api/route
    if ((pathname === '/api/route' || pathname === '/api/route/') && req.method === 'GET') {
      if (!config.enabled) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: false,
            error: 'Live routing is disabled (set ROUTE_LIVE_ENABLED=true)',
          })
        );
        return;
      }

      const originParam = parsedUrl.searchParams.get('origin');
      const destParam = parsedUrl.searchParams.get('destination');
      const modeParam = (parsedUrl.searchParams.get('mode') || 'driving') as RouteMode;

      if (!originParam || !destParam) {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Missing required query parameters: origin and destination ([lat,lng])',
          })
        );
        return;
      }

      const parseCoords = (val: string): Coordinate | null => {
        const parts = val.split(',').map(s => parseFloat(s.trim()));
        if (parts.length !== 2 || parts.some(n => Number.isNaN(n) || !Number.isFinite(n))) {
          return null;
        }
        return [parts[0]!, parts[1]!] as Coordinate;
      };

      const origin = parseCoords(originParam);
      const destination = parseCoords(destParam);

      if (!origin || !destination) {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Invalid coordinate format. Expected "lat,lng"',
          })
        );
        return;
      }

      try {
        const routeResult = await routeAdapter.route(origin, destination, modeParam);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: true,
            route: routeResult,
            attribution: OSRM_ATTRIBUTION,
          })
        );
      } catch (err: any) {
        if (err?.code === 'mode_unsupported' || err?.message?.includes('mode_unsupported')) {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          res.end(
            JSON.stringify({
              enabled: true,
              route: null,
              code: 'mode_unsupported',
              error: 'Walking route unavailable (mode_unsupported)',
              attribution: OSRM_ATTRIBUTION,
            })
          );
          return;
        }
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: err?.message || 'Routing provider error',
          })
        );
      }
      return;
    }

    // Method Not Allowed / Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  };
}

export interface PlacesProxyConfig {
  readonly enabled: boolean;
  readonly provider: 'overpass';
  readonly attribution: string;
}

export function resolvePlacesConfig(
  env: NodeJS.ProcessEnv = process.env
): PlacesProxyConfig {
  const enabledVal = env['PLACES_LIVE_ENABLED'] || env['VITE_PLACES_LIVE_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';
  return {
    enabled,
    provider: 'overpass',
    attribution: OVERPASS_ATTRIBUTION,
  };
}

let lastOutboundPlacesQueryMs = 0;

export function resetPlacesRateLimit(): void {
  lastOutboundPlacesQueryMs = 0;
}

export function createPlacesProxyMiddleware(
  configOverride?: Partial<PlacesProxyConfig>,
  adapterOverride?: PlacesProvider
) {
  const baseConfig = resolvePlacesConfig();
  const config: PlacesProxyConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    provider: configOverride?.provider ?? baseConfig.provider,
    attribution: configOverride?.attribution ?? baseConfig.attribution,
  };

  const placesAdapter = adapterOverride ?? new OverpassPlacesAdapter();

  return async function placesProxyMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const urlStr = req.url || '';
    const rawPathname = urlStr.split('?')[0] || '';

    // Path-first guard: only intercept /api/places paths
    if (!rawPathname.startsWith('/api/places')) {
      return next();
    }

    // --- TEST SEAM INJECTION (provokes denied / stale / timeout / error) ---
    const placesSeam = getProxyTestSeam('places');
    if (placesSeam && placesSeam.forceMode && placesSeam.forceMode !== 'none') {
      if (placesSeam.forceMode === 'denied') {
        const code = placesSeam.forceStatusCode || 403;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error:
              placesSeam.errorMessage ||
              'Access denied: places disabled (provoked by test seam)',
            code: 'permission_denied',
            provider: config.provider,
          })
        );
        return;
      }
      if (placesSeam.forceMode === 'timeout') {
        if (placesSeam.forceDelayMs && placesSeam.forceDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, placesSeam.forceDelayMs));
        }
        const code = placesSeam.forceStatusCode || 504;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: placesSeam.errorMessage || 'Places gateway timeout (provoked by test seam)',
            code: 'timeout',
            provider: config.provider,
          })
        );
        return;
      }
      if (placesSeam.forceMode === 'error') {
        const code = placesSeam.forceStatusCode || 500;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: placesSeam.errorMessage || 'Places provider error (provoked by test seam)',
            code: 'provider_error',
            provider: config.provider,
          })
        );
        return;
      }
      if (placesSeam.forceMode === 'stale') {
        const staleOffset = placesSeam.staleAgeMs || 7200000;
        const staleAsOf = new Date(Date.now() - staleOffset).toISOString();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        const payload =
          placesSeam.payload ||
          (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
            ? {
                enabled: true,
                stale: true,
                places: [
                  {
                    osmId: 999999,
                    name: 'Test Place',
                    lat: 37.77,
                    lng: -122.41,
                    distanceMeters: 250,
                    fetchedAt: staleAsOf,
                    validFor: 300000,
                    source: 'OpenStreetMap via Overpass (ODbL)',
                  },
                ],
                attribution: config.attribution,
              }
            : { enabled: true, stale: true, places: [] });
        res.end(JSON.stringify(payload));
        return;
      }
    }

    const hostHeader = req.headers['host'];
    let baseUrl = 'http://127.0.0.1:5173';
    if (hostHeader) {
      if (!isAllowlistedLoopbackHost(hostHeader) && process.env.DEV_DEVICE_TESTING !== 'true') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access forbidden: allowlisted loopback host required' }));
        return;
      }
      if (isAllowlistedLoopbackHost(hostHeader)) {
        baseUrl = `http://${hostHeader.trim()}`;
      }
    }

    // Security Guard: Sec-Fetch-Site / Cross-site check
    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite === 'cross-site') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cross-site requests forbidden' }));
      return;
    }

    // Security Guard: Referer check
    const referer = req.headers['referer'];
    if (referer && !isLocalOriginOrReferer(referer) && process.env.DEV_DEVICE_TESTING !== 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Untrusted referer' }));
      return;
    }

    const parsedUrl = new URL(urlStr, baseUrl);
    const pathname = parsedUrl.pathname;

    // Route 1: GET /api/places/status
    if (pathname === '/api/places/status' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          enabled: config.enabled,
          provider: config.provider,
          attribution: config.attribution,
        })
      );
      return;
    }

    // Route 2: GET /api/places
    if ((pathname === '/api/places' || pathname === '/api/places/') && req.method === 'GET') {
      if (!config.enabled) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: false,
            error: 'Live places is disabled (set PLACES_LIVE_ENABLED=true)',
            places: [],
          })
        );
        return;
      }

      const latParam = parsedUrl.searchParams.get('lat');
      const lngParam = parsedUrl.searchParams.get('lng');
      const amenityParam = parsedUrl.searchParams.get('amenity') || 'restaurant';
      const radiusParam = parsedUrl.searchParams.get('radius');

      if (!latParam || !lngParam) {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Missing required query parameters: lat and lng',
          })
        );
        return;
      }

      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      if (Number.isNaN(lat) || Number.isNaN(lng) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Invalid coordinate format for lat/lng',
          })
        );
        return;
      }

      // Amenity enum validation
      if (!isAllowedAmenity(amenityParam)) {
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: `Invalid amenity filter '${amenityParam}'. Allowed: ${ALLOWED_AMENITIES.join(', ')}`,
          })
        );
        return;
      }

      // Rate limit check: >=10s between outbound queries per server
      const now = Date.now();
      if (now - lastOutboundPlacesQueryMs < OVERPASS_MIN_OUTBOUND_INTERVAL_MS) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Rate limit exceeded: minimum 10 seconds between outbound queries',
          })
        );
        return;
      }

      // Radius cap (<= 1500m)
      const parsedRadius = radiusParam ? parseInt(radiusParam, 10) : undefined;
      const radiusMeters = Math.min(Math.max(parsedRadius ?? OVERPASS_MAX_RADIUS_METERS, 100), OVERPASS_MAX_RADIUS_METERS);

      // Coordinate rounding to 3 decimals (~100m) for privacy
      const roundedLat = roundCoordinate3Decimals(lat);
      const roundedLng = roundCoordinate3Decimals(lng);

      lastOutboundPlacesQueryMs = Date.now();

      try {
        const places = await placesAdapter.searchNearby({
          location: { lat: roundedLat, lng: roundedLng },
          category: amenityParam,
          radiusMeters,
        });

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: true,
            places,
            attribution: config.attribution,
          })
        );
      } catch (err: any) {
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: err?.message || 'Places provider error',
          })
        );
      }
      return;
    }

    // Method Not Allowed / Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  };
}

export interface CalendarProxyConfig {
  readonly enabled: boolean;
  readonly configured: boolean;
  readonly provider: 'ics';
  readonly attribution: string;
  readonly icsUrl?: string | null;
}

export function resolveCalendarConfig(
  env: NodeJS.ProcessEnv = process.env
): CalendarProxyConfig {
  const enabledVal = env['CALENDAR_LIVE_ENABLED'] || env['VITE_CALENDAR_LIVE_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';
  const icsUrl = env['CALENDAR_ICS_URL']?.trim() || null;
  const configured = Boolean(icsUrl && icsUrl.length > 0);

  return {
    enabled,
    configured,
    provider: 'ics',
    attribution: 'iCalendar (RFC 5545)',
    icsUrl,
  };
}

export function createCalendarProxyMiddleware(
  configOverride?: Partial<CalendarProxyConfig>,
  adapterOverride?: IcsCalendarAdapter
) {
  const baseConfig = resolveCalendarConfig();
  const config: CalendarProxyConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    configured: configOverride?.configured ?? baseConfig.configured,
    provider: 'ics',
    attribution: configOverride?.attribution ?? baseConfig.attribution,
    icsUrl: configOverride?.icsUrl !== undefined ? configOverride.icsUrl : baseConfig.icsUrl,
  };

  const calendarAdapter = adapterOverride ?? new IcsCalendarAdapter();

  return async function calendarProxyMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const urlStr = req.url || '';
    const rawPathname = urlStr.split('?')[0] || '';

    if (!rawPathname.startsWith('/api/calendar')) {
      return next();
    }

    // --- TEST SEAM INJECTION (provokes denied / stale / timeout / error) ---
    const calSeam = getProxyTestSeam('calendar');
    if (calSeam && calSeam.forceMode && calSeam.forceMode !== 'none') {
      if (calSeam.forceMode === 'denied') {
        const code = calSeam.forceStatusCode || 403;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: calSeam.errorMessage || 'Access denied: calendar disabled (provoked by test seam)',
            code: 'permission_denied',
            provider: config.provider,
          })
        );
        return;
      }
      if (calSeam.forceMode === 'timeout') {
        if (calSeam.forceDelayMs && calSeam.forceDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, calSeam.forceDelayMs));
        }
        const code = calSeam.forceStatusCode || 504;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: calSeam.errorMessage || 'Calendar gateway timeout (provoked by test seam)',
            code: 'timeout',
            provider: config.provider,
          })
        );
        return;
      }
      if (calSeam.forceMode === 'error') {
        const code = calSeam.forceStatusCode || 500;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            error: calSeam.errorMessage || 'Calendar provider error (provoked by test seam)',
            code: 'provider_error',
            provider: config.provider,
          })
        );
        return;
      }
      if (calSeam.forceMode === 'stale') {
        const staleOffset = calSeam.staleAgeMs || 7200000;
        const staleAsOf = new Date(Date.now() - staleOffset).toISOString();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        const payload =
          calSeam.payload || {
            enabled: true,
            configured: true,
            stale: true,
            asOf: staleAsOf,
            events: [],
            attribution: config.attribution,
          };
        res.end(JSON.stringify(payload));
        return;
      }
    }

    const hostHeader = req.headers['host'];
    let baseUrl = 'http://127.0.0.1:5173';
    if (hostHeader) {
      if (!isAllowlistedLoopbackHost(hostHeader) && process.env.DEV_DEVICE_TESTING !== 'true') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access forbidden: allowlisted loopback host required' }));
        return;
      }
      if (isAllowlistedLoopbackHost(hostHeader)) {
        baseUrl = `http://${hostHeader.trim()}`;
      }
    }

    // Security Guard: Sec-Fetch-Site / Cross-site check
    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite === 'cross-site') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cross-site requests forbidden' }));
      return;
    }

    // Security Guard: Referer check
    const referer = req.headers['referer'];
    if (referer && !isLocalOriginOrReferer(referer) && process.env.DEV_DEVICE_TESTING !== 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Untrusted referer' }));
      return;
    }

    const parsedUrl = new URL(urlStr, baseUrl);
    const pathname = parsedUrl.pathname;

    // Route 1: GET /api/calendar/status
    if (pathname === '/api/calendar/status' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          enabled: config.enabled,
          configured: config.configured,
          provider: config.provider,
          attribution: config.attribution,
          actionRequired: config.configured
            ? undefined
            : 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
        })
      );
      return;
    }

    // Route 2: GET /api/calendar or /api/calendar/events
    if ((pathname === '/api/calendar' || pathname === '/api/calendar/' || pathname === '/api/calendar/events') && req.method === 'GET') {
      if (!config.configured) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: false,
            configured: false,
            events: [],
            attribution: config.attribution,
            actionRequired: 'paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat',
          })
        );
        return;
      }

      if (!config.enabled) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: false,
            configured: true,
            events: [],
            error: 'Live calendar is disabled (set CALENDAR_LIVE_ENABLED=true)',
          })
        );
        return;
      }

      try {
        if (!config.icsUrl) {
          throw new Error('CALENDAR_ICS_URL missing');
        }
        const events = await calendarAdapter.fetchAndParse(config.icsUrl);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: true,
            configured: true,
            events,
            attribution: config.attribution,
          })
        );
      } catch (err: any) {
        res.writeHead(502, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Failed to fetch calendar feed',
            code: 'provider_error',
          })
        );
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  };
}

export interface GeocodeProxyConfig {
  readonly enabled: boolean;
  readonly attribution: string;
}

export function resolveGeocodeConfig(
  env: NodeJS.ProcessEnv = process.env
): GeocodeProxyConfig {
  const enabledVal = env['GEOCODE_LIVE_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';
  return {
    enabled,
    attribution: NOMINATIM_ATTRIBUTION,
  };
}

export function createGeocodeProxyMiddleware(
  configOverride?: Partial<GeocodeProxyConfig>,
  geocoderOverride?: NominatimGeocoder
) {
  const baseConfig = resolveGeocodeConfig();
  const config: GeocodeProxyConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    attribution: configOverride?.attribution ?? baseConfig.attribution,
  };

  const geocoder = geocoderOverride ?? new NominatimGeocoder();

  return async function geocodeProxyMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const urlStr = req.url || '';
    const rawPathname = urlStr.split('?')[0] || '';

    if (!rawPathname.startsWith('/api/geocode')) {
      return next();
    }

    // --- TEST SEAM INJECTION ---
    const geoSeam = getProxyTestSeam('geocode');
    if (geoSeam && geoSeam.forceMode && geoSeam.forceMode !== 'none') {
      if (geoSeam.forceMode === 'denied') {
        const code = geoSeam.forceStatusCode || 403;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: geoSeam.errorMessage || 'Geocode access denied', code: 'permission_denied' }));
        return;
      }
      if (geoSeam.forceMode === 'timeout') {
        if (geoSeam.forceDelayMs && geoSeam.forceDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, geoSeam.forceDelayMs));
        }
        const code = geoSeam.forceStatusCode || 504;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: geoSeam.errorMessage || 'Geocode timeout', code: 'timeout' }));
        return;
      }
      if (geoSeam.forceMode === 'error') {
        const code = geoSeam.forceStatusCode || 500;
        res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: geoSeam.errorMessage || 'Geocode error', code: 'provider_error' }));
        return;
      }
      if (geoSeam.forceMode === 'stale') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(geoSeam.payload || { success: true, result: null, attribution: config.attribution }));
        return;
      }
    }

    const hostHeader = req.headers['host'];
    let baseUrl = 'http://127.0.0.1:5173';
    if (hostHeader) {
      if (!isAllowlistedLoopbackHost(hostHeader) && process.env.DEV_DEVICE_TESTING !== 'true') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access forbidden: allowlisted loopback host required' }));
        return;
      }
      if (isAllowlistedLoopbackHost(hostHeader)) {
        baseUrl = `http://${hostHeader.trim()}`;
      }
    }

    const secFetchSite = req.headers['sec-fetch-site'];
    if (secFetchSite === 'cross-site') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Cross-site requests forbidden' }));
      return;
    }

    const referer = req.headers['referer'];
    if (referer && !isLocalOriginOrReferer(referer) && process.env.DEV_DEVICE_TESTING !== 'true') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Untrusted referer' }));
      return;
    }

    const parsedUrl = new URL(urlStr, baseUrl);
    const pathname = parsedUrl.pathname;

    // Route 1: GET /api/geocode/status
    if (pathname === '/api/geocode/status' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          enabled: config.enabled,
          provider: 'nominatim',
          attribution: config.attribution,
        })
      );
      return;
    }

    // Route 2: GET /api/geocode?q=...
    if (pathname === '/api/geocode' && req.method === 'GET') {
      if (!config.enabled) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: false,
            success: false,
            error: 'owner_gated',
            message: 'Geocoding live provider disabled by gate (owner approval required)',
            result: null,
            attribution: config.attribution,
          })
        );
        return;
      }

      const q = parsedUrl.searchParams.get('q');
      if (!q || !q.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: 'Missing required query parameter: q' }));
        return;
      }

      try {
        const result = await geocoder.geocode(q.trim());
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            enabled: true,
            success: Boolean(result),
            query: q.trim(),
            result: result ?? null,
            attribution: config.attribution,
          })
        );
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: err?.message || 'Geocoding failed', code: 'provider_error' }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  };
}
