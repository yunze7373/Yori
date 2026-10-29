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

  describe('AC-211-1: Consent, Degradation, Timeout, Stale, and Budget', () => {
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

    it('handles explicit consent grant and transitions to available', async () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'prompt',
        initialCoords: DEFAULT_DEMO_COORDS,
        simulated: true,
      });

      expect(adapter.getLocation().status).toBe('prompt');

      adapter.grantConsent();
      expect(adapter.getConsentStatus()).toBe('granted');

      const loc = adapter.getLocation();
      expect(loc.status).toBe('available');
      expect(loc.coords).toEqual(DEFAULT_DEMO_COORDS);
      expect(loc.accuracy).toBeDefined();
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

    it('handles timeout error gracefully: status unavailable, clear notice', async () => {
      mockGeo.getCurrentPosition.mockImplementation((_success, error) => {
        error({ code: 3, message: 'Timeout expired' });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      adapter.grantConsent();
      const res = await adapter.requestCurrentPosition();

      expect(res.status).toBe('unavailable');
      expect(res.coords).toBeUndefined();
      expect(res.notice).toContain('timed out');
    });

    it('handles user deny error (code 1): transitions to denied', async () => {
      mockGeo.getCurrentPosition.mockImplementation((_success, error) => {
        error({ code: 1, message: 'User denied Geolocation' });
      });

      const adapter = new GeolocationAdapter({
        enabled: true,
        simulated: false,
        geolocationProvider: mockGeo,
        initialStatus: 'prompt',
      });

      adapter.grantConsent();
      const res = await adapter.requestCurrentPosition();

      expect(res.status).toBe('denied');
      expect(adapter.getConsentStatus()).toBe('denied');
      expect(res.notice).toContain('denied');
    });

    it('handles stale fix (age > threshold): status unavailable, isStale true', () => {
      const adapter = new GeolocationAdapter({
        initialStatus: 'available',
        initialCoords: DEFAULT_DEMO_COORDS,
        staleThresholdMs: 1000, // 1 second threshold for test
      });

      // Initially fresh
      expect(adapter.getLocation().status).toBe('available');

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

      adapter.grantConsent();
      const res = await adapter.requestCurrentPosition();

      expect(res.status).toBe('available');
      expect(res.coords).toEqual(DEFAULT_DEMO_COORDS);
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

      adapter.grantConsent();
      const res = await adapter.requestCurrentPosition();

      expect(res.status).toBe('available');
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

      adapter.grantConsent();
      const res = await adapter.requestCurrentPosition();

      expect(res.status).toBe('available');
      expect(res.coords).toEqual({ lat: 34.0522, lng: -118.2437 });
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
});
