/**
 * XMemo Connector Port (UI adapter layer)
 * Governed by ARCH-REV3-UI-CONNECTORS and AC-203-2.
 *
 * Implements truthful runtime read:
 * - GET /api/xmemo/status
 * - enabled false -> owner_gated ('XMemo integration is disabled (owner setting)')
 * - enabled && !connected -> not_connected ('Not connected · tap Connect to sign in')
 * - enabled && connected (fresh read) -> connected
 * - Connect -> triggers PKCE auth URL flow
 * - Disconnect -> calls POST /api/xmemo/disconnect, re-reads status before claiming
 * - Zero agent tokens anywhere
 */

import type { ConnectorPort, ConnectorStatus } from '../types.js';

export class XMemoConnectorPort implements ConnectorPort {
  public readonly id = 'xmemo' as const;

  public async status(): Promise<ConnectorStatus> {
    const updatedAt = new Date().toISOString();

    try {
      const res = await fetch('/api/xmemo/status', { cache: 'no-store' });
      if (!res.ok) {
        return {
          id: this.id,
          state: 'unavailable',
          detail: 'XMemo service unavailable',
          source: '/api/xmemo/status',
          updatedAt,
        };
      }

      const data = await res.json();
      if (!data?.enabled) {
        return {
          id: this.id,
          state: 'owner_gated',
          detail: 'XMemo integration is disabled (owner setting)',
          source: '/api/xmemo/status',
          updatedAt,
        };
      }

      if (data.connected) {
        return {
          id: this.id,
          state: 'connected',
          detail: data.statusText || 'Connected to XMemo',
          source: '/api/xmemo/status',
          updatedAt,
        };
      }

      return {
        id: this.id,
        state: 'not_connected',
        detail: 'Not connected · tap Connect to sign in',
        source: '/api/xmemo/status',
        updatedAt,
      };
    } catch {
      return {
        id: this.id,
        state: 'unavailable',
        detail: 'XMemo service unavailable',
        source: '/api/xmemo/status',
        updatedAt,
      };
    }
  }

  public async connect(): Promise<ConnectorStatus> {
    try {
      const res = await fetch('/api/xmemo/auth-url', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { authUrl?: string };
        if (data.authUrl && typeof window !== 'undefined') {
          window.location.href = data.authUrl;
        }
      }
    } catch {
      // Fall through to status re-read
    }
    return this.status();
  }

  public async disconnect(): Promise<ConnectorStatus> {
    try {
      await fetch('/api/xmemo/disconnect', { method: 'POST' });
    } catch {
      // Fall through to status re-read
    }
    // Must re-read status before claiming
    return this.status();
  }
}

export const xmemoConnectorPort = new XMemoConnectorPort();
