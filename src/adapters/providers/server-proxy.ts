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
}

export function resolveRouteConfig(
  env: NodeJS.ProcessEnv = process.env
): RouteProxyConfig {
  const enabledVal = env['ROUTE_LIVE_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';

  const tilesVal = env['TILES_ENABLED'];
  const tilesEnabled = tilesVal === 'true' || tilesVal === '1';

  const provider = env['ROUTE_PROVIDER'] || 'osrm';

  return {
    enabled,
    tilesEnabled,
    provider,
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
  };

  const routeAdapter = adapterOverride ?? new OSRMRouteAdapter();

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
