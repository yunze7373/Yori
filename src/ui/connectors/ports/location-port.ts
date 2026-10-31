/**
 * Location Connector Port (UI adapter layer)
 * Governed by ARCH-REV3-UI-CONNECTORS and AC-211-1, AC-211-2.
 *
 * Implements truthful runtime read:
 * - navigator.permissions.query({ name: 'geolocation' })
 * - prompt -> permission_needed
 * - denied -> denied (with browser/OS instructions and Check again)
 * - granted + one-shot fix this session -> connected ('Shared this session')
 * - granted + no fix -> not_connected ('Allowed · not used yet')
 * - API absent -> unavailable
 * - Connect -> user gesture via consented one-shot adapter
 * - Revoke -> forgets in-session fix, instructs user on browser setting
 * - NEVER renders coordinates
 */

import type { ConnectorPort, ConnectorStatus } from '../types.js';
import { defaultLocationPort } from '../../../adapters/providers/location-port.js';

export class LocationConnectorPort implements ConnectorPort {
  public readonly id = 'location' as const;

  public async status(): Promise<ConnectorStatus> {
    const updatedAt = new Date().toISOString();

    if (
      typeof navigator === 'undefined' ||
      !('permissions' in navigator) ||
      typeof navigator.permissions?.query !== 'function'
    ) {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Geolocation permissions API not supported in this environment',
        source: 'navigator.permissions',
        updatedAt,
      };
    }

    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      const state = perm.state; // 'granted' | 'prompt' | 'denied'

      if (state === 'prompt') {
        return {
          id: this.id,
          state: 'permission_needed',
          detail: 'Permission needed · tap Connect to share location for this session',
          source: 'navigator.permissions.query(geolocation)',
          updatedAt,
        };
      }

      if (state === 'denied') {
        return {
          id: this.id,
          state: 'denied',
          detail: 'Location access is blocked in your browser or OS settings. To enable: open site permissions in your browser address bar, set Location to Allow, and tap Check again.',
          source: 'navigator.permissions.query(geolocation)',
          updatedAt,
        };
      }

      if (state === 'granted') {
        const hasFix = defaultLocationPort.hasSessionFix ? defaultLocationPort.hasSessionFix() : false;
        if (hasFix) {
          return {
            id: this.id,
            state: 'connected',
            detail: 'Shared this session',
            source: 'navigator.permissions.query(geolocation) + in-session fix',
            updatedAt,
          };
        }

        return {
          id: this.id,
          state: 'not_connected',
          detail: 'Allowed · not used yet',
          source: 'navigator.permissions.query(geolocation)',
          updatedAt,
        };
      }

      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Unknown permission state',
        source: 'navigator.permissions.query(geolocation)',
        updatedAt,
      };
    } catch {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Could not query geolocation permission',
        source: 'navigator.permissions.query(geolocation)',
        updatedAt,
      };
    }
  }

  public async connect(): Promise<ConnectorStatus> {
    // User-gesture one-shot acquisition via consented adapter
    // Does NOT toggle global simulated/live flags (preserves Demo simulation invariants)
    if (typeof defaultLocationPort.acquireSessionFix === 'function') {
      try {
        await defaultLocationPort.acquireSessionFix();
      } catch {
        // Fall through to status re-read
      }
    } else if (typeof defaultLocationPort.consentAndRequest === 'function') {
      try {
        await defaultLocationPort.consentAndRequest();
      } catch {
        // Fall through to status re-read
      }
    }

    return this.status();
  }

  public async revoke(): Promise<ConnectorStatus> {
    // Forget in-session fix
    if (typeof defaultLocationPort.clearSessionFix === 'function') {
      defaultLocationPort.clearSessionFix();
    }
    return this.status();
  }
}

export const locationConnectorPort = new LocationConnectorPort();
