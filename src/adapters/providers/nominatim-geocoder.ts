/**
 * Nominatim OpenStreetMap Geocoder Adapter
 * Governed by LIVE_FIRST plan (PT:S4-LIVE-DEPART).
 *
 * Implements address and place name geocoding via OpenStreetMap Nominatim.
 * Invariants:
 * - Rate limit: strictly at most 1 request per second (≥1000ms delay between fetches).
 * - Caching: in-memory cache to prevent redundant queries.
 * - Attribution: "Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright".
 * - User-Agent: Custom descriptive User-Agent per Nominatim Usage Policy.
 * - Zero live outbound calls in automated tests (mocked responses or recorded fixtures only).
 */

export interface GeocodeResult {
  readonly query: string;
  readonly coordinate: readonly [lat: number, lng: number];
  readonly displayName: string;
  readonly attribution: string;
  readonly fetchedAt: string;
  readonly fromCache: boolean;
}

export interface NominatimGeocoderConfig {
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
  readonly minIntervalMs?: number;
  readonly userAgent?: string;
}

export const NOMINATIM_ATTRIBUTION = 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright';

export class NominatimGeocoder {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly userAgent: string;

  private readonly cache = new Map<string, GeocodeResult>();
  private lastRequestTime = 0;

  constructor(config?: NominatimGeocoderConfig) {
    this.baseUrl = config?.baseUrl ?? 'https://nominatim.openstreetmap.org';
    this.fetchFn = config?.fetchFn ?? globalThis.fetch;
    this.minIntervalMs = config?.minIntervalMs ?? 1000;
    this.userAgent = config?.userAgent ?? 'Yori/0.1.0 (Hackathon Live Prototype; contact: info@yori.app)';
  }

  /**
   * Geocodes a free-text address or venue name to [lat, lng].
   * Returns null if unresolvable.
   */
  async geocode(query: string): Promise<GeocodeResult | null> {
    const trimmed = query.trim();
    if (!trimmed) {
      return null;
    }

    const normalizedKey = trimmed.toLowerCase();
    const cached = this.cache.get(normalizedKey);
    if (cached) {
      return {
        ...cached,
        fromCache: true,
      };
    }

    // Rate limiting: enforce ≥ minIntervalMs since last outbound request
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();

    const encoded = encodeURIComponent(trimmed);
    const url = `${this.baseUrl.replace(/\/+$/, '')}/search?q=${encoded}&format=json&limit=1&addressdetails=1`;

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': this.userAgent,
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim geocoder HTTP ${response.status}: ${response.statusText}`);
    }

    const data: any = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const first = data[0];
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return null;
    }

    const result: GeocodeResult = {
      query: trimmed,
      coordinate: [lat, lon],
      displayName: first.display_name || trimmed,
      attribution: NOMINATIM_ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };

    this.cache.set(normalizedKey, result);
    return result;
  }

  /**
   * Clears the in-memory geocoding cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets current size of the cache.
   */
  get cacheSize(): number {
    return this.cache.size;
  }
}
