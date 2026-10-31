import { describe, it, expect } from 'vitest';
import {
  classifyFactSource,
  provenanceLabel,
  isFactUserConfirmed,
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
});
