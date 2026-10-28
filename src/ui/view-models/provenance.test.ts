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
});
