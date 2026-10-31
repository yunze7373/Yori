/**
 * Notifications Connector Port (UI adapter layer)
 * Governed by ARCH-REV3-UI-CONNECTORS and AC-205-1.
 *
 * Implements truthful runtime read:
 * - Notification.permission per platform
 * - default -> permission_needed (Connect = requestPermission from user gesture)
 * - granted -> connected ('Allowed · Yori sends nothing from this screen')
 * - denied -> denied (with browser settings instructions and Check again)
 * - API absent -> unavailable
 * - Status pill + action button, NOT a toggle implying app can revoke browser permission
 * - Zero notifications sent; prompt budget untouched
 */

import type { ConnectorPort, ConnectorStatus } from '../types.js';

export class NotificationsConnectorPort implements ConnectorPort {
  public readonly id = 'notifications' as const;

  public async status(): Promise<ConnectorStatus> {
    const updatedAt = new Date().toISOString();

    if (typeof Notification === 'undefined' || typeof Notification.permission === 'undefined') {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Notifications API not supported in this browser',
        source: 'Notification.permission',
        updatedAt,
      };
    }

    try {
      const perm = Notification.permission;

      if (perm === 'granted') {
        return {
          id: this.id,
          state: 'connected',
          detail: 'Allowed · Yori sends nothing from this screen',
          source: 'Notification.permission',
          updatedAt,
        };
      }

      if (perm === 'denied') {
        return {
          id: this.id,
          state: 'denied',
          detail: 'Notifications blocked in browser settings. To enable: open site permissions in your browser address bar, allow Notifications, and tap Check again.',
          source: 'Notification.permission',
          updatedAt,
        };
      }

      return {
        id: this.id,
        state: 'permission_needed',
        detail: 'Permission needed · tap Connect to allow proactive updates',
        source: 'Notification.permission',
        updatedAt,
      };
    } catch {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'Could not query notifications permission',
        source: 'Notification.permission',
        updatedAt,
      };
    }
  }

  public async connect(): Promise<ConnectorStatus> {
    if (typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function') {
      try {
        await Notification.requestPermission();
      } catch {
        // Fall through to status re-read
      }
    }
    return this.status();
  }
}

export const notificationsConnectorPort = new NotificationsConnectorPort();
