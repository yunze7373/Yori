/**
 * Mock Weather Provider Twin
 * Governed by Invariants INV-101, INV-102, INV-103 and AC-204-1.
 *
 * Mock twin of the real weather provider.
 * Guaranteed to emit SimulatedSignal only (source: 'simulated', label: 'simulated').
 */

import {
  createSimulatedSignal,
  type SimulatedProviderAdapter,
  type SimulatedSignal,
} from '../../core/contracts/index.js';
import type { WeatherData } from './weather-types.js';

export interface MockWeatherOptions {
  readonly weather?: WeatherData;
  readonly issuedAt?: string;
  readonly validFor?: number;
  readonly confidence?: number;
}

export const DEFAULT_MOCK_WEATHER: WeatherData = Object.freeze({
  condition: 'clear',
  precipProbability: 0.0,
  temperatureC: 20,
  city: 'San Francisco, CA',
});

export class MockWeatherAdapter implements SimulatedProviderAdapter<WeatherData> {
  public readonly kind = 'mock-weather-adapter';
  public readonly source = 'simulated' as const;

  constructor(private readonly options: MockWeatherOptions = {}) {}

  public getWeather(): WeatherData {
    return this.options.weather ?? DEFAULT_MOCK_WEATHER;
  }

  public signals(asOfIso?: string): readonly SimulatedSignal<WeatherData>[] {
    const issuedAt = this.options.issuedAt ?? asOfIso ?? '2026-10-28T17:00:00.000Z';
    const validFor = this.options.validFor ?? 36000000; // 10h default in mock scenarios
    const confidence = this.options.confidence ?? 0.95;

    const signal = createSimulatedSignal<WeatherData>({
      kind: 'weather',
      value: this.getWeather(),
      issuedAt,
      validFor,
      confidence,
      consentScope: 'device_only',
    });

    return Object.freeze([signal]);
  }
}

export const mockWeatherAdapter = new MockWeatherAdapter();
