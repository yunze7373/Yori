/**
 * Unit Tests for Fuel Plugin (V5-FUEL / AC-212-1, AC-212-2, AC-EXT-1)
 */

import { describe, it, expect } from 'vitest';
import { fuelPlugin } from './index.js';
import { fuelDetector } from './detector.js';
import { FuelPreparer } from './preparer.js';
import { FuelPlacesAdapter } from './adapter.js';
import {
  createSimulatedSignal,
  type ContextSnapshot,
} from '../../core/contracts/index.js';
import { FixtureLocationPort } from '../../adapters/providers/location-port.js';
import { SimulatedPlacesProvider } from '../../adapters/providers/simulated-places-provider.js';
import { staticPluginRegistry } from '../registry.js';
import { computeSceneState } from '../../ui/living-context/app.js';

describe('V5-FUEL: Fuel Plugin & Extensibility (AC-EXT-1)', () => {
  it('registers in staticPluginRegistry without core diff', () => {
    expect(staticPluginRegistry.has('fuel')).toBe(true);
    const plugin = staticPluginRegistry.get('fuel');
    expect(plugin).toBeDefined();
    expect(plugin?.id).toBe('fuel');
    expect(plugin?.name).toBe('Fuel Plugin');
    expect(fuelPlugin.id).toBe('fuel');
  });

  it('fuelDetector: detects low fuel signal', () => {
    const lowFuelSignal = createSimulatedSignal({
      kind: 'fuel_status',
      value: { fuelPercent: 12, rangeMiles: 20, needsFuel: true },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });

    const snapshot: ContextSnapshot = {
      id: 'snap-fuel-1',
      asOf: '2026-10-28T20:35:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [lowFuelSignal],
    };
    const candidate = fuelDetector.detect(snapshot, []);

    expect(candidate).not.toBeNull();
    expect(candidate?.intent).toBe('fuel');
    expect(candidate?.confidence).toBeGreaterThan(0.9);
    expect(candidate?.metadata?.reason).toBe('low_fuel_signal');
  });

  it('fuelDetector: detects user command signal', () => {
    const cmdSignal = createSimulatedSignal({
      kind: 'user_command',
      value: { intent: 'FIND_FUEL', text: 'find gas' },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });

    const snapshot: ContextSnapshot = {
      id: 'snap-fuel-cmd',
      asOf: '2026-10-28T20:35:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [cmdSignal],
    };
    const candidate = fuelDetector.detect(snapshot, []);

    expect(candidate).not.toBeNull();
    expect(candidate?.intent).toBe('fuel');
    expect(candidate?.metadata?.reason).toBe('user_requested');
  });

  it('fuelDetector: returns null when fuel is adequate and no user request exists', () => {
    const normalFuelSignal = createSimulatedSignal({
      kind: 'fuel_status',
      value: { fuelPercent: 85, rangeMiles: 300, needsFuel: false },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });

    const snapshot: ContextSnapshot = {
      id: 'snap-fuel-normal',
      asOf: '2026-10-28T20:35:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [normalFuelSignal],
    };
    const candidate = fuelDetector.detect(snapshot, []);
    expect(candidate).toBeNull();
  });

  it('fuelPreparer: prepares plan with ranked gas stations and straight-line distances', () => {
    const preparer = new FuelPreparer();
    const candidate = {
      intent: 'fuel',
      confidence: 1.0,
      evidence: [],
    };

    const locSignal = createSimulatedSignal({
      kind: 'location_status',
      value: { lat: 37.7749, lng: -122.4194 },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });
    const snapshot: ContextSnapshot = {
      id: 'snap-loc-sf',
      asOf: '2026-10-28T20:35:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [locSignal],
    };

    const plan = preparer.prepare(candidate, snapshot, []);
    expect(plan).not.toBeNull();
    expect(plan?.intentId).toBe('fuel');
    expect(plan?.subjectTitle).toBe('Nearby Gas Stations');
    expect(plan?.headline).toContain('Nearby Fuel: Metro Gas & Go');
    expect(plan?.headline).toContain('(straight-line)');
    expect(plan?.headline).toContain('simulated');

    expect(plan?.optionsOrSteps.length).toBeGreaterThanOrEqual(2);
    const topOption = plan!.optionsOrSteps[0] as any;
    expect(topOption.name).toBe('Metro Gas & Go');
    expect(topOption.straightLineDistanceMeters).toBeGreaterThan(0);
    expect(topOption.straightLineDistanceLabel).toContain('(straight-line)');
  });

  it('fuelPreparer: changing coordinates changes returned candidates (AC-212-1)', () => {
    const preparer = new FuelPreparer();
    const candidate = {
      intent: 'fuel',
      confidence: 1.0,
      evidence: [],
    };

    // Query 1: San Francisco
    const sfSignal = createSimulatedSignal({
      kind: 'location_status',
      value: { lat: 37.7749, lng: -122.4194 },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });
    const sfPlan = preparer.prepare(
      candidate,
      { id: 'snap-sf', asOf: '2026-10-28T20:35:00.000Z', timezone: 'America/Los_Angeles', signals: [sfSignal] },
      []
    );
    expect(sfPlan?.headline).toContain('Metro Gas & Go');

    // Query 2: Los Angeles
    const laSignal = createSimulatedSignal({
      kind: 'location_status',
      value: { lat: 34.0522, lng: -118.2437 },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });
    const laPlan = preparer.prepare(
      candidate,
      { id: 'snap-la', asOf: '2026-10-28T20:35:00.000Z', timezone: 'America/Los_Angeles', signals: [laSignal] },
      []
    );
    expect(laPlan?.headline).toContain('Angel City Fuel');
    expect((laPlan?.optionsOrSteps as any[]).map(o => o.name)).toContain('Pacific Coast Petrol');
  });

  it('fuelPreparer: fails closed when location is unavailable (AC-212-2)', () => {
    const candidate = {
      intent: 'fuel',
      confidence: 1.0,
      evidence: [],
    };

    // Snapshot without coordinates
    const snapshot: ContextSnapshot = {
      id: 'snap-empty',
      asOf: '2026-10-28T20:35:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [],
    };

    // With LocationPort status unavailable
    const port = new FixtureLocationPort('unavailable');
    const portPreparer = new FuelPreparer({ locationPort: port });
    const plan = portPreparer.prepare(candidate, snapshot, []);
    expect(plan).toBeNull();
  });

  it('fuelPreparer: fails closed when PlacesProvider throws error (AC-212-2)', () => {
    const errorProvider = new SimulatedPlacesProvider({ simulateError: true });
    const preparer = new FuelPreparer({ placesProvider: errorProvider });
    const candidate = { intent: 'fuel', confidence: 1.0, evidence: [] };
    const locSignal = createSimulatedSignal({
      kind: 'location_status',
      value: { lat: 37.7749, lng: -122.4194 },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });
    const plan = preparer.prepare(
      candidate,
      {
        id: 'snap-err',
        asOf: '2026-10-28T20:35:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [locSignal],
      },
      []
    );
    expect(plan).toBeNull();
  });

  it('fuelPreparer: fails closed when PlacesProvider returns empty results (AC-212-2)', () => {
    const emptyProvider = new SimulatedPlacesProvider({ templates: [] });
    const preparer = new FuelPreparer({ placesProvider: emptyProvider });
    const candidate = { intent: 'fuel', confidence: 1.0, evidence: [] };
    const locSignal = createSimulatedSignal({
      kind: 'location_status',
      value: { lat: 37.7749, lng: -122.4194 },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });
    const plan = preparer.prepare(
      candidate,
      {
        id: 'snap-empty-places',
        asOf: '2026-10-28T20:35:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [locSignal],
      },
      []
    );
    expect(plan).toBeNull();
  });

  it('FuelPlacesAdapter: emits places_fuel signal from PlacesProvider', () => {
    const adapter = new FuelPlacesAdapter();
    const locSignal = createSimulatedSignal({
      kind: 'location_status',
      value: { lat: 37.7749, lng: -122.4194 },
      issuedAt: '2026-10-28T20:35:00.000Z',
      validFor: 3600000,
      confidence: 0.9,
      consentScope: 'device_only',
    });
    const signals = adapter.signals({
      id: 'snap-adapter',
      asOf: '2026-10-28T20:35:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [locSignal],
    });
    expect(signals).toHaveLength(1);
    const sig = signals[0];
    expect(sig).toBeDefined();
    expect(sig!.kind).toBe('places_fuel');
    const val = sig!.value as any;
    expect(val.status).toBe('ok');
    expect(val.places.length).toBeGreaterThan(0);
  });

  it('computes fuel scene state with low fuel plan in living context', () => {
    const res = computeSceneState('fuel');
    expect(res.pipelineResult.livingContext.now).not.toBeNull();
    expect(res.pipelineResult.livingContext.now?.intentId).toBe('fuel');
    expect(res.pipelineResult.livingContext.now?.headline).toContain('Metro Gas & Go');
  });
});
