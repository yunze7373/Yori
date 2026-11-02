/**
 * Proxy Boundary Mock Harness Contract Tests
 * Governed by LIVE_FIRST Plan S0-LIVE-CONTRACTS (ARCH-LIVE-FIRST-PROVIDERS).
 *
 * Verifies that the /api/* test seams deterministically provoke:
 * 1. Denied (403 Forbidden / permission_denied)
 * 2. Stale (expired timestamps / degraded validity per INV-106)
 * 3. Timeout (504 Gateway Timeout / timeout notice)
 * 4. Error (500 Internal Server Error / provider_error)
 *
 * Verifies that client snapshot construction degrades to honest notices (INV-103)
 * with zero crashes, zero external network calls, and frozen contracts (INV-101).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createWeatherProxyMiddleware,
  createRouteProxyMiddleware,
  createPlacesProxyMiddleware,
  createCalendarProxyMiddleware,
  createGeocodeProxyMiddleware,
  setProxyTestSeam,
  resetProxyTestSeams,
} from '../../src/adapters/providers/server-proxy.js';
import {
  createLiveSignal,
  degradeIfExpired,
  createEmptyLiveSignal,
} from '../../src/adapters/providers/live-signal.js';
import {
  buildLiveSnapshot,
  deriveLiveLivingHeaderFromSnapshot,
} from '../../src/adapters/providers/live-snapshot.js';

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function createMockReqRes(url: string, headers: Record<string, string> = { host: '127.0.0.1:5173' }) {
  const req: any = {
    url,
    method: 'GET',
    headers,
  };

  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
  };

  const res: any = {
    writeHead: vi.fn((code: number, hdrs: Record<string, string>) => {
      response.statusCode = code;
      response.headers = hdrs;
    }),
    end: vi.fn((data: string) => {
      response.body = data;
    }),
  };

  const next = vi.fn();

  return { req, res, next, response };
}

describe('Proxy-Boundary Mock Harness (/api/* seams)', () => {
  beforeEach(() => {
    resetProxyTestSeams();
  });

  afterEach(() => {
    resetProxyTestSeams();
  });

  // =========================================================================
  // 1. Weather Proxy (/api/weather)
  // =========================================================================
  describe('Weather Proxy Seam (/api/weather)', () => {
    const middleware = createWeatherProxyMiddleware({ enabled: true });

    it('provokes DENIED path deterministically (403 Forbidden)', async () => {
      setProxyTestSeam('weather', {
        forceMode: 'denied',
        errorMessage: 'Weather access unconsented',
      });

      const { req, res, next, response } = createMockReqRes('/api/weather/current');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(403);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('permission_denied');
      expect(data.error).toContain('Weather access unconsented');

      // Client mapping to LiveSignal
      const signal = createEmptyLiveSignal({
        kind: 'weather',
        provider: 'open-meteo',
        reason: 'permission_denied',
        humanNotice: 'Weather data not shared',
        errorDetails: data.error,
      });
      expect(signal.status).toBe('permission_needed');
      expect(signal.notice?.humanNotice).toBe('Weather data not shared');
    });

    it('provokes STALE path deterministically (backdated timestamp degraded by client)', async () => {
      const staleAgeMs = 7200000; // 2 hours in past
      setProxyTestSeam('weather', {
        forceMode: 'stale',
        staleAgeMs,
      });

      const { req, res, next, response } = createMockReqRes('/api/weather/current');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.stale).toBe(true);
      expect(data.signals).toHaveLength(1);

      const rawSig = data.signals[0];
      const liveSig = createLiveSignal({
        kind: rawSig.kind,
        value: rawSig.value,
        provider: rawSig.provider,
        asOf: rawSig.asOf,
        validFor: rawSig.validFor,
        confidence: rawSig.confidence,
        provenance: rawSig.provenance,
        consentScope: rawSig.consentScope,
      });

      // Degrades when checked against current time (INV-106)
      const degraded = degradeIfExpired(liveSig, new Date().toISOString());
      expect(degraded.status).toBe('unavailable');
      expect(degraded.confidence).toBe(0);
      expect(degraded.notice?.code).toBe('signal_expired');
    });

    it('provokes TIMEOUT path deterministically (504 Gateway Timeout)', async () => {
      setProxyTestSeam('weather', {
        forceMode: 'timeout',
        errorMessage: 'Open-Meteo connection timed out',
      });

      const { req, res, next, response } = createMockReqRes('/api/weather/current');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(504);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('timeout');

      // Client mapping to LiveSignal
      const signal = createEmptyLiveSignal({
        kind: 'weather',
        provider: 'open-meteo',
        reason: 'timeout',
        humanNotice: 'Weather provider timed out',
        errorDetails: data.error,
      });
      expect(signal.status).toBe('unavailable');
      expect(signal.notice?.code).toBe('timeout');
    });

    it('provokes ERROR path deterministically (500 Internal Error)', async () => {
      setProxyTestSeam('weather', {
        forceMode: 'error',
        errorMessage: 'Upstream weather service unavailable',
      });

      const { req, res, next, response } = createMockReqRes('/api/weather/current');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('provider_error');

      // Client mapping to LiveSignal
      const signal = createEmptyLiveSignal({
        kind: 'weather',
        provider: 'open-meteo',
        reason: 'error',
        humanNotice: 'Weather service temporarily unavailable',
        errorDetails: data.error,
      });
      expect(signal.status).toBe('error');
    });
  });

  // =========================================================================
  // 2. Route Proxy (/api/route)
  // =========================================================================
  describe('Route Proxy Seam (/api/route)', () => {
    const middleware = createRouteProxyMiddleware({ enabled: true });

    it('provokes DENIED path deterministically (403 Forbidden)', async () => {
      setProxyTestSeam('route', {
        forceMode: 'denied',
        errorMessage: 'Routing provider unconfigured or disabled',
      });

      const { req, res, next, response } = createMockReqRes('/api/route?origin=37.77,-122.41&destination=37.78,-122.40');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(403);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('permission_denied');
    });

    it('provokes STALE path deterministically (expired route duration)', async () => {
      setProxyTestSeam('route', {
        forceMode: 'stale',
      });

      const { req, res, next, response } = createMockReqRes('/api/route?origin=37.77,-122.41&destination=37.78,-122.40');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.stale).toBe(true);

      const routeSig = createLiveSignal({
        kind: 'travel_estimate',
        value: data.route,
        provider: 'osrm',
        asOf: data.route.asOf,
        validFor: data.route.validFor,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      });

      const degraded = degradeIfExpired(routeSig, new Date().toISOString());
      expect(degraded.status).toBe('unavailable');
    });

    it('provokes TIMEOUT path deterministically (504 Gateway Timeout)', async () => {
      setProxyTestSeam('route', {
        forceMode: 'timeout',
      });

      const { req, res, next, response } = createMockReqRes('/api/route?origin=37.77,-122.41&destination=37.78,-122.40');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(504);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('timeout');
    });

    it('provokes ERROR path deterministically (500 Internal Error)', async () => {
      setProxyTestSeam('route', {
        forceMode: 'error',
      });

      const { req, res, next, response } = createMockReqRes('/api/route?origin=37.77,-122.41&destination=37.78,-122.40');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('provider_error');
    });
  });

  // =========================================================================
  // 3. Places Proxy (/api/places)
  // =========================================================================
  describe('Places Proxy Seam (/api/places)', () => {
    const middleware = createPlacesProxyMiddleware({ enabled: true });

    it('provokes DENIED path deterministically (403 Forbidden)', async () => {
      setProxyTestSeam('places', {
        forceMode: 'denied',
      });

      const { req, res, next, response } = createMockReqRes('/api/places?lat=37.77&lng=-122.41&amenity=restaurant');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(403);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('permission_denied');
    });

    it('provokes STALE path deterministically', async () => {
      setProxyTestSeam('places', {
        forceMode: 'stale',
      });

      const { req, res, next, response } = createMockReqRes('/api/places?lat=37.77&lng=-122.41&amenity=restaurant');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.stale).toBe(true);
      expect(data.places).toHaveLength(1);

      const place = data.places[0];
      const placesSig = createLiveSignal({
        kind: 'places_lunch',
        value: data.places,
        provider: 'overpass',
        asOf: place.fetchedAt,
        validFor: place.validFor,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      });

      const degraded = degradeIfExpired(placesSig, new Date().toISOString());
      expect(degraded.status).toBe('unavailable');
    });

    it('provokes TIMEOUT path deterministically (504 Gateway Timeout)', async () => {
      setProxyTestSeam('places', {
        forceMode: 'timeout',
      });

      const { req, res, next, response } = createMockReqRes('/api/places?lat=37.77&lng=-122.41&amenity=restaurant');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(504);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('timeout');
    });

    it('provokes ERROR path deterministically (500 Internal Error)', async () => {
      setProxyTestSeam('places', {
        forceMode: 'error',
      });

      const { req, res, next, response } = createMockReqRes('/api/places?lat=37.77&lng=-122.41&amenity=restaurant');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('provider_error');
    });
  });

  // =========================================================================
  // 4. Calendar Proxy Seam (/api/calendar)
  // =========================================================================
  describe('Calendar Proxy Seam (/api/calendar)', () => {
    it('returns honest unconfigured status and connection-block action requirement', async () => {
      const middleware = createCalendarProxyMiddleware({ enabled: false, configured: false });
      const { req, res, next, response } = createMockReqRes('/api/calendar/status');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.enabled).toBe(false);
      expect(data.configured).toBe(false);
      expect(data.provider).toBe('ics');
      expect(data.actionRequired).toContain('paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat');
    });

    it('returns connection-block payload when /api/calendar queried while unconfigured', async () => {
      const middleware = createCalendarProxyMiddleware({ enabled: false, configured: false });
      const { req, res, next, response } = createMockReqRes('/api/calendar');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.enabled).toBe(false);
      expect(data.configured).toBe(false);
      expect(data.events).toEqual([]);
      expect(data.actionRequired).toContain('paste the secret iCal URL into .env.local as CALENDAR_ICS_URL yourself; never in chat');
    });

    it('provokes DENIED path deterministically (403 Forbidden)', async () => {
      const middleware = createCalendarProxyMiddleware({ enabled: true, configured: true });
      setProxyTestSeam('calendar', {
        forceMode: 'denied',
        errorMessage: 'Calendar access denied',
      });

      const { req, res, next, response } = createMockReqRes('/api/calendar');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(403);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('permission_denied');
    });

    it('provokes TIMEOUT path deterministically (504 Gateway Timeout)', async () => {
      const middleware = createCalendarProxyMiddleware({ enabled: true, configured: true });
      setProxyTestSeam('calendar', {
        forceMode: 'timeout',
      });

      const { req, res, next, response } = createMockReqRes('/api/calendar');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(504);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('timeout');
    });
  });

  // =========================================================================
  // 5. Geocode Proxy Seam (/api/geocode)
  // =========================================================================
  describe('Geocode Proxy Seam (/api/geocode)', () => {
    it('rejects empty query parameter with 400', async () => {
      const middleware = createGeocodeProxyMiddleware({ enabled: true });
      const { req, res, next, response } = createMockReqRes('/api/geocode?q=');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error).toContain('Missing required query parameter: q');
    });

    it('provokes TIMEOUT path deterministically (504 Gateway Timeout)', async () => {
      const middleware = createGeocodeProxyMiddleware({ enabled: true });
      setProxyTestSeam('geocode', {
        forceMode: 'timeout',
      });

      const { req, res, next, response } = createMockReqRes('/api/geocode?q=San+Francisco');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(504);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('timeout');
    });

    it('provokes ERROR path deterministically (500 Internal Error)', async () => {
      const middleware = createGeocodeProxyMiddleware({ enabled: true });
      setProxyTestSeam('geocode', {
        forceMode: 'error',
      });

      const { req, res, next, response } = createMockReqRes('/api/geocode?q=San+Francisco');
      await middleware(req, res, next);

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);
      expect(data.code).toBe('provider_error');
    });
  });

  // =========================================================================
  // 6. End-to-End Snapshot Composition Under Failure Modes
  // =========================================================================
  describe('Snapshot Composition Under Failure Modes', () => {
    it('composes snapshot gracefully when all providers are in failed/denied states', () => {
      const deniedWeather = createEmptyLiveSignal({
        kind: 'weather',
        provider: 'open-meteo',
        reason: 'permission_denied',
        humanNotice: 'Weather data not shared',
      });

      const timeoutPlaces = createEmptyLiveSignal({
        kind: 'places_lunch',
        provider: 'overpass',
        reason: 'timeout',
        humanNotice: 'Places search timed out',
      });

      const errorRoute = createEmptyLiveSignal({
        kind: 'travel_estimate',
        provider: 'osrm',
        reason: 'error',
        humanNotice: 'Routing service unavailable',
      });

      const snapshot = buildLiveSnapshot({
        asOf: '2026-11-02T10:00:00.000Z',
        timezone: 'America/Los_Angeles',
        weatherSignal: deniedWeather,
        placesSignal: timeoutPlaces,
        routeSignal: errorRoute,
      });

      // Verify: Snapshot is structurally intact and deeply frozen
      expect(snapshot.signals.length).toBeGreaterThanOrEqual(4);
      expect(Object.isFrozen(snapshot)).toBe(true);

      // Living Header reports honest unavailable status without crashing or faking
      const header = deriveLiveLivingHeaderFromSnapshot(snapshot, 'America/Los_Angeles');
      expect(header.weatherDisplay).toBe('Weather unavailable');
      expect(header.placeDisplay).toBe('Location not shared');
      expect(header.formattedLine).toBe('2:00 AM · Weather unavailable · Location not shared');
      expect(header.formattedLine).not.toContain('Clear');
      expect(header.formattedLine).not.toContain('Home');
    });
  });
});
