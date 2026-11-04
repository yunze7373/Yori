import { describe, it, expect } from 'vitest';
import { createMemoryFact } from '../contracts/memory.js';
import { tasteSignals, bestTasteMatch } from './taste.js';
import { rankPlacesByConfirmedPreferences } from '../../adapters/providers/overpass-places-adapter.js';

const AT = '2026-11-04T03:00:00.000Z';
const learnedRamen = createMemoryFact(
  'learned_lunch_cuisine',
  { cuisine: 'ramen', count: 3, total: 4, lastSeen: AT },
  'learned',
  { source: 'observed', recordedAt: AT },
  AT
);
const toldSoba = createMemoryFact('taste_preference', 'soba', 'confirmed', { source: 'user_stated', recordedAt: AT }, AT);
const pendingSushi = createMemoryFact('taste_preference', 'sushi', 'pending', { source: 'user_feedback', recordedAt: AT }, AT);

const place = (name: string, cuisine: string, m: number, open = true) => ({
  placeId: name, name, cuisine, category: 'restaurant', source: 'live', fetchedAt: AT,
  coords: { lat: 35.69, lng: 139.69 }, straightLineDistanceMeters: m, straightLineDistanceLabel: `${m} m (straight-line)`,
  openingStatus: open ? 'open' : undefined,
}) as any;

const PLACES = [place('Near Cafe', 'cafe', 45), place('Mid Ramen', 'ramen', 125), place('Soba Corner', 'soba', 260)];

describe('HABIT-LEARN: ranking reads learned and user-stated memory', () => {
  it('a learned habit puts ramen first, with the learned explanation', () => {
    const ranked = rankPlacesByConfirmedPreferences(PLACES, [learnedRamen]);
    expect(ranked.map(p => p.name)).toEqual(['Mid Ramen', 'Near Cafe', 'Soba Corner']);
    expect(ranked[0]!.rankingExplanation).toBe('You often pick ramen · 3 of your last 4 lunches');
    expect(ranked[0]!.tasteSource).toBe('learned');
    expect(ranked[1]!.rankingExplanation).toBe('Open now · 45 m (straight-line)');
  });

  it('what the user told Yori wins over what Yori learned', () => {
    const ranked = rankPlacesByConfirmedPreferences(PLACES, [learnedRamen, toldSoba]);
    expect(ranked.map(p => p.name)).toEqual(['Soba Corner', 'Mid Ramen', 'Near Cafe']);
    expect(ranked[0]!.rankingExplanation).toBe('You told Yori you like soba');
    expect(ranked[1]!.rankingExplanation).toBe('You often pick ramen · 3 of your last 4 lunches');
  });

  it('pending proposals shape nothing', () => {
    expect(tasteSignals([pendingSushi])).toEqual([]);
    const ranked = rankPlacesByConfirmedPreferences([place('Sushi Bar', 'sushi', 300), ...PLACES], [pendingSushi]);
    expect(ranked[0]!.name).toBe('Near Cafe');
  });

  it('with no memory, ranking falls back to open now, then distance', () => {
    const ranked = rankPlacesByConfirmedPreferences([place('Closed Ramen', 'ramen', 20, false), ...PLACES], []);
    expect(ranked.map(p => p.name)).toEqual(['Near Cafe', 'Mid Ramen', 'Soba Corner', 'Closed Ramen']);
  });

  it('a learned fact with a malformed value is ignored', () => {
    const bad = createMemoryFact('learned_lunch_cuisine', 'ramen', 'learned', { source: 'observed', recordedAt: AT }, AT);
    expect(tasteSignals([bad])).toEqual([]);
  });

  it('bestTasteMatch picks the heavier signal', () => {
    const signals = tasteSignals([learnedRamen, createMemoryFact('favorite_cuisine', 'ramen', 'confirmed', { source: 'user_stated', recordedAt: AT }, AT)]);
    expect(bestTasteMatch(signals, { cuisine: 'ramen', name: 'Mid Ramen' })?.source).toBe('user_stated');
  });
});
