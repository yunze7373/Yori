/**
 * Weather Provider Dev-Server Proxy Middleware
 * Governed by G-204, Acceptance Criteria AC-204-1, AC-204-2, and Invariants INV-101, INV-102, INV-103.
 *
 * Security & Invariant Guarantees:
 * 1. Loopback-only binding: only local requests (127.0.0.1, localhost) are accepted.
 * 2. Origin/Referer guard: rejects cross-site requests.
 * 3. Feature-flagged: WEATHER_LIVE_ENABLED (boolean, default: false).
 * 4. Privacy: without `coords`, uses the configured fixed demo-city coordinates (dev/recorded only).
 *    With `coords=lat,lng` (D1), queries at the consented device fix, re-rounded to 3 decimals
 *    (~100 m) before anything leaves the server. Coordinates are never logged and the server
 *    never requests device geolocation or forwards user identifiers.
 * 5. Returns attribution metadata for Open-Meteo (CC BY 4.0).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  DEFAULT_DEMO_CITY,
  OPEN_METEO_ATTRIBUTION,
  type DemoCityCoordinate,
} from './weather-types.js';
import { OpenMeteoWeatherAdapter } from './open-meteo-adapter.js';
import { isAllowlistedLoopbackHost, isLoopbackPeer } from '../xmemo/loopback-allowlist.js';
import {
  OSRM_ATTRIBUTION,
  type Coordinate,
  type RouteMode,
} from './routing-types.js';
import type { RoutingProvider } from './routing-provider.js';
import { OSRMRouteAdapter, describeOutboundHost } from './osrm-route-adapter.js';
import type { PlacesProvider } from './places-types.js';
import {
  OverpassPlacesAdapter,
  DEFAULT_OVERPASS_ENDPOINT,
  OVERPASS_ATTRIBUTION,
  OVERPASS_MAX_RADIUS_METERS,
  OVERPASS_MIN_OUTBOUND_INTERVAL_MS,
  roundCoordinate3Decimals,
  isAllowedAmenity,
  ALLOWED_AMENITIES,
} from './overpass-places-adapter.js';
import {
  IcsCalendarAdapter,
  resolveIanaTimezone,
} from './ics-calendar-adapter.js';
import { GoogleOAuthCore, GOOGLE_SCOPES, getSharedGoogleOAuthCore } from '../google/oauth-core.js';
import { fetchGoogleCalendarEvents } from '../google/calendar-events.js';
import {
  NominatimGeocoder,
  NOMINATIM_ATTRIBUTION,
} from './nominatim-geocoder.js';
import {
  GooglePlacesAdapter,
  GoogleQuotaExceededError,
  GOOGLE_PLACES_ATTRIBUTION,
} from './google-places-adapter.js';
import { FileGooglePlacesLedger, DEFAULT_GOOGLE_PLACES_DAILY_CAP } from './google-places-ledger.js';
import { loadEnvLocal } from '../model/server-proxy.js';

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
  const enabled = resolveTrioFlag(env['WEATHER_LIVE_ENABLED']);

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

/**
 * DEMO_RESCUE D2 — keyless trio default (Overpass places, OSRM/routed-foot routing, Open-Meteo).
 * ON since the §9 owner confirmation (review chat 3738319b, 2026-11-03 05:36 JST:
 * "key已填，同意 1–4，手机。"). Per-session browser location consent stays mandatory, and an
 * explicit env value ('true'/'1' or 'false'/'0') always wins, so the owner can still disable a
 * single provider (and the e2e preview servers pin all three to 'false' to stay offline).
 */
export const KEYLESS_TRIO_DEFAULT_ON = true;

export function resolveTrioFlag(
  raw: string | undefined,
  defaultOn: boolean = KEYLESS_TRIO_DEFAULT_ON
): boolean {
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return defaultOn;
}

/** Decimal places kept for any device fix sent to the weather provider (~100 m). */
export const WEATHER_COORD_DECIMALS = 3;

const WEATHER_COORDS_PATTERN = /^(-?\d{1,3}(?:\.\d{1,6})?),(-?\d{1,3}(?:\.\d{1,6})?)$/;

