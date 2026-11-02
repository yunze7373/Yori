/**
 * Unit Tests for Connectors Ports and View
 * Governed by ARCH-REV3-UI-CONNECTORS and Acceptance Criteria AC-211-1, AC-203-2, AC-204-2, AC-205-1.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocationConnectorPort } from './ports/location-port.js';
import { CalendarConnectorPort } from './ports/calendar-port.js';
import { WeatherConnectorPort } from './ports/weather-port.js';
import { XMemoConnectorPort } from './ports/xmemo-port.js';
import { NotificationsConnectorPort } from './ports/notifications-port.js';
import { getAllConnectorsStatus } from './index.js';
import { renderConnectorsView } from './connectors-view.js';
import { defaultLocationPort, DEFAULT_DEMO_COORDS } from '../../adapters/providers/location-port.js';
import { computeSceneState } from '../living-context/app.js';

describe('Connectors Suite', () => {
  const originalNavigator = globalThis.navigator;
  const originalNotification = globalThis.Notification;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    }
    if (originalNotification) {
      Object.defineProperty(globalThis, 'Notification', {
        value: originalNotification,
        configurable: true,
        writable: true,
      });
    } else {
      delete (globalThis as any).Notification;
    }
    globalThis.fetch = originalFetch;
  });

  describe('LocationConnectorPort', () => {
    it('returns unavailable when navigator.permissions is absent', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        configurable: true,
        writable: true,
      });

      const port = new LocationConnectorPort();
      const status = await port.status();
      expect(status.id).toBe('location');
      expect(status.state).toBe('unavailable');
      expect(status.detail).toContain('not supported');
    });

    it('returns permission_needed when permission is prompt', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          permissions: {
            query: vi.fn().mockResolvedValue({ state: 'prompt' }),
          },
        },
        configurable: true,
        writable: true,
      });

      const port = new LocationConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('permission_needed');
      expect(status.detail).toContain('Permission needed');
    });

    it('returns denied when permission is denied', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          permissions: {
            query: vi.fn().mockResolvedValue({ state: 'denied' }),
          },
        },
        configurable: true,
        writable: true,
      });

      const port = new LocationConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('denied');
      expect(status.detail).toContain('Location access is blocked');
      expect(status.detail).toContain('Check again');
    });

    it('returns not_connected when permission is granted but no session fix exists', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          permissions: {
            query: vi.fn().mockResolvedValue({ state: 'granted' }),
          },
        },
        configurable: true,
        writable: true,
      });

      if (typeof defaultLocationPort.clearSessionFix === 'function') {
        defaultLocationPort.clearSessionFix();
      }

      const port = new LocationConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('not_connected');
      expect(status.detail).toBe('Allowed · not used yet');
    });

    it('returns connected when permission is granted and session fix exists', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          permissions: {
            query: vi.fn().mockResolvedValue({ state: 'granted' }),
          },
        },
        configurable: true,
        writable: true,
      });

      // Simulate a session fix
      (defaultLocationPort as any).cachedCoords = { lat: 37.7749, lng: -122.4194 };
      (defaultLocationPort as any).cachedTimestamp = Date.now();

      const port = new LocationConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('connected');
      expect(status.detail).toBe('Shared this session');
      // Must NEVER contain coordinates
      expect(status.detail).not.toMatch(/\d+\.\d+°/);
    });

    it('revoke clears the in-session fix and re-reads state to not_connected', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          permissions: {
            query: vi.fn().mockResolvedValue({ state: 'granted' }),
          },
        },
        configurable: true,
        writable: true,
      });

      (defaultLocationPort as any).cachedCoords = { lat: 37.7749, lng: -122.4194 };
      (defaultLocationPort as any).cachedTimestamp = Date.now();

      const port = new LocationConnectorPort();
      const beforeStatus = await port.status();
      expect(beforeStatus.state).toBe('connected');

      const afterStatus = await port.revoke();
      expect(afterStatus.state).toBe('not_connected');
      expect(afterStatus.detail).toBe('Allowed · not used yet');
      expect(defaultLocationPort.hasSessionFix ? defaultLocationPort.hasSessionFix() : false).toBe(false);
    });
  });

  describe('CalendarConnectorPort', () => {
    it('is always unavailable with detail Not available yet', async () => {
      const port = new CalendarConnectorPort();
      const status = await port.status();
      expect(status.id).toBe('calendar');
      expect(status.state).toBe('unavailable');
      expect(status.detail).toBe('Not available yet');
    });
  });

  describe('WeatherConnectorPort', () => {
    it('returns owner_gated when enabled is false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          enabled: false,
          provider: 'open-meteo',
          demoCity: { name: 'San Francisco, CA' },
        }),
      } as any);

      const port = new WeatherConnectorPort();
      const status = await port.status();
      expect(status.id).toBe('weather');
      expect(status.state).toBe('owner_gated');
      expect(status.detail).toBe('Live weather is off (owner setting)');
    });

    it('returns connected with demo city name when enabled is true', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          enabled: true,
          provider: 'open-meteo',
          demoCity: { name: 'Aomori, Japan' },
        }),
      } as any);

      const port = new WeatherConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('connected');
      expect(status.detail).toBe('Open-Meteo · Aomori, Japan · fixed demo city (not your location)');
    });

    it('D1: in Live, reports that weather follows the shared location (never the demo city)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          enabled: true,
          provider: 'open-meteo',
          demoCity: { name: 'San Francisco, CA' },
        }),
      } as any);

      const port = new WeatherConnectorPort();
      const status = await port.status({ live: true });
      expect(status.state).toBe('connected');
      expect(status.detail).toBe('Open-Meteo · follows your shared location (rounded ~100 m)');
      expect(status.detail).not.toContain('San Francisco');
      expect(status.detail).not.toContain('demo city');
    });

    it('returns connected with location not reported when demoCity is missing', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          enabled: true,
          provider: 'open-meteo',
        }),
      } as any);

      const port = new WeatherConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('connected');
      expect(status.detail).toBe('Open-Meteo · fixed demo city (location not reported)');
    });

    it('returns unavailable when fetch rejects or returns non-200', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as any);

      const port = new WeatherConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('unavailable');
      expect(status.detail).toBe('Weather service unavailable');
    });
  });

  describe('XMemoConnectorPort', () => {
    it('returns owner_gated when enabled is false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: false }),
      } as any);

      const port = new XMemoConnectorPort();
      const status = await port.status();
      expect(status.id).toBe('xmemo');
      expect(status.state).toBe('owner_gated');
      expect(status.detail).toBe('XMemo integration is disabled (owner setting)');
    });

    it('returns not_connected when enabled is true but connected is false', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: true, connected: false }),
      } as any);

      const port = new XMemoConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('not_connected');
      expect(status.detail).toBe('Not connected · tap Connect to sign in');
    });

    it('returns connected when enabled is true and connected is true', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ enabled: true, connected: true, statusText: 'Vault connected' }),
      } as any);

      const port = new XMemoConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('connected');
      expect(status.detail).toBe('Vault connected');
    });

    it('disconnect posts to endpoint and re-reads status', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/xmemo/disconnect') {
          return { ok: true, json: async () => ({ success: true }) } as any;
        }
        if (url === '/api/xmemo/status') {
          callCount++;
          if (callCount === 1) {
            return { ok: true, json: async () => ({ enabled: true, connected: true }) } as any;
          }
          return { ok: true, json: async () => ({ enabled: true, connected: false }) } as any;
        }
        return { ok: false } as any;
      });

      const port = new XMemoConnectorPort();
      const before = await port.status();
      expect(before.state).toBe('connected');

      const after = await port.disconnect();
      expect(after.state).toBe('not_connected');
      expect(after.detail).toBe('Not connected · tap Connect to sign in');
    });
  });

  describe('NotificationsConnectorPort', () => {
    it('returns unavailable when Notification is absent', async () => {
      delete (globalThis as any).Notification;
      const port = new NotificationsConnectorPort();
      const status = await port.status();
      expect(status.id).toBe('notifications');
      expect(status.state).toBe('unavailable');
      expect(status.detail).toContain('not supported');
    });

    it('returns permission_needed when permission is default', async () => {
      (globalThis as any).Notification = {
        permission: 'default',
        requestPermission: vi.fn(),
      };

      const port = new NotificationsConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('permission_needed');
      expect(status.detail).toContain('Permission needed');
    });

    it('returns connected when permission is granted', async () => {
      (globalThis as any).Notification = {
        permission: 'granted',
      };

      const port = new NotificationsConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('connected');
      expect(status.detail).toBe('Allowed · Yori sends nothing from this screen');
    });

    it('returns denied when permission is denied', async () => {
      (globalThis as any).Notification = {
        permission: 'denied',
      };

      const port = new NotificationsConnectorPort();
      const status = await port.status();
      expect(status.state).toBe('denied');
      expect(status.detail).toContain('Notifications blocked in browser settings');
    });
  });

  describe('Aggregator & View', () => {
    it('getAllConnectorsStatus returns records for all 5 connectors', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/weather/status') {
          return { ok: true, json: async () => ({ enabled: false }) } as any;
        }
        if (url === '/api/xmemo/status') {
          return { ok: true, json: async () => ({ enabled: false }) } as any;
        }
        return { ok: false } as any;
      });

      const all = await getAllConnectorsStatus();
      expect(all.location).toBeDefined();
      expect(all.calendar).toBeDefined();
      expect(all.weather).toBeDefined();
      expect(all.xmemo).toBeDefined();
      expect(all.notifications).toBeDefined();
    });

    it('renderConnectorsView renders all cards, badges, and titles cleanly', async () => {
      const mockStatuses = {
        location: {
          id: 'location' as const,
          state: 'connected' as const,
          detail: 'Shared this session',
          source: 'test',
          updatedAt: new Date().toISOString(),
        },
        calendar: {
          id: 'calendar' as const,
          state: 'unavailable' as const,
          detail: 'Not available yet',
          source: 'test',
          updatedAt: new Date().toISOString(),
        },
        weather: {
          id: 'weather' as const,
          state: 'owner_gated' as const,
          detail: 'Live weather is off (owner setting)',
          source: 'test',
          updatedAt: new Date().toISOString(),
        },
        xmemo: {
          id: 'xmemo' as const,
          state: 'not_connected' as const,
          detail: 'Not connected · tap Connect to sign in',
          source: 'test',
          updatedAt: new Date().toISOString(),
        },
        notifications: {
          id: 'notifications' as const,
          state: 'permission_needed' as const,
          detail: 'Permission needed',
          source: 'test',
          updatedAt: new Date().toISOString(),
        },
      };

      const html = renderConnectorsView(mockStatuses);
      expect(html).toContain('Connectors');
      expect(html).toContain('You control what Yori can access.');
      expect(html).toContain('connector-row-location');
      expect(html).toContain('connector-row-calendar');
      expect(html).toContain('connector-row-weather');
      expect(html).toContain('connector-row-xmemo');
      expect(html).toContain('connector-row-notifications');
      expect(html).toContain('More coming soon');
      expect(html).toContain('btn-connectors-back');
      expect(html).toContain('btn-revoke-location');
      expect(html).toContain('btn-connect-xmemo');
      expect(html).toContain('btn-connect-notifications');
    });
  });

  describe('Demo Scene Builder Location Invariant', () => {
    it('preserves clean simulated demo scenes and never blends a device fix into demo scenes', () => {
      // 1. Baseline without device fix (standard demo fixture state)
      defaultLocationPort.clearSessionFix?.();
      defaultLocationPort.setLocation('available', DEFAULT_DEMO_COORDS);
      const baselineLunch = computeSceneState('lunch');
      const baselineFuel = computeSceneState('fuel');
      const baselineAwayLunch = computeSceneState('away-lunch');

      // 2. Simulate acquiring a real device fix (e.g. Tokyo via geolocation)
      defaultLocationPort.clearManualLocation?.();
      defaultLocationPort.grantConsent?.();
      (defaultLocationPort as any).cachedCoords = { lat: 35.68, lng: 139.77 };
      (defaultLocationPort as any).cachedAccuracy = 15;
      (defaultLocationPort as any).cachedTimestamp = Date.now();

      // 3. Re-run scene builder
      const withDeviceFixLunch = computeSceneState('lunch');
      const withDeviceFixFuel = computeSceneState('fuel');
      const withDeviceFixAwayLunch = computeSceneState('away-lunch');

      // 4. Assert that demo scene location signal remains 'fixture' with DEFAULT_DEMO_COORDS
      const lunchLocSig = withDeviceFixLunch.snapshot.signals.find(s => s.kind === 'location_status');
      expect((lunchLocSig?.value as any)?.source).toBe('fixture');
      expect((lunchLocSig?.value as any)?.lat).toBe(DEFAULT_DEMO_COORDS.lat);
      expect((lunchLocSig?.value as any)?.lng).toBe(DEFAULT_DEMO_COORDS.lng);

      const fuelLocSig = withDeviceFixFuel.snapshot.signals.find(s => s.kind === 'location_status');
      expect((fuelLocSig?.value as any)?.source).toBe('fixture');
      expect((fuelLocSig?.value as any)?.lat).toBe(DEFAULT_DEMO_COORDS.lat);
      expect((fuelLocSig?.value as any)?.lng).toBe(DEFAULT_DEMO_COORDS.lng);

      // 5. Assert that output recommendations are identical to baseline and NOT broken
      expect(withDeviceFixLunch.pipelineResult.livingContext.now?.headline).toBe(baselineLunch.pipelineResult.livingContext.now?.headline);
      expect(withDeviceFixFuel.pipelineResult.livingContext.now?.headline).toBe(baselineFuel.pipelineResult.livingContext.now?.headline);
      expect(withDeviceFixAwayLunch.pipelineResult.livingContext.now?.headline).toBe(baselineAwayLunch.pipelineResult.livingContext.now?.headline);

      // Clean up
      if (defaultLocationPort.clearSessionFix) {
        defaultLocationPort.clearSessionFix();
      }
      defaultLocationPort.setLocation('available', DEFAULT_DEMO_COORDS);
    });
  });
});
