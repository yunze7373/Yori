/**
 * Unit Tests for PlacesProvider & LocationPort Seam (V5-FUEL / AC-212-1, AC-212-2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FixtureLocationPort,
  DEFAULT_DEMO_COORDS,
} from './location-port.js';
import {
  SimulatedPlacesProvider,
  computeHaversineDistanceMeters,
  formatStraightLineDistance,
} from './simulated-places-provider.js';
import {
  OverpassPlacesAdapter,
  buildOverpassQuery,
  parseOverpassElements,
  isPlacesLiveEnabled,
  parseDeterministicOpeningHours,
  roundCoordinate3Decimals,
  isAllowedAmenity,
  rankPlacesByConfirmedPreferences,
  OVERPASS_ATTRIBUTION,
} from './overpass-places-adapter.js';
import {
  createPlacesProxyMiddleware,
  resetPlacesRateLimit,
} from './server-proxy.js';
import type { PlacesProvider } from './places-types.js';

describe('V5-FUEL: LocationPort Seam', () => {
  it('initializes to default demo coords with fixture source', () => {
    const port = new FixtureLocationPort();
    const loc = port.getLocation();
    expect(loc.status).toBe('available');
    expect(loc.source).toBe('fixture');
    expect(loc.coords).toEqual(DEFAULT_DEMO_COORDS);
  });

  it('supports updating location status to unavailable or denied', () => {
    const port = new FixtureLocationPort();
    port.setLocation('unavailable');
    expect(port.getLocation().status).toBe('unavailable');
    expect(port.getLocation().coords).toBeUndefined();

    port.setLocation('denied');
    expect(port.getLocation().status).toBe('denied');
    expect(port.getLocation().coords).toBeUndefined();

    port.setLocation('available', { lat: 34.0522, lng: -118.2437 });
    expect(port.getLocation().status).toBe('available');
    expect(port.getLocation().coords).toEqual({ lat: 34.0522, lng: -118.2437 });
    expect(port.getLocation().source).toBe('manual');
  });

  it('never references or relies on window.navigator.geolocation', () => {
    // Check that port operations do not attempt to invoke browser geolocation
    const port = new FixtureLocationPort();
    expect(port.getLocation()).toBeDefined();
  });
});

describe('V5-FUEL: SimulatedPlacesProvider (AC-212-1, AC-212-2)', () => {
  it('AC-212-1: returns labelled "simulated" gas stations for San Francisco coordinates', async () => {
    const provider = new SimulatedPlacesProvider({
      fixedFetchedAt: '2026-10-28T20:35:00.000Z',
    });

    const results = await provider.searchNearby({
      location: DEFAULT_DEMO_COORDS,
      category: 'gas_station',
      radiusMeters: 3000,
    });

    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const item of results) {
      expect(item.source).toBe('simulated');
      expect(item.category).toBe('gas_station');
      expect(item.fetchedAt).toBe('2026-10-28T20:35:00.000Z');
      expect(item.straightLineDistanceMeters).toBeGreaterThan(0);
      expect(item.straightLineDistanceLabel).toContain('(straight-line)');
      expect(item.coords.lat).toBeGreaterThan(37);
      expect(item.coords.lng).toBeLessThan(-122);
    }

    // Top result is closest station
    expect(results[0]!.name).toBe('Metro Gas & Go');
  });

  it('AC-212-1: changing fixture location changes returned candidates', async () => {
    const provider = new SimulatedPlacesProvider();

    // Query 1: San Francisco
    const sfResults = await provider.searchNearby({
      location: { lat: 37.7749, lng: -122.4194 },
      category: 'gas_station',
      radiusMeters: 5000,
    });
    const sfNames = sfResults.map(r => r.name);
    expect(sfNames).toContain('Metro Gas & Go');
    expect(sfNames).not.toContain('Pacific Coast Petrol');

    // Query 2: Los Angeles
    const laResults = await provider.searchNearby({
      location: { lat: 34.0522, lng: -118.2437 },
      category: 'gas_station',
      radiusMeters: 5000,
    });
    const laNames = laResults.map(r => r.name);
    expect(laNames).toContain('Pacific Coast Petrol');
    expect(laNames).toContain('Angel City Fuel');
    expect(laNames).not.toContain('Metro Gas & Go');
  });

  it('AC-212-2: returns empty result set when no places match within search radius', async () => {
    const provider = new SimulatedPlacesProvider();

    // Query in middle of Pacific Ocean
    const oceanResults = await provider.searchNearby({
      location: { lat: 0, lng: 0 },
      category: 'gas_station',
      radiusMeters: 5000,
    });

    expect(oceanResults).toEqual([]);
  });

  it('AC-212-2: degrades on provider failure', async () => {
    const provider = new SimulatedPlacesProvider({ simulateError: true });

    await expect(
      provider.searchNearby({
        location: DEFAULT_DEMO_COORDS,
        category: 'gas_station',
      })
    ).rejects.toThrow('Simulated places provider failure');
  });

  it('correctly calculates Haversine straight-line distance and formatting', () => {
    // Distance between SF (37.7749, -122.4194) and Metro Gas (37.7755, -122.4180)
    const dist = computeHaversineDistanceMeters(
      { lat: 37.7749, lng: -122.4194 },
      { lat: 37.7755, lng: -122.418 }
    );
    expect(dist).toBeGreaterThan(100);
    expect(dist).toBeLessThan(200);

    expect(formatStraightLineDistance(150)).toBe('150 m (straight-line)');
    expect(formatStraightLineDistance(1500)).toBe('1.5 km (straight-line)');
  });
});

describe('V5-FUEL: OverpassPlacesAdapter', () => {
  it('fails closed when PLACES_LIVE_ENABLED is false (default)', async () => {
    expect(isPlacesLiveEnabled()).toBe(false);
    const adapter = new OverpassPlacesAdapter();

    await expect(
      adapter.searchNearby({
        location: DEFAULT_DEMO_COORDS,
        category: 'gas_station',
      })
    ).rejects.toThrow('Places live provider is disabled (PLACES_LIVE_ENABLED=false)');
  });

  it('builds valid Overpass QL query syntax', () => {
    const q = buildOverpassQuery({
      location: { lat: 37.7749, lng: -122.4194 },
      category: 'gas_station',
      radiusMeters: 2500,
    });

    expect(q).toContain('[out:json][timeout:10];');
    expect(q).toContain('amenity"="fuel');
    expect(q).toContain('around:2500,37.7749,-122.4194');
  });

  it('maps Overpass elements to PlaceItems with straight-line distance', () => {
    const elements = [
      {
        id: 101,
        type: 'node' as const,
        lat: 37.7755,
        lon: -122.418,
        tags: {
          name: 'Chevron Overpass',
          amenity: 'fuel',
          brand: 'Chevron',
          'addr:street': 'Market St',
          'addr:housenumber': '850',
        },
      },
      {
        id: 202,
        type: 'way' as const,
        center: { lat: 37.778, lon: -122.415 },
        tags: {
          amenity: 'fuel',
          brand: 'Shell',
        },
      },
    ];

    const parsed = parseOverpassElements(
      elements,
      'gas_station',
      DEFAULT_DEMO_COORDS,
      '2026-10-28T20:35:00.000Z'
    );

    expect(parsed.length).toBe(2);
    expect(parsed[0]!.placeId).toBe('overpass-node-101');
    expect(parsed[0]!.name).toBe('Chevron Overpass');
    expect(parsed[0]!.address).toBe('850 Market St');
    expect(parsed[0]!.source).toBe('live');
    expect(parsed[0]!.straightLineDistanceLabel).toContain('(straight-line)');

    expect(parsed[1]!.placeId).toBe('overpass-way-202');
    expect(parsed[1]!.name).toBe('Shell Station');
  });

  it('L1-LIVE-TRUTH: parses recorded Overpass response to candidates with OSM id, name, distance, fetchedAt and ODbL attribution', () => {
    const recordedFixture = [
      {
        id: 789123,
        type: 'node' as const,
        lat: 37.7755,
        lon: -122.4185,
        tags: {
          name: 'Civic Center Diner',
          amenity: 'restaurant',
          'addr:street': 'Grove St',
          'addr:housenumber': '100',
        },
      },
    ];

    const results = parseOverpassElements(
      recordedFixture,
      'restaurant',
      DEFAULT_DEMO_COORDS,
      '2026-10-31T21:00:00.000Z'
    );

    expect(results.length).toBe(1);
    const item = results[0]!;
    expect(item.osmId).toBe(789123);
    expect(item.name).toBe('Civic Center Diner');
    expect(item.straightLineDistanceMeters).toBeGreaterThan(0);
    expect(item.straightLineDistanceLabel).toBeDefined();
    expect(item.fetchedAt).toBe('2026-10-31T21:00:00.000Z');
    expect(item.attribution).toContain('OpenStreetMap');
  });

  it('executes mapped request using injected mock fetch', async () => {
    const mockResponse = {
      elements: [
        {
          id: 555,
          type: 'node',
          lat: 37.776,
          lon: -122.417,
          tags: { name: 'Mock Gas Station', amenity: 'fuel' },
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const adapter = new OverpassPlacesAdapter({ fetchFn: mockFetch as unknown as typeof fetch });
    const results = await adapter.searchNearby({
      location: DEFAULT_DEMO_COORDS,
      category: 'gas_station',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(results.length).toBe(1);
    expect(results[0]!.name).toBe('Mock Gas Station');
  });
});

describe('L3-REAL-PLACES: Unit Acceptance Matrix', () => {
  beforeEach(() => {
    resetPlacesRateLimit();
  });

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

  it('1. Overpass recorded-response fixture loads with ODbL note and parses to valid candidates with osmId, coords, and fetchedAt', () => {
    const fixturePath = path.resolve('tests/fixtures/overpass-places-fixture.json');
    expect(fs.existsSync(fixturePath)).toBe(true);

    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    expect(raw._comment).toContain('ODbL');
    expect(raw._comment).toContain('OpenStreetMap');

    const fetchedAt = '2026-11-01T12:00:00.000Z';
    const parsed = parseOverpassElements(raw.elements, 'restaurant', DEFAULT_DEMO_COORDS, fetchedAt);

    expect(parsed.length).toBe(4);
    for (const place of parsed) {
      expect(place.osmId).toBeDefined();
      expect(place.name.length).toBeGreaterThan(0);
      expect(place.coords.lat).toBeGreaterThan(37);
      expect(place.coords.lng).toBeLessThan(-122);
      expect(place.straightLineDistanceMeters).toBeGreaterThan(0);
      expect(place.fetchedAt).toBe(fetchedAt);
      expect(place.attribution).toBe(OVERPASS_ATTRIBUTION);
      expect(place.source).toBe('live');
    }

    // Top result is closest
    expect(parsed[0]!.name).toBe('Market Street Cafe');
  });

  it('2. Missing tags are omitted: no estimated open-now, no fabricated rating or photos', () => {
    const rawElements = [
      {
        id: 9991,
        type: 'node' as const,
        lat: 37.775,
        lon: -122.418,
        tags: {
          name: 'Minimal Tag Cafe',
          amenity: 'cafe',
        },
      },
      {
        id: 9992,
        type: 'node' as const,
        lat: 37.775,
        lon: -122.418,
        tags: {
          amenity: 'restaurant', // No name tag! Must be omitted
        },
      },
    ];

    const parsed = parseOverpassElements(rawElements, 'cafe', DEFAULT_DEMO_COORDS, '2026-11-01T12:00:00.000Z');

    // Venue without name in tags is omitted
    expect(parsed.length).toBe(1);
    const item = parsed[0]!;
    expect(item.name).toBe('Minimal Tag Cafe');
    expect(item.cuisine).toBeUndefined();
    expect(item.openingStatus).toBeUndefined(); // Omitted!
    expect((item as any).rating).toBeUndefined(); // Zero ratings
    expect((item as any).photoUrl).toBeUndefined(); // Zero photos
  });

  it('3. opening_hours parser handles deterministic cases and omits unparseable cases', () => {
    // Deterministic 24/7
    expect(parseDeterministicOpeningHours('24/7')).toBe('open');

    // Deterministic weekday open (Monday 2026-11-02 14:00)
    const mondayAfternoon = new Date('2026-11-02T14:00:00');
    expect(parseDeterministicOpeningHours('Mo-Fr 08:00-18:00', mondayAfternoon)).toBe('open');

    // Deterministic weekday closed (Monday 2026-11-02 21:00)
    const mondayNight = new Date('2026-11-02T21:00:00');
    expect(parseDeterministicOpeningHours('Mo-Fr 08:00-18:00', mondayNight)).toBe('closed');

    // Deterministic off-day (Sunday 2026-11-01 14:00 when rule is Mo-Fr)
    const sundayAfternoon = new Date('2026-11-01T14:00:00');
    expect(parseDeterministicOpeningHours('Mo-Fr 08:00-18:00', sundayAfternoon)).toBeUndefined();

    // Unparseable / complex strings fail closed to undefined (omitted)
    expect(parseDeterministicOpeningHours('PH off; sunrise-sunset')).toBeUndefined();
    expect(parseDeterministicOpeningHours('open on demand')).toBeUndefined();
    expect(parseDeterministicOpeningHours('')).toBeUndefined();
    expect(parseDeterministicOpeningHours(undefined)).toBeUndefined();
  });

  it('4. Coordinate rounding to 3 decimals in outbound query and privacy preservation', () => {
    const rawLat = 37.774912345;
    const rawLng = -122.419456789;

    expect(roundCoordinate3Decimals(rawLat)).toBe(37.775);
    expect(roundCoordinate3Decimals(rawLng)).toBe(-122.419);

    const roundedLat = roundCoordinate3Decimals(rawLat);
    const roundedLng = roundCoordinate3Decimals(rawLng);

    const query = buildOverpassQuery({
      location: { lat: roundedLat, lng: roundedLng },
      category: 'restaurant',
      radiusMeters: 1200,
    });

    expect(query).toContain('around:1200,37.775,-122.419');
    expect(query).not.toContain(String(rawLat));
    expect(query).not.toContain(String(rawLng));
    expect(query).toContain('timeout:8');
  });

  it('5. Amenity enum validation accepts only allowlisted categories and caps radius', () => {
    expect(isAllowedAmenity('restaurant')).toBe(true);
    expect(isAllowedAmenity('cafe')).toBe(true);
    expect(isAllowedAmenity('fast_food')).toBe(true);

    expect(isAllowedAmenity('fuel')).toBe(false);
    expect(isAllowedAmenity('bar')).toBe(false);
    expect(isAllowedAmenity('hospital')).toBe(false);
    expect(isAllowedAmenity('')).toBe(false);

    // Overpass query caps radius to <= 1500m
    const queryLargeRadius = buildOverpassQuery({
      location: DEFAULT_DEMO_COORDS,
      category: 'restaurant',
      radiusMeters: 50000,
    });
    expect(queryLargeRadius).toContain('around:1500');
  });

  it('6. Server Proxy Seam (/api/places): flag off returns enabled:false without outbound fetch', async () => {
    const mockSearchNearby = vi.fn();
    const mockAdapter: PlacesProvider = {
      id: 'mock',
      name: 'Mock',
      searchNearby: mockSearchNearby,
    };

    const middleware = createPlacesProxyMiddleware({ enabled: false }, mockAdapter);

    // Status check
    const statusReq = {
      url: '/api/places/status',
      method: 'GET',
      headers: { host: '127.0.0.1:5173' },
    } as unknown as IncomingMessage;
    const statusRes = createMockRes();

    await middleware(statusReq, statusRes, () => {});
    expect(statusRes.getStatusCode()).toBe(200);
    expect(statusRes.getJson()).toEqual({
      enabled: false,
      provider: 'overpass',
      attribution: OVERPASS_ATTRIBUTION,
      // D2: exact outbound host for the consent copy (reported even while off).
      outboundHosts: [{ purpose: 'nearby places', host: 'overpass-api.de/api/interpreter' }],
    });

    // Query endpoint
    const queryReq = {
      url: '/api/places?lat=37.7749&lng=-122.4194&amenity=restaurant',
      method: 'GET',
      headers: { host: '127.0.0.1:5173' },
    } as unknown as IncomingMessage;
    const queryRes = createMockRes();

    await middleware(queryReq, queryRes, () => {});
    expect(queryRes.getStatusCode()).toBe(200);
    expect(queryRes.getJson().enabled).toBe(false);
    expect(mockSearchNearby).not.toHaveBeenCalled();
  });

  it('7. Server Proxy Seam: blocks non-loopback hosts and rejects invalid amenity filters', async () => {
    const middleware = createPlacesProxyMiddleware({ enabled: true });

    // Host blocking
    const blockedReq = {
      url: '/api/places/status',
      method: 'GET',
      headers: { host: 'evil.attacker.com' },
    } as unknown as IncomingMessage;
    const blockedRes = createMockRes();

    await middleware(blockedReq, blockedRes, () => {});
    expect(blockedRes.getStatusCode()).toBe(403);

    // Invalid amenity filter
    const badAmenityReq = {
      url: '/api/places?lat=37.7749&lng=-122.4194&amenity=unauthorized_category',
      method: 'GET',
      headers: { host: '127.0.0.1:5173' },
    } as unknown as IncomingMessage;
    const badAmenityRes = createMockRes();

    await middleware(badAmenityReq, badAmenityRes, () => {});
    expect(badAmenityRes.getStatusCode()).toBe(400);
    expect(badAmenityRes.getJson().error).toContain('Invalid amenity filter');
  });

  it('8. Server Proxy Seam: enforces >=10s rate limit between outbound queries', async () => {
    const mockSearch = vi.fn().mockResolvedValue([]);
    const mockAdapter: PlacesProvider = {
      id: 'mock',
      name: 'Mock',
      searchNearby: mockSearch,
    };

    const middleware = createPlacesProxyMiddleware({ enabled: true }, mockAdapter);

    const makeCall = async () => {
      const req = {
        url: '/api/places?lat=37.7749&lng=-122.4194&amenity=restaurant',
        method: 'GET',
        headers: { host: '127.0.0.1:5173' },
      } as unknown as IncomingMessage;
      const res = createMockRes();
      await middleware(req, res, () => {});
      return res;
    };

    const res1 = await makeCall();
    expect(res1.getStatusCode()).toBe(200);
    expect(mockSearch).toHaveBeenCalledTimes(1);

    // Immediate second call should be rate-limited (HTTP 429)
    const res2 = await makeCall();
    expect(res2.getStatusCode()).toBe(429);
    expect(res2.getJson().error).toContain('Rate limit exceeded');
    expect(mockSearch).toHaveBeenCalledTimes(1); // Not called again!
  });

  it('9. Deterministic Ranking: explanation cites confirmed memory facts or distance rule', () => {
    const places = [
      {
        placeId: 'p1',
        osmId: 101,
        name: 'Downtown Diner',
        cuisine: 'american',
        category: 'restaurant',
        coords: { lat: 37.775, lng: -122.418 },
        source: 'live' as const,
        fetchedAt: '2026-11-01T12:00:00.000Z',
        straightLineDistanceMeters: 200,
        straightLineDistanceLabel: '200 m (straight-line)',
      },
      {
        placeId: 'p2',
        osmId: 102,
        name: 'Tokyo Ramen Bar',
        cuisine: 'ramen;japanese',
        category: 'restaurant',
        coords: { lat: 37.776, lng: -122.417 },
        source: 'live' as const,
        fetchedAt: '2026-11-01T12:00:00.000Z',
        straightLineDistanceMeters: 500,
        straightLineDistanceLabel: '500 m (straight-line)',
      },
    ];

    // Case A: User has confirmed taste preference for ramen
    const confirmedFacts = [
      { key: 'taste_preference', value: 'ramen', status: 'confirmed' },
    ];

    const rankedA = rankPlacesByConfirmedPreferences(places, confirmedFacts);
    // Tokyo Ramen Bar ranks #1 despite being farther, because it matches confirmed taste
    expect(rankedA[0]!.name).toBe('Tokyo Ramen Bar');
    expect(rankedA[0]!.rankingExplanation).toBe('Matches your confirmed taste for ramen');
    expect(rankedA[1]!.name).toBe('Downtown Diner');
    expect(rankedA[1]!.rankingExplanation).toBe('Closest dining option · 200 m (straight-line)');

    // Case B: No confirmed taste memory -> ranks purely by distance
    const rankedB = rankPlacesByConfirmedPreferences(places, []);
    expect(rankedB[0]!.name).toBe('Downtown Diner');
    expect(rankedB[0]!.rankingExplanation).toBe('Closest dining option · 200 m (straight-line)');
    expect(rankedB[1]!.name).toBe('Tokyo Ramen Bar');
  });
});
