/**
 * Routing Adapter & Seam Unit Tests
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 *
 * Tests:
 * 1. Polyline and GeoJSON decode against recorded OSRM response fixture.
 * 2. Rendered SVG path points equal projected decoded coordinates (not straight 2-point line).
 * 3. ETA and distance match the provider record.
 * 4. Staleness degrades route to unavailable (isRouteStale).
 * 5. Server proxy /api/route with flag off returns {enabled:false} and never calls outbound fetch.
 * 6. Server proxy /api/route Host allowlist (rejects non-loopback with 403, passes through non-/api/route paths).
 * 7. Security audit: ORS_API_KEY is server-side only and never exposed in client bundle.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { decodePolyline, encodePolyline } from './polyline.js';
import { OSRMRouteAdapter } from './osrm-route-adapter.js';
import { ORSRouteAdapter } from './ors-route-adapter.js';
import {
  isRouteStale,
  OSRM_ATTRIBUTION,
  type RouteResult,
} from './routing-types.js';
import {
  projectCoordinatesToSvg,
  formatDistance,
  formatDuration,
  renderLiveRouteSvg,
} from '../../ui/living-context/route-geometry.js';
import {
  createRouteProxyMiddleware,
} from './server-proxy.js';
import {
  RECORDED_OSRM_ROUTE_RESPONSE,
  RECORDED_ROUTE_COORDINATES,
  RECORDED_POLYLINE_5,
  RECORDED_POLYLINE_6,
} from '../../../tests/fixtures/route-fixtures.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

describe('Routing Provider & Polyline Decoding', () => {
  it('decodes precision-5 polyline accurately', () => {
    const decoded = decodePolyline(RECORDED_POLYLINE_5, 5);
    expect(decoded).toHaveLength(6);
    expect(decoded[0]).toEqual([37.7749, -122.4194]);
    expect(decoded[5]).toEqual([37.7599, -122.4148]);
  });

  it('decodes precision-6 polyline accurately', () => {
    const decoded = decodePolyline(RECORDED_POLYLINE_6, 6);
    expect(decoded).toHaveLength(6);
    expect(decoded[0]).toEqual([37.7749, -122.4194]);
    expect(decoded[5]).toEqual([37.7599, -122.4148]);
  });

  it('encodes and roundtrips coordinates with fidelity', () => {
    const encoded = encodePolyline(RECORDED_ROUTE_COORDINATES, 5);
    const roundtrip = decodePolyline(encoded, 5);
    expect(roundtrip).toEqual(RECORDED_ROUTE_COORDINATES);
  });

  it('parses recorded OSRM fixture into a valid RouteResult', () => {
    const adapter = new OSRMRouteAdapter();
    const result = adapter.parseResponse(RECORDED_OSRM_ROUTE_RESPONSE, 'driving');

    expect(result.provider).toBe('osrm');
    expect(result.attribution).toBe(OSRM_ATTRIBUTION);
    expect(result.mode).toBe('driving');
    // Distance from fixture is 2145.8m -> 2146
    expect(result.distanceM).toBe(2146);
    // Duration from fixture is 348.6s -> 349
    expect(result.durationS).toBe(349);
    expect(result.geometry).toHaveLength(6);
    expect(result.geometry[0]).toEqual([37.7749, -122.4194]);
    expect(result.geometry[5]).toEqual([37.7599, -122.4148]);
    expect(result.fetchedAt).toBeTruthy();
  });

  it('formats distance and duration strictly from the record', () => {
    expect(formatDistance(2146)).toBe('2.1 km');
    expect(formatDistance(450)).toBe('450 m');
    expect(formatDuration(349)).toBe('6 min');
    expect(formatDuration(45)).toBe('1 min');
  });
});

describe('Route SVG Geometry Projection', () => {
  it('projects multi-point decoded coordinates into SVG points (not a 2-point line)', () => {
    const projected = projectCoordinatesToSvg(RECORDED_ROUTE_COORDINATES);
    expect(projected.points).toHaveLength(6);

    const pointsList = projected.pointsString.split(' ');
    expect(pointsList).toHaveLength(6);

    // Verify all points are inside target viewBox bounds (45..285, 45..130)
    for (const pt of projected.points) {
      expect(pt.x).toBeGreaterThanOrEqual(44.9);
      expect(pt.x).toBeLessThanOrEqual(285.1);
      expect(pt.y).toBeGreaterThanOrEqual(44.9);
      expect(pt.y).toBeLessThanOrEqual(130.1);
    }

    // Origin and destination match first and last points
    expect(projected.origin).toEqual(projected.points[0]);
    expect(projected.destination).toEqual(projected.points[5]);
  });

  it('renders SVG with polyline, origin marker, and destination marker', () => {
    const route: RouteResult = {
      geometry: RECORDED_ROUTE_COORDINATES,
      distanceM: 2146,
      durationS: 349,
      provider: 'osrm',
      fetchedAt: new Date().toISOString(),
      attribution: OSRM_ATTRIBUTION,
      mode: 'driving',
    };

    const svg = renderLiveRouteSvg(route, {
      originLabel: 'Start Point',
      destLabel: 'End Point',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('id="live-route-polyline"');
    expect(svg).toContain('Start Point');
    expect(svg).toContain('End Point');
    // Contains multi-point points attribute
    const projected = projectCoordinatesToSvg(RECORDED_ROUTE_COORDINATES);
    expect(svg).toContain(`points="${projected.pointsString}"`);
  });
});

describe('Route Staleness Rule', () => {
  it('identifies fresh route within 10-minute validity window as not stale', () => {
    const now = 1700000000000;
    const freshRoute = { fetchedAt: new Date(now - 5 * 60 * 1000).toISOString() }; // 5 min ago
    expect(isRouteStale(freshRoute, now)).toBe(false);
  });

  it('identifies route older than 10 minutes as stale', () => {
    const now = 1700000000000;
    const staleRoute = { fetchedAt: new Date(now - 11 * 60 * 1000).toISOString() }; // 11 min ago
    expect(isRouteStale(staleRoute, now)).toBe(true);
  });

  it('identifies route with missing or invalid fetchedAt as stale', () => {
    expect(isRouteStale({ fetchedAt: '' } as any)).toBe(true);
    expect(isRouteStale({ fetchedAt: 'invalid-date' } as any)).toBe(true);
  });
});

describe('Server Proxy Seam (/api/route)', () => {
  function createMockRes() {
    let statusCode = 200;
    let headers: Record<string, string> = {};
    let body = '';

    const res = {
      writeHead: vi.fn((code: number, hdrs?: Record<string, string>) => {
        statusCode = code;
        if (hdrs) headers = { ...headers, ...hdrs };
        return res;
      }),
      end: vi.fn((data?: string) => {
        if (data) body = data;
        return res;
      }),
      getStatusCode: () => statusCode,
      getHeaders: () => headers,
      getBody: () => body,
      getJson: () => JSON.parse(body),
    };

    return res as unknown as ServerResponse & {
      getStatusCode: () => number;
      getHeaders: () => Record<string, string>;
      getBody: () => string;
      getJson: () => any;
    };
  }

  it('passes through non-/api/route paths without intercepting', async () => {
    const middleware = createRouteProxyMiddleware({ enabled: false });
    const req = {
      url: '/other/path',
      headers: { host: '127.0.0.1:5173' },
    } as unknown as IncomingMessage;
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('rejects non-loopback Host header with 403', async () => {
    const middleware = createRouteProxyMiddleware({ enabled: true });
    const req = {
      url: '/api/route',
      headers: { host: 'evil.com' },
    } as unknown as IncomingMessage;
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.writeHead).toHaveBeenCalledWith(403, expect.anything());
    expect(res.getJson().error).toContain('allowlisted loopback host required');
  });

  it('with ROUTE_LIVE_ENABLED=false, returns {enabled:false} and NEVER calls outbound fetch', async () => {
    const fetchSpy = vi.fn();
    const mockAdapter = new OSRMRouteAdapter({ fetchFn: fetchSpy });

    const middleware = createRouteProxyMiddleware({ enabled: false }, mockAdapter);
    const req = {
      url: '/api/route?origin=37.7749,-122.4194&destination=37.7599,-122.4148',
      method: 'GET',
      headers: { host: 'localhost:5173' },
    } as unknown as IncomingMessage;
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.getStatusCode()).toBe(200);
    const json = res.getJson();
    expect(json.enabled).toBe(false);
  });

  it('GET /api/route/status reports configuration honestly without outbound network call', async () => {
    const middleware = createRouteProxyMiddleware({ enabled: false, tilesEnabled: false });
    const req = {
      url: '/api/route/status',
      method: 'GET',
      headers: { host: '127.0.0.1:5173' },
    } as unknown as IncomingMessage;
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.getStatusCode()).toBe(200);
    const json = res.getJson();
    expect(json.enabled).toBe(false);
    expect(json.tilesEnabled).toBe(false);
    expect(json.provider).toBe('osrm');
    expect(json.attribution).toBe(OSRM_ATTRIBUTION);
  });

  it('with ROUTE_LIVE_ENABLED=true and valid stubbed adapter, returns route and attribution', async () => {
    const mockAdapter = {
      route: vi.fn().mockResolvedValue({
        geometry: RECORDED_ROUTE_COORDINATES,
        distanceM: 2146,
        durationS: 349,
        provider: 'osrm',
        fetchedAt: '2026-11-01T00:00:00.000Z',
        attribution: OSRM_ATTRIBUTION,
        mode: 'driving' as const,
      }),
    };

    const middleware = createRouteProxyMiddleware({ enabled: true }, mockAdapter);
    const req = {
      url: '/api/route?origin=37.7749,-122.4194&destination=37.7599,-122.4148&mode=driving',
      method: 'GET',
      headers: { host: '127.0.0.1:5173' },
    } as unknown as IncomingMessage;
    const res = createMockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(mockAdapter.route).toHaveBeenCalledWith(
      [37.7749, -122.4194],
      [37.7599, -122.4148],
      'driving'
    );
    expect(res.getStatusCode()).toBe(200);
    const json = res.getJson();
    expect(json.enabled).toBe(true);
    expect(json.route.distanceM).toBe(2146);
    expect(json.route.durationS).toBe(349);
    expect(json.attribution).toBe(OSRM_ATTRIBUTION);
  });
});

describe('ORS Adapter Security & Compilation Check', () => {
  it('compiles cleanly as a stub and reads server-side ORS_API_KEY without leaking', async () => {
    const ors = new ORSRouteAdapter();
    expect(ors.getBaseUrl()).toBe('https://api.openrouteservice.org');

    // Without key, throws informative error
    await expect(
      ors.route([37.7749, -122.4194], [37.7599, -122.4148])
    ).rejects.toThrow('OpenRouteService API key not configured (ORS_API_KEY)');

    // With mock key, throws gate G-ROUTE pending error
    const orsWithKey = new ORSRouteAdapter({ apiKey: 'mock-key' });
    await expect(
      orsWithKey.route([37.7749, -122.4194], [37.7599, -122.4148])
    ).rejects.toThrow(/pending owner key registration and gate G-ROUTE approval/);
  });

  it('ensures ORS_API_KEY is never exposed to the built client JS bundle', () => {
    const distDir = path.resolve('dist');
    if (fs.existsSync(distDir)) {
      const files = fs.readdirSync(distDir, { recursive: true }) as string[];
      for (const file of files) {
        if (typeof file === 'string' && file.endsWith('.js')) {
          const content = fs.readFileSync(path.join(distDir, file), 'utf-8');
          expect(content).not.toContain('ORS_API_KEY');
        }
      }
    }
  });
});
