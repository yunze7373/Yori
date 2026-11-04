/**
 * D7-LICENSED-PLACES boundary tests (DEMO_RESCUE rev12, TID INBOX-20261102-0C471B).
 * Recorded Google Places (New) responses through the real adapter + /api/places middleware with
 * an injected fetch (no network):
 * - searchNearby: POST, X-Goog-Api-Key header only (never in a URL), minimal field mask, 1.5 km
 *   circle around the 3-decimal fix, restaurants + cafes.
 * - photo media: server-side GET .../{photo.name}/media?skipHttpRedirect=true; only a keyless
 *   googleusercontent photoUri reaches the client; only for the first 3 cards.
 * - ledger: every billed call counted by SKU; daily hard stop -> Overpass with reason daily_cap.
 * - failover: Google failure -> Overpass flagship -> mirror, labelled; no key anywhere in the
 *   response, logs or outbound URLs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GooglePlacesAdapter,
  GOOGLE_PLACES_FIELD_MASK,
  GOOGLE_SKU_NEARBY,
  GOOGLE_SKU_PHOTO,
  GoogleQuotaExceededError,
  GOOGLE_PLACES_AMENITY_TYPE_MAP,
} from '../../src/adapters/providers/google-places-adapter.js';
import { MemoryGooglePlacesLedger } from '../../src/adapters/providers/google-places-ledger.js';
import {
  createPlacesProxyMiddleware,
  resetPlacesRateLimit,
  resetProxyTestSeams,
  resolvePlacesConfig,
  DEFAULT_OVERPASS_MIRROR_URL,
} from '../../src/adapters/providers/server-proxy.js';

/** Advances past the proxy's 10 s outbound interval without clearing the Google result cache. */
function resetPlacesRateLimitKeepCache() {
  const realNow = Date.now;
  const shifted = realNow() + 11000;
  Date.now = () => shifted;
  setTimeout(() => { Date.now = realNow; }, 0);
}
import { OverpassPlacesAdapter } from '../../src/adapters/providers/overpass-places-adapter.js';

const FAKE_KEY = 'AIzaFAKE_TEST_KEY_d7_0123456789';
const ORIGIN = { lat: 35.689, lng: 139.692 };

const RECORDED_NEARBY = {
  places: [
    {
      id: 'ChIJfarSoba',
      displayName: { text: 'Far Soba', languageCode: 'ja' },
      location: { latitude: 35.6935, longitude: 139.6955 },
      rating: 4.1,
      userRatingCount: 88,
      priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
      currentOpeningHours: { openNow: false },
      primaryType: 'japanese_restaurant',
      shortFormattedAddress: '1 Far St',
      photos: [{ name: 'places/ChIJfarSoba/photos/P4', widthPx: 800, heightPx: 600, authorAttributions: [{ displayName: 'Dee', uri: '//maps.google.com/maps/contrib/4' }] }],
    },
    {
      id: 'ChIJnearCafe',
      displayName: { text: 'Near Cafe' },
      location: { latitude: 35.6893, longitude: 139.6921 },
      rating: 4.6,
      userRatingCount: 1204,
      priceLevel: 'PRICE_LEVEL_MODERATE',
      currentOpeningHours: { openNow: true },
      primaryType: 'cafe',
      shortFormattedAddress: '2 Near St',
      photos: [{ name: 'places/ChIJnearCafe/photos/P1', widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'Ann', uri: '//maps.google.com/maps/contrib/1' }] }],
    },
    { id: 'ChIJmid1', displayName: { text: 'Mid One' }, location: { latitude: 35.6905, longitude: 139.6925 }, primaryType: 'ramen_restaurant', photos: [{ name: 'places/ChIJmid1/photos/P2', authorAttributions: [{ displayName: 'Bo' }] }] },
    { id: 'ChIJmid2', displayName: { text: 'Mid Two' }, location: { latitude: 35.6912, longitude: 139.6931 }, primaryType: 'restaurant', photos: [{ name: 'places/ChIJmid2/photos/P3', authorAttributions: [{ displayName: 'Cy' }] }] },
    { id: 'ChIJnoName', location: { latitude: 35.69, longitude: 139.69 } },
  ],
};

