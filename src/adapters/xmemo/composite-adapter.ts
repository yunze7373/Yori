/**
 * CompositeMemoryAdapter
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, AC-203-2, and INBOX-20261031-E69766 (HB-3).
 *
 * Local-First Sovereign MemoryPort:
 * 1. Sovereign Local Storage:
 *    Local storage always loads first and serves as the sovereign source of truth.
 * 2. Remote Gating:
 *    Remote is accessed ONLY when /api/xmemo/status reports enabled=true and connected=true.
 * 3. Client-Side Security:
 *    The browser talks exclusively to the same-origin /api/xmemo proxy with zero bearer tokens,
 *    zero Authorization headers, and zero external requests to xmemo.dev.
 * 4. Read Merge Contract:
 *    - Remote facts must have status === 'confirmed' (pending/rejected items are ignored, never auto-confirmed).
 *    - Fact keys must be Yori-managed (isYoriManagedFactKey).
 *    - Never overwrites existing local confirmed facts (local takes precedence).
 *    - Truthful provenance ('xmemo', note 'Synced from XMemo vault').
 * 5. Write Invariant INV-107:
 *    - Only confirmed facts may be written back; pending/rejected throws immediately fail-closed.
 *    - Writes to local first, then remote if connected.
 * 6. Silent Fallback:
 *    - Bounded timeout (1500ms) with AbortController.
 *    - 401, 403, 5xx, timeout, or network error falls back silently to local state without UX disruption.
 *    - connectionState reflects 'off' | 'connected-mock' | 'error-fallback'.
 */

import type { MemoryFact, MemorySource } from '../../core/contracts/index.js';
import { YoriStorage } from '../../core/storage/index.js';
import { isYoriManagedFactKey } from './key-contract.js';
import { LocalMemoryAdapter } from './local-adapter.js';
import type { MemoryPort, MemoryPortStatus } from './types.js';

export interface CompositeMemoryAdapterOptions {
  readonly storage?: YoriStorage;
  readonly localAdapter?: LocalMemoryAdapter;
  readonly proxyEndpoint?: string;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
  readonly statusChecker?: () => Promise<{ enabled: boolean; connected: boolean; statusText?: string }>;
}

export class CompositeMemoryAdapter implements MemoryPort {
  private readonly localAdapter: LocalMemoryAdapter;
  private readonly proxyEndpoint: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly statusChecker?: () => Promise<{ enabled: boolean; connected: boolean; statusText?: string }>;

  private connectionState: 'off' | 'connected-mock' | 'error-fallback' = 'off';
  private lastStatusText: string = 'Local storage memory adapter active (remote XMemo off)';
  private cachedMergedFacts: readonly MemoryFact[] | null = null;

  constructor(options: CompositeMemoryAdapterOptions = {}) {
    if (options.localAdapter) {
      this.localAdapter = options.localAdapter;
    } else if (options.storage) {
      this.localAdapter = new LocalMemoryAdapter(options.storage);
    } else {
      this.localAdapter = new LocalMemoryAdapter();
    }

    this.proxyEndpoint = options.proxyEndpoint ?? '/api/xmemo';
    this.fetchFn =
      options.fetchFn ??
      (typeof window !== 'undefined' && typeof window.fetch === 'function'
        ? window.fetch.bind(window)
        : typeof fetch !== 'undefined'
        ? fetch
        : (() => Promise.reject(new Error('fetch unavailable'))) as any);
    this.timeoutMs = options.timeoutMs ?? 1500;
    this.statusChecker = options.statusChecker;
  }

  public getStatus(): MemoryPortStatus {
    const isRemoteConfigured = this.connectionState === 'connected-mock';
    return {
      adapter: 'composite',
      isRemoteConfigured,
      statusText: this.lastStatusText,
      connectionState: this.connectionState,
    };
  }

  public getLocalAdapter(): LocalMemoryAdapter {
    return this.localAdapter;
  }

