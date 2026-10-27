/**
 * MemoryPort Unit Tests
 * Governed by Architecture Rev3 Section 9.2, AC-106-3, and HB-3.
 */

import { describe, it, expect } from 'vitest';
import { createMemoryPort, LocalMemoryAdapter, XMemoRemoteAdapter } from './index.js';
import { YoriStorage, InMemoryStorageDriver } from '../../core/storage/index.js';
import { createMemoryFact, type MemoryFact } from '../../core/contracts/index.js';

describe('MemoryPort (XMemo & Local Adapters)', () => {
  it('defaults to LocalMemoryAdapter and reports local status (HB-3)', () => {
    const memoryPort = createMemoryPort();
    const status = memoryPort.getStatus();
    expect(status.adapter).toBe('local');
    expect(status.isRemoteConfigured).toBe(false);
  });

  it('LocalMemoryAdapter writes back CONFIRMED facts to storage', async () => {
    const driver = new InMemoryStorageDriver();
    const storage = new YoriStorage(driver);
    const memoryPort = new LocalMemoryAdapter(storage);

    const confirmedFact: MemoryFact = createMemoryFact(
      'rain_transport_preference',
      'drive_first',
      'confirmed',
      { source: 'user_confirmed', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    const result = await memoryPort.writeBack(confirmedFact);
    expect(result.success).toBe(true);

    const loaded = await memoryPort.loadFacts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.key).toBe('rain_transport_preference');
    expect(loaded[0]?.status).toBe('confirmed');
  });

  it('LocalMemoryAdapter strictly REJECTS write-back of pending facts (INV-107, AC-106-3)', async () => {
    const memoryPort = new LocalMemoryAdapter();

    const pendingFact: MemoryFact = createMemoryFact(
      'prep_buffer_preference',
      { prep: 25 },
      'pending',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(memoryPort.writeBack(pendingFact)).rejects.toThrow(
      /MemoryPort invariant violation \(INV-107\): only confirmed facts can be written back/
    );
  });

  it('LocalMemoryAdapter strictly REJECTS write-back of rejected facts (INV-107, AC-106-3)', async () => {
    const memoryPort = new LocalMemoryAdapter();

    const rejectedFact: MemoryFact = createMemoryFact(
      'suppress_lunch',
      'never',
      'rejected',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(memoryPort.writeBack(rejectedFact)).rejects.toThrow(
      /MemoryPort invariant violation \(INV-107\): only confirmed facts can be written back/
    );
  });

  it('XMemoRemoteAdapter stays off unless app auth configured and rejects non-confirmed write-back (HB-3)', async () => {
    const unconfiguredRemote = new XMemoRemoteAdapter();
    expect(unconfiguredRemote.getStatus().isRemoteConfigured).toBe(false);

    const pendingFact: MemoryFact = createMemoryFact(
      'key',
      'val',
      'pending',
      { source: 'user_feedback', recordedAt: '2026-10-28T10:00:00Z' },
      '2026-10-28T10:00:00Z'
    );

    await expect(unconfiguredRemote.writeBack(pendingFact)).rejects.toThrow(
      /MemoryPort invariant violation/
    );
  });
});
