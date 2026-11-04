/**
 * NEARBY-ESSENTIALS Unit Tests (INBOX-20261104-EC92E9)
 *
 * Scope:
 * 1. Grammar: parses 'supermarket nearby', 'mall nearby', 'convenience store', 'pharmacy' into FIND_ESSENTIALS.
 * 2. Idle chips: Live idle opener provides 'Supermarket nearby'.
 * 3. Offline/demo mode: answers honestly that live places are needed.
 * 4. Live location: prompts for location if required, fails closed if denied.
 * 5. Live search: calls places pipeline and returns top result card + compact trace.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createActionStateStore } from './store.js';
import { defaultCommandInterpreter } from '../conversation/grammar.js';
import { defaultLocationPort } from '../../adapters/providers/location-port.js';
import type { ContextSnapshot } from '../../core/contracts/index.js';
import type { PlaceItem } from '../../adapters/providers/places-types.js';

const liveSnapshot = {
  id: 'snap-live-essentials',
  asOf: '2026-11-05T07:00:00.000Z',
  timezone: 'Asia/Tokyo',
  signals: [
    {
      kind: 'places_lunch',
      value: { status: 'available', places: [] },
      source: 'real',
      issuedAt: '2026-11-05T07:00:00.000Z',
      validFor: 300000,
      confidence: 1,
      consentScope: 'local_only',
      provenance: 'live',
    },
  ],
} as unknown as ContextSnapshot;

describe('NEARBY-ESSENTIALS Grammar & Interpreter', () => {
  it.each([
    ['supermarket nearby', 'supermarket'],
    ['supermarket', 'supermarket'],
    ['find a supermarket', 'supermarket'],
    ['nearby supermarkets', 'supermarket'],
    ['groceries', 'supermarket'],
    ['附近的超市', 'supermarket'],
    ['超市', 'supermarket'],
    ['mall nearby', 'shopping_mall'],
    ['shopping mall', 'shopping_mall'],
    ['find a mall', 'shopping_mall'],
    ['商场', 'shopping_mall'],
    ['购物中心', 'shopping_mall'],
    ['convenience store', 'convenience'],
    ['convenience store nearby', 'convenience'],
    ['便利店', 'convenience'],
    ['pharmacy', 'pharmacy'],
    ['pharmacy nearby', 'pharmacy'],
    ['drugstore', 'pharmacy'],
    ['药店', 'pharmacy'],
    ['药房', 'pharmacy'],
    ['nearby essentials', 'supermarket'],
  ])('maps "%s" to FIND_ESSENTIALS with category "%s"', (input, expectedCategory) => {
    const cmd = defaultCommandInterpreter.interpret(input);
    expect(cmd.intent).toBe('FIND_ESSENTIALS');
    expect(cmd.slots.category).toBe(expectedCategory);
  });
});

describe('NEARBY-ESSENTIALS Store & Conversation Flow', () => {
  afterEach(() => {
    defaultLocationPort.reset?.();
  });

  it('adds "Supermarket nearby" to Live idle opener chips', () => {
    const store = createActionStateStore();
    store.setCommandContext({ sceneId: 'live' } as any);
    store.openConversation();
    const transcript = store.getTranscript();
    expect(transcript.length).toBeGreaterThan(0);
    const welcome = transcript[0]!;
    expect(welcome.suggestions).toContain('Supermarket nearby');
  });

  it('demo / offline mode answers honestly that live places are needed', () => {
    const store = createActionStateStore();
    // Default mode is demo / offline (sceneId: 'clear')
    const res = store.submitMessage('supermarket nearby');
    expect(res.rule).toBe('degraded_failure');
    expect(res.response).toMatch(/Live places search is needed to find nearby supermarkets/i);

    const resPharmacy = store.submitMessage('pharmacy nearby');
    expect(resPharmacy.rule).toBe('degraded_failure');
    expect(resPharmacy.response).toMatch(/Live places search is needed to find nearby pharmacies/i);
  });

  it('in Live mode without location fix, requests location permission', () => {
    defaultLocationPort.setLocation('prompt');
    const store = createActionStateStore();
    const res = store.submitMessage('supermarket nearby', { sceneId: 'live', snapshot: liveSnapshot } as any);
    expect(res.rule).toBe('degraded_failure');
    expect(res.response).toContain('I need your location to find places near you.');
    const transcript = store.getTranscript();
    const last = transcript[transcript.length - 1]!;
    expect(last.actions).toBeDefined();
    expect(last.actions?.some(a => a.action === 'allow_location')).toBe(true);
  });

  it('in Live mode with denied location, gives honest error message', () => {
    defaultLocationPort.setLocation('denied');
    const store = createActionStateStore();
    const res = store.submitMessage('supermarket nearby', { sceneId: 'live', snapshot: liveSnapshot } as any);
    expect(res.rule).toBe('degraded_failure');
    expect(res.response).toContain('Location access is blocked in your browser settings');
  });

  it('in Live mode with location, executes search and returns real top result card and compact trace', async () => {
    defaultLocationPort.setLocation('available', { lat: 35.689, lng: 139.692 });
    const store = createActionStateStore();

    const mockPlaces: PlaceItem[] = [
      {
        placeId: 'osm-way-101',
        osmId: 101,
        coords: { lat: 35.69, lng: 139.693 },
        name: 'Seijo Ishii Shinjuku',
        category: 'supermarket',
        source: 'live',
        fetchedAt: '2026-11-05T07:00:00.000Z',
        straightLineDistanceMeters: 145,
        straightLineDistanceLabel: '145 m (straight-line)',
        openingStatus: 'open',
        attribution: 'OpenStreetMap via Overpass (ODbL)',
      },
      {
        placeId: 'osm-way-102',
        osmId: 102,
        coords: { lat: 35.692, lng: 139.695 },
        name: 'Maruetsu Petit',
        category: 'supermarket',
        source: 'live',
        fetchedAt: '2026-11-05T07:00:00.000Z',
        straightLineDistanceMeters: 420,
        straightLineDistanceLabel: '420 m (straight-line)',
        openingStatus: 'closed',
        attribution: 'OpenStreetMap via Overpass (ODbL)',
      },
    ];

    store.setPlacesFetcher!(async (cat, coords) => {
      expect(cat).toBe('supermarket');
      expect(coords.lat).toBe(35.689);
      expect(coords.lng).toBe(139.692);
      return {
        places: mockPlaces,
        discovery: 'osm',
        attribution: 'OpenStreetMap via Overpass (ODbL)',
      };
    });

    const res = await store.submitMessageAsync!('supermarket nearby', {
      sceneId: 'live',
      snapshot: liveSnapshot,
    } as any);

    expect(res.rule).toBe('executable_determinate');
    expect(res.response).toContain('Seijo Ishii Shinjuku');
    expect(res.response).toContain('145 m (straight-line)');

    const transcript = store.getTranscript();
    const assistantMsg = transcript[transcript.length - 1]!;
    expect(assistantMsg.lunchCard).toBeDefined();
    expect(assistantMsg.lunchCard?.name).toBe('Seijo Ishii Shinjuku');
    expect(assistantMsg.lunchCard?.straightLineDistanceLabel).toBe('145 m (straight-line)');
    expect(assistantMsg.lunchCard?.openingStatus).toBe('open');
    expect(assistantMsg.lunchCard?.attribution).toBe('OpenStreetMap via Overpass (ODbL)');

    // Compact trace assertions
    expect(assistantMsg.traceRun).toBeDefined();
    const run = assistantMsg.traceRun!;
    expect(run.status).toBe('completed');
    expect(run.topPick?.name).toBe('Seijo Ishii Shinjuku');

    const placesStep = run.steps.find(s => s.kind === 'places');
    expect(placesStep).toBeDefined();
    expect(placesStep?.summary).toContain('Found 2 places via OpenStreetMap');
  });

  it('in Live mode when 0 places found, gives honest not-found message', async () => {
    defaultLocationPort.setLocation('available', { lat: 35.689, lng: 139.692 });
    const store = createActionStateStore();

    store.setPlacesFetcher!(async () => ({
      places: [],
      discovery: 'osm',
      attribution: 'OpenStreetMap via Overpass (ODbL)',
    }));

    const res = await store.submitMessageAsync!('pharmacy nearby', {
      sceneId: 'live',
      snapshot: liveSnapshot,
    } as any);

    expect(res.rule).toBe('degraded_failure');
    expect(res.response).toContain('No pharmacies found nearby within 1.5 km');
  });
});