export type WeatherCoordsParseResult =
  | { readonly ok: true; readonly coords: { readonly latitude: number; readonly longitude: number } | null }
  | { readonly ok: false };

/**
 * Strictly parses the optional `coords=lat,lng` query value for /api/weather/current.
 * Absent -> { ok: true, coords: null }. Anything malformed or out of range -> { ok: false }.
 * The parsed fix is re-rounded to 3 decimals so no unrounded value can reach Open-Meteo.
 */
export function parseWeatherCoordsParam(raw: string | null): WeatherCoordsParseResult {
  if (raw === null) return { ok: true, coords: null };
  const match = WEATHER_COORDS_PATTERN.exec(raw);
  if (!match) return { ok: false };
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false };
  return {
    ok: true,
    coords: {
      latitude: roundCoordinate3Decimals(lat),
      longitude: roundCoordinate3Decimals(lng),
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
          // D2: exact outbound host for the consent copy.
          outboundHosts: [{ purpose: 'weather', host: 'api.open-meteo.com' }],
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

      const coordsResult = parseWeatherCoordsParam(parsedUrl.searchParams.get('coords'));
      if (!coordsResult.ok) {
        // Never echo the rejected value (it may be an unrounded fix).
        res.writeHead(400, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            error: 'Invalid coords. Expected coords=lat,lng with lat in [-90,90] and lng in [-180,180]',
            code: 'invalid_coords',
          })
        );
        return;
      }

      const deviceFix = coordsResult.coords;
      const adapterForRequest = deviceFix
        ? weatherAdapter.withCoordinate({
            latitude: deviceFix.latitude,
            longitude: deviceFix.longitude,
            name: 'Near you',
            // Open-Meteo resolves the fix's own timezone, so issuedAt is correct for any city.
            timezone: 'auto',
          })
        : weatherAdapter;

      try {
        const signals = await adapterForRequest.signals();
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(
          JSON.stringify({
            enabled: true,
            signals,
            attribution: OPEN_METEO_ATTRIBUTION,
            source: 'Open-Meteo',
            fetchedAt: new Date().toISOString(),
            coordinate: deviceFix
              ? {
                  kind: 'device_fix',
                  latitude: deviceFix.latitude,
                  longitude: deviceFix.longitude,
                  decimals: WEATHER_COORD_DECIMALS,
                }
              : {
                  kind: 'demo_city',
                  name: config.demoCity.name,
                  latitude: config.demoCity.latitude,
                  longitude: config.demoCity.longitude,
                },
          })
        );
      } catch {
        // Fixed message only: provider errors can embed the request URL (and so the fix).
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(JSON.stringify({ error: 'Failed to fetch weather' }));
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
  const enabled = resolveTrioFlag(env['ROUTE_LIVE_ENABLED']);

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
          // D2: exact outbound hosts (from the adapter's configured base URLs) for the consent copy.
          outboundHosts:
            typeof (routeAdapter as { outboundHosts?: unknown }).outboundHosts === 'function'
              ? (routeAdapter as OSRMRouteAdapter).outboundHosts()
              : [],
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
  readonly provider: 'overpass' | 'google';
  readonly attribution: string;
  /**
   * D7: server-side only (GOOGLE_PLACES_API_KEY override, else GOOGLE_MAPS_API_KEY). Never
   * serialized, logged or sent to the client. Absent -> Overpass-only discovery.
   */
  readonly googleApiKey?: string;
  /** D7: verified public Overpass mirror tried after the flagship (OVERPASS_MIRROR_URL; '' disables). */
  readonly overpassMirrorUrl?: string | null;
  readonly googleDailyCap?: number;
}

/** D7: verified 2026-11-03 (flagship 502/28 s; this mirror answered a 1.5 km query in ~21 s). */
export const DEFAULT_OVERPASS_MIRROR_URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
export const OVERPASS_FALLBACK_FLAGSHIP_TIMEOUT_MS = 20000;
export const OVERPASS_FALLBACK_MIRROR_TIMEOUT_MS = 25000;

