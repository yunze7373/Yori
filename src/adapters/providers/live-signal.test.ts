import { describe, it, expect } from 'vitest';
import {
  createLiveSignal,
  isLiveSignalExpired,
  degradeIfExpired,
  createEmptyLiveSignal,
} from './live-signal.js';

describe('LiveSignal Contract & Envelope (INV-101, INV-102, INV-106)', () => {
  const validAsOf = '2026-11-02T10:00:00.000Z';

  it('creates a validated, deeply frozen LiveSignal with correct fields and types', () => {
    const signal = createLiveSignal({
      kind: 'weather',
      value: { condition: 'clear', temperature: 18 },
      provider: 'open-meteo',
      asOf: validAsOf,
      validFor: 3600000,
      confidence: 0.95,
      provenance: 'live',
      consentScope: 'device_only',
      status: 'available',
    });

    expect(signal.kind).toBe('weather');
    expect(signal.provider).toBe('open-meteo');
    expect(signal.asOf).toBe(validAsOf);
    expect(signal.issuedAt).toBe(validAsOf);
    expect(signal.validFor).toBe(3600000);
    expect(signal.confidence).toBe(0.95);
    expect(signal.provenance).toBe('live');
    expect(signal.status).toBe('available');
    expect(signal.consentScope).toBe('device_only');
    expect(signal.source).toBe('real');
    expect(signal.label).toBe('real');
    expect(signal.value).toEqual({ condition: 'clear', temperature: 18 });

    // Deep freeze enforcement (INV-101)
    expect(Object.isFrozen(signal)).toBe(true);
    expect(Object.isFrozen(signal.value)).toBe(true);
    expect(() => {
      (signal as any).confidence = 0.5;
    }).toThrow();
    expect(() => {
      (signal.value as any).temperature = 25;
    }).toThrow();
  });

  it('maps provenance simulated correctly to source=simulated, label=simulated (INV-102)', () => {
    const signal = createLiveSignal({
      kind: 'clock',
      value: { tick: 1 },
      provider: 'simulated_clock',
      asOf: validAsOf,
      validFor: 1000,
      confidence: 1.0,
      provenance: 'simulated',
      consentScope: 'device_only',
    });

    expect(signal.provenance).toBe('simulated');
    expect(signal.source).toBe('simulated');
    expect(signal.label).toBe('simulated');
  });

  it('maps provenance user correctly to source=real, label=real (INV-102)', () => {
    const signal = createLiveSignal({
      kind: 'preference',
      value: { cuisine: 'ramen' },
      provider: 'user_setting',
      asOf: validAsOf,
      validFor: 86400000,
      confidence: 1.0,
      provenance: 'user',
      consentScope: 'local_only',
    });

    expect(signal.provenance).toBe('user');
    expect(signal.source).toBe('real');
    expect(signal.label).toBe('real');
  });

  it('enforces fail-closed validation on timestamps, durations, and confidence', () => {
    // Invalid asOf
    expect(() =>
      createLiveSignal({
        kind: 'weather',
        value: {},
        provider: 'open-meteo',
        asOf: 'invalid-date',
        validFor: 60000,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      })
    ).toThrow(/asOf must be a valid ISO-8601 string/);

    // Negative / zero validFor
    expect(() =>
      createLiveSignal({
        kind: 'weather',
        value: {},
        provider: 'open-meteo',
        asOf: validAsOf,
        validFor: 0,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      })
    ).toThrow(/validFor must be a finite positive number/);

    expect(() =>
      createLiveSignal({
        kind: 'weather',
        value: {},
        provider: 'open-meteo',
        asOf: validAsOf,
        validFor: -100,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      })
    ).toThrow(/validFor must be a finite positive number/);

    // Invalid confidence
    expect(() =>
      createLiveSignal({
        kind: 'weather',
        value: {},
        provider: 'open-meteo',
        asOf: validAsOf,
        validFor: 60000,
        confidence: 1.5,
        provenance: 'live',
        consentScope: 'device_only',
      })
    ).toThrow(/confidence must be a finite number between 0 and 1/);

    expect(() =>
      createLiveSignal({
        kind: 'weather',
        value: {},
        provider: 'open-meteo',
        asOf: validAsOf,
        validFor: 60000,
        confidence: -0.1,
        provenance: 'live',
        consentScope: 'device_only',
      })
    ).toThrow(/confidence must be a finite number between 0 and 1/);

    // Empty provider or kind
    expect(() =>
      createLiveSignal({
        kind: '',
        value: {},
        provider: 'open-meteo',
        asOf: validAsOf,
        validFor: 60000,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      })
    ).toThrow(/kind must be a non-empty string/);

    expect(() =>
      createLiveSignal({
        kind: 'weather',
        value: {},
        provider: '',
        asOf: validAsOf,
        validFor: 60000,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      })
    ).toThrow(/provider must be a non-empty string/);
  });

  it('evaluates expiration correctly via isLiveSignalExpired (INV-106)', () => {
    const signal = createLiveSignal({
      kind: 'location',
      value: { lat: 37.77, lng: -122.41 },
      provider: 'geolocation',
      asOf: '2026-11-02T10:00:00.000Z',
      validFor: 60000, // 60s -> expires at 10:01:00.000Z
      confidence: 0.9,
      provenance: 'live',
      consentScope: 'device_only',
    });

    expect(isLiveSignalExpired(signal, '2026-11-02T10:00:30.000Z')).toBe(false);
    expect(isLiveSignalExpired(signal, '2026-11-02T10:01:00.000Z')).toBe(false);
    expect(isLiveSignalExpired(signal, '2026-11-02T10:01:01.000Z')).toBe(true);
    expect(isLiveSignalExpired(signal, '2026-11-02T10:05:00.000Z')).toBe(true);
  });

  it('degrades expired signals to unavailable status with human-first notice (INV-103, INV-106)', () => {
    const signal = createLiveSignal({
      kind: 'weather',
      value: { condition: 'Rain' },
      provider: 'open-meteo',
      asOf: '2026-11-02T10:00:00.000Z',
      validFor: 1800000, // 30 min -> expires at 10:30:00
      confidence: 0.8,
      provenance: 'live',
      consentScope: 'device_only',
      status: 'available',
    });

    // Before expiry: returns original signal
    const fresh = degradeIfExpired(signal, '2026-11-02T10:20:00.000Z');
    expect(fresh).toBe(signal);
    expect(fresh.status).toBe('available');

    // After expiry: degrades
    const degraded = degradeIfExpired(signal, '2026-11-02T10:35:00.000Z');
    expect(degraded).not.toBe(signal);
    expect(degraded.status).toBe('unavailable');
    expect(degraded.confidence).toBe(0);
    expect(degraded.notice).toBeDefined();
    expect(degraded.notice?.code).toBe('signal_expired');
    expect(degraded.notice?.humanNotice).toBe('weather data is unavailable (expired)');
    expect(degraded.notice?.provider).toBe('open-meteo');
    expect(degraded.notice?.fetchedAt).toBe('2026-11-02T10:00:00.000Z');
    expect(Object.isFrozen(degraded)).toBe(true);
  });

  it('creates honest empty signals with human-first notices via createEmptyLiveSignal (INV-103)', () => {
    const emptySignal = createEmptyLiveSignal({
      kind: 'location_status',
      provider: 'geolocation',
      asOf: validAsOf,
      reason: 'permission_denied',
      humanNotice: 'Location permission was not granted',
    });

    expect(emptySignal.kind).toBe('location_status');
    expect(emptySignal.provider).toBe('geolocation');
    expect(emptySignal.status).toBe('permission_needed');
    expect(emptySignal.confidence).toBe(0);
    expect(emptySignal.value).toBeNull();
    expect(emptySignal.notice?.humanNotice).toBe('Location permission was not granted');
    expect(emptySignal.notice?.code).toBe('permission_denied');
  });
});