function googleFetch(opts: { searchStatus?: number; photoUri?: (name: string) => string } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://places.googleapis.com/v1/places:searchNearby')) {
      if (opts.searchStatus && opts.searchStatus !== 200) {
        return new Response(JSON.stringify({ error: { message: `echo ${FAKE_KEY}` } }), { status: opts.searchStatus });
      }
      return new Response(JSON.stringify(RECORDED_NEARBY), { status: 200 });
    }
    const m = /^https:\/\/places\.googleapis\.com\/v1\/(places\/[^/]+\/photos\/[^/]+)\/media\?/.exec(url);
    if (m) {
      const uri = opts.photoUri ? opts.photoUri(m[1]!) : `https://lh3.googleusercontent.com/places/${m[1]!.split('/').pop()}=s400`;
      return new Response(JSON.stringify({ name: `${m[1]}/media`, photoUri: uri }), { status: 200 });
    }
    void init;
    return new Response('{}', { status: 404 });
  });
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

describe('D7 GooglePlacesAdapter (recorded responses)', () => {
  it('searchNearby: POST with header key, minimal mask, 1.5 km circle at the rounded fix', async () => {
    const fetchFn = googleFetch();
    const ledger = new MemoryGooglePlacesLedger();
    const adapter = new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger, fetchFn: fetchFn as any });
    const places = await adapter.searchNearby(ORIGIN);

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(url).not.toContain(FAKE_KEY);
    expect(init.method).toBe('POST');
    expect(headersOf(init)['X-Goog-Api-Key']).toBe(FAKE_KEY);
    expect(headersOf(init)['X-Goog-FieldMask']).toBe(GOOGLE_PLACES_FIELD_MASK);
    expect(GOOGLE_PLACES_FIELD_MASK.split(',')).toEqual([
      'places.id', 'places.displayName', 'places.location', 'places.rating', 'places.userRatingCount',
      'places.priceLevel', 'places.currentOpeningHours.openNow', 'places.primaryType', 'places.photos',
      'places.shortFormattedAddress',
    ]);
    const body = JSON.parse(String(init.body));
    expect(body.includedTypes).toEqual(['restaurant', 'cafe']);
    expect(body.locationRestriction.circle).toEqual({ center: { latitude: 35.689, longitude: 139.692 }, radius: 1500 });

    // Nameless places dropped; sorted by distance; real fields only.
    expect(places.map(p => p.name)).toEqual(['Near Cafe', 'Mid One', 'Mid Two', 'Far Soba']);
    const cafe = places[0]!;
    expect(cafe).toMatchObject({
      placeId: 'google-ChIJnearCafe',
      provenance: 'google',
      rating: 4.6,
      userRatingCount: 1204,
      priceLevel: 2,
      openingStatus: 'open',
      cuisine: 'cafe',
      attribution: 'Powered by Google',
    });
    expect(cafe.straightLineDistanceLabel).toMatch(/^\d+ m \(straight-line\)$/);
    expect(places[1]!.cuisine).toBe('ramen');
    expect(places[1]!.rating).toBeUndefined();
    expect(places[3]!.openingStatus).toBe('closed');
  });

  it('NEARBY-ESSENTIALS: maps supermarket, convenience, shopping_mall, pharmacy to Google Places includedTypes', async () => {
    expect(GOOGLE_PLACES_AMENITY_TYPE_MAP.supermarket).toEqual(['supermarket']);
    expect(GOOGLE_PLACES_AMENITY_TYPE_MAP.convenience).toEqual(['convenience_store']);
    expect(GOOGLE_PLACES_AMENITY_TYPE_MAP.shopping_mall).toEqual(['shopping_mall']);
    expect(GOOGLE_PLACES_AMENITY_TYPE_MAP.pharmacy).toEqual(['pharmacy']);
    expect(GOOGLE_PLACES_AMENITY_TYPE_MAP.restaurant).toEqual(['restaurant', 'cafe']);

    const fetchFn = googleFetch();
    const ledger = new MemoryGooglePlacesLedger();
    const adapter = new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger, fetchFn: fetchFn as any });

    const supermarketPlaces = await adapter.searchNearby(ORIGIN, 'supermarket');
    const pharmacyPlaces = await adapter.searchNearby(ORIGIN, 'pharmacy');

    const searchCalls = fetchFn.mock.calls.filter(c => String(c[0]).includes(':searchNearby')) as unknown as [string, RequestInit][];
    expect(searchCalls.length).toBe(2);

    const supermarketBody = JSON.parse(String(searchCalls[0]![1].body));
    expect(supermarketBody.includedTypes).toEqual(['supermarket']);
    expect(supermarketPlaces[0]!.category).toBe('supermarket');

    const pharmacyBody = JSON.parse(String(searchCalls[1]![1].body));
    expect(pharmacyBody.includedTypes).toEqual(['pharmacy']);
    expect(pharmacyPlaces[0]!.category).toBe('pharmacy');
  });

  it('photo media: server-side skipHttpRedirect, keyless URI, credits kept, only the first 3 cards', async () => {
    const fetchFn = googleFetch();
    const ledger = new MemoryGooglePlacesLedger();
    const adapter = new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger, fetchFn: fetchFn as any });
    const places = await adapter.searchNearby(ORIGIN);

    const mediaCalls = fetchFn.mock.calls.map(c => String(c[0])).filter(u => u.includes('/media?'));
    expect(mediaCalls).toHaveLength(3);
    for (const u of mediaCalls) {
      expect(u).toContain('skipHttpRedirect=true');
      expect(u).not.toContain(FAKE_KEY);
      expect(u).not.toMatch(/[?&]key=/);
    }
    for (const call of fetchFn.mock.calls) expect(headersOf(call[1] as RequestInit)['X-Goog-Api-Key']).toBe(FAKE_KEY);

    expect(places[0]!.photo).toEqual({
      uri: 'https://lh3.googleusercontent.com/places/P1=s400',
      widthPx: 1200,
      heightPx: 800,
      authorAttributions: [{ displayName: 'Ann', uri: 'https://maps.google.com/maps/contrib/1' }],
    });
    expect(places[3]!.photo).toBeUndefined(); // 4th card: no photo fetched (cost: shown cards only)
    expect(ledger.bySku).toEqual({ [GOOGLE_SKU_NEARBY]: 1, [GOOGLE_SKU_PHOTO]: 3 });
    expect(JSON.stringify(places)).not.toContain(FAKE_KEY);
  });

  it('drops a photoUri that is not https googleusercontent or that carries a key', async () => {
    for (const bad of [
      (n: string) => `https://places.googleapis.com/v1/${n}/media?key=${FAKE_KEY}`,
      (n: string) => `https://lh3.googleusercontent.com/x?key=abc&n=${n}`,
      () => `http://lh3.googleusercontent.com/plain-http`,
      () => `https://evil.example.com/p.jpg`,
      () => `https://lh3.googleusercontent.com/${FAKE_KEY}`,
    ]) {
      const adapter = new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGooglePlacesLedger(), fetchFn: googleFetch({ photoUri: bad }) as any });
      const places = await adapter.searchNearby(ORIGIN);
      expect(places.every(p => p.photo === undefined)).toBe(true);
    }
  });

  it('daily hard stop: no call is made once the cap is reached', async () => {
    const fetchFn = googleFetch();
    const ledger = new MemoryGooglePlacesLedger(0);
    const adapter = new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger, fetchFn: fetchFn as any });
    await expect(adapter.searchNearby(ORIGIN)).rejects.toBeInstanceOf(GoogleQuotaExceededError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('HTTP errors throw a fixed message (never the provider body)', async () => {
    const adapter = new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGooglePlacesLedger(), fetchFn: googleFetch({ searchStatus: 403 }) as any });
    await expect(adapter.searchNearby(ORIGIN)).rejects.toThrow('Google Places searchNearby responded with HTTP 403');
    await expect(adapter.searchNearby(ORIGIN)).rejects.not.toThrow(new RegExp(FAKE_KEY));
  });
});