export function resolvePlacesConfig(
  env: NodeJS.ProcessEnv = process.env
): PlacesProxyConfig {
  const enabled = resolveTrioFlag(env['PLACES_LIVE_ENABLED'] || env['VITE_PLACES_LIVE_ENABLED']);
  const googleApiKey = (env['GOOGLE_PLACES_API_KEY'] || env['GOOGLE_MAPS_API_KEY'] || '').trim() || undefined;
  const mirror = env['OVERPASS_MIRROR_URL'];
  const cap = Number(env['GOOGLE_PLACES_DAILY_CAP']);
  return {
    enabled,
    provider: googleApiKey ? 'google' : 'overpass',
    attribution: googleApiKey ? GOOGLE_PLACES_ATTRIBUTION : OVERPASS_ATTRIBUTION,
    googleApiKey,
    overpassMirrorUrl: mirror === undefined ? DEFAULT_OVERPASS_MIRROR_URL : mirror.trim() || null,
    googleDailyCap: Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_GOOGLE_PLACES_DAILY_CAP,
  };
}

let lastOutboundPlacesQueryMs = 0;

/** D7: Google results are reused this long for automatic refreshes (explicit taps send fresh=1). */
export const GOOGLE_RESULT_CACHE_TTL_MS = 5 * 60 * 1000;
const googleResultCache = new Map<string, { at: number; body: string }>();

export function resetPlacesRateLimit(): void {
  lastOutboundPlacesQueryMs = 0;
  googleResultCache.clear();
}

