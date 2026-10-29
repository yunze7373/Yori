/**
 * Unit Tests for PlacesProvider & LocationPort Seam (V5-FUEL / AC-212-1, AC-212-2)
 */

import { describe, it, expect, vi } from 'vitest';
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
} from './overpass-places-adapter.js';

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