const OVERPASS_OK = {
  elements: [{ type: 'node', id: 99, lat: 35.6899, lon: 139.6921, tags: { amenity: 'restaurant', name: 'OSM Soba', opening_hours: '24/7' } }],
};

function reqRes(url: string) {
  const req: any = { url, method: 'GET', headers: { host: '127.0.0.1:4174' } };
  const response = { statusCode: 0, body: '' };
  const res: any = {
    writeHead: vi.fn((c: number) => { response.statusCode = c; }),
    end: vi.fn((d: string) => { response.body = d; }),
  };
  return { req, res, next: vi.fn(), response };
}

function overpass(status: number) {
  const fetchFn = vi.fn(async () => new Response(JSON.stringify(OVERPASS_OK), { status }));
  return { fetchFn, adapter: new OverpassPlacesAdapter({ fetchFn: fetchFn as any }) };
}

describe('D7 /api/places: Google primary, Overpass fallback', () => {
  beforeEach(() => {
    resetProxyTestSeams();
    resetPlacesRateLimit();
  });

  it('Google answers: discovery google, keyless photos, no key in the response or logs', async () => {
    const logs: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(k =>
      vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); })
    );
    const fetchFn = googleFetch();
    const flagship = overpass(200);
    const mw = createPlacesProxyMiddleware({ enabled: true, googleApiKey: FAKE_KEY }, undefined, {
      google: new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGooglePlacesLedger(), fetchFn: fetchFn as any }),
      overpassChain: [flagship.adapter],
    });
    const { req, res, next, response } = reqRes('/api/places?lat=35.689487&lng=139.691706&amenity=restaurant');
    await mw(req, res, next);
    spies.forEach(s => s.mockRestore());

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.discovery).toBe('google');
    expect(data.attribution).toBe('Powered by Google');
    expect(data.places[0].photo.uri).toMatch(/^https:\/\/lh3\.googleusercontent\.com\//);
    expect(response.body).not.toContain(FAKE_KEY);
    expect(response.body).not.toMatch(/[?&]key=/);
    expect(flagship.fetchFn).not.toHaveBeenCalled();
    // The proxy rounded the fix before Google saw it.
    const body = JSON.parse(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.locationRestriction.circle.center).toEqual({ latitude: 35.689, longitude: 139.692 });
    expect(logs.join('\n')).not.toContain(FAKE_KEY);
  });

  it('Google fails -> flagship fails -> mirror answers: discovery osm, labelled failover', async () => {
    const flagship = overpass(502);
    const mirror = overpass(200);
    const mw = createPlacesProxyMiddleware({ enabled: true, googleApiKey: FAKE_KEY }, undefined, {
      google: new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGooglePlacesLedger(), fetchFn: googleFetch({ searchStatus: 500 }) as any }),
      overpassChain: [flagship.adapter, mirror.adapter],
    });
    const { req, res, next, response } = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await mw(req, res, next);
    const data = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(data).toMatchObject({ discovery: 'osm', failover: { from: 'google', reason: 'unavailable' }, attribution: 'OpenStreetMap via Overpass (ODbL)' });
    expect(data.places[0]).toMatchObject({ name: 'OSM Soba', provenance: 'osm', openingStatus: 'open' });
    expect(data.places[0].rating).toBeUndefined();
    expect(data.places[0].photo).toBeUndefined();
    expect(flagship.fetchFn).toHaveBeenCalledTimes(1);
    expect(mirror.fetchFn).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain(FAKE_KEY);
  });

  it('daily cap reached -> Overpass with reason daily_cap and zero Google calls', async () => {
    const gFetch = googleFetch();
    const flagship = overpass(200);
    const mw = createPlacesProxyMiddleware({ enabled: true, googleApiKey: FAKE_KEY }, undefined, {
      google: new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger: new MemoryGooglePlacesLedger(0), fetchFn: gFetch as any }),
      overpassChain: [flagship.adapter],
    });
    const { req, res, next, response } = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await mw(req, res, next);
    expect(JSON.parse(response.body).failover).toEqual({ from: 'google', reason: 'daily_cap' });
    expect(gFetch).not.toHaveBeenCalled();
  });

  it('no key: Overpass only, no failover label; all Overpass endpoints down -> fixed 500', async () => {
    const mw = createPlacesProxyMiddleware({ enabled: true, googleApiKey: undefined }, undefined, {
      google: null,
      overpassChain: [overpass(502).adapter, overpass(504).adapter],
    });
    const { req, res, next, response } = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await mw(req, res, next);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({ error: 'Overpass API responded with HTTP 504', discovery: 'osm', failover: null });
  });

  it('status lists exactly the hosts in use (Google first, then flagship + mirror) and never the key', async () => {
    const mw = createPlacesProxyMiddleware({ enabled: true, googleApiKey: FAKE_KEY });
    const { req, res, next, response } = reqRes('/api/places/status');
    await mw(req, res, next);
    const data = JSON.parse(response.body);
    expect(data.discovery).toBe('google');
    expect(data.outboundHosts).toEqual([
      { purpose: 'nearby places and photos', host: 'places.googleapis.com' },
      { purpose: 'nearby places, fallback', host: 'overpass-api.de/api/interpreter' },
      { purpose: 'nearby places, fallback', host: 'maps.mail.ru/osm/tools/overpass/api/interpreter' },
    ]);
    expect(response.body).not.toContain(FAKE_KEY);
  });

  it('config: GOOGLE_PLACES_API_KEY overrides GOOGLE_MAPS_API_KEY; mirror default and opt-out', () => {
    expect(resolvePlacesConfig({ GOOGLE_MAPS_API_KEY: 'a' }).googleApiKey).toBe('a');
    expect(resolvePlacesConfig({ GOOGLE_MAPS_API_KEY: 'a', GOOGLE_PLACES_API_KEY: 'b' }).googleApiKey).toBe('b');
    expect(resolvePlacesConfig({ GOOGLE_MAPS_API_KEY: '   ' }).googleApiKey).toBeUndefined();
    expect(resolvePlacesConfig({}).overpassMirrorUrl).toBe(DEFAULT_OVERPASS_MIRROR_URL);
    expect(resolvePlacesConfig({ OVERPASS_MIRROR_URL: '' }).overpassMirrorUrl).toBeNull();
  });

  it('cost guard: automatic refreshes reuse the Google result (no billing); fresh=1 bills exactly once', async () => {
    const fetchFn = googleFetch();
    const ledger = new MemoryGooglePlacesLedger();
    const mw = createPlacesProxyMiddleware({ enabled: true, googleApiKey: FAKE_KEY }, undefined, {
      google: new GooglePlacesAdapter({ apiKey: FAKE_KEY, ledger, fetchFn: fetchFn as any }),
      overpassChain: [overpass(200).adapter],
    });
    const first = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await mw(first.req, first.res, first.next);
    expect(ledger.bySku[GOOGLE_SKU_NEARBY]).toBe(1);

    // Automatic refresh inside the TTL (and inside the 10 s interval): served from cache, 200, no call.
    const auto = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant');
    await mw(auto.req, auto.res, auto.next);
    expect(auto.response.statusCode).toBe(200);
    expect(JSON.parse(auto.response.body).discovery).toBe('google');
    expect(ledger.bySku[GOOGLE_SKU_NEARBY]).toBe(1);

    // Explicit Nearby now (fresh=1) after the 10 s interval: one new billed search; photos reused.
    resetPlacesRateLimitKeepCache();
    const fresh = reqRes('/api/places?lat=35.689&lng=139.692&amenity=restaurant&fresh=1');
    await mw(fresh.req, fresh.res, fresh.next);
    expect(fresh.response.statusCode).toBe(200);
    expect(ledger.bySku[GOOGLE_SKU_NEARBY]).toBe(2);
    expect(ledger.bySku[GOOGLE_SKU_PHOTO]).toBe(3); // photo URIs cached for 10 min
  });
});

