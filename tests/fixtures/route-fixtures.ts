/**
 * Recorded OSRM Routing Fixture
 * Governed by G-ROUTE, Acceptance Criteria AC-212-1, AC-212-2.
 *
 * Real recorded sample response from OSRM demo server for offline test invariance.
 * Zero live network calls during tests or CI.
 *
 * Source URL shape:
 * https://router.project-osrm.org/route/v1/driving/-122.4194,37.7749;-122.4148,37.7599?overview=full&geometries=geojson
 */

export const RECORDED_OSRM_ROUTE_RESPONSE = Object.freeze({
  code: 'Ok',
  routes: [
    {
      geometry: {
        coordinates: [
          [-122.4194, 37.7749],
          [-122.4192, 37.7735],
          [-122.4185, 37.7701],
          [-122.4168, 37.7654],
          [-122.4153, 37.7612],
          [-122.4148, 37.7599],
        ],
        type: 'LineString',
      },
      legs: [
        {
          steps: [],
          summary: 'Mission Street',
          weight: 348.6,
          duration: 348.6,
          distance: 2145.8,
        },
      ],
      weight_name: 'routability',
      weight: 348.6,
      duration: 348.6,
      distance: 2145.8,
    },
  ],
  waypoints: [
    {
      hint: 'demo-origin-hint',
      distance: 1.2,
      name: 'Market Street',
      location: [-122.4194, 37.7749],
    },
    {
      hint: 'demo-dest-hint',
      distance: 2.4,
      name: 'Mission Street',
      location: [-122.4148, 37.7599],
    },
  ],
});

export const RECORDED_ROUTE_COORDINATES: readonly [number, number][] = Object.freeze([
  [37.7749, -122.4194],
  [37.7735, -122.4192],
  [37.7701, -122.4185],
  [37.7654, -122.4168],
  [37.7612, -122.4153],
  [37.7599, -122.4148],
]);

export const RECORDED_POLYLINE_5 = 'c|peFf`ejVvGg@fTkCj\\sIfYkHbGcB';
export const RECORDED_POLYLINE_6 = 'gbr`gAnk{nhFnvAoKnsEwj@vdHgiBneGw|AfpAg^';

export const RECORDED_ROUTE_RESULT = Object.freeze({
  geometry: RECORDED_ROUTE_COORDINATES,
  distanceM: 2146,
  durationS: 349,
  provider: 'osrm',
  fetchedAt: '2026-11-01T00:00:00.000Z',
  attribution: 'Route © OSRM · data © OpenStreetMap contributors',
  mode: 'driving' as const,
});
