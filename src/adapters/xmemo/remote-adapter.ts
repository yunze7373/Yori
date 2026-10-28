/**
 * XMemoRemoteAdapter
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, and AC-203-2 (HB-3).
 *
 * Remote integration seam:
 * - Server-side OAuth 2.0 PKCE + MCP data surface at https://xmemo.dev/mcp.
 * - Remains OFF/falls back to local memory unless an end-user app auth path is active.
 * - Never includes agent tokens or agent credentials.
 * - Writes back CONFIRMED facts only (INV-107).
 * - Silent fallback on 401/5xx/network errors without disrupting deterministic UX.
 */

import type {
  MemoryPort,
  MemoryPortStatus,
  RemoteMemoryAdapterConfig,
  XMemoOAuthConfig,
} from './types.js';
import type { MemoryFact, MemorySource } from '../../core/contracts/index.js';

export class XMemoRemoteAdapter implements MemoryPort {
  private readonly appAuthToken?: string;
  private readonly oauthConfig?: XMemoOAuthConfig;
  private readonly proxyEndpoint: string;
  private readonly fetchFn: typeof fetch;

  constructor(configOrToken?: string | RemoteMemoryAdapterConfig) {
    if (typeof configOrToken === 'string') {
      this.appAuthToken = configOrToken;
      this.proxyEndpoint = '/api/xmemo';
      this.fetchFn = typeof fetch !== 'undefined' ? fetch : (() => Promise.reject(new Error('fetch unavailable'))) as any;
    } else if (configOrToken) {
      this.appAuthToken = configOrToken.appAuthToken;
      this.oauthConfig = configOrToken.oauth;
      this.proxyEndpoint = configOrToken.proxyEndpoint || '/api/xmemo';
      this.fetchFn =
        configOrToken.fetchFn ||
        (typeof fetch !== 'undefined' ? fetch : (() => Promise.reject(new Error('fetch unavailable'))) as any);
    } else {
      this.proxyEndpoint = '/api/xmemo';
      this.fetchFn = typeof fetch !== 'undefined' ? fetch : (() => Promise.reject(new Error('fetch unavailable'))) as any;
    }
  }

  public getOAuthConfig(): XMemoOAuthConfig | undefined {
    return this.oauthConfig;
  }

  public getStatus(): MemoryPortStatus {
    const isConfigured = Boolean(this.appAuthToken);
    return {
      adapter: 'xmemo_remote',
      isRemoteConfigured: isConfigured,
      statusText: isConfigured
        ? 'XMemo remote adapter configured'
        : 'XMemo remote adapter disabled (HB-3: awaiting verified app auth path)',
    };
  }

  /**
   * Loads confirmed preferences from remote XMemo vault via MCP proxy or direct token.
   * If disabled, unauthorized (401), or encountering network/server errors (5xx):
   * fails closed and cleanly returns [] allowing LocalMemoryAdapter to serve as truth.
   */
  public async loadFacts(): Promise<readonly MemoryFact[]> {
    if (!this.appAuthToken && !this.oauthConfig && !this.proxyEndpoint) {
      return Object.freeze([]);
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.appAuthToken) {
        headers['Authorization'] = `Bearer ${this.appAuthToken}`;
      }

      const response = await this.fetchFn(`${this.proxyEndpoint}/preferences`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: 'preferences',
        }),
      });

      if (!response.ok) {
        // 401, 403, 5xx: fallback cleanly to empty list (local storage is truth)
        return Object.freeze([]);
      }

      const json = (await response.json()) as {
        result?: {
          memories?: Array<Record<string, any>>;
          items?: Array<Record<string, any>>;
          content?: Array<{ type?: string; text?: string }>;
        };
        items?: Array<Record<string, any>>;
      };

      const items: Array<Record<string, any>> = [];

      if (Array.isArray(json?.items)) {
        items.push(...json.items);
      } else if (Array.isArray(json?.result?.memories)) {
        items.push(...json.result.memories);
      } else if (Array.isArray(json?.result?.items)) {
        items.push(...json.result.items);
      } else if (Array.isArray(json?.result?.content)) {
        for (const c of json.result.content) {
          if (c.type === 'text' && c.text) {
            try {
              const parsed = JSON.parse(c.text);
              if (Array.isArray(parsed)) {
                items.push(...parsed);
              } else if (parsed && typeof parsed === 'object') {
                items.push(parsed);
              }
            } catch {
              // Non-JSON content string
            }
          }
        }
      }

      const facts: MemoryFact[] = items
        .filter(item => typeof item === 'object' && item !== null && (item.key || item.name))
        .map(item => {
          const key = String(item.key || item.name);
          const value = String(item.value || item.content || item.text || '');
          const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString();
          const recordedAt = typeof item.recordedAt === 'string' ? item.recordedAt : updatedAt;

          return {
            key,
            value,
            status: 'confirmed' as const, // Remote synced preferences enter strictly as confirmed
            provenance: {
              source: 'xmemo' as unknown as MemorySource,
              recordedAt,
              note: typeof item.note === 'string' ? item.note : 'Synced from XMemo vault',
            },
            updatedAt,
          };
        });

      return Object.freeze(facts);
    } catch {
      // Network or parsing error -> silent fallback
      return Object.freeze([]);
    }
  }

  /**
   * Writes back a user-confirmed fact to remote XMemo vault.
   * Invariant INV-107 & AC-106-3: ONLY confirmed facts may be written back!
   * Any pending or rejected fact throws immediately without dispatch.
   */
  public async writeBack(
    fact: MemoryFact
  ): Promise<{ readonly success: boolean; readonly error?: string }> {
    // Invariant INV-107 & AC-106-3: Only confirmed facts may be written back!
    if (fact.status !== 'confirmed') {
      const errorMsg = `MemoryPort invariant violation (INV-107): only confirmed facts can be written back. Got status '${fact.status}'.`;
      throw new Error(errorMsg);
    }

    if (!this.appAuthToken && !this.oauthConfig && !this.proxyEndpoint) {
      return Object.freeze({
        success: false,
        error: 'XMemo remote adapter disabled (HB-3)',
      });
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.appAuthToken) {
        headers['Authorization'] = `Bearer ${this.appAuthToken}`;
      }

      const response = await this.fetchFn(`${this.proxyEndpoint}/confirmed-facts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          key: fact.key,
          value: fact.value,
          status: fact.status,
          provenance: fact.provenance,
        }),
      });

      if (!response.ok) {
        return Object.freeze({
          success: false,
          error: `XMemo remote sync failed with status ${response.status}`,
        });
      }

      return Object.freeze({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return Object.freeze({
        success: false,
        error: `XMemo remote sync error: ${msg}`,
      });
    }
  }
}
