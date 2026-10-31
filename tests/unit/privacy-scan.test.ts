import { describe, it, expect } from 'vitest';
import { isFixtureCoord } from '../../scripts/publish/privacy-scan.js';

describe('Privacy Scanner isFixtureCoord (GeoJSON order-agnostic)', () => {
  it('accepts fixture coordinates in [lat, lon] order', () => {
    // San Francisco
    expect(isFixtureCoord(37.7749, -122.4194)).toBe(true);
    // Los Angeles
    expect(isFixtureCoord(34.0522, -118.2437)).toBe(true);
    // Tokyo (general)
    expect(isFixtureCoord(35.6764, 139.65)).toBe(true);
    // Tokyo (Shinjuku)
    expect(isFixtureCoord(35.6895, 139.6917)).toBe(true);
    // Seattle
    expect(isFixtureCoord(47.6062, -122.3321)).toBe(true);
  });

  it('accepts fixture coordinates in GeoJSON [lon, lat] order', () => {
    // San Francisco in GeoJSON order [lng, lat]
    expect(isFixtureCoord(-122.4194, 37.7749)).toBe(true);
    // Mission Dolores in SF cluster [lng, lat]
    expect(isFixtureCoord(-122.4148, 37.7599)).toBe(true);
    // Los Angeles in GeoJSON order [lng, lat]
    expect(isFixtureCoord(-118.2437, 34.0522)).toBe(true);
    // Tokyo in GeoJSON order [lng, lat]
    expect(isFixtureCoord(139.65, 35.6764)).toBe(true);
    // Seattle in GeoJSON order [lng, lat]
    expect(isFixtureCoord(-122.3321, 47.6062)).toBe(true);
  });

  it('rejects coordinates outside allowed fixture zones regardless of order', () => {
    // Non-fixture points (0, 0 or offset coordinates)
    expect(isFixtureCoord(0, 0)).toBe(false);
    expect(isFixtureCoord(10.5, 20.5)).toBe(false);
    expect(isFixtureCoord(20.5, 10.5)).toBe(false);

    // Coordinate outside SF threshold (> 0.05 deg difference)
    const sfLatShifted = 37.7749 + 0.1;
    const sfLon = -122.4194;
    expect(isFixtureCoord(sfLatShifted, sfLon)).toBe(false);
    expect(isFixtureCoord(sfLon, sfLatShifted)).toBe(false);
  });
});