export function createPlacesProxyMiddleware(
  configOverride?: Partial<PlacesProxyConfig>,
  adapterOverride?: PlacesProvider,
  deps?: {
    /** D7: Google discovery (null disables even with a key); default built from googleApiKey. */
    readonly google?: GooglePlacesAdapter | null;
    /** D7: ordered Overpass chain; default flagship (20 s) then the verified mirror (25 s). */
    readonly overpassChain?: readonly PlacesProvider[];
  }
) {
  loadEnvLocal();
  const baseConfig = resolvePlacesConfig();
  const hasOverride = configOverride !== undefined && 'googleApiKey' in configOverride;
  const googleApiKey = hasOverride ? configOverride!.googleApiKey : baseConfig.googleApiKey;
  const config: PlacesProxyConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    provider: googleApiKey ? 'google' : 'overpass',
    attribution: configOverride?.attribution ?? (googleApiKey ? GOOGLE_PLACES_ATTRIBUTION : OVERPASS_ATTRIBUTION),
    googleApiKey,
    overpassMirrorUrl:
      configOverride && 'overpassMirrorUrl' in configOverride ? configOverride.overpassMirrorUrl : baseConfig.overpassMirrorUrl,
    googleDailyCap: configOverride?.googleDailyCap ?? baseConfig.googleDailyCap,
  };

  // Legacy single-adapter callers (tests) keep exactly that adapter; otherwise the D7 chain.
  const overpassChain: readonly PlacesProvider[] =
    deps?.overpassChain ??
    (adapterOverride
      ? [adapterOverride]
      : [
          new OverpassPlacesAdapter({
            liveEnabled: config.enabled,
            timeoutMs: OVERPASS_FALLBACK_FLAGSHIP_TIMEOUT_MS,
            queryTimeoutSeconds: 20,
          }),
          ...(config.overpassMirrorUrl
            ? [
                new OverpassPlacesAdapter({
                  liveEnabled: config.enabled,
                  endpoint: config.overpassMirrorUrl,
                  timeoutMs: OVERPASS_FALLBACK_MIRROR_TIMEOUT_MS,
                  queryTimeoutSeconds: 25,
                }),
              ]
            : []),
        ]);
  const googleAdapter: GooglePlacesAdapter | null =
    deps && 'google' in deps
      ? deps.google ?? null
      : config.googleApiKey && !adapterOverride
      ? new GooglePlacesAdapter({
          apiKey: config.googleApiKey,
          ledger: new FileGooglePlacesLedger({ dailyCap: config.googleDailyCap }),
        })
      : null;
  const usesGoogle = Boolean(googleAdapter);
  const overpassHosts = overpassChain
    .map(a => (typeof (a as OverpassPlacesAdapter).getEndpoint === 'function' ? (a as OverpassPlacesAdapter).getEndpoint() : DEFAULT_OVERPASS_ENDPOINT))
    .map(u => describeOutboundHost(u));

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
          // D2/D7: exact outbound hosts for the consent copy (Google first when it is primary).
          discovery: usesGoogle ? 'google' : 'osm',
          outboundHosts: [
            ...(usesGoogle ? [{ purpose: 'nearby places and photos', host: 'places.googleapis.com' }] : []),
            ...Array.from(new Set(overpassHosts)).map((host, i) => ({
              purpose: usesGoogle || i > 0 ? 'nearby places, fallback' : 'nearby places',
              host,
            })),
          ],
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

      // D7 cost guard: Google results are reused for 5 min per rounded fix + amenity, so automatic
      // Live refreshes (focus / 60 s) never bill; an explicit "Nearby now" sends fresh=1.
      const cacheKey = `${roundCoordinate3Decimals(lat)},${roundCoordinate3Decimals(lng)},${amenityParam}`;
      const wantsFresh = parsedUrl.searchParams.get('fresh') === '1';
      const cached = googleResultCache.get(cacheKey);
      if (googleAdapter && cached && !wantsFresh && Date.now() - cached.at < GOOGLE_RESULT_CACHE_TTL_MS) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(cached.body);
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

      // D7: Google first for food when configured; any Google failure (or the daily cap) falls
      // back to the Overpass chain and the response says so. Fixed error messages only.
      let failover: { from: 'google'; reason: 'daily_cap' | 'unavailable' } | null = null;
      if (googleAdapter && (amenityParam === 'restaurant' || amenityParam === 'cafe')) {
        try {
          const places = await googleAdapter.searchNearby({ lat: roundedLat, lng: roundedLng });
          const body = JSON.stringify({ enabled: true, discovery: 'google', places, attribution: GOOGLE_PLACES_ATTRIBUTION });
          googleResultCache.set(cacheKey, { at: Date.now(), body });
          if (googleResultCache.size > 50) googleResultCache.delete(googleResultCache.keys().next().value!);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(body);
          return;
        } catch (err) {
          failover = { from: 'google', reason: err instanceof GoogleQuotaExceededError ? 'daily_cap' : 'unavailable' };
        }
      }

      let lastErr: unknown = null;
      for (let i = 0; i < overpassChain.length; i++) {
        try {
          const places = await overpassChain[i]!.searchNearby({
            location: { lat: roundedLat, lng: roundedLng },
            category: amenityParam,
            radiusMeters,
          });
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(
            JSON.stringify({
              enabled: true,
              discovery: 'osm',
              osmHost: overpassHosts[i],
              failover,
              places,
              attribution: OVERPASS_ATTRIBUTION,
            })
          );
          return;
        } catch (err) {
          lastErr = err;
        }
      }
      res.writeHead(500, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({
          error:
            lastErr instanceof Error && /^Overpass API responded with HTTP \d+$/.test(lastErr.message)
              ? lastErr.message
              : 'Places provider error',
          discovery: 'osm',
          failover,
        })
      );
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
  readonly defaultTimezone: string;
}

export function resolveCalendarConfig(
  env: NodeJS.ProcessEnv = process.env
): CalendarProxyConfig {
  const enabledVal = env['CALENDAR_LIVE_ENABLED'] || env['VITE_CALENDAR_LIVE_ENABLED'];
  const enabled = enabledVal === 'true' || enabledVal === '1';
  const icsUrl = env['CALENDAR_ICS_URL']?.trim() || null;
  const configured = Boolean(icsUrl && icsUrl.length > 0);
  const rawTz = env['CALENDAR_DEFAULT_TZ']?.trim();
  const hostTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  const resolvedTz = (rawTz ? resolveIanaTimezone(rawTz) : null) ??
    (hostTz ? resolveIanaTimezone(hostTz) : null) ??
    'UTC';

  return {
    enabled,
    configured,
    provider: 'ics',
    attribution: 'iCalendar (RFC 5545)',
    icsUrl,
    defaultTimezone: resolvedTz,
  };
}

/** D11: Google Calendar source behind /api/calendar (preferred when connected; iCal underneath). */
export interface GoogleCalendarSource {
  readonly core: GoogleOAuthCore;
  readonly fetchEvents?: typeof fetchGoogleCalendarEvents;
  readonly fetchFn?: typeof fetch;
}

