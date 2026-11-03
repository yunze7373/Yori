/**
 * D5-LIVE-FORECAST: the depart preparer with a target-time forecast signal.
 * - Rain expected in the trip window -> umbrella + forward-looking evidence; leave-by UNCHANGED
 *   unless the user confirmed a rain buffer (S4c), which moves it by exactly those minutes and is
 *   cited with its user provenance. Sample/pending/out-of-range buffers are never applied.
 * - Dry forecast -> no umbrella. No forecast -> the existing current-conditions path, unchanged.
 */

import { describe, it, expect } from 'vitest';
import { DepartPreparer } from './index.js';
import {
  createSimulatedSignal,
  createMemoryFact,
  freezeSnapshot,
  type ContextSnapshot,
  type IntentCandidate,
  type MemoryFact,
} from '../../core/contracts/index.js';
import { appliedRainBufferMinutes, forecastCitation, forecastStatusLine } from '../../ui/view-models/rain-buffer.js';
import { resolveWeatherForecastUrl } from '../../ui/living-context/weather-request.js';

const ASOF = '2026-11-03T03:00:00.000Z'; // 12:00 Tokyo
const APPT = '2026-11-03T15:00:00+09:00';
const preparer = new DepartPreparer();

const calendar = createSimulatedSignal({
  kind: 'calendar',
  value: { title: 'Piano lesson', startTime: APPT, timezone: 'Asia/Tokyo' },
  issuedAt: ASOF,
  validFor: 3600_000,
  confidence: 1,
  consentScope: 'device_only',
});
const candidate: IntentCandidate = {
  intent: 'depart',
  confidence: 1,
  evidence: [calendar],
  metadata: { title: 'Piano lesson', startTime: APPT, timezone: 'Asia/Tokyo' },
};
const travel = createSimulatedSignal({
  kind: 'travel_estimate',
  value: { mode: 'drive', travelMinutes: 30 },
  issuedAt: ASOF,
  validFor: 3600_000,
  confidence: 0.9,
  consentScope: 'device_only',
});

function forecastSignal(rainExpected: boolean) {
  return createSimulatedSignal({
    kind: 'weather',
    value: {
      condition: rainExpected ? 'rain' : 'cloudy',
      precipProbability: rainExpected ? 0.7 : 0.1,
      forecast: {
        rainExpected,
        rainFrom: rainExpected ? '2026-11-03T05:00:00.000Z' : undefined,
        rainTo: rainExpected ? '2026-11-03T06:00:00.000Z' : undefined,
        validAt: { from: '2026-11-03T05:25:00.000Z', to: '2026-11-03T06:00:00.000Z' },
        confidence: 0.8,
      },
    },
    issuedAt: ASOF,
    validFor: 3600_000,
    confidence: 0.8,
    consentScope: 'device_only',
  });
}
const currentClear = createSimulatedSignal({
  kind: 'weather',
  value: { condition: 'clear', precipProbability: 0 },
  issuedAt: ASOF,
  validFor: 3600_000,
  confidence: 1,
  consentScope: 'device_only',
});

const at = '2026-11-03T02:00:00.000Z';
const base: MemoryFact[] = [
  createMemoryFact('prep_buffer_minutes', 5, 'confirmed', { source: 'user_confirmed', recordedAt: at }, at),
  createMemoryFact('prep_duration_minutes', 20, 'confirmed', { source: 'user_confirmed', recordedAt: at }, at),
];
const rainBuffer = (value: number, status: 'confirmed' | 'pending' = 'confirmed', source = 'user_confirmed') =>
  createMemoryFact('rain_buffer_minutes', value, status, { source: source as any, recordedAt: at }, at);

function plan(signals: readonly any[], memory: readonly MemoryFact[]) {
  const snapshot: ContextSnapshot = freezeSnapshot({ id: 's', asOf: ASOF, timezone: 'Asia/Tokyo', signals: [calendar, travel, ...signals] });
  return preparer.prepare(candidate, snapshot, memory)!;
}

