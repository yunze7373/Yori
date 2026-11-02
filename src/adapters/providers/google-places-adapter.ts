/**
 * Google Places API (New) nearby discovery — DEMO_RESCUE D7 (rev12), server-side only.
 *
 * - One searchNearby per request: 1.5 km circle around the already 3-decimal-rounded fix,
 *   restaurants and cafes, a minimal field mask (no reviews, no contact data).
 * - The API key travels ONLY in the X-Goog-Api-Key request header, never in a URL, and is
 *   never logged or returned.
 * - Photo media (binding key-safety rule): the server calls
 *   GET places.googleapis.com/v1/{photo.name}/media?skipHttpRedirect=true (key in the header)
 *   and hands the client only the resulting short-lived photoUri (googleusercontent, no key).
 *   Photos are hotlinked from that URI, never re-hosted, and fetched only for shown cards.
 * - Every outbound call is counted in a per-day ledger with a hard stop (GooglePlacesLedger).
 * - Fail-closed: any error throws; the proxy then falls back to Overpass and labels it.
 */

import type { PlaceItem } from './places-types.js';
import type { LocationCoords } from './location-port.js';
import { computeHaversineDistanceMeters, formatStraightLineDistance } from './simulated-places-provider.js';

export const GOOGLE_PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';
export const GOOGLE_PLACES_MEDIA_BASE = 'https://places.googleapis.com/v1/';
export const GOOGLE_PLACES_ATTRIBUTION = 'Powered by Google';
export const GOOGLE_PLACES_TIMEOUT_MS = 8000;
export const GOOGLE_PLACES_RADIUS_METERS = 1500;
export const GOOGLE_PLACES_MAX_RESULTS = 10;
/** Photos are resolved only for the cards actually shown (hero + the next two). */
export const GOOGLE_PLACES_PHOTO_CARDS = 3;
export const GOOGLE_PLACES_PHOTO_MAX_WIDTH_PX = 400;
export const GOOGLE_PHOTO_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Minimal field mask. Billing SKU: rating / userRatingCount / priceLevel / currentOpeningHours
 * put this request on "Nearby Search Enterprise"; photo media is "Place Details Photos".
 */
export const GOOGLE_PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.currentOpeningHours.openNow',
  'places.primaryType',
  'places.photos',
  'places.shortFormattedAddress',
].join(',');

export const GOOGLE_SKU_NEARBY = 'places.searchNearby (Nearby Search Enterprise)';
export const GOOGLE_SKU_PHOTO = 'places.photos.media (Place Details Photos)';

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** Counts billed Google calls per local day with a hard stop; the proxy persists it. */
export interface GooglePlacesLedger {
  /** Reserves one call of the given SKU; false (and nothing counted) when the daily cap is hit. */
  tryReserve(sku: string): boolean;
}

export interface GooglePlacesAdapterOptions {
  readonly apiKey: string;
  readonly ledger: GooglePlacesLedger;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

interface GooglePlaceRaw {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly location?: { readonly latitude?: number; readonly longitude?: number };
  readonly rating?: number;
  readonly userRatingCount?: number;
  readonly priceLevel?: string;
  readonly currentOpeningHours?: { readonly openNow?: boolean };
  readonly primaryType?: string;
  readonly shortFormattedAddress?: string;
  readonly photos?: readonly {
    readonly name?: string;
    readonly widthPx?: number;
    readonly heightPx?: number;
    readonly authorAttributions?: readonly { readonly displayName?: string; readonly uri?: string }[];
  }[];
}

export class GoogleQuotaExceededError extends Error {
  constructor() {
    super('Google Places daily cap reached');
    this.name = 'GoogleQuotaExceededError';
  }
}

/** "ramen_restaurant" -> "ramen"; "cafe" -> "cafe"; "restaurant" -> undefined. */
export function cuisineFromPrimaryType(primaryType: string | undefined): string | undefined {
  if (!primaryType) return undefined;
  const t = primaryType.replace(/_restaurant$/, '').replace(/_/g, ' ');
  return t === 'restaurant' || t === 'food' ? undefined : t;
}

/** Google contributor links come back protocol-relative ("//maps.google.com/..."). */
function absoluteHttps(uri: string | undefined): string | undefined {
  if (!uri) return undefined;
  if (uri.startsWith('//')) return `https:${uri}`;
  return /^https:\/\//.test(uri) ? uri : undefined;
}

export class GooglePlacesAdapter {
  public readonly id = 'google-places-new';

  private readonly apiKey: string;
  private readonly ledger: GooglePlacesLedger;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  /** D7 cost guard: photo URIs are reused for 10 min per photo name (photos are billed). */
  private readonly photoCache = new Map<string, { uri: string; at: number }>();

  constructor(options: GooglePlacesAdapterOptions) {
    this.apiKey = options.apiKey;
    this.ledger = options.ledger;
    this.fetchFn = options.fetchFn ?? fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? GOOGLE_PLACES_TIMEOUT_MS;
  }

