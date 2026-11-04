/**
 * OpenStreetMap Overpass Places Adapter (V5-FUEL / L3-REAL-PLACES / LIVING_CONTEXT_V2.md §10.2)
 *
 * Request & response mapping only for OpenStreetMap Overpass API.
 * Protected strictly behind PLACES_LIVE_ENABLED (default false).
 *
 * Invariants:
 * - ZERO network calls are executed unless PLACES_LIVE_ENABLED is true.
 * - In this slice and all automated tests, live network calls are NON-GOALS and never run.
 * - Outbound coordinates are rounded to 3 decimals (~100m) for privacy; raw coordinates never logged.
 * - Amenity filter is strictly an allowlisted enum (restaurant | cafe | fast_food).
 * - Fixed radius cap <= 1500 m.
 * - 8s timeout with AbortController and descriptive User-Agent.
 * - Candidates carry osmId, name (from tags only), lat/lng, distance, fetchedAt, and source 'OpenStreetMap via Overpass (ODbL)'.
 * - Opening hours parsed deterministically; unparseable values omitted (never estimated).
 * - Venue without a provider name record never renders; no ratings, no photos.
 * - Ranking is deterministic and explainable: cites confirmed memory facts or the distance rule.
 */

import { tasteSignals, bestTasteMatch } from '../../core/memory/taste.js';
import type { LocationCoords } from './location-port.js';
import type { PlaceItem, PlacesProvider, PlacesQuery } from './places-types.js';
import { computeHaversineDistanceMeters, formatStraightLineDistance } from './simulated-places-provider.js';

export const ALLOWED_AMENITIES = ['restaurant', 'cafe', 'fast_food'] as const;
export type AllowedAmenity = (typeof ALLOWED_AMENITIES)[number];

export const DEFAULT_OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_ATTRIBUTION = 'OpenStreetMap via Overpass (ODbL)';
export const OVERPASS_USER_AGENT = 'YoriLivingContext/0.1.0 (+https://github.com/yori-assistant/yori)';
export const OVERPASS_TIMEOUT_MS = 8000;
export const OVERPASS_MAX_RADIUS_METERS = 1500;
export const OVERPASS_MIN_OUTBOUND_INTERVAL_MS = 10000; // 10s between outbound queries

export function isPlacesLiveEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.PLACES_LIVE_ENABLED === 'true') {
    return true;
  }
  if (
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PLACES_LIVE_ENABLED === 'true'
  ) {
    return true;
  }
  return false;
}

/**
 * Rounds coordinate to 3 decimal places (~100m resolution) for outbound privacy.
 */
export function roundCoordinate3Decimals(val: number): number {
  return Math.round(val * 1000) / 1000;
}

/**
 * Validates whether the amenity is in the allowlisted enum.
 */
