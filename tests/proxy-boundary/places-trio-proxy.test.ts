/**
 * D2-LUNCH-DEFAULT-ON proxy-boundary tests (DEMO_RESCUE plan, TID INBOX-20261102-1E359B).
 *
 * Recorded Overpass response (raw `elements`, captured shape) through the REAL /api/places
 * middleware + OverpassPlacesAdapter with an injected fetch (no network):
 * - FOSSGIS endpoint, POST, dedicated User-Agent, [timeout:8] query, 3-decimal coords only.
 * - Candidates carry real OSM ids, coords, fetchedAt, straight-line distance label, and an
 *   open status derived from opening_hours ONLY (absent tag -> undefined = "hours unknown").
 * - 10 s outbound interval: a second query inside it is 429 with zero outbound calls.
 * Keyless trio default switch: shipped OFF; explicit env wins; adapter follows the proxy flag.
 * Status endpoints report the exact outbound hosts used by the consent copy.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPlacesProxyMiddleware,
  createRouteProxyMiddleware,
  createWeatherProxyMiddleware,
  resetPlacesRateLimit,
  resetProxyTestSeams,
  resolvePlacesConfig,
  resolveRouteConfig,
  resolveWeatherConfig,
  resolveTrioFlag,
  KEYLESS_TRIO_DEFAULT_ON,
} from '../../src/adapters/providers/server-proxy.js';
import { OverpassPlacesAdapter, OVERPASS_ATTRIBUTION } from '../../src/adapters/providers/overpass-places-adapter.js';

// Fix in the Tokyo-Shinjuku fixture cluster, with extra decimals to detect unrounded leaks.
const RAW_LAT = '35.689487';
const RAW_LNG = '139.691706';

// Recorded Overpass API JSON (shape as returned by overpass-api.de for `out center;`).
const RECORDED_OVERPASS = {
  version: 0.6,
  generator: 'Overpass API',
  osm3s: { timestamp_osm_base: '2026-11-03T07:00:00Z', copyright: 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.' },
  elements: [
    { type: 'node', id: 4242001, lat: 35.6899, lon: 139.6921, tags: { amenity: 'restaurant', name: 'Shinjuku Soba Tei', cuisine: 'soba', opening_hours: '24/7' } },
    { type: 'way', id: 4242002, center: { lat: 35.6902, lon: 139.6930 }, tags: { amenity: 'restaurant', name: 'Nishi Curry House', cuisine: 'curry' } },
    { type: 'node', id: 4242003, lat: 35.6889, lon: 139.6935, tags: { amenity: 'restaurant', cuisine: 'ramen' } }, // no name -> dropped
  ],
};

function reqRes(url: string, method = 'GET') {
  const req: any = { url, method, headers: { host: '127.0.0.1:4174' } };
  const response = { statusCode: 0, body: '' };
  const res: any = {
    writeHead: vi.fn((code: number) => {
      response.statusCode = code;
    }),
    end: vi.fn((data: string) => {
      response.body = data;
    }),
  };
  return { req, res, next: vi.fn(), response };
}

function recordedFetch() {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(RECORDED_OVERPASS), { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
}

describe('D2 /api/places over a recorded Overpass response', () => {
  beforeEach(() => {
    resetProxyTestSeams();
    resetPlacesRateLimit();
  });

  it('queries FOSSGIS Overpass with rounded coords, UA and 8 s timeout; returns real-shaped candidates', async () => {
    const fetchFn = recordedFetch();
    const middleware = createPlacesProxyMiddleware({ enabled: true }, new OverpassPlacesAdapter({ fetchFn: fetchFn as any }));
    const { req, res, next, response } = reqRes(`/api/places?lat=${RAW_LAT}&lng=${RAW_LNG}&amenity=restaurant&radius=1500`);
    await middleware(req, res, next);

    expect(response.statusCode).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^YoriLivingContext\//);
    const query = decodeURIComponent(String(init.body).replace(/^data=/, ''));
    expect(query).toContain('[timeout:8]');
    expect(query).toContain('around:1500,35.689,139.692');
    expect(query).not.toContain(RAW_LAT);
    expect(query).not.toContain(RAW_LNG);

    const data = JSON.parse(response.body);
    expect(data.enabled).toBe(true);
    expect(data.attribution).toBe(OVERPASS_ATTRIBUTION);
    expect(data.attribution).toBe('OpenStreetMap via Overpass (ODbL)');
    expect(data.places.map((p: any) => p.name).sort()).toEqual(['Nishi Curry House', 'Shinjuku Soba Tei']);

    const soba = data.places.find((p: any) => p.name === 'Shinjuku Soba Tei');
    expect(soba.osmId).toBe(4242001);
    expect(soba.placeId).toBe('overpass-node-4242001');
    expect(soba.coords).toEqual({ lat: 35.6899, lng: 139.6921 });
    expect(Number.isFinite(Date.parse(soba.fetchedAt))).toBe(true);
    expect(soba.straightLineDistanceLabel).toMatch(/^\d+ m \(straight-line\)$/);
    expect(soba.openingStatus).toBe('open'); // from opening_hours '24/7' only

    const curry = data.places.find((p: any) => p.name === 'Nishi Curry House');
    expect(curry.osmId).toBe(4242002);
    expect(curry.openingStatus).toBeUndefined(); // no opening_hours tag -> "Hours unknown", never invented
  });

  it('a second query inside the 10 s outbound interval is 429 with zero outbound calls', async () => {
    const fetchFn = recordedFetch();
    const middleware = createPlacesProxyMiddleware({ enabled: true }, new OverpassPlacesAdapter({ fetchFn: fetchFn as any }));
    const first = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await middleware(first.req, first.res, first.next);
    const second = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await middleware(second.req, second.res, second.next);
    expect(first.response.statusCode).toBe(200);
    expect(second.response.statusCode).toBe(429);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('places off: 200 enabled:false, zero venues, zero outbound calls', async () => {
    const fetchFn = recordedFetch();
    const middleware = createPlacesProxyMiddleware({ enabled: false }, new OverpassPlacesAdapter({ fetchFn: fetchFn as any }));
    const { req, res, next, response } = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await middleware(req, res, next);
    expect(JSON.parse(response.body)).toMatchObject({ enabled: false, places: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('D2 keyless trio default switch (shipped ON after §9)', () => {
  it('ships ON after the §9 confirmation: unset env enables all three keyless providers', () => {
    expect(KEYLESS_TRIO_DEFAULT_ON).toBe(true);
    expect(resolvePlacesConfig({}).enabled).toBe(true);
    expect(resolveRouteConfig({}).enabled).toBe(true);
    expect(resolveWeatherConfig({}).enabled).toBe(true);
  });

  it('an explicit false still disables each provider after the flip', () => {
    expect(resolvePlacesConfig({ PLACES_LIVE_ENABLED: 'false' }).enabled).toBe(false);
    expect(resolveRouteConfig({ ROUTE_LIVE_ENABLED: '0' }).enabled).toBe(false);
    expect(resolveWeatherConfig({ WEATHER_LIVE_ENABLED: 'false' }).enabled).toBe(false);
  });

  it('explicit env always wins; the default applies only when unset', () => {
    expect(resolveTrioFlag(undefined, true)).toBe(true);
    expect(resolveTrioFlag('', true)).toBe(true);
    expect(resolveTrioFlag('false', true)).toBe(false);
    expect(resolveTrioFlag('0', true)).toBe(false);
    expect(resolveTrioFlag('true', false)).toBe(true);
    expect(resolveTrioFlag('1', false)).toBe(true);
    expect(resolveTrioFlag('yes', false)).toBe(false);
    expect(resolvePlacesConfig({ PLACES_LIVE_ENABLED: '1' }).enabled).toBe(true);
    expect(resolveRouteConfig({ ROUTE_LIVE_ENABLED: 'true' }).enabled).toBe(true);
    expect(resolveWeatherConfig({ WEATHER_LIVE_ENABLED: '1' }).enabled).toBe(true);
  });

  it('the adapter follows the proxy flag, so PLACES_LIVE_ENABLED=1 no longer throws inside the adapter', async () => {
    await expect(new OverpassPlacesAdapter({ liveEnabled: false }).searchNearby({
      location: { lat: 35.689, lng: 139.692 },
      category: 'restaurant',
    } as any)).rejects.toThrow(/disabled/);
    const fetchFn = recordedFetch();
    const places = await new OverpassPlacesAdapter({ liveEnabled: true, fetchFn: fetchFn as any }).searchNearby({
      location: { lat: 35.689, lng: 139.692 },
      category: 'restaurant',
    } as any);
    expect(places.length).toBe(2);
  });
});

describe('D2 status endpoints report exact outbound hosts for the consent copy', () => {
  it('places, route (driving + routed-foot) and weather hosts', async () => {
    const places = reqRes('/api/places/status');
    await createPlacesProxyMiddleware({ enabled: true })(places.req, places.res, places.next);
    // D7: the verified mirror is listed as the fallback host (no Google key in this test).
    expect(JSON.parse(places.response.body).outboundHosts).toEqual([
      { purpose: 'nearby places', host: 'overpass-api.de/api/interpreter' },
      { purpose: 'nearby places, fallback', host: 'maps.mail.ru/osm/tools/overpass/api/interpreter' },
    ]);

    const route = reqRes('/api/route/status');
    await createRouteProxyMiddleware({ enabled: true })(route.req, route.res, route.next);
    expect(JSON.parse(route.response.body).outboundHosts).toEqual([
      { purpose: 'driving routes', host: 'router.project-osrm.org' },
      { purpose: 'walking routes', host: 'routing.openstreetmap.de/routed-foot' },
    ]);

    const noFoot = reqRes('/api/route/status');
    await createRouteProxyMiddleware({ enabled: true, footBaseUrl: null })(noFoot.req, noFoot.res, noFoot.next);
    expect(JSON.parse(noFoot.response.body).outboundHosts).toEqual([
      { purpose: 'driving routes', host: 'router.project-osrm.org' },
    ]);

    const weather = reqRes('/api/weather/status');
    await createWeatherProxyMiddleware({ enabled: true })(weather.req, weather.res, weather.next);
    expect(JSON.parse(weather.response.body).outboundHosts).toEqual([{ purpose: 'weather', host: 'api.open-meteo.com' }]);
  });
});