describe('D5 depart preparer with a trip-window forecast', () => {
  it('rain expected, no rain buffer: umbrella + forward evidence, leave-by unchanged (2:25 PM)', () => {
    const p = plan([currentClear, forecastSignal(true)], base);
    expect(p.leaveAt).toBe('2026-11-03T05:25:00.000Z');
    expect(p.checklist).toEqual(['umbrella']);
    const cite = p.why.evidenceSignals.find(s => s.kind === 'weather') as any;
    expect(cite.description).toBe('Rain expected 2:00–3:00 PM during your trip · Open-Meteo hourly forecast');
    expect(cite.value).toMatchObject({ forecast: true, rainExpected: true, rainSpan: '2:00–3:00 PM', confidence: 0.8 });
    expect(p.why.derivation).toContain('Rain expected (forecast)');
    expect(p.why.derivation).toContain('leave-by unchanged: no rain buffer set');
    expect(p.why.memoryFactsUsed.some(f => f.key === 'rain_buffer_minutes')).toBe(false);
    expect(appliedRainBufferMinutes(p)).toBe(0);
    expect(forecastStatusLine(p, 'ok')).toBe('Forecast · leave-by unchanged, no rain buffer set');
  });

  it('rain expected + a user-confirmed 10 min rain buffer: leave-by moves by exactly 10 min, cited with user provenance', () => {
    const without = plan([forecastSignal(true)], base);
    const withBuffer = plan([forecastSignal(true)], [...base, rainBuffer(10)]);
    expect(Date.parse(without.leaveAt!) - Date.parse(withBuffer.leaveAt!)).toBe(10 * 60_000);
    expect(Date.parse(without.prepareAt!) - Date.parse(withBuffer.prepareAt!)).toBe(10 * 60_000);
    expect(withBuffer.leaveAt).toBe('2026-11-03T05:15:00.000Z');
    const cited = withBuffer.why.memoryFactsUsed.find(f => f.key === 'rain_buffer_minutes') as any;
    expect(cited).toMatchObject({ value: 10, status: 'confirmed', provenance: { source: 'user_confirmed' } });
    expect(withBuffer.why.derivation).toContain('5m buffer + your 10m rain buffer');
    expect(appliedRainBufferMinutes(withBuffer)).toBe(10);
    expect(forecastStatusLine(withBuffer, 'ok')).toBe('Forecast · leaving 10 min earlier (your rain buffer)');
  });

  it('a rain buffer that is sample/inferred, pending, zero or over 60 is never applied', () => {
    for (const bad of [rainBuffer(10, 'confirmed', 'seed'), rainBuffer(10, 'confirmed', 'inferred'), rainBuffer(10, 'pending'), rainBuffer(0), rainBuffer(90), rainBuffer(7.5)]) {
      const p = plan([forecastSignal(true)], [...base, bad]);
      expect(p.leaveAt, JSON.stringify(bad)).toBe('2026-11-03T05:25:00.000Z');
      expect(appliedRainBufferMinutes(p)).toBe(0);
    }
  });

  it('dry forecast: no umbrella, no buffer even if one is confirmed; the status says so', () => {
    const p = plan([forecastSignal(false)], [...base, rainBuffer(10)]);
    expect(p.checklist).toEqual([]);
    expect(p.leaveAt).toBe('2026-11-03T05:25:00.000Z');
    expect(forecastCitation(p)).toEqual({ rainExpected: false, rainSpan: null });
    expect(forecastStatusLine(p, 'ok')).toBe('Forecast · dry for your trip');
  });

  it('a STALE forecast never shadows current conditions: current rain still gives the umbrella + current evidence', () => {
    // Reviewer 48aae24c negative case: dry forecast issued 90 min before asOf, validFor 60 min.
    const staleDry = createSimulatedSignal({
      kind: 'weather',
      value: { condition: 'cloudy', precipProbability: 0.1, forecast: { rainExpected: false, confidence: 0.8 } },
      issuedAt: '2026-11-03T01:30:00.000Z',
      validFor: 3600_000,
      confidence: 0.8,
      consentScope: 'device_only',
    });
    const currentRain = createSimulatedSignal({
      kind: 'weather',
      value: { condition: 'rain', precipProbability: 0.8 },
      issuedAt: ASOF,
      validFor: 3600_000,
      confidence: 1,
      consentScope: 'device_only',
    });
    for (const order of [[staleDry, currentRain], [currentRain, staleDry]]) {
      const p = plan(order, [...base, rainBuffer(10)]);
      expect(p.checklist).toEqual(['umbrella']);
      const cite = p.why.evidenceSignals.find(s => s.kind === 'weather') as any;
      expect(cite?.description).toBe('Rain forecast'); // the existing current-conditions citation
      expect(forecastCitation(p)).toBeNull();
      expect(p.leaveAt).toBe('2026-11-03T05:25:00.000Z'); // no buffer without a fresh forecast
      expect(forecastStatusLine(p, 'expired')).toBe('Forecast expired · using current conditions');
    }
  });

  it('current-conditions rain never applies the rain buffer (forecast-only rule)', () => {
    const currentRain = createSimulatedSignal({
      kind: 'weather',
      value: { condition: 'rain', precipProbability: 0.8 },
      issuedAt: ASOF,
      validFor: 3600_000,
      confidence: 1,
      consentScope: 'device_only',
    });
    const p = plan([currentRain], [...base, rainBuffer(10)]);
    expect(p.checklist).toEqual(['umbrella']);
    expect(p.leaveAt).toBe('2026-11-03T05:25:00.000Z');
    expect(appliedRainBufferMinutes(p)).toBe(0);
  });

  it('no forecast: current-conditions path unchanged; an unavailable forecast is labelled as such', () => {
    const p = plan([currentClear], [...base, rainBuffer(10)]);
    expect(forecastCitation(p)).toBeNull();
    expect((p.why.evidenceSignals.find(s => s.kind === 'weather') as any).description).toBe('Weather conditions');
    expect(p.leaveAt).toBe('2026-11-03T05:25:00.000Z');
    expect(forecastStatusLine(p, 'unavailable')).toBe('Forecast unavailable · using current conditions');
    expect(forecastStatusLine(p, undefined)).toBeUndefined();
    // With no current conditions either, the label never claims to use them.
    const none = plan([], base);
    expect(forecastStatusLine(none, 'expired')).toBe('Forecast expired · no current conditions either');
    expect(forecastStatusLine(none, 'unavailable')).toBe('Forecast unavailable · no current conditions either');
  });
});

