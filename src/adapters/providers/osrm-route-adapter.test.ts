/**
 * S3-LIVE-LUNCH: OSRM Route Adapter Walking Mode & Geometry Tests
 * Governed by LIVE_FIRST plan (PT:S3-LIVE-LUNCH).
 *
 * Acceptance Checks:
 * 1. Routing with mode=walking requests OSRM walking endpoint.
 * 2. Walking duration and distance are derived from provider geometry records.
 * 3. OSRM and OpenStreetMap attribution is visible.
 * 4. Geometry correctly decoded to coordinates.
 */

import { describe, it, expect, vi } from 'vitest';
import { OSRMRouteAdapter } from './osrm-route-adapter.js';
import { OSRM_ATTRIBUTION } from './routing-types.js';

describe('S3-LIVE-LUNCH: OSRM Route Adapter', () => {
  const origin: [number, number] = [37.7749, -122.4194];
  const destination: [number, number] = [37.7755, -122.418];

  const recordedWalkingResponse = {
    code: 'Ok',
    routes: [
      {
        geometry: {
          coordinates: [
            [-122.4194, 37.7749],
            [-122.4187, 37.7752],
            [-122.418, 37.7755],
          ],
          type: 'LineString',
        },
        legs: [
          {
            steps: [],
            summary: 'Grove Street',
            weight: 240,
            duration: 240,
            distance: 310,
          },
        ],
        weight_name: 'routability',
        weight: 240,
        duration: 240,
        distance: 310,
      },
    ],
    waypoints: [
      { location: [-122.4194, 37.7749], name: 'Start' },
      { location: [-122.418, 37.7755], name: 'Civic Center Diner' },
    ],
  };

  it('routes with mode=walking calling the walking profile endpoint', async () => {
    let requestedUrl = '';
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => recordedWalkingResponse,
      };
    });

    const adapter = new OSRMRouteAdapter({ fetchFn: mockFetch as unknown as typeof fetch });
    const result = await adapter.route(origin, destination, 'walking');

    expect(requestedUrl).toContain('/route/v1/walking/');
    expect(requestedUrl).toContain('-122.4194,37.7749;-122.418,37.7755');
    expect(result.mode).toBe('walking');
    expect(result.distanceM).toBe(310);
    expect(result.durationS).toBe(240);
    expect(result.provider).toBe('osrm');
    expect(result.attribution).toBe(OSRM_ATTRIBUTION);
    expect(result.geometry).toHaveLength(3);
    expect(result.geometry[0]).toEqual([37.7749, -122.4194]);
    expect(result.geometry[2]).toEqual([37.7755, -122.418]);
  });

  it('fails with clear error message when OSRM provider returns error code', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', message: 'No route could be found' }),
    });

    const adapter = new OSRMRouteAdapter({ fetchFn: mockFetch as unknown as typeof fetch });
    await expect(adapter.route(origin, destination, 'walking')).rejects.toThrow(
      'OSRM routing error: No route could be found'
    );
  });
});