  public getCachedFacts(): readonly MemoryFact[] | null {
    return this.cachedMergedFacts;
  }

  /**
   * Checks whether the remote XMemo proxy session is currently enabled and connected.
   */
  public async checkRemoteStatus(): Promise<{ enabled: boolean; connected: boolean; statusText?: string }> {
    if (this.statusChecker) {
      try {
        return await this.statusChecker();
      } catch {
        return { enabled: false, connected: false };
      }
    }

    try {
      const response = await this.fetchFn(`${this.proxyEndpoint}/status`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return { enabled: false, connected: false };
      }

      const data = (await response.json()) as { enabled?: boolean; connected?: boolean; statusText?: string };
      return {
        enabled: Boolean(data?.enabled),
        connected: Boolean(data?.connected),
        statusText: data?.statusText,
      };
    } catch {
      return { enabled: false, connected: false };
    }
  }

  /**
   * Loads facts local-first:
   * 1. Local storage loads first (sovereign truth).
   * 2. If remote is enabled & connected, fetches remote preferences with bounded timeout (1500ms).
   * 3. Merges confirmed remote facts for Yori-managed keys without overwriting local facts.
   * 4. On timeout or error (401/403/5xx/offline), falls back silently to local facts.
   */
  public async loadFacts(): Promise<readonly MemoryFact[]> {
    // 1. Local storage is sovereign: always load local facts first
    const localFacts = await this.localAdapter.loadFacts();

    // 2. Check remote status
    let status: { enabled: boolean; connected: boolean; statusText?: string };
    try {
      status = await this.checkRemoteStatus();
    } catch {
      status = { enabled: false, connected: false };
    }

    if (!status.enabled || !status.connected) {
      this.connectionState = 'off';
      this.lastStatusText = 'Local storage memory adapter active (remote XMemo off)';
      this.cachedMergedFacts = localFacts;
      return localFacts;
    }

    // 3. Remote is enabled and connected: query /api/xmemo/preferences with bounded timeout
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      // Note: Browser talks only to same-origin /api/xmemo proxy: ZERO agent/owner tokens or Authorization headers!
      const response = await this.fetchFn(`${this.proxyEndpoint}/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ query: 'preferences' }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        // 401, 403, 5xx: silent fallback to local storage
        this.connectionState = 'error-fallback';
        this.lastStatusText = `Remote memory vault unavailable (HTTP ${response.status}). Operating in local fallback mode.`;
        this.cachedMergedFacts = localFacts;
        return localFacts;
      }

      const json = await response.json();
      const remoteFacts = this.parseRemoteFacts(json);

      // Read contract:
      // - Remote CONFIRMED facts for Yori-managed keys merge in without overwriting local confirmed facts.
      // - Pending, rejected, and non-Yori-tagged remote items are IGNORED (never auto-confirmed).
      // - Remote-origin facts carry truthful provenance ('xmemo', note 'Synced from XMemo vault').
      const localKeys = new Set(localFacts.map(f => f.key));
      const validRemoteFacts = remoteFacts.filter(fact => {
        if (fact.status !== 'confirmed') return false;
        if (!isYoriManagedFactKey(fact.key)) return false;
        if (localKeys.has(fact.key)) return false; // Local confirmed fact takes precedence
        return true;
      });

      const mergedFacts = Object.freeze([...localFacts, ...validRemoteFacts]);
      this.connectionState = 'connected-mock';
      this.lastStatusText = 'Connected to mock XMemo vault (local-first composite active)';
      this.cachedMergedFacts = mergedFacts;
      return mergedFacts;
    } catch {
      // Timeout, network error, or malformed JSON: silent fallback to local
      this.connectionState = 'error-fallback';
      this.lastStatusText = 'Remote memory vault timeout or network error. Operating in local fallback mode.';
      this.cachedMergedFacts = localFacts;
      return localFacts;
    }
  }

  /**
   * Writes back a user-confirmed fact:
   * - Invariant INV-107: ONLY confirmed facts may be written back! Pending/rejected throw immediately.
   * - Writes to local storage first (sovereignty).
   * - If remote is connected, attempts remote sync with bounded timeout.
   * - Remote write failures fall back gracefully without breaking local state.
   */
  public async writeBack(fact: MemoryFact): Promise<{ readonly success: boolean; readonly error?: string }> {
    // Invariant INV-107 & AC-106-3: Only confirmed facts may be written back!
    if (fact.status !== 'confirmed') {
      const errorMsg = `MemoryPort invariant violation (INV-107): only confirmed facts can be written back. Got status '${fact.status}'.`;
      throw new Error(errorMsg);
    }

    // 1. Sovereign write to local storage first
    const localResult = await this.localAdapter.writeBack(fact);

    // Update in-memory cached facts if present
    if (this.cachedMergedFacts) {
      const updated = this.cachedMergedFacts.filter(f => f.key !== fact.key);
      updated.push(fact);
      this.cachedMergedFacts = Object.freeze(updated);
    }

    // 2. Check remote status
    let status: { enabled: boolean; connected: boolean; statusText?: string };
    try {
      status = await this.checkRemoteStatus();
    } catch {
      status = { enabled: false, connected: false };
    }

    if (!status.enabled || !status.connected) {
      return localResult;
    }

    // 3. Attempt remote write with bounded timeout
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      const response = await this.fetchFn(`${this.proxyEndpoint}/confirmed-facts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // NO Authorization header! Client talks same-origin to proxy.
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          key: fact.key,
          value: fact.value,
          status: fact.status,
          provenance: fact.provenance,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        this.connectionState = 'error-fallback';
        this.lastStatusText = `Remote write failed with status ${response.status}. Local storage updated.`;
        return Object.freeze({
          success: true,
          error: `Remote write fallback: status ${response.status}`,
        });
      }

      this.connectionState = 'connected-mock';
      this.lastStatusText = 'Connected to mock XMemo vault (fact synced)';
      return Object.freeze({ success: true });
    } catch (err: unknown) {
      this.connectionState = 'error-fallback';
      const msg = err instanceof Error ? err.message : String(err);
      this.lastStatusText = `Remote write error (${msg}). Local storage updated.`;
      return Object.freeze({
        success: true,
        error: `Remote write fallback: ${msg}`,
      });
    }
  }

  /**
   * Parses remote MCP response payloads into MemoryFact candidates.
   */
  private parseRemoteFacts(json: unknown): readonly MemoryFact[] {
    const items: Array<Record<string, any>> = [];

    if (Array.isArray(json)) {
      items.push(...json);
    } else if (json && typeof json === 'object') {
      const record = json as Record<string, any>;
      if (Array.isArray(record.items)) {
        items.push(...record.items);
      } else if (Array.isArray(record.memories)) {
        items.push(...record.memories);
      } else if (record.result && typeof record.result === 'object') {
        const res = record.result as Record<string, any>;
        if (Array.isArray(res.items)) {
          items.push(...res.items);
        } else if (Array.isArray(res.memories)) {
          items.push(...res.memories);
        } else if (Array.isArray(res.content)) {
          for (const c of res.content) {
            if (c?.type === 'text' && typeof c.text === 'string') {
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
      }
    }

    const facts: MemoryFact[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const key = item.key || item.name;
      if (typeof key !== 'string' || !key.trim()) continue;

      const value = item.value ?? item.content ?? item.text ?? '';
      const status = item.status === 'confirmed' ? 'confirmed' : item.status === 'rejected' ? 'rejected' : 'pending';
      const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString();
      const recordedAt = typeof item.recordedAt === 'string' ? item.recordedAt : updatedAt;
      const note = typeof item.note === 'string' ? item.note : (item.provenance?.note || 'Synced from XMemo vault');

      facts.push({
        key,
        value,
        status,
        provenance: {
          source: 'xmemo' as unknown as MemorySource,
          recordedAt,
          note,
        },
        updatedAt,
      });
    }

    return facts;
  }
}