export function isAllowedAmenity(val: unknown): val is AllowedAmenity {
  return typeof val === 'string' && (ALLOWED_AMENITIES as readonly string[]).includes(val);
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

/**
 * Deterministically parses standard OSM opening_hours strings for a given local date.
 * Returns 'open', 'closed', or undefined (if unparseable, complex, or absent).
 * Fails closed: never guesses or estimates.
 */
export function parseDeterministicOpeningHours(
  openingHoursTag?: string,
  localDate: Date = new Date()
): 'open' | 'closed' | undefined {
  if (!openingHoursTag || typeof openingHoursTag !== 'string') {
    return undefined;
  }
  const clean = openingHoursTag.trim();
  if (clean === '24/7') {
    return 'open';
  }

  // Reject strings with complex words (e.g. sunrise, sunset, easter, open, off, holidays)
  if (/[a-zA-Z]{3,}/.test(clean) && !/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/.test(clean)) {
    return undefined;
  }

  const currentDayIndex = localDate.getDay(); // 0 = Su, 1 = Mo, etc.
  const currentDay = DAYS_OF_WEEK[currentDayIndex];
  const currentMinutes = localDate.getHours() * 60 + localDate.getMinutes();

  // Split multiple sub-rules separated by semicolon
  const subRules = clean.split(';').map(s => s.trim()).filter(Boolean);
  let matchedRuleForToday = false;

  for (const rule of subRules) {
    // Matches e.g. "Mo-Fr 08:00-18:00", "Sa 10:00-16:00", "11:00-22:00"
    const match = rule.match(/^(?:([A-Za-z,-]+)\s+)?(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!match) {
      continue;
    }

    const daysPart = match[1];
    const startStr = match[2];
    const endStr = match[3];
    if (!startStr || !endStr) {
      continue;
    }
    let dayApplies = false;

    if (!daysPart) {
      dayApplies = true;
    } else {
      const dayTokens = daysPart.split(',').map(d => d.trim());
      for (const token of dayTokens) {
        if (token.includes('-')) {
          const [startDay, endDay] = token.split('-').map(t => t.trim());
          const startIdx = DAYS_OF_WEEK.indexOf(startDay as any);
          const endIdx = DAYS_OF_WEEK.indexOf(endDay as any);
          if (startIdx !== -1 && endIdx !== -1) {
            if (startIdx <= endIdx) {
              if (currentDayIndex >= startIdx && currentDayIndex <= endIdx) {
                dayApplies = true;
              }
            } else {
              // Wrap around e.g. Fr-Tu
              if (currentDayIndex >= startIdx || currentDayIndex <= endIdx) {
                dayApplies = true;
              }
            }
          }
        } else if (token === currentDay) {
          dayApplies = true;
        }
      }
    }

    if (dayApplies) {
      matchedRuleForToday = true;
      const startParts = startStr.split(':').map(Number);
      const endParts = endStr.split(':').map(Number);
      const startH = startParts[0] ?? 0;
      const startM = startParts[1] ?? 0;
      const endH = endParts[0] ?? 0;
      const endM = endParts[1] ?? 0;
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      if (endMin >= startMin) {
        if (currentMinutes >= startMin && currentMinutes < endMin) {
          return 'open';
        }
      } else {
        // Overnight hours e.g. 18:00-02:00
        if (currentMinutes >= startMin || currentMinutes < endMin) {
          return 'open';
        }
      }
    }
  }

  if (matchedRuleForToday) {
    return 'closed';
  }

  return undefined;
}

/**
 * Builds Overpass QL query string for nearby POI search.
 * Enforces coordinate privacy (rounded to 3 decimals), radius cap (<= 1500m),
 * allowlisted amenity enum, and 8s timeout.
 */
export function buildOverpassQuery(query: PlacesQuery & { timeoutSeconds?: number }): string {
  let amenityTag = 'restaurant';
  if (query.category === 'gas_station' || query.category === 'fuel') {
    amenityTag = 'fuel';
  } else if (query.category && isAllowedAmenity(query.category)) {
    amenityTag = query.category;
  }

  const radius =
    amenityTag === 'fuel'
      ? query.radiusMeters ?? 3000
      : Math.min(Math.max(query.radiusMeters ?? OVERPASS_MAX_RADIUS_METERS, 100), OVERPASS_MAX_RADIUS_METERS);
  const lat = query.location.lat;
  const lng = query.location.lng;

  const timeout = query.timeoutSeconds ?? (amenityTag === 'fuel' ? 10 : 8);

  return `[out:json][timeout:${timeout}];(node["amenity"="${amenityTag}"](around:${radius},${lat},${lng});way["amenity"="${amenityTag}"](around:${radius},${lat},${lng}););out center;`;
}

export interface OverpassElement {
  readonly id: number;
  readonly type: 'node' | 'way';
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { lat: number; lon: number };
  readonly tags?: {
    readonly name?: string;
    readonly amenity?: string;
    readonly brand?: string;
    readonly cuisine?: string;
    readonly opening_hours?: string;
    readonly 'addr:street'?: string;
    readonly 'addr:housenumber'?: string;
    readonly [key: string]: unknown;
  };
}

/**
 * Parses raw Overpass JSON elements into typed PlaceItems.
 * Enforces:
 * - Venue name must come from tags ONLY. Venue without a provider name record is omitted.
 * - Missing tags (cuisine, opening_hours) omitted, never fabricated or estimated.
 * - Distance computed from user's unrounded fix.
 * - No ratings, no photos.
 */
export function parseOverpassElements(
  elements: readonly OverpassElement[],
  category: string,
  userLocation: LocationCoords,
  fetchedAtIso: string
): readonly PlaceItem[] {
  const items: PlaceItem[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      continue;
    }

    // Venue name from tags only (for dining/restaurant); gas_station fallback to brand if present
    const name =
      el.tags?.name?.trim() ||
      (category === 'gas_station' && el.tags?.brand ? `${el.tags.brand} Station` : undefined);
    if (!name) {
      continue;
    }

    const coords: LocationCoords = { lat, lng };
    const distMeters = computeHaversineDistanceMeters(userLocation, coords);

    let address: string | undefined;
    if (el.tags?.['addr:street']) {
      address = el.tags['addr:housenumber']
        ? `${el.tags['addr:housenumber']} ${el.tags['addr:street']}`
        : el.tags['addr:street'];
    }

    // Optional tags
    const cuisine = el.tags?.cuisine ? String(el.tags.cuisine) : undefined;
    const openingStatus = parseDeterministicOpeningHours(
      el.tags?.opening_hours ? String(el.tags.opening_hours) : undefined,
      new Date(fetchedAtIso)
    );

    items.push({
      placeId: `overpass-${el.type}-${el.id}`,
      osmId: el.id,
      coords,
      name,
      category,
      source: 'live',
      fetchedAt: fetchedAtIso,
      address,
      cuisine,
      straightLineDistanceMeters: distMeters,
      straightLineDistanceLabel: formatStraightLineDistance(distMeters),
      openingStatus,
      brand: el.tags?.brand ? String(el.tags.brand) : undefined,
      attribution: OVERPASS_ATTRIBUTION,
      provenance: 'osm',
    });
  }

  items.sort((a, b) => (a.straightLineDistanceMeters ?? 0) - (b.straightLineDistanceMeters ?? 0));
  return Object.freeze(items);
}

export interface RankedPlaceItem extends PlaceItem {
  readonly rankScore: number;
  readonly rankingExplanation: string;
  /** HABIT-LEARN: which memory placed it first ('user_stated' | 'confirmed' | 'learned'). */
  readonly tasteSource?: string;
}

/**
 * Deterministically ranks candidates against what the user told Yori and what Yori learned
 * (HABIT-LEARN). Told / confirmed taste outranks a learned habit; a learned habit outranks
 * open-now; open-now outranks the rest. Zero model calls.
 */
export function rankPlacesByConfirmedPreferences(
  places: readonly PlaceItem[],
  facts: readonly { key: string; value: unknown; status?: string; provenance?: { source?: string } }[]
): readonly RankedPlaceItem[] {
  const signals = tasteSignals(facts as any);

  const scored: RankedPlaceItem[] = places.map(place => {
    const match = bestTasteMatch(signals, place);
    const distMeters = place.straightLineDistanceMeters ?? 1000;
    const distLabel = place.straightLineDistanceLabel ?? `${distMeters} m`;

    if (match) {
      return {
        ...place,
        rankScore: match.weight * 10000 - distMeters,
        rankingExplanation: match.basis,
        tasteSource: match.source,
      };
    } else if (place.openingStatus === 'open') {
      // D2: without a taste match, open now (OSM opening_hours only) ranks above unknown/closed,
      // matching the lunch card's order.
      return {
        ...place,
        rankScore: 3000 - distMeters,
        rankingExplanation: `Open now · ${distLabel}`,
      };
    } else {
      return {
        ...place,
        rankScore: 1000 - distMeters,
        rankingExplanation: `Closest dining option · ${distLabel}`,
      };
    }
  });

  scored.sort((a, b) => b.rankScore - a.rankScore);
  return Object.freeze(scored);
}

export interface OverpassPlacesAdapterOptions {
  readonly endpoint?: string;
  readonly fetchFn?: typeof fetch;
  /**
   * D2: the proxy's resolved flag (PLACES_LIVE_ENABLED, or the keyless-trio default) governs
   * outbound calls. Omitted -> legacy env check (isPlacesLiveEnabled).
   */
  readonly liveEnabled?: boolean;
  /** D7 fallback path: client timeout and the query's own [timeout:N] (defaults 8 s / 8). */
  readonly timeoutMs?: number;
  readonly queryTimeoutSeconds?: number;
}

export class OverpassPlacesAdapter implements PlacesProvider {
  public readonly id = 'overpass-places';
  public readonly name = 'OpenStreetMap Overpass API';

  private readonly endpoint: string;
  private readonly fetchFn?: typeof fetch;
  private readonly liveEnabled?: boolean;
  private readonly timeoutMs: number;
  private readonly queryTimeoutSeconds?: number;

  constructor(options: OverpassPlacesAdapterOptions = {}) {
    this.endpoint = options.endpoint ?? DEFAULT_OVERPASS_ENDPOINT;
    this.fetchFn = options.fetchFn;
    this.liveEnabled = options.liveEnabled;
    this.timeoutMs = options.timeoutMs ?? OVERPASS_TIMEOUT_MS;
    this.queryTimeoutSeconds = options.queryTimeoutSeconds;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  public async searchNearby(query: PlacesQuery): Promise<readonly PlaceItem[]> {
    if (!(this.liveEnabled ?? isPlacesLiveEnabled()) && !this.fetchFn) {
      throw new Error(
        'Places live provider is disabled (PLACES_LIVE_ENABLED=false). Real network calls are forbidden in this mode.'
      );
    }

    const body = buildOverpassQuery(
      this.queryTimeoutSeconds ? { ...query, timeoutSeconds: this.queryTimeoutSeconds } : query
    );
    const effectiveFetch = this.fetchFn ?? fetch;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await effectiveFetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OVERPASS_USER_AGENT,
        },
        body: `data=${encodeURIComponent(body)}`,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Overpass API responded with HTTP ${res.status}`);
      }

      const data = (await res.json()) as { elements?: readonly OverpassElement[] };
      const elements = data.elements ?? [];
      return parseOverpassElements(elements, query.category, query.location, new Date().toISOString());
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