export const GOOGLE_CALENDAR_ATTRIBUTION = 'Google Calendar (read-only)';

export function createCalendarProxyMiddleware(
  configOverride?: Partial<CalendarProxyConfig>,
  adapterOverride?: IcsCalendarAdapter,
  googleOverride?: GoogleCalendarSource
) {
  const baseConfig = resolveCalendarConfig();
  const config: CalendarProxyConfig = {
    enabled: configOverride?.enabled ?? baseConfig.enabled,
    configured: configOverride?.configured ?? baseConfig.configured,
    provider: 'ics',
    attribution: configOverride?.attribution ?? baseConfig.attribution,
    icsUrl: configOverride?.icsUrl !== undefined ? configOverride.icsUrl : baseConfig.icsUrl,
    defaultTimezone: configOverride?.defaultTimezone ?? baseConfig.defaultTimezone,
  };

  const calendarAdapter =
    adapterOverride ??
    new IcsCalendarAdapter({
      defaultTimezone: config.defaultTimezone,
    });

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

    // D11 rework (Reviewer 85e66fd7): the owner's calendar (Google via the owner's token, or the
    // private iCal feed) is served only to a loopback socket peer, for both sources and regardless
    // of DEV_DEVICE_TESTING; the Host header is client-supplied and a missing peer fails closed.
    // The phone reaches it through surface E (ssh -R to localhost:4174), which arrives as loopback.
    if (!isLoopbackPeer(req.socket?.remoteAddress)) {
      res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({
          error: 'Calendar is available on this Mac or through surface E (localhost) only',
          code: 'non_loopback_client',
        })
      );
      return;
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

    // D11: with no Google client configured nothing below changes (byte-identical iCal-only
    // behaviour). When configured, a connected grant is the preferred source unless the owner
    // switched live calendar off explicitly; an expired/revoked grant falls back to iCal, else none.
    const google = googleOverride ?? { core: getSharedGoogleOAuthCore() };
    const gStatus = google.core.status();
    const calendarOwnerOff = /^(false|0)$/i.test(process.env['CALENDAR_LIVE_ENABLED']?.trim() ?? '');
    const googleFlag = gStatus.configured ? { google: { configured: true, calendar: gStatus.calendar } } : {};

    if (gStatus.configured && gStatus.calendar === 'connected' && !calendarOwnerOff) {
      if (pathname === '/api/calendar/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(
          JSON.stringify({
            enabled: true,
            configured: true,
            provider: 'google_calendar',
            attribution: GOOGLE_CALENDAR_ATTRIBUTION,
            google: { configured: true, calendar: 'connected' },
          })
        );
        return;
      }
      if ((pathname === '/api/calendar' || pathname === '/api/calendar/' || pathname === '/api/calendar/events') && req.method === 'GET') {
        const fetchEvents = google.fetchEvents ?? fetchGoogleCalendarEvents;
        const opts = { apiBase: google.core.config.calendarApiBase, fetchFn: google.fetchFn };
        let token = await google.core.getAccessToken(GOOGLE_SCOPES.calendar);
        let result = token ? await fetchEvents(token, opts) : null;
        if (result && !result.ok && result.reason === 'unauthorized') {
          token = await google.core.forceRefresh();
          result = token ? await fetchEvents(token, opts) : null;
          if (result && !result.ok && result.reason === 'unauthorized') {
            google.core.rejectGrant();
            result = null;
          }
        }
        if (result && result.ok) {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(
            JSON.stringify({
              enabled: true,
              configured: true,
              provider: 'google_calendar',
              events: result.events,
              attribution: GOOGLE_CALENDAR_ATTRIBUTION,
            })
          );
          return;
        }
        if (result && !result.ok) {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Failed to fetch Google Calendar events', code: 'provider_error', provider: 'google_calendar' }));
          return;
        }
        // No usable grant any more: fall through to the iCal path (or the honest "no calendar").
      }
    }
    const googleNow = gStatus.configured ? { google: { configured: true, calendar: google.core.status().calendar } } : googleFlag;

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
          ...googleNow,
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
            ...googleNow,
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
            ...googleNow,
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
            ...googleNow,
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
