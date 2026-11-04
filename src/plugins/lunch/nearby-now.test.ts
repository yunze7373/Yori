/**
 * D2-LUNCH-DEFAULT-ON (DEMO_RESCUE): on-demand "Nearby now" / Ask path and the Live no-taste
 * reason fallback. The explicit request lifts ONLY the meal-window check; Demo places keep the
 * confirmed-taste fail-closed rule (AC-103-1).
 */
import { describe, it, expect } from 'vitest';
import { lunchDetector, hasFreshNearbyRequest, NEARBY_REQUEST_FRESH_MS } from './detector.js';
import { lunchPreparer } from './preparer.js';
import type { ContextSignal, ContextSnapshot, MemoryFact } from '../../core/contracts/index.js';

// 16:40 in Tokyo: well outside the 11:00-14:30 meal window.
const AS_OF = '2026-11-03T07:40:00.000Z';
const TZ = 'Asia/Tokyo';

function sig(kind: string, value: unknown, extra: Record<string, unknown> = {}): ContextSignal {
  return {
    kind,
    value,
    source: 'real',
    issuedAt: AS_OF,
    validFor: 300000,
    confidence: 1,
    consentScope: 'local_only',
    ...extra,
  } as unknown as ContextSignal;
}

const livePlaces = sig(
  'places_lunch',
  {
    status: 'available',
    places: [
      { id: 'overpass-node-1', name: 'Far Open Soba', cuisine: 'japanese', coords: { lat: 35.69, lng: 139.692 }, straightLineDistanceMeters: 900, straightLineDistanceLabel: '900 m (straight-line)', openingStatus: 'open', osmId: 1, fetchedAt: AS_OF },
      { id: 'overpass-node-2', name: 'Near Unknown Cafe', cuisine: 'cafe', coords: { lat: 35.6895, lng: 139.6918 }, straightLineDistanceMeters: 120, straightLineDistanceLabel: '120 m (straight-line)', openingStatus: undefined, osmId: 2, fetchedAt: AS_OF },
      { id: 'overpass-way-3', name: 'Mid Closed Grill', cuisine: 'burger', coords: { lat: 35.6899, lng: 139.6925 }, straightLineDistanceMeters: 400, straightLineDistanceLabel: '400 m (straight-line)', openingStatus: 'closed', osmId: 3, fetchedAt: AS_OF },
    ],
  },
  { provenance: 'live' }
);

const location = sig('location_status', { status: 'available', isHome: false });

function request(source: string, requestedAt = AS_OF, intent = 'lunch'): ContextSignal {
  return sig('user_request', { intent, source, requestedAt }, { provenance: 'user', validFor: NEARBY_REQUEST_FRESH_MS });
}

function snap(signals: ContextSignal[], asOf = AS_OF): ContextSnapshot {
  return { asOf, timezone: TZ, signals } as unknown as ContextSnapshot;
}

const noMemory: MemoryFact[] = [];

describe('D2 lunch detector: explicit nearby request', () => {
  it('outside the meal window, no request -> no lunch intent (proactive rule unchanged)', () => {
    expect(lunchDetector.detect(snap([location, livePlaces]), noMemory)).toBeNull();
  });

  it.each(['nearby_now', 'ask'])('a fresh %s request fires lunch outside the meal window', source => {
    const candidate = lunchDetector.detect(snap([location, livePlaces, request(source)]), noMemory);
    expect(candidate?.intent).toBe('lunch');
    expect((candidate?.metadata as any)?.userRequested).toBe(true);
    expect(candidate?.evidence.some(e => e.kind === 'user_request')).toBe(true);
  });

  it('stale, future-dated, wrong-intent or unknown-source requests do not lift the window', () => {
    const stale = new Date(Date.parse(AS_OF) - NEARBY_REQUEST_FRESH_MS - 1000).toISOString();
    const future = new Date(Date.parse(AS_OF) + 60000).toISOString();
    for (const r of [request('nearby_now', stale), request('nearby_now', future), request('nearby_now', AS_OF, 'fuel'), request('model', AS_OF)]) {
      expect(lunchDetector.detect(snap([location, livePlaces, r]), noMemory)).toBeNull();
      expect(hasFreshNearbyRequest(snap([r]))).toBeNull();
    }
  });

  it('the request lifts only the meal window: at home still yields nothing', () => {
    const atHome = sig('location_status', { status: 'available', isHome: true });
    expect(lunchDetector.detect(snap([atHome, livePlaces, request('nearby_now')]), noMemory)).toBeNull();
  });
});

