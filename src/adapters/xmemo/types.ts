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
  readonly adapter: 'local' | 'xmemo_remote';
  readonly isRemoteConfigured: boolean;
  readonly statusText: string;
}

export interface MemoryPort {
  loadFacts(): Promise<readonly MemoryFact[]>;
  writeBack(fact: MemoryFact): Promise<{ readonly success: boolean; readonly error?: string }>;
  getStatus(): MemoryPortStatus;
}
