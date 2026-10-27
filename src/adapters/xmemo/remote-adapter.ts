/**
 * XMemoRemoteAdapter
 * Governed by Architecture Rev3 Section 9.2 (HB-3).
 *
 * Remote integration seam:
 * - Remains OFF unless an end-user app auth path is configured.
 * - Never includes agent tokens or agent credentials.
 * - Writes back confirmed facts only.
 */

import type { MemoryPort, MemoryPortStatus } from './types.js';
import type { MemoryFact } from '../../core/contracts/index.js';

export class XMemoRemoteAdapter implements MemoryPort {
  constructor(private readonly appAuthToken?: string) {}

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

  public async loadFacts(): Promise<readonly MemoryFact[]> {
    if (!this.appAuthToken) {
      return Object.freeze([]);
    }
    // Remote fetch path when end-user auth is configured
    return Object.freeze([]);
  }

  public async writeBack(fact: MemoryFact): Promise<{ readonly success: boolean; readonly error?: string }> {
    // Invariant INV-107 & AC-106-3: Only confirmed facts may be written back!
    if (fact.status !== 'confirmed') {
      const errorMsg = `MemoryPort invariant violation (INV-107): only confirmed facts can be written back. Got status '${fact.status}'.`;
      throw new Error(errorMsg);
    }

    if (!this.appAuthToken) {
      // Remote adapter is off; local remains source of truth
      return Object.freeze({
        success: false,
        error: 'XMemo remote adapter disabled (HB-3)',
      });
    }

    return Object.freeze({ success: true });
  }
}