describe('D2 lunch preparer: Live places without confirmed taste', () => {
  const candidate = () => lunchDetector.detect(snap([location, livePlaces, request('nearby_now')]), noMemory)!;

  it('cold user: open-now first, then nearest; reasons are open_now / nearest; no taste cited', () => {
    const plan = lunchPreparer.prepare(candidate(), snap([location, livePlaces, request('nearby_now')]), noMemory);
    expect(plan).not.toBeNull();
    const opts = plan!.optionsOrSteps as any[];
    expect(opts.map(o => o.name)).toEqual(['Far Open Soba', 'Near Unknown Cafe', 'Mid Closed Grill']);
    expect(opts.map(o => o.reasonKind)).toEqual(['open_now', 'nearest', 'nearest']);
    expect(opts[0].osmId).toBe(1);
    expect(opts[0].fetchedAt).toBe(AS_OF);
    expect(opts[0].straightLineDistanceLabel).toBe('900 m (straight-line)');
    expect(plan!.why.memoryFactsUsed).toEqual([]);
    expect(plan!.headline).toBe('Restaurants near you (1 open now)');
    expect(plan!.why.derivation).toContain('No confirmed taste yet');
    const descriptions = plan!.why.evidenceSignals.map(e => e.description);
    expect(descriptions).toContain('Because you asked for food nearby just now');
    expect(descriptions).toContain('Nearby places from OpenStreetMap via Overpass (ODbL)');
    expect(descriptions.join(' ')).not.toMatch(/simulated/i);
  });

  it('confirmed taste that matches keeps taste ranking and cites the fact', () => {
    const memory = [
      { key: 'taste_preference', value: 'cafe', status: 'confirmed', provenance: { source: 'user_confirmed', recordedAt: AS_OF } },
    ] as unknown as MemoryFact[];
    const plan = lunchPreparer.prepare(candidate(), snap([location, livePlaces, request('nearby_now')]), memory);
    const opts = plan!.optionsOrSteps as any[];
    // HABIT-LEARN: in Live a taste match leads; the other real places stay, each with its own reason.
    expect(opts[0].name).toBe('Near Unknown Cafe');
    expect(opts[0].reasonKind).toBe('taste');
    expect(opts.slice(1).map(o => o.reasonKind)).not.toContain('taste');
    expect(plan!.why.memoryFactsUsed.map(f => f.key)).toEqual(['taste_preference']);
  });

  it('confirmed taste with no matching place falls back to open-now/nearest instead of an empty card', () => {
    const memory = [
      { key: 'taste_preference', value: 'vegan', status: 'confirmed', provenance: { source: 'user_confirmed', recordedAt: AS_OF } },
    ] as unknown as MemoryFact[];
    const plan = lunchPreparer.prepare(candidate(), snap([location, livePlaces, request('nearby_now')]), memory);
    expect((plan!.optionsOrSteps as any[])[0].reasonKind).toBe('open_now');
    expect(plan!.why.memoryFactsUsed).toEqual([]);
  });

  it('Demo/simulated places keep the fail-closed rule without confirmed taste', () => {
    const demoPlaces = sig('places_lunch', (livePlaces.value as any)); // no provenance 'live'
    const s = snap([location, demoPlaces, request('nearby_now')]);
    const c = lunchDetector.detect(s, noMemory)!;
    expect(lunchPreparer.prepare(c, s, noMemory)).toBeNull();
  });

  it('Live provider error or empty list still fails closed (zero venues)', () => {
    for (const value of [{ status: 'error', places: [] }, { status: 'empty', places: [] }]) {
      const s = snap([location, sig('places_lunch', value, { provenance: 'live' }), request('nearby_now')]);
      const c = lunchDetector.detect(s, noMemory)!;
      expect(lunchPreparer.prepare(c, s, noMemory)).toBeNull();
    }
  });
});

describe('HABIT-LEARN: the lunch preparer applies what Yori learned and what the user told it', () => {
  const learnedBurger = {
    key: 'learned_lunch_cuisine',
    value: { cuisine: 'burger', count: 3, total: 4, lastSeen: AS_OF },
    status: 'learned',
    provenance: { source: 'observed', recordedAt: AS_OF },
  } as unknown as MemoryFact;

  it('a learned habit leads the Live list with its plain basis, without any confirm step', () => {
    const c = lunchDetector.detect(snap([location, livePlaces, request('nearby_now')]), [learnedBurger])!;
    const plan = lunchPreparer.prepare(c, snap([location, livePlaces, request('nearby_now')]), [learnedBurger])!;
    const opts = plan.optionsOrSteps as any[];
    expect(opts[0].name).toBe('Mid Closed Grill');
    expect(opts[0].reasonKind).toBe('taste');
    expect(opts[0].habitBasis).toBe('You often pick burger · 3 of your last 4 lunches');
    expect(opts[0].tasteSource).toBe('learned');
    expect(opts[1].habitBasis).toBeUndefined();
    expect(plan.why.memoryFactsUsed.map(f => f.key)).toEqual(['learned_lunch_cuisine']);
    expect(plan.why.derivation).toContain('You often pick burger · 3 of your last 4 lunches');
    expect(plan.requiresConfirmation).toBe(false);
  });

  it('what the user told Yori outranks the learned habit', () => {
    const told = { key: 'taste_preference', value: 'cafe', status: 'confirmed', provenance: { source: 'user_stated', recordedAt: AS_OF } } as unknown as MemoryFact;
    const plan = lunchPreparer.prepare(lunchDetector.detect(snap([location, livePlaces, request('nearby_now')]), [])!, snap([location, livePlaces, request('nearby_now')]), [learnedBurger, told])!;
    const opts = plan.optionsOrSteps as any[];
    expect(opts[0].name).toBe('Near Unknown Cafe');
    expect(opts[0].habitBasis).toBe('You told Yori you like cafe');
    expect(opts[1].name).toBe('Mid Closed Grill');
    expect(opts[1].habitBasis).toBe('You often pick burger · 3 of your last 4 lunches');
  });

  it('a pending proposal shapes nothing (Live falls back to open now)', () => {
    const pending = { ...learnedBurger, status: 'pending' } as unknown as MemoryFact;
    const plan = lunchPreparer.prepare(lunchDetector.detect(snap([location, livePlaces, request('nearby_now')]), [])!, snap([location, livePlaces, request('nearby_now')]), [pending])!;
    expect((plan.optionsOrSteps as any[])[0].reasonKind).toBe('open_now');
  });
});
