import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeolocationAdapter } from './geolocation-adapter.js';
import { DEFAULT_DEMO_COORDS } from './location-port.js';

describe('V5-GEO: GeolocationAdapter (AC-211-1, AC-211-2)', () => {
  let mockGeo: {
    getCurrentPosition: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGeo = {
      getCurrentPosition: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC-211-1: Consent Tap, Real Chain Activation, Timeout, Stale, and Budget', () => {
    it('initializes in prompt state with consent needed notice and no coordinates', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'prompt',
        simulated: true,
      });

      const loc = adapter.getLocation();
      expect(loc.status).toBe('prompt');
      expect(loc.coords).toBeUndefined();
      expect(loc.notice).toContain('Location permission needed');
      expect(adapter.getConsentStatus()).toBe('prompt');
    });

    it('initialStatus "available" initializes with source "fixture" while consentStatus remains "prompt" (no inferred consent)', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'available',
        initialCoords: DEFAULT_DEMO_COORDS,
        simulated: true,
      });

      // Location is available from fixture
      const loc = adapter.getLocation();
      expect(loc.status).toBe('available');
      expect(loc.coords).toEqual(DEFAULT_DEMO_COORDS);
      expect(loc.source).toBe('fixture');

      // Geolocation consent itself was NOT pre-granted from fixture
      expect(adapter.getConsentStatus()).toBe('prompt');
    });

    it('consent tap via consentAndRequest() with real chain OFF: grants consent, returns unavailable with P-LOC notice, never fabricates coords/accuracy, 0 provider calls', async () => {
      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: true, // flag-off in demo
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      // Consent is now granted
      expect(adapter.getConsentStatus()).toBe('granted');
      // Status is unavailable because live geolocation is disabled
      expect(res.status).toBe('unavailable');
      expect(res.source).toBe('geolocation');
      expect(res.coords).toBeUndefined();
      expect(res.accuracy).toBeUndefined();
      expect(res.notice).toContain('Live geolocation is disabled in this demo (owner gate P-LOC required)');

      // Provider was NEVER called
      expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled();

      // Subsequent getLocation() returns the same honest unavailable state and notice
      const loc = adapter.getLocation();
      expect(loc.status).toBe('unavailable');
      expect(loc.coords).toBeUndefined();
      expect(loc.notice).toContain('Live geolocation is disabled in this demo (owner gate P-LOC required)');
    });

    it('consent tap sequence (grantConsent then requestCurrentPosition) matches consentAndRequest() exactly', async () => {
      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: true,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      adapter.grantConsent();
      expect(adapter.getConsentStatus()).toBe('granted');

      const res = await adapter.requestCurrentPosition();
      expect(res.status).toBe('unavailable');
      expect(res.coords).toBeUndefined();
      expect(res.accuracy).toBeUndefined();
      expect(res.notice).toContain('Live geolocation is disabled in this demo (owner gate P-LOC required)');
      expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled();
    });

    it('consent tap with real chain ON (enabled=true, simulated=false, mock provider): invokes provider exactly once and returns available with real fix', async () => {
      const now = Date.now();
      mockGeo.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 8 },
          timestamp: now,
        });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      expect(adapter.getConsentStatus()).toBe('granted');
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
      expect(res.status).toBe('available');
      expect(res.source).toBe('geolocation');
      expect(res.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
      expect(res.accuracy).toBe(8);

      const loc = adapter.getLocation();
      expect(loc.status).toBe('available');
      expect(loc.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
      expect(loc.accuracy).toBe(8);
    });

    it('handles explicit consent deny: status denied, zero coordinates, clear notice', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'available',
        initialCoords: DEFAULT_DEMO_COORDS,
      });

      adapter.denyConsent();
      expect(adapter.getConsentStatus()).toBe('denied');

      const loc = adapter.getLocation();
      expect(loc.status).toBe('denied');
      expect(loc.coords).toBeUndefined();
      expect(loc.notice).toContain('Location access denied');
    });

    it('handles provider error code 1 (denied) via consentAndRequest: transitions consent to denied', async () => {
      mockGeo.getCurrentPosition.mockImplementation((_success, error) => {
        error({ code: 1, message: 'User denied Geolocation' });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      expect(res.status).toBe('denied');
      expect(adapter.getConsentStatus()).toBe('denied');
      expect(res.notice).toContain('denied');

      const loc = adapter.getLocation();
      expect(loc.status).toBe('denied');
      expect(loc.notice).toContain('Location access denied');
    });

    it('handles provider error code 2 (unavailable) via consentAndRequest: status unavailable, clear notice', async () => {
      mockGeo.getCurrentPosition.mockImplementation((_success, error) => {
        error({ code: 2, message: 'Position unavailable' });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      expect(res.status).toBe('unavailable');
      expect(res.coords).toBeUndefined();
      expect(res.notice).toContain('unavailable');
    });

    it('handles provider error code 3 (timeout) via consentAndRequest: status unavailable, clear notice', async () => {
      mockGeo.getCurrentPosition.mockImplementation((_success, error) => {
        error({ code: 3, message: 'Timeout expired' });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      expect(res.status).toBe('unavailable');
      expect(res.coords).toBeUndefined();
      expect(res.notice).toContain('timed out');
    });

    it('handles stale fix (age > threshold): status unavailable, isStale true', () => {
      mockGeo.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
          timestamp: Date.now(),
        });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
        staleThresholdMs: 1000,
      });

      // Acquire initial fresh fix
      adapter.grantConsent();
      adapter.requestCurrentPosition();

      // Fast forward time past stale threshold
      const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);

      const staleLoc = adapter.getLocation();
      expect(staleLoc.status).toBe('unavailable');
      expect(staleLoc.isStale).toBe(true);
      expect(staleLoc.notice).toContain('stale');
      dateSpy.mockRestore();
    });

    it('stops further requests once session request budget is exhausted', async () => {
      mockGeo.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
          timestamp: Date.now(),
        });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        maxRequestsPerSession: 2,
        debounceMs: 0,
        cacheTtlMs: 0,
        initialStatus: 'prompt',
      });

      adapter.grantConsent();

      // Request 1: succeeds
      const r1 = await adapter.requestCurrentPosition();
      expect(r1.status).toBe('available');
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);

      // Request 2: succeeds
      const r2 = await adapter.requestCurrentPosition();
      expect(r2.status).toBe('available');
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(2);

      // Request 3: budget exhausted!
      const r3 = await adapter.requestCurrentPosition();
      expect(r3.status).toBe('unavailable');
      expect(r3.notice).toContain('budget exhausted');
      // Provider not invoked a 3rd time
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it('debounces and caches rapid requests', async () => {
      mockGeo.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
          timestamp: Date.now(),
        });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        debounceMs: 2000,
        cacheTtlMs: 60000,
        initialStatus: 'prompt',
      });

      adapter.grantConsent();

      // 1st request invokes provider
      await adapter.requestCurrentPosition();
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);

      // 2nd rapid request (within debounce) reuses cached fix without calling provider
      const r2 = await adapter.requestCurrentPosition();
      expect(r2.status).toBe('available');
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC-211-2: Spy Verification of Flag-Off and Simulation Guards', () => {
    it('never calls real geolocation provider when simulated=true (default)', async () => {
      const adapter = new GeolocationAdapter({
        enabled: true, // even if flag enabled
        simulated: true, // simulated scene switch is ON
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      expect(res.status).toBe('unavailable');
      expect(res.coords).toBeUndefined();
      expect(res.accuracy).toBeUndefined();
      expect(res.notice).toContain('Live geolocation is disabled in this demo (owner gate P-LOC required)');
      // Spy asserts 0 real-chain calls
      expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled();
    });

    it('never calls real geolocation provider when GEO_LIVE_ENABLED is false', async () => {
      const adapter = new GeolocationAdapter({
        enabled: false, // flag OFF
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      expect(res.status).toBe('unavailable');
      expect(res.coords).toBeUndefined();
      expect(res.accuracy).toBeUndefined();
      expect(res.notice).toContain('Live geolocation is disabled in this demo (owner gate P-LOC required)');
      expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled();
    });

    it('calls real provider only when both enabled=true and simulated=false', async () => {
      mockGeo.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 34.0522, longitude: -118.2437, accuracy: 5 },
          timestamp: Date.now(),
        });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      const res = await adapter.consentAndRequest();

      expect(res.status).toBe('available');
      expect(res.coords).toEqual({ lat: 34.0522, lng: -118.2437 });
      expect(res.accuracy).toBe(5);
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('Manual Location Overrides & Fallback Invariants', () => {
    it('setLocation("available", coords) provides manual coordinates without geolocation access', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'prompt',
        geolocationProvider: mockGeo,
      });

      adapter.setLocation('available', { lat: 34.0522, lng: -118.2437 });
      const loc = adapter.getLocation();

      expect(loc.status).toBe('available');
      expect(loc.coords).toEqual({ lat: 34.0522, lng: -118.2437 });
      expect(loc.source).toBe('manual');
      expect(mockGeo.getCurrentPosition).not.toHaveBeenCalled();
    });

    it('setLocation("available") without coords rejects and sets status to unavailable (no silent fallback to demo coords)', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'prompt',
      });

      adapter.setLocation('available');
      const loc = adapter.getLocation();

      expect(loc.status).toBe('unavailable');
      expect(loc.coords).toBeUndefined();
      expect(loc.notice).toContain('Coordinates required');
    });

    it('clearManualLocation() restores the underlying geolocation consent status', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'prompt',
      });

      adapter.setLocation('available', { lat: 34.0522, lng: -118.2437 });
      expect(adapter.getLocation().status).toBe('available');

      adapter.clearManualLocation();
      expect(adapter.getLocation().status).toBe('prompt');
    });
  });

  describe('EvidenceRecord Creation for Grounding Verification', () => {
    it('creates EvidenceRecord with id loc-fuel-origin and provenance', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'available',
        initialCoords: DEFAULT_DEMO_COORDS,
        simulated: true,
      });

      const rec = adapter.createLocationEvidenceRecord('2026-10-28T19:10:00.000Z');
      expect(rec).toBeDefined();
      expect(rec!.id).toBe('loc-fuel-origin');
      expect(rec!.provider).toBe('location-port');
      expect(rec!.kind).toBe('poi');
      expect(rec!.provenance).toBe('simulated');
      expect(rec!.fields.lat).toBe(DEFAULT_DEMO_COORDS.lat);
      expect(rec!.fields.lng).toBe(DEFAULT_DEMO_COORDS.lng);
    });

    it('returns undefined EvidenceRecord when location is unavailable', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'prompt',
      });

      expect(adapter.createLocationEvidenceRecord()).toBeUndefined();
    });
  });

  describe('L1-LIVE-TRUTH: acquireSessionFix Cap and Debounce Guard', () => {
    it('acquireSessionFix respects maxRequestsPerSession cap (5)', async () => {
      mockGeo.getCurrentPosition.mockImplementation((success) => {
        success({
          coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 25 },
          timestamp: Date.now(),
        });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        maxRequestsPerSession: 5,
        debounceMs: 0, // disable debounce for cap test
        cacheTtlMs: 0, // disable cache to test per-session request count
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      // Call 5 times successfully
      for (let i = 0; i < 5; i++) {
        adapter.clearSessionFix();
        const res = await adapter.acquireSessionFix();
        expect(res.status).toBe('available');
      }
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(5);
      expect(adapter.getRequestCount()).toBe(5);

      // 6th call exceeds budget
      adapter.clearSessionFix();
      const sixth = await adapter.acquireSessionFix();
      expect(sixth.status).toBe('unavailable');
      expect(sixth.notice).toContain('budget exhausted');
      // Provider not invoked a 6th time
      expect(mockGeo.getCurrentPosition).toHaveBeenCalledTimes(5);
    });

    it('acquireSessionFix respects 2000ms debounce guard', async () => {
      let callCount = 0;
      mockGeo.getCurrentPosition.mockImplementation((success) => {
        callCount++;
        success({
          coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 25 },
          timestamp: Date.now(),
        });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        debounceMs: 2000,
        cacheTtlMs: 0, // disable cache to isolate debounce
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      // First call invokes provider
      const fix1 = await adapter.acquireSessionFix();
      expect(fix1.status).toBe('available');
      expect(callCount).toBe(1);

      // Immediate second call is debounced; returns existing fix without calling provider again
      const fix2 = await adapter.acquireSessionFix();
      expect(fix2.status).toBe('available');
      expect(callCount).toBe(1);
    });
  });
});