  private async call(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** origin must already be rounded to 3 decimals by the caller (the proxy does). */
  public async searchNearby(origin: LocationCoords): Promise<readonly PlaceItem[]> {
    if (!this.ledger.tryReserve(GOOGLE_SKU_NEARBY)) throw new GoogleQuotaExceededError();
    const res = await this.call(GOOGLE_PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: ['restaurant', 'cafe'],
        maxResultCount: GOOGLE_PLACES_MAX_RESULTS,
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: { latitude: origin.lat, longitude: origin.lng },
            radius: GOOGLE_PLACES_RADIUS_METERS,
          },
        },
      }),
    });
    if (!res.ok) {
      // Fixed message: Google error bodies can echo request details.
      throw new Error(`Google Places searchNearby responded with HTTP ${res.status}`);
    }
    const data = (await res.json()) as { places?: readonly GooglePlaceRaw[] };
    const fetchedAt = new Date().toISOString();
    const items: (PlaceItem & { photoName?: string; photoAuthors?: PlaceItem['photo'] })[] = [];

    for (const p of data.places ?? []) {
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      const name = p.displayName?.text?.trim();
      if (!p.id || !name || typeof lat !== 'number' || typeof lng !== 'number') continue;
      const coords = { lat, lng };
      const dist = computeHaversineDistanceMeters(origin, coords);
      const openNow = p.currentOpeningHours?.openNow;
      items.push({
        placeId: `google-${p.id}`,
        coords,
        name,
        category: 'restaurant',
        source: 'live',
        provenance: 'google',
        fetchedAt,
        address: p.shortFormattedAddress,
        cuisine: cuisineFromPrimaryType(p.primaryType),
        straightLineDistanceMeters: dist,
        straightLineDistanceLabel: formatStraightLineDistance(dist),
        openingStatus: openNow === true ? 'open' : openNow === false ? 'closed' : undefined,
        rating: typeof p.rating === 'number' ? p.rating : undefined,
        userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
        priceLevel: p.priceLevel && p.priceLevel in PRICE_LEVELS ? PRICE_LEVELS[p.priceLevel] : undefined,
        attribution: GOOGLE_PLACES_ATTRIBUTION,
        photoName: p.photos?.[0]?.name,
        photoAuthors: p.photos?.[0]
          ? {
              uri: '',
              widthPx: p.photos[0].widthPx,
              heightPx: p.photos[0].heightPx,
              authorAttributions: (p.photos[0].authorAttributions ?? [])
                .filter(a => a.displayName)
                .map(a => ({ displayName: String(a.displayName), uri: absoluteHttps(a.uri) })),
            }
          : undefined,
      });
    }
    items.sort((a, b) => (a.straightLineDistanceMeters ?? 0) - (b.straightLineDistanceMeters ?? 0));

    // Resolve keyless photo URIs only for the cards that are shown.
    const out: PlaceItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const { photoName, photoAuthors, ...place } = items[i]!;
      let photo: PlaceItem['photo'];
      if (i < GOOGLE_PLACES_PHOTO_CARDS && photoName && photoAuthors && photoAuthors.authorAttributions.length > 0) {
        const uri = await this.resolvePhotoUri(photoName).catch(() => null);
        if (uri) photo = { ...photoAuthors, uri };
      }
      out.push(Object.freeze({ ...place, photo }));
    }
    return Object.freeze(out);
  }

  /**
   * Server-side photo media lookup (skipHttpRedirect=true): returns ONLY the keyless photoUri.
   * Anything that is not an https googleusercontent URI, or that mentions the key, is dropped.
   */
  public async resolvePhotoUri(photoName: string): Promise<string | null> {
    if (!/^places\/[^/?#]+\/photos\/[^/?#]+$/.test(photoName)) return null;
    const hit = this.photoCache.get(photoName);
    if (hit && Date.now() - hit.at < GOOGLE_PHOTO_CACHE_TTL_MS) return hit.uri;
    if (!this.ledger.tryReserve(GOOGLE_SKU_PHOTO)) return null;
    const url = `${GOOGLE_PLACES_MEDIA_BASE}${photoName}/media?maxWidthPx=${GOOGLE_PLACES_PHOTO_MAX_WIDTH_PX}&skipHttpRedirect=true`;
    const res = await this.call(url, { method: 'GET', headers: { 'X-Goog-Api-Key': this.apiKey } });
    if (!res.ok) return null;
    const data = (await res.json()) as { photoUri?: string };
    const uri = data.photoUri;
    if (typeof uri !== 'string') return null;
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.googleusercontent.com')) return null;
    if (uri.includes(this.apiKey) || /[?&]key=/i.test(uri)) return null;
    this.photoCache.set(photoName, { uri, at: Date.now() });
    if (this.photoCache.size > 100) this.photoCache.delete(this.photoCache.keys().next().value!);
    return uri;
  }
}
