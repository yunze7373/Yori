/**
 * S3-LIVE-LUNCH: RestaurantDetailVM Derivation Tests
 * Governed by LIVE_FIRST plan (PT:S3-LIVE-LUNCH).
 *
 * Acceptance Checks:
 * 1. Candidate IDs, coords, fetchedAt come from provider records only.
 * 2. open-now is derived solely from opening_hours ('Open now' | 'Closed' | 'Hours unknown'); never guessed or estimated.
 * 3. ODbL/OSM attribution is visible in attribution and simulatedNotice.
 * 4. Zero ratings, zero stock photos (local labelled SVG illustration only).
 * 5. Stable accepted state across ticks within the same calendar day via isPlanAccepted.
 */

import { describe, it, expect } from 'vitest';
import { deriveRestaurantDetailVM, formatCuisineBasis, formatCuisineLabel } from './restaurant-detail-vm.js';
import { isPlanAccepted } from './home-vm.js';
import type { PreparedPlan } from '../../core/contracts/index.js';

describe('S3-LIVE-LUNCH: RestaurantDetailVM Derivation', () => {
  const baseLiveLunchPlan: PreparedPlan = {
    id: 'plan-lunch-20261102121500',
    intentId: 'lunch',
    headline: 'Lunch options near you',
    timezone: 'UTC',
    requiresConfirmation: false,
    createdAt: '2026-11-02T12:00:00.000Z',
    why: {
      derivation: 'Nearby dining options',
      evidenceSignals: [],
      memoryFactsUsed: [],
    },
    optionsOrSteps: [
      {
        id: 'opt-1-civic-center-diner',
        recordId: 'overpass-node-1001',
        label: 'Civic Center Diner (American) · 250m',
        name: 'Civic Center Diner',
        cuisine: 'american',
        coords: { lat: 37.7755, lng: -122.418 },
        straightLineDistanceMeters: 250,
        straightLineDistanceLabel: '250m',
        openingStatus: 'open',
        openNow: true,
        osmId: 1001,
        fetchedAt: '2026-11-02T12:15:00.000Z',
        attribution: 'OpenStreetMap via Overpass (ODbL)',
        requiresConfirmation: false,
      } as any,
      {
        id: 'opt-2-hayes-ramen',
        recordId: 'overpass-node-1002',
        label: 'Hayes Ramen (Japanese) · 450m',
        name: 'Hayes Ramen',
        cuisine: 'japanese',
        coords: { lat: 37.776, lng: -122.417 },
        straightLineDistanceMeters: 450,
        straightLineDistanceLabel: '450m',
        openingStatus: 'closed',
        openNow: false,
        osmId: 1002,
        fetchedAt: '2026-11-02T12:15:00.000Z',
        attribution: 'OpenStreetMap via Overpass (ODbL)',
        requiresConfirmation: false,
      } as any,
      {
        id: 'opt-3-mysterious-bistro',
        recordId: 'overpass-node-1003',
        label: 'Mysterious Bistro (French) · 600m',
        name: 'Mysterious Bistro',
        cuisine: 'french',
        coords: { lat: 37.777, lng: -122.416 },
        straightLineDistanceMeters: 600,
        straightLineDistanceLabel: '600m',
        openingStatus: undefined, // No opening_hours tag!
        osmId: 1003,
        fetchedAt: '2026-11-02T12:15:00.000Z',
        attribution: 'OpenStreetMap via Overpass (ODbL)',
        requiresConfirmation: false,
      } as any,
    ],
  };

  it('preserves candidate IDs, coordinates, and fetchedAt strictly from provider record', () => {
    const vm = deriveRestaurantDetailVM({
      candidateId: 'opt-1-civic-center-diner',
      plan: baseLiveLunchPlan,
      spatialEvidence: null,
      isLive: true,
    });

    expect(vm.id).toBe('opt-1-civic-center-diner');
    expect(vm.name).toBe('Civic Center Diner');
    expect(vm.osmId).toBe(1001);
    expect(vm.coords).toEqual({ lat: 37.7755, lng: -122.418 });
    expect(vm.fetchedAt).toBe('2026-11-02T12:15:00.000Z');
  });

  it('derives "Open now" chip when openingStatus is open', () => {
    const vm = deriveRestaurantDetailVM({
      candidateId: 'opt-1-civic-center-diner',
      plan: baseLiveLunchPlan,
      spatialEvidence: null,
      isLive: true,
    });

    expect(vm.attributeChips).toContain('Open now');
    expect(vm.attributeChips).not.toContain('Hours unknown');
    expect(vm.attributeChips).not.toContain('Closed');
  });

  it('derives "Closed" chip when openingStatus is closed', () => {
    const vm = deriveRestaurantDetailVM({
      candidateId: 'opt-2-hayes-ramen',
      plan: baseLiveLunchPlan,
      spatialEvidence: null,
      isLive: true,
    });

    expect(vm.attributeChips).toContain('Closed');
    expect(vm.attributeChips).not.toContain('Open now');
    expect(vm.attributeChips).not.toContain('Hours unknown');
  });

  it('derives "Hours unknown" chip when openingStatus is undefined (never estimates)', () => {
    const vm = deriveRestaurantDetailVM({
      candidateId: 'opt-3-mysterious-bistro',
      plan: baseLiveLunchPlan,
      spatialEvidence: null,
      isLive: true,
    });

    expect(vm.attributeChips).toContain('Hours unknown');
    expect(vm.attributeChips).not.toContain('Open now');
    expect(vm.attributeChips).not.toContain('Closed');
  });

  it('displays ODbL attribution clearly in attribution and simulatedNotice', () => {
    const vm = deriveRestaurantDetailVM({
      candidateId: 'opt-1-civic-center-diner',
      plan: baseLiveLunchPlan,
      spatialEvidence: null,
      isLive: true,
    });

    expect(vm.attribution).toBe('OpenStreetMap via Overpass (ODbL)');
    expect(vm.simulatedNotice).toContain('OpenStreetMap via Overpass (ODbL)');
    expect(vm.simulatedNotice).toContain('live nearby dining');
  });

  it('contains zero star ratings, review counts, or remote stock photos', () => {
    const vm = deriveRestaurantDetailVM({
      candidateId: 'opt-1-civic-center-diner',
      plan: baseLiveLunchPlan,
      spatialEvidence: null,
      isLive: true,
    });

    const serialized = JSON.stringify(vm);
    expect(serialized).not.toContain('★');
    expect(serialized).not.toContain('stars');
    expect(serialized).not.toContain('reviewCount');
    expect(serialized).not.toContain('rating');
    expect(vm.photo.svgMarkup).toMatch(/^<svg/);
    expect(vm.photo.svgMarkup).not.toContain('<image');
    expect(vm.photo.svgMarkup).not.toContain('https://');
    expect(vm.photo.svgMarkup).not.toContain('http://localhost');
    expect(vm.photo.svgMarkup).not.toContain('.jpg');
    expect(vm.photo.svgMarkup).not.toContain('.png');
  });

  it('isPlanAccepted ensures accepted state is stable across ticks within the same calendar day', () => {
    const initialPlan = {
      id: 'plan-lunch-20261102121500',
      intentId: 'lunch',
      headline: 'Lunch options near you',
    } as unknown as PreparedPlan;

    // User accepted at 12:15:00
    const acceptedPlanIds = ['plan-lunch-20261102121500'];
    expect(isPlanAccepted(initialPlan, acceptedPlanIds)).toBe(true);

    // 60s later: clock tick advances asOf to 12:16:00
    const nextTickPlan = {
      id: 'plan-lunch-20261102121600',
      intentId: 'lunch',
      headline: 'Lunch options near you',
    } as unknown as PreparedPlan;
    expect(isPlanAccepted(nextTickPlan, acceptedPlanIds)).toBe(true);

    // Next calendar day: clock tick advances to 2026-11-03 12:15:00 -> unaccepted
    const nextDayPlan = {
      id: 'plan-lunch-20261103121500',
      intentId: 'lunch',
      headline: 'Lunch options near you',
    } as unknown as PreparedPlan;
    expect(isPlanAccepted(nextDayPlan, acceptedPlanIds)).toBe(false);
  });
});

describe('UI-QUIET-PRECISION increment 2: cuisine basis reads as plain English', () => {
  it.each([
    ['italian', 'Italian · close to you'],
    ['indian', 'Indian · close to you'],
    ['ramen;japanese', 'Ramen · close to you'],
    ['cafe', 'Cafe · close to you'],
    ['fast_food', 'Fast food · close to you'],
    ['  sushi ; japanese ', 'Sushi · close to you'],
    [undefined, 'Close to you'],
    ['', 'Close to you'],
    [';', 'Close to you'],
  ])('%s -> %s', (raw, expected) => {
    expect(formatCuisineBasis(raw)).toBe(expected);
  });

  it('never yields the article grammar ("A italian spot")', () => {
    for (const raw of ['italian', 'indian', 'american', 'ramen;japanese']) {
      expect(formatCuisineBasis(raw)).not.toMatch(/^An? /);
    }
  });

  it('formatCuisineLabel keeps only the first OSM token', () => {
    expect(formatCuisineLabel('ramen;japanese')).toBe('Ramen');
    expect(formatCuisineLabel('coffee_shop')).toBe('Coffee shop');
    expect(formatCuisineLabel(undefined)).toBeUndefined();
  });
});
