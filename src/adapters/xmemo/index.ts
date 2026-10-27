/**
 * MemoryPort Entry Point
 * Governed by Architecture Rev3 Section 9.2.
 */

import type { MemoryPort } from './types.js';
import { LocalMemoryAdapter } from './local-adapter.js';
import { XMemoRemoteAdapter } from './remote-adapter.js';
import type { YoriStorage } from '../../core/storage/index.js';

export function createMemoryPort(storage?: YoriStorage, remoteAuthToken?: string): MemoryPort {
  if (remoteAuthToken) {
    return new XMemoRemoteAdapter(remoteAuthToken);
  }
  return new LocalMemoryAdapter(storage);
}

export * from './types.js';
export * from './local-adapter.js';
export * from './remote-adapter.js';