describe('D5 forecast request (client)', () => {
  const fix = { status: 'available', source: 'geolocation', coords: { lat: 35.68951, lng: 139.69171 } } as any;
  const window = { leaveAt: '2026-11-03T05:25:00.000Z', apptAt: '2026-11-03T06:00:00.000Z' };
  const now = Date.parse(ASOF);

  it('Live without consent, without a fix, or in demo: no request at all', () => {
    expect(resolveWeatherForecastUrl('live', fix, undefined, window, now)).toBeNull();
    expect(resolveWeatherForecastUrl('live', fix, 'denied', window, now)).toBeNull();
    expect(resolveWeatherForecastUrl('live', { status: 'prompt' } as any, 'granted', window, now)).toBeNull();
    expect(resolveWeatherForecastUrl('demo', fix, 'granted', window, now)).toBeNull();
  });

  it('consented: rounded fix and the [leave-by, appointment] window; an ended window -> no request', () => {
    expect(resolveWeatherForecastUrl('live', fix, 'granted', window, now)).toBe(
      '/api/weather/forecast?coords=35.690%2C139.692&from=2026-11-03T05:25:00.000Z&to=2026-11-03T06:00:00.000Z'
    );
    expect(resolveWeatherForecastUrl('live', fix, 'granted', window, Date.parse('2026-11-03T07:00:00.000Z'))).toBeNull();
    // A leave-by already in the past starts the window at most 30 min back.
    const late = resolveWeatherForecastUrl('live', fix, 'granted', window, Date.parse('2026-11-03T05:50:00.000Z'))!;
    expect(new URL(late, 'http://x').searchParams.get('from')).toBe('2026-11-03T05:25:00.000Z');
  });
});
