/**
 * MemoryPort Entry Point
 * Governed by Architecture Rev3 Section 9.2, AC-203-1, and AC-203-2.
 */

import type { MemoryPort, RemoteMemoryAdapterConfig } from './types.js';
import { LocalMemoryAdapter } from './local-adapter.js';
import { XMemoRemoteAdapter } from './remote-adapter.js';
import type { YoriStorage } from '../../core/storage/index.js';

export function createMemoryPort(
  storage?: YoriStorage,
  remoteConfigOrToken?: string | RemoteMemoryAdapterConfig
): MemoryPort {
  if (remoteConfigOrToken) {
    return new XMemoRemoteAdapter(remoteConfigOrToken);
  }
  return new LocalMemoryAdapter(storage);
}

export * from './types.js';
export * from './local-adapter.js';
export * from './remote-adapter.js';
