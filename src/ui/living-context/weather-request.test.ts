import { describe, it, expect } from 'vitest';
import { resolveWeatherCurrentUrl, roundFixCoordinate } from './weather-request.js';
import type { LocationStatus } from '../../adapters/providers/location-port.js';

const NOW = '2026-11-03T01:00:00.000Z';

function loc(partial: Partial<LocationStatus>): LocationStatus {
  return { status: 'available', source: 'geolocation', updatedAt: NOW, ...partial } as LocationStatus;
}

describe('D1 resolveWeatherCurrentUrl', () => {
  it('Live + granted fresh fix sends only the 3-decimal fix', () => {
    const url = resolveWeatherCurrentUrl('live', loc({ coords: { lat: 35.689487, lng: 139.691706 } }), 'granted');
    expect(url).toBe('/api/weather/current?coords=35.689%2C139.692');
    expect(url).not.toContain('35.689487');
    expect(url).not.toContain('139.691706');
  });

  it('Live with no consent, denied, stale or missing fix sends nothing (no demo-city fallback)', () => {
    expect(resolveWeatherCurrentUrl('live', loc({ status: 'prompt' }), 'prompt')).toBeNull();
    expect(resolveWeatherCurrentUrl('live', loc({ status: 'denied' }), 'denied')).toBeNull();
    expect(
      resolveWeatherCurrentUrl('live', loc({ status: 'unavailable', isStale: true, coords: { lat: 1, lng: 2 } }), 'granted')
    ).toBeNull();
    expect(resolveWeatherCurrentUrl('live', loc({ status: 'available' }), 'granted')).toBeNull();
    // A cached geolocation fix without granted consent is never sent.
    expect(resolveWeatherCurrentUrl('live', loc({ coords: { lat: 1, lng: 2 } }), 'prompt')).toBeNull();
    // Fixture coordinates are never treated as the device fix in Live.
    expect(resolveWeatherCurrentUrl('live', loc({ source: 'fixture', coords: { lat: 1, lng: 2 } }), 'granted')).toBeNull();
    expect(resolveWeatherCurrentUrl('live', loc({ coords: { lat: Number.NaN, lng: 2 } }), 'granted')).toBeNull();
  });

  it('Live accepts a location the user typed in, rounded the same way', () => {
    expect(resolveWeatherCurrentUrl('live', loc({ source: 'manual', coords: { lat: 34.052235, lng: -118.243683 } }), 'prompt')).toBe(
      '/api/weather/current?coords=34.052%2C-118.244'
    );
  });

  it('Demo (dev-only) keeps the coords-less demo-city request', () => {
    expect(resolveWeatherCurrentUrl('demo', loc({ status: 'prompt' }), 'prompt')).toBe('/api/weather/current');
  });

  it('roundFixCoordinate pads to 3 decimals and never prints -0.000', () => {
    expect(roundFixCoordinate(35.6)).toBe('35.600');
    expect(roundFixCoordinate(-0.0004)).toBe('0.000');
    expect(roundFixCoordinate(-122.41941)).toBe('-122.419');
  });
});
