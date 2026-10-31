import { describe, it, expect } from 'vitest';
import {
  classifyFactSource,
  provenanceLabel,
  isFactUserConfirmed,
  formatProvenanceAttrs,
  isWeatherStale,
  resolveElementProvenance,
  type FactLike,
} from './provenance.js';

describe('Provenance Classifier (src/ui/view-models/provenance.ts)', () => {
  const userConfirmedKeys = new Set(['confirmed_preference_1']);

  it('classifies a status-confirmed demo fact with demo provenance as demo_sample', () => {
    const demoFact: FactLike = {
      key: 'taste_preference',
      status: 'confirmed',
      provenance: { source: 'sample_profile' },
      value: 'ramen_or_salad',
    };

    expect(classifyFactSource(demoFact, userConfirmedKeys)).toBe('demo_sample');
    expect(provenanceLabel(classifyFactSource(demoFact, userConfirmedKeys))).toBe(
      'Demo profile · sample preference'
    );
    expect(isFactUserConfirmed(demoFact, userConfirmedKeys)).toBe(false);
  });

  it('classifies a status-confirmed fact missing from userConfirmedKeys as demo_sample', () => {
    const fact: FactLike = {
      key: 'some_habit',
      status: 'confirmed',
      provenance: { source: 'user_confirmed' }, // source is user_confirmed, BUT not in userConfirmedKeys!
    };

    expect(classifyFactSource(fact, userConfirmedKeys)).toBe('demo_sample');
    expect(isFactUserConfirmed(fact, userConfirmedKeys)).toBe(false);
  });

  it('classifies a fact with no provenance as demo_sample', () => {
    const fact: FactLike = {
      key: 'favorite_cuisine',
      status: 'confirmed',
    };

    expect(classifyFactSource(fact, userConfirmedKeys)).toBe('demo_sample');
  });

  it('correctly yields user_confirmed and Confirmed label when provenance source is user_confirmed AND in userConfirmedKeys', () => {
    const confirmedFact: FactLike = {
      key: 'confirmed_preference_1',
      status: 'confirmed',
      provenance: { source: 'user_confirmed' },
    };

    const kind = classifyFactSource(confirmedFact, userConfirmedKeys);
    expect(kind).toBe('user_confirmed');
    expect(provenanceLabel(kind)).toBe('Confirmed');
    expect(isFactUserConfirmed(confirmedFact, userConfirmedKeys)).toBe(true);
  });

  it('classifies user_request as user_request', () => {
    expect(classifyFactSource('user_request', userConfirmedKeys)).toBe('user_request');
    expect(provenanceLabel('user_request')).toBe('Your request · this session');
  });

  it('classifies provider source as provider', () => {
    const providerFact: FactLike = {
      key: 'weather_status',
      provenance: { source: 'provider' },
    };
    expect(classifyFactSource(providerFact, userConfirmedKeys)).toBe('provider');
    expect(provenanceLabel('provider')).toBe('Live provider');
  });

  describe('Truthful XMemo Sync Provenance (Reviewer Finding P2)', () => {
    it('classifies facts with source xmemo as synced with truthful Synced from XMemo label', () => {
      const xmemoFact: FactLike = {
        key: 'prep_buffer_preference',
        status: 'confirmed',
        provenance: { source: 'xmemo', note: 'Synced from XMemo vault' },
        value: { prepMinutes: 25, bufferMinutes: 10 },
      };

      const kind = classifyFactSource(xmemoFact, userConfirmedKeys);
      expect(kind).toBe('synced');
      expect(provenanceLabel(kind)).toBe('Synced from XMemo');
      expect(isFactUserConfirmed(xmemoFact, userConfirmedKeys)).toBe(false);
    });

    it('classifies key present in syncedKeys as synced when not locally confirmed', () => {
      const syncedKeys = new Set(['prep_buffer_minutes']);
      expect(classifyFactSource('prep_buffer_minutes', userConfirmedKeys, undefined, syncedKeys)).toBe('synced');
      expect(provenanceLabel('synced')).toBe('Synced from XMemo');
    });

    it('prioritizes local user confirmation over remote sync when key is locally confirmed', () => {
      const userConfirmed = new Set(['prep_buffer_preference']);
      const localConfirmedFact: FactLike = {
        key: 'prep_buffer_preference',
        status: 'confirmed',
        provenance: { source: 'user_confirmed' },
        value: { prepMinutes: 30, bufferMinutes: 15 },
      };
      const syncedKeys = new Set(['prep_buffer_preference']);

      const kind = classifyFactSource(localConfirmedFact, userConfirmed, undefined, syncedKeys);
      expect(kind).toBe('user_confirmed');
      expect(provenanceLabel(kind)).toBe('Confirmed');
      expect(isFactUserConfirmed(localConfirmedFact, userConfirmed)).toBe(true);
    });
  });

  describe('formatProvenanceAttrs', () => {
    it('formats live provenance with source and fetchedAt attributes', () => {
      const attrs = formatProvenanceAttrs('live', 'open-meteo', '2026-11-01T06:00:00.000Z');
      expect(attrs).toBe('data-provenance="live" data-source="open-meteo" data-fetched-at="2026-11-01T06:00:00.000Z"');
    });

    it('defaults source and fetchedAt when not provided for live', () => {
      const attrs = formatProvenanceAttrs('live');
      expect(attrs).toContain('data-provenance="live"');
      expect(attrs).toContain('data-source="live_feed"');
      expect(attrs).toContain('data-fetched-at="');
    });

    it('formats fixture, user, and none with simple data-provenance attribute', () => {
      expect(formatProvenanceAttrs('fixture')).toBe('data-provenance="fixture"');
      expect(formatProvenanceAttrs('user')).toBe('data-provenance="user"');
      expect(formatProvenanceAttrs('none')).toBe('data-provenance="none"');
    });
  });

  describe('isWeatherStale', () => {
    const fixedNow = 1761984000000; // arbitrary fixed epoch

    it('returns false if signal is missing or null', () => {
      expect(isWeatherStale(null, fixedNow)).toBe(false);
      expect(isWeatherStale(undefined, fixedNow)).toBe(false);
    });

    it('returns false when weather data is fresh (within 2h validFor)', () => {
      const signal = {
        fetchedAt: new Date(fixedNow - 30 * 60 * 1000).toISOString(), // 30 min ago
        validFor: 7200000, // 2h
      };
      expect(isWeatherStale(signal, fixedNow)).toBe(false);
    });

    it('returns true when weather data fetchedAt is older than validFor', () => {
      const signal = {
        fetchedAt: new Date(fixedNow - 3 * 3600 * 1000).toISOString(), // 3h ago
        validFor: 7200000, // 2h
      };
      expect(isWeatherStale(signal, fixedNow)).toBe(true);
    });

    it('falls back to issuedAt if fetchedAt is missing', () => {
      const signal = {
        issuedAt: new Date(fixedNow - 2.5 * 3600 * 1000).toISOString(), // 2.5h ago
        validFor: 7200000,
      };
      expect(isWeatherStale(signal, fixedNow)).toBe(true);
    });

    it('uses 2h default window if validFor is unspecified', () => {
      const freshSignal = {
        fetchedAt: new Date(fixedNow - 1 * 3600 * 1000).toISOString(), // 1h ago
      };
      expect(isWeatherStale(freshSignal, fixedNow)).toBe(false);

      const staleSignal = {
        fetchedAt: new Date(fixedNow - 2.5 * 3600 * 1000).toISOString(), // 2.5h ago
      };
      expect(isWeatherStale(staleSignal, fixedNow)).toBe(true);
    });
  });

  describe('resolveElementProvenance', () => {
    it('in Demo mode, returns fixture for scene elements', () => {
      expect(resolveElementProvenance('demo', 'scene_plan')).toEqual({ provenance: 'fixture' });
      expect(resolveElementProvenance('demo', 'scene_map')).toEqual({ provenance: 'fixture' });
      expect(resolveElementProvenance('demo', 'scene_timeline')).toEqual({ provenance: 'fixture' });
      expect(resolveElementProvenance('demo', 'scene_candidate')).toEqual({ provenance: 'fixture' });
    });

    it('in Demo mode, returns user for user memories', () => {
      expect(resolveElementProvenance('demo', 'user_memory')).toEqual({ provenance: 'user' });
    });

    it('in Live mode, returns live with source device_clock for clock', () => {
      const res = resolveElementProvenance('live', 'device_clock');
      expect(res.provenance).toBe('live');
      expect(res.source).toBe('device_clock');
      expect(res.fetchedAt).toBeDefined();
    });

    it('in Live mode, returns live with source open-meteo for weather_live', () => {
      const res = resolveElementProvenance('live', 'weather_live');
      expect(res.provenance).toBe('live');
      expect(res.source).toBe('open-meteo');
      expect(res.fetchedAt).toBeDefined();
    });

    it('in Live mode, returns live with source geolocation for location_shared', () => {
      const res = resolveElementProvenance('live', 'location_shared');
      expect(res.provenance).toBe('live');
      expect(res.source).toBe('geolocation');
      expect(res.fetchedAt).toBeDefined();
    });

    it('in Live mode, returns none for empty, unshared location, weather off/stale, places not enabled, route unavailable', () => {
      expect(resolveElementProvenance('live', 'weather_off')).toEqual({ provenance: 'none' });
      expect(resolveElementProvenance('live', 'weather_stale')).toEqual({ provenance: 'none' });
      expect(resolveElementProvenance('live', 'location_prompt')).toEqual({ provenance: 'none' });
      expect(resolveElementProvenance('live', 'location_denied')).toEqual({ provenance: 'none' });
      expect(resolveElementProvenance('live', 'places_not_enabled')).toEqual({ provenance: 'none' });
      expect(resolveElementProvenance('live', 'route_unavailable')).toEqual({ provenance: 'none' });
      expect(resolveElementProvenance('live', 'empty')).toEqual({ provenance: 'none' });
    });
  });
});
