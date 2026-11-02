/**
 * S3-LIVE-LUNCH: Overpass Places Adapter & Ranking Unit Tests
 * Governed by LIVE_FIRST plan (PT:S3-LIVE-LUNCH).
 *
 * Acceptance Checks:
 * 1. Candidate IDs, coordinates, and fetchedAt come from provider records only.
 * 2. open-now is derived solely from opening_hours (deterministic cases; fail closed / undefined otherwise).
 * 3. ODbL/OSM attribution is attached.
 * 4. Ranking uses bounded rules + confirmed memory facts (taste preference / favorite cuisine).
 * 5. PLACES_LIVE_ENABLED=false fails closed without outbound network calls.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  OverpassPlacesAdapter,
  parseOverpassElements,
  parseDeterministicOpeningHours,
  rankPlacesByConfirmedPreferences,
  isPlacesLiveEnabled,
  OVERPASS_ATTRIBUTION,
  type OverpassElement,
} from './overpass-places-adapter.js';

describe('S3-LIVE-LUNCH: Overpass Places Adapter', () => {
  const userLoc = { lat: 37.7749, lng: -122.4194 };
  const fetchedAt = '2026-11-02T12:15:00.000Z';

  it('fails closed when PLACES_LIVE_ENABLED is off (default)', async () => {
    expect(isPlacesLiveEnabled()).toBe(false);
    const adapter = new OverpassPlacesAdapter();
    await expect(
      adapter.searchNearby({ location: userLoc, category: 'restaurant' })
    ).rejects.toThrow('Places live provider is disabled');
  });

  it('loads recorded Overpass fixture and maps candidates with real IDs, coordinates, fetchedAt, and ODbL attribution', () => {
    const fixturePath = path.resolve('tests/fixtures/overpass-places-fixture.json');
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const elements: OverpassElement[] = raw.elements;

    const items = parseOverpassElements(elements, 'restaurant', userLoc, fetchedAt);
    expect(items.length).toBe(4);

    for (const item of items) {
      expect(item.osmId).toBeGreaterThan(0);
      expect(item.placeId).toMatch(/^overpass-node-\d+$/);
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.coords.lat).toBeGreaterThan(37);
      expect(item.coords.lng).toBeLessThan(-122);
      expect(item.fetchedAt).toBe(fetchedAt);
      expect(item.attribution).toBe(OVERPASS_ATTRIBUTION);
      expect(item.source).toBe('live');
      expect(item.straightLineDistanceMeters).toBeGreaterThan(0);
      expect(item.straightLineDistanceLabel).toBeDefined();
    }
  });

  it('derives opening status deterministically from opening_hours without guessing', () => {
    // 12:15 PM on Monday 2026-11-02 (local time)
    const mondayNoon = new Date('2026-11-02T12:15:00');

    // 24/7 is open
    expect(parseDeterministicOpeningHours('24/7', mondayNoon)).toBe('open');

    // Mo-Fr 08:00-20:00 is open at 12:15
    expect(parseDeterministicOpeningHours('Mo-Fr 08:00-20:00', mondayNoon)).toBe('open');

    // Mo-Fr 08:00-11:00 is closed at 12:15
    expect(parseDeterministicOpeningHours('Mo-Fr 08:00-11:00', mondayNoon)).toBe('closed');

    // Complex / unparseable strings return undefined (Hours unknown, never estimated)
    expect(parseDeterministicOpeningHours('Mo-Fr sunrise-sunset', mondayNoon)).toBeUndefined();
    expect(parseDeterministicOpeningHours('By appointment only', mondayNoon)).toBeUndefined();
    expect(parseDeterministicOpeningHours(undefined, mondayNoon)).toBeUndefined();
  });

  it('omits venues without a provider name record; zero ratings and zero photos', () => {
    const rawElements: OverpassElement[] = [
      {
        id: 9001,
        type: 'node',
        lat: 37.775,
        lon: -122.418,
        tags: { amenity: 'restaurant' }, // Missing name tag
      },
      {
        id: 9002,
        type: 'node',
        lat: 37.776,
        lon: -122.417,
        tags: { name: 'Valid Cafe', amenity: 'cafe' },
      },
    ];

    const parsed = parseOverpassElements(rawElements, 'restaurant', userLoc, fetchedAt);
    expect(parsed.length).toBe(1);
    expect(parsed[0]!.name).toBe('Valid Cafe');
    expect((parsed[0] as any).rating).toBeUndefined();
    expect((parsed[0] as any).photoUrl).toBeUndefined();
  });

  it('ranks places using confirmed taste preferences before distance rule', () => {
    const fixturePath = path.resolve('tests/fixtures/overpass-places-fixture.json');
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const items = parseOverpassElements(raw.elements, 'restaurant', userLoc, fetchedAt);

    // With confirmed Japanese/Ramen taste
    const confirmedJapanese = [
      { key: 'taste_preference', value: 'Japanese or Ramen', status: 'confirmed' },
    ];
    const rankedJapanese = rankPlacesByConfirmedPreferences(items, confirmedJapanese);

    expect(rankedJapanese[0]!.name).toBe('Hayes Valley Ramen');
    expect(rankedJapanese[0]!.rankingExplanation).toContain('Matches your confirmed taste for');

    // Cold user with no confirmed taste facts: falls back to distance rule
    const rankedCold = rankPlacesByConfirmedPreferences(items, []);
    expect(rankedCold[0]!.name).toBe('Market Street Cafe'); // Closest straight-line distance
    // D2: it is also open now (OSM opening_hours), so the reason says so instead of "closest".
    expect(rankedCold[0]!.rankingExplanation).toBe('Open now · 113 m (straight-line)');
    expect(rankedCold.some(p => p.rankingExplanation.startsWith('Closest dining option · '))).toBe(true);
  });

  it('executes searchNearby using injected fetchFn with recorded response', async () => {
    const mockElements = [
      {
        id: 1234,
        type: 'node' as const,
        lat: 37.775,
        lon: -122.418,
        tags: { name: 'Recorded Bistro', amenity: 'restaurant', cuisine: 'bistro' },
      },
    ];

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elements: mockElements }),
    });

    const adapter = new OverpassPlacesAdapter({ fetchFn: mockFetch as unknown as typeof fetch });
    const results = await adapter.searchNearby({ location: userLoc, category: 'restaurant' });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('Recorded Bistro');
    expect(results[0]!.osmId).toBe(1234);
    expect(results[0]!.attribution).toBe(OVERPASS_ATTRIBUTION);
  });
});
