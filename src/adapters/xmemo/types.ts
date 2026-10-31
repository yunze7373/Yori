/**
 * MemoryPort Contracts & Types
 * Governed by Architecture Rev3 Section 9.2 and Acceptance Criteria AC-106-3, HB-3.
 *
 * MemoryPort:
 * - Local adapter is the default and source of truth.
 * - XMemo remote adapter is behind the port and stays off unless end-user app auth path is configured (HB-3).
 * - Writes back CONFIRMED facts only. Any attempt to write back pending or rejected facts throws/fails closed.
 * - Zero agent tokens in repo or client.
 */

import type { MemoryFact } from '../../core/contracts/index.js';

export interface MemoryPortStatus {
  readonly adapter: 'local' | 'xmemo_remote' | 'composite';
  readonly isRemoteConfigured: boolean;
  readonly statusText: string;
  readonly connectionState?: 'off' | 'connected-mock' | 'error-fallback';
}

/**
 * Verified XMemo OAuth Configuration
 * Derived from RFC 8414 metadata at https://xmemo.dev/.well-known/oauth-authorization-server (AC-203-1).
 */
export interface XMemoOAuthConfig {
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly registrationEndpoint?: string;
  readonly revocationEndpoint?: string;
  readonly clientId?: string;
  readonly scopes: readonly string[];
}

/**
 * Remote Memory Adapter Configuration Surface
 */
export interface RemoteMemoryAdapterConfig {
  readonly appAuthToken?: string;
  readonly oauth?: XMemoOAuthConfig;
  readonly proxyEndpoint?: string;
  readonly fetchFn?: typeof fetch;
}

export interface MemoryPort {
  loadFacts(): Promise<readonly MemoryFact[]>;
  writeBack(fact: MemoryFact): Promise<{ readonly success: boolean; readonly error?: string }>;
  getStatus(): MemoryPortStatus;
}
