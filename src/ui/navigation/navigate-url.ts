/**
 * Navigate URL Builders (V5-FUEL / LIVING_CONTEXT_V2.md §10.4, AC-212-1, AC-212-2, G2)
 *
 * Implements auditable Google Maps and Apple Maps navigation URL builders.
 * Features:
 * - Exact coordinates and encoding (pinned and verified).
 * - Desktop, iOS, and Android platform selection and fallback.
 * - Non-skippable GroundedRecommendationVerifier gate: if verification fails
 *   (tampered value, missing ref, stale record, simulated mislabelled as live,
 *   candidate outside bundle, or forced failure), returns undefined so no URL
 *   can be opened.
 * - Redacted failure logging via globalDecisionLogger.
 */

import type { EvidenceBundle, SourceRef } from '../view-models/grounding.js';
import { GroundedRecommendationVerifier } from '../view-models/grounding.js';

export type NavigatePlatform = 'ios' | 'android' | 'desktop';

export interface NavigateCoords {
  readonly lat: number;
  readonly lng: number;
}

export interface GoogleMapsNavigateOptions {
  readonly lat: number;
  readonly lng: number;
  readonly name?: string;
  readonly placeId?: string;
  readonly travelMode?: 'driving' | 'walking' | 'transit';
}

export interface AppleMapsNavigateOptions {
  readonly lat: number;
  readonly lng: number;
  readonly name?: string;
}

/**
 * Builds Google Maps Directions URL per LIVING_CONTEXT_V2.md §10.4:
 * `https://www.google.com/maps/dir/?api=1&destination=<lat,lng>`
 */
export function buildGoogleMapsNavigateUrl(options: GoogleMapsNavigateOptions): string {
  const destination = `${options.lat}%2C${options.lng}`;
  let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  if (options.travelMode) {
    url += `&travelmode=${encodeURIComponent(options.travelMode)}`;
  } else {
    url += '&travelmode=driving';
  }
  if (options.placeId) {
    url += `&destination_place_id=${encodeURIComponent(options.placeId)}`;
  }
  return url;
}

/**
 * Builds Apple Maps Navigation URL per LIVING_CONTEXT_V2.md §10.4:
 * `https://maps.apple.com/?daddr=<lat,lng>&dirflg=d`
 */
export function buildAppleMapsNavigateUrl(options: AppleMapsNavigateOptions): string {
  const daddr = `${options.lat},${options.lng}`;
  let url = `https://maps.apple.com/?daddr=${daddr}&dirflg=d`;
  if (options.name) {
    url += `&q=${encodeURIComponent(options.name)}`;
  }
  return url;
}

/**
 * Selects and builds the navigation URL based on target platform.
 * Fallback policy:
 * - ios -> Apple Maps
 * - android / desktop -> Google Maps (universal web / app intent)
 */
export function buildPlatformNavigateUrl(options: {
  lat: number;
  lng: number;
  name?: string;
  platform?: NavigatePlatform;
  placeId?: string;
}): string {
  const platform = options.platform ?? 'desktop';
  if (platform === 'ios') {
    return buildAppleMapsNavigateUrl({
      lat: options.lat,
      lng: options.lng,
      name: options.name,
    });
  }
  return buildGoogleMapsNavigateUrl({
    lat: options.lat,
    lng: options.lng,
    name: options.name,
    placeId: options.placeId,
    travelMode: 'driving',
  });
}

export interface GroundedCandidateForNavigate {
  readonly id: string;
  readonly name: string;
  readonly coords?: { lat: number; lng: number };
  readonly sourceRef?: SourceRef;
  readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
  readonly [key: string]: unknown;
}

export interface GroundedNavigateOptions {
  readonly platform?: NavigatePlatform;
  readonly forceFail?: boolean;
}

/**
 * Non-skippable Grounded Navigation URL Builder (G2).
 * Verifies candidate against session EvidenceBundle before building URL.
 * Fails closed if candidate is invalid, stale, tampered, or outside bundle.
 */
export function buildGroundedNavigateUrl(
  candidate: GroundedCandidateForNavigate,
  bundle: EvidenceBundle,
  options?: GroundedNavigateOptions
): string | undefined {
  if (options?.forceFail) {
    // Explicit forced verifier failure for negative tests
    GroundedRecommendationVerifier.verifyField(
      { recordId: '__non_existent_forced__', field: 'name' },
      candidate.name,
      bundle
    );
    return undefined;
  }

  const verif = GroundedRecommendationVerifier.verifyCandidateCard(candidate, bundle);
  if (!verif.valid) {
    return undefined;
  }

  const rec = bundle.getRecord(candidate.sourceRef?.recordId || candidate.id);
  const recCoords = (rec?.fields.coords as { lat: number; lng: number } | undefined) ?? candidate.coords;
  if (!recCoords || typeof recCoords.lat !== 'number' || typeof recCoords.lng !== 'number') {
    return undefined;
  }

  const name = String(rec?.fields.name || candidate.name);
  return buildPlatformNavigateUrl({
    lat: recCoords.lat,
    lng: recCoords.lng,
    name,
    platform: options?.platform ?? 'desktop',
    placeId: rec?.id || candidate.id,
  });
}
