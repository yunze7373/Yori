/**
 * Unit Tests for Navigate URL Builders & Grounding Verification (V5-FUEL / AC-212-1, AC-212-2, G2)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildGoogleMapsNavigateUrl,
  buildAppleMapsNavigateUrl,
  buildPlatformNavigateUrl,
  buildGroundedNavigateUrl,
} from './navigate-url.js';
import {
  createEvidenceBundle,
  GroundedRecommendationVerifier,
  type EvidenceRecord,
} from '../view-models/grounding.js';
import { globalDecisionLogger } from '../../adapters/model/decision-log.js';

describe('V5-FUEL: Navigate URL Builders (AC-212-1, AC-212-2)', () => {
  const coords = { lat: 37.7755, lng: -122.418 };
  const name = 'Metro Gas & Go';

  it('builds exact Google Maps Directions URL with pinned coordinates and encoding', () => {
    const url = buildGoogleMapsNavigateUrl({
      lat: coords.lat,
      lng: coords.lng,
      name,
      travelMode: 'driving',
      placeId: 'fuel-sf-1',
    });

    // Exact string verification
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=37.7755%2C-122.418&travelmode=driving&destination_place_id=fuel-sf-1'
    );
  });

  it('builds exact Apple Maps Navigation URL with pinned coordinates and encoding', () => {
    const url = buildAppleMapsNavigateUrl({
      lat: coords.lat,
      lng: coords.lng,
      name,
    });

    // Exact string verification
    expect(url).toBe('https://maps.apple.com/?daddr=37.7755,-122.418&dirflg=d&q=Metro%20Gas%20%26%20Go');
  });

  it('selects correct platform URL with iOS / Android / Desktop fallback', () => {
    const iosUrl = buildPlatformNavigateUrl({
      lat: coords.lat,
      lng: coords.lng,
      name,
      platform: 'ios',
    });
    expect(iosUrl).toContain('maps.apple.com');
    expect(iosUrl).toContain('daddr=37.7755,-122.418');

    const androidUrl = buildPlatformNavigateUrl({
      lat: coords.lat,
      lng: coords.lng,
      name,
      platform: 'android',
    });
    expect(androidUrl).toContain('google.com/maps/dir');
    expect(androidUrl).toContain('destination=37.7755%2C-122.418');

    const desktopUrl = buildPlatformNavigateUrl({
      lat: coords.lat,
      lng: coords.lng,
      name,
      platform: 'desktop',
    });
    expect(desktopUrl).toContain('google.com/maps/dir');
    expect(desktopUrl).toContain('destination=37.7755%2C-122.418');
  });
});

describe('V5-FUEL: Grounded Recommendation Verifier Gate for Navigation (G2 Negative Suite)', () => {
  const sceneClock = '2026-10-28T20:35:00.000Z';

  const validRecord: EvidenceRecord = {
    id: 'fuel-sf-1',
    provider: 'simulated-places',
    kind: 'poi',
    fetchedAt: '2026-10-28T20:35:00.000Z',
    provenance: 'simulated',
    fields: {
      name: 'Metro Gas & Go',
      coords: { lat: 37.7755, lng: -122.418 },
      category: 'gas_station',
      straightLineDistanceMeters: 140,
    },
  };

  const bundle = createEvidenceBundle('test-fuel-bundle', sceneClock, [validRecord]);

  beforeEach(() => {
    globalDecisionLogger.clear();
  });

  it('G2 Positive: valid candidate in bundle builds verified URL', () => {
    const validCandidate = {
      id: 'fuel-sf-1',
      name: 'Metro Gas & Go',
      coords: { lat: 37.7755, lng: -122.418 },
      sourceRef: { recordId: 'fuel-sf-1', field: 'name' },
    };

    const url = buildGroundedNavigateUrl(validCandidate, bundle, { platform: 'desktop' });
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=37.7755%2C-122.418&travelmode=driving&destination_place_id=fuel-sf-1'
    );
  });

  it('G2 Negative (1): tampered value fails closed -> returns undefined & logs redacted reason', () => {
    const tamperedCandidate = {
      id: 'fuel-sf-1',
      name: 'Tampered Gas Station',
      coords: { lat: 37.7755, lng: -122.418 },
      sourceRef: { recordId: 'fuel-sf-1', field: 'name' },
    };

    const url = buildGroundedNavigateUrl(tamperedCandidate, bundle);
    expect(url).toBeUndefined();

    const latest = globalDecisionLogger.getLatest()!;
    expect(latest).toBeDefined();
    expect(latest.outputReasonCodes).toContain('tampered_value');
    expect(latest.validationResult?.valid).toBe(false);
  });

  it('G2 Negative (2): missing ref fails closed -> returns undefined & logs redacted reason', () => {
    const missingRefCandidate = {
      id: 'fuel-sf-1',
      name: 'Metro Gas & Go',
      coords: { lat: 37.7755, lng: -122.418 },
      sourceRef: { recordId: 'fuel-sf-1', field: 'name' },
      fieldSourceRefs: {
        distance: { recordId: 'non-existent-record-id', field: 'distance' },
      },
    };

    const url = buildGroundedNavigateUrl(missingRefCandidate, bundle);
    expect(url).toBeUndefined();

    const latest = globalDecisionLogger.getLatest()!;
    expect(latest.outputReasonCodes).toContain('missing_ref');
  });

  it('G2 Negative (3): stale fetchedAt fails closed -> returns undefined & logs redacted reason', () => {
    const staleRecord: EvidenceRecord = {
      ...validRecord,
      id: 'stale-fuel-rec',
      fetchedAt: '2026-10-25T20:35:00.000Z', // 3 days ago (exceeds 24h freshness for POI)
    };
    const staleBundle = createEvidenceBundle('stale-bundle', sceneClock, [staleRecord]);

    const candidate = {
      id: 'stale-fuel-rec',
      name: 'Metro Gas & Go',
      coords: { lat: 37.7755, lng: -122.418 },
      sourceRef: { recordId: 'stale-fuel-rec', field: 'name' },
    };

    const url = buildGroundedNavigateUrl(candidate, staleBundle);
    expect(url).toBeUndefined();

    const latest = globalDecisionLogger.getLatest()!;
    expect(latest.outputReasonCodes).toContain('stale_record');
  });

  it('G2 Negative (4): simulated record mislabelled as live fails closed', () => {
    const verif = bundle.getRecord('fuel-sf-1');
    expect(verif?.provenance).toBe('simulated');

    // GroundedRecommendationVerifier verifyField checks provenance match
    const failResult = GroundedRecommendationVerifier.verifyField(
      { recordId: 'fuel-sf-1', field: 'name' },
      'Metro Gas & Go',
      bundle,
      'live' // expectedProvenance is live, but bundle has simulated
    );
    expect(failResult.valid).toBe(false);
    expect(failResult.reason).toBe('simulated_mislabelled_as_live');
  });

  it('G2 Negative (5): model-invented place fails closed -> returns undefined', () => {
    const inventedCandidate = {
      id: 'fuel-sf-999',
      name: 'Invented Mega Gas Station',
      coords: { lat: 37.779, lng: -122.419 },
      sourceRef: { recordId: 'fuel-sf-999', field: 'name' },
    };

    const url = buildGroundedNavigateUrl(inventedCandidate, bundle);
    expect(url).toBeUndefined();

    const latest = globalDecisionLogger.getLatest()!;
    expect(latest.outputReasonCodes).toContain('candidate_outside_bundle');
  });

  it('G2 Negative (6): candidate outside bundle fails closed', () => {
    const outsideCandidate = {
      id: 'fuel-la-1',
      name: 'Pacific Coast Petrol',
      coords: { lat: 34.053, lng: -118.242 },
      sourceRef: { recordId: 'fuel-la-1', field: 'name' },
    };

    const url = buildGroundedNavigateUrl(outsideCandidate, bundle);
    expect(url).toBeUndefined();
  });

  it('G2 Negative (7): forced verifier failure fails closed -> returns undefined', () => {
    const validCandidate = {
      id: 'fuel-sf-1',
      name: 'Metro Gas & Go',
      coords: { lat: 37.7755, lng: -122.418 },
      sourceRef: { recordId: 'fuel-sf-1', field: 'name' },
    };

    const url = buildGroundedNavigateUrl(validCandidate, bundle, { forceFail: true });
    expect(url).toBeUndefined();

    const latest = globalDecisionLogger.getLatest()!;
    expect(latest.outputReasonCodes).toContain('missing_ref');
  });
});
