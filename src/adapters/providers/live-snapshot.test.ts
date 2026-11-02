import { describe, it, expect } from 'vitest';
import {
  buildLiveSnapshot,
  deriveLiveLivingHeaderFromSnapshot,
  formatLiveTime,
} from './live-snapshot.js';
import { createLiveSignal } from './live-signal.js';
import { createMemoryFact } from '../../core/contracts/index.js';

describe('LiveSnapshot Composer & Derivation (LIVE_FIRST S0)', () => {
  const baseAsOf = '2026-11-02T10:00:00.000Z';
  const tz = 'America/Los_Angeles'; // 10:00 AM UTC = 2:00 AM PST, or 18:00 UTC = 11:00 AM PDT / 10:00 AM PST

  it('builds a valid, deeply frozen ContextSnapshot with clock and timezone signals', () => {
    const snapshot = buildLiveSnapshot({
      asOf: baseAsOf,
      timezone: tz,
    });

    expect(snapshot.asOf).toBe(baseAsOf);
    expect(snapshot.timezone).toBe(tz);
    expect(snapshot.signals.length).toBeGreaterThanOrEqual(2);

    const clockSig = snapshot.signals.find(s => s.kind === 'clock');
    expect(clockSig).toBeDefined();
    expect(clockSig?.source).toBe('real');

    const tzSig = snapshot.signals.find(s => s.kind === 'timezone');
    expect(tzSig).toBeDefined();
    expect(tzSig?.value).toEqual({ timezone: tz, asOf: baseAsOf });

    // Deep freeze enforcement (INV-101)
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.signals)).toBe(true);
    expect(() => {
      (snapshot as any).asOf = '2026-11-02T12:00:00.000Z';
    }).toThrow();
  });

  it('yields empty signal lists when providers are absent, NEVER fabricating fake signals (INV-103)', () => {
    const snapshot = buildLiveSnapshot({
      asOf: baseAsOf,
      timezone: tz,
      locationSignal: null,
      weatherSignal: null,
      routeSignal: null,
      placesSignal: null,
    });

    // Verify: No location_status, weather, travel_estimate, or places_lunch signals exist
    expect(snapshot.signals.find(s => s.kind === 'location_status')).toBeUndefined();
    expect(snapshot.signals.find(s => s.kind === 'location')).toBeUndefined();
    expect(snapshot.signals.find(s => s.kind === 'weather')).toBeUndefined();
    expect(snapshot.signals.find(s => s.kind === 'travel_estimate')).toBeUndefined();
    expect(snapshot.signals.find(s => s.kind === 'places_lunch')).toBeUndefined();
  });

  it('degrades expired signals when composing live snapshot (INV-106)', () => {
    const expiredWeather = createLiveSignal({
      kind: 'weather',
      value: { condition: 'Sunny' },
      provider: 'open-meteo',
      asOf: '2026-11-02T08:00:00.000Z',
      validFor: 3600000, // 1 hour -> expired at 09:00:00
      confidence: 0.9,
      provenance: 'live',
      consentScope: 'device_only',
      status: 'available',
    });

    const snapshot = buildLiveSnapshot({
      asOf: '2026-11-02T10:00:00.000Z', // 2 hours after fetch
      weatherSignal: expiredWeather,
    });

    const weatherSig = snapshot.signals.find(s => s.kind === 'weather');
    expect(weatherSig).toBeDefined();
    expect((weatherSig as any).status).toBe('unavailable');
    expect((weatherSig as any).confidence).toBe(0);
    expect((weatherSig as any).notice?.code).toBe('signal_expired');
  });

  it('enforces confirmed-only MemoryPort facts and rejects pending/rejected facts (INV-107)', () => {
    const confirmedFact = createMemoryFact(
      'taste',
      'udon',
      'confirmed',
      { source: 'user_confirmed', recordedAt: baseAsOf },
      baseAsOf
    );
    const pendingFact = createMemoryFact(
      'taste',
      'sushi',
      'pending',
      { source: 'inferred', recordedAt: baseAsOf },
      baseAsOf
    );
    const rejectedFact = createMemoryFact(
      'habit',
      'avoid_tolls',
      'rejected',
      { source: 'user_feedback', recordedAt: baseAsOf },
      baseAsOf
    );

    const snapshot = buildLiveSnapshot({
      asOf: baseAsOf,
      memoryFacts: [confirmedFact, pendingFact, rejectedFact],
    });

    const memSig = snapshot.signals.find(s => s.kind === 'memory_facts');
    expect(memSig).toBeDefined();
    const facts = memSig?.value as any[];
    expect(facts).toHaveLength(1);
    expect(facts[0].key).toBe('taste');
    expect(facts[0].value).toBe('udon');
    expect(facts[0].status).toBe('confirmed');
  });

  describe('deriveLiveLivingHeaderFromSnapshot (Carried finding 1)', () => {
    it('derives honest header with real signals present', () => {
      const locSig = createLiveSignal({
        kind: 'location_status',
        value: { currentArea: 'Downtown Financial', isHome: false },
        provider: 'geolocation',
        asOf: '2026-10-28T18:50:00.000Z',
        validFor: 300000,
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
      });

      const weatherSig = createLiveSignal({
        kind: 'weather',
        value: { condition: 'Rain', forecastOnset: '1:30' },
        provider: 'open-meteo',
        asOf: '2026-10-28T18:50:00.000Z',
        validFor: 1800000,
        confidence: 0.85,
        provenance: 'live',
        consentScope: 'device_only',
      });

      const snapshot = buildLiveSnapshot({
        asOf: '2026-10-28T18:50:00.000Z',
        timezone: 'America/Los_Angeles',
        locationSignal: locSig,
        weatherSignal: weatherSig,
      });

      const header = deriveLiveLivingHeaderFromSnapshot(snapshot, 'America/Los_Angeles');
      expect(header.timeDisplay).toBe('11:50 AM');
      expect(header.weatherDisplay).toBe('Rain from 1:30');
      expect(header.placeDisplay).toBe('Downtown Financial');
      expect(header.formattedLine).toBe('11:50 AM · Rain from 1:30 · Downtown Financial');
    });

    it('strictly outputs "Weather unavailable" and "Location not shared" when signals are missing (NEVER Clear or Home)', () => {
      const emptySnapshot = buildLiveSnapshot({
        asOf: '2026-10-28T17:00:00.000Z',
        timezone: 'America/Los_Angeles',
      });

      const header = deriveLiveLivingHeaderFromSnapshot(emptySnapshot, 'America/Los_Angeles');
      expect(header.timeDisplay).toBe('10:00 AM');
      expect(header.weatherDisplay).toBe('Weather unavailable');
      expect(header.placeDisplay).toBe('Location not shared');
      expect(header.formattedLine).toBe('10:00 AM · Weather unavailable · Location not shared');

      // Assert: "Clear" and "Home" are completely absent
      expect(header.formattedLine).not.toContain('Clear');
      expect(header.formattedLine).not.toContain('Home');
    });

    it('treats degraded/expired weather as "Weather unavailable"', () => {
      const expiredWeather = createLiveSignal({
        kind: 'weather',
        value: { condition: 'Clear' },
        provider: 'open-meteo',
        asOf: '2026-10-28T10:00:00.000Z',
        validFor: 1800000, // 30 min -> expired at 10:30
        confidence: 0.9,
        provenance: 'live',
        consentScope: 'device_only',
        status: 'available',
      });

      const snapshot = buildLiveSnapshot({
        asOf: '2026-10-28T17:00:00.000Z', // 7 hours later
        timezone: 'America/Los_Angeles',
        weatherSignal: expiredWeather,
      });

      const header = deriveLiveLivingHeaderFromSnapshot(snapshot, 'America/Los_Angeles');
      expect(header.weatherDisplay).toBe('Weather unavailable');
      expect(header.formattedLine).not.toContain('Clear');
    });
  });

  describe('formatLiveTime', () => {
    it('formats ISO time correctly across timezones', () => {
      expect(formatLiveTime('2026-10-28T17:00:00.000Z', 'America/Los_Angeles')).toBe('10:00 AM');
      expect(formatLiveTime('2026-10-28T17:00:00.000Z', 'America/New_York')).toBe('1:00 PM');
      expect(formatLiveTime('2026-10-28T17:00:00.000Z', 'Asia/Tokyo')).toBe('2:00 AM');
    });

    it('returns empty string for missing or invalid timestamps', () => {
      expect(formatLiveTime(undefined)).toBe('');
      expect(formatLiveTime('not-a-date')).toBe('');
    });
  });
});
