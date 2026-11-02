/**
 * S4-LIVE-DEPART: Nominatim Geocoder Tests
 * Governed by LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 *
 * Acceptance Checks:
 * 1. Geocodes query to coordinates [lat, lng] from recorded Nominatim response.
 * 2. Enforces rate limiting (≥1000ms interval between network requests).
 * 3. In-memory caching prevents duplicate fetches.
 * 4. Attribution included ("Data © OpenStreetMap contributors, ODbL 1.0").
 * 5. Returns null on empty or unresolvable query.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  NominatimGeocoder,
  NOMINATIM_ATTRIBUTION,
} from './nominatim-geocoder.js';

describe('S4-LIVE-DEPART: Nominatim Geocoder', () => {
  const recordedResponse = [
    {
      place_id: 123456,
      licence: 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright',
      osm_type: 'way',
      osm_id: 98765,
      lat: '37.7760',
      lon: '-122.4170',
      display_name: '100, Van Ness Avenue, Civic Center, San Francisco, California, 94102, United States',
      class: 'building',
      type: 'yes',
      importance: 0.5,
    },
  ];

  it('geocodes valid location query to coordinates with attribution', async () => {
    let capturedUrl = '';
    let capturedHeaders: any = {};
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      return {
        ok: true,
        json: async () => recordedResponse,
      };
    });

    const geocoder = new NominatimGeocoder({
      fetchFn: mockFetch as unknown as typeof fetch,
      minIntervalMs: 10, // speed up unit test
    });

    const result = await geocoder.geocode('100 Van Ness Ave, San Francisco, CA');

    expect(capturedUrl).toContain('q=100%20Van%20Ness%20Ave%2C%20San%20Francisco%2C%20CA');
    expect(capturedHeaders['User-Agent']).toContain('Yori');
    expect(result).not.toBeNull();
    expect(result!.coordinate).toEqual([37.776, -122.417]);
    expect(result!.attribution).toBe(NOMINATIM_ATTRIBUTION);
    expect(result!.fromCache).toBe(false);
  });

  it('uses in-memory cache to prevent duplicate network calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => recordedResponse,
    });

    const geocoder = new NominatimGeocoder({
      fetchFn: mockFetch as unknown as typeof fetch,
      minIntervalMs: 10,
    });

    const res1 = await geocoder.geocode('100 Van Ness Ave, San Francisco, CA');
    const res2 = await geocoder.geocode('100 Van Ness Ave, San Francisco, CA');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res1!.fromCache).toBe(false);
    expect(res2!.fromCache).toBe(true);
    expect(res2!.coordinate).toEqual(res1!.coordinate);
  });

  it('enforces rate limiting interval between successive uncached queries', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => recordedResponse,
    });

    const intervalMs = 150;
    const geocoder = new NominatimGeocoder({
      fetchFn: mockFetch as unknown as typeof fetch,
      minIntervalMs: intervalMs,
    });

    const t0 = Date.now();
    await geocoder.geocode('First Query');
    await geocoder.geocode('Second Query (distinct)');
    const elapsed = Date.now() - t0;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(intervalMs - 20); // allow slight timer jitter
  });

  it('returns null on empty response or blank query without error', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const geocoder = new NominatimGeocoder({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(await geocoder.geocode('')).toBeNull();
    expect(await geocoder.geocode('   ')).toBeNull();
    expect(await geocoder.geocode('Unknown Planet XYZ')).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
