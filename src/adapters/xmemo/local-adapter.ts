/**
 * LocalMemoryAdapter
 * Default implementation of MemoryPort for the Living Context engine.
 * Backed by YoriStorage; serves as the demo source of truth (HB-3).
 *
 * Invariant INV-107 & AC-106-3:
 * Writes back CONFIRMED facts only. Rejects pending and rejected facts fail-closed.
 */

import type { MemoryPort, MemoryPortStatus } from './types.js';
import type { MemoryFact } from '../../core/contracts/index.js';
import { YoriStorage, InMemoryStorageDriver } from '../../core/storage/index.js';

export class LocalMemoryAdapter implements MemoryPort {
  constructor(private readonly storage: YoriStorage = new YoriStorage(new InMemoryStorageDriver())) {}

  public getStatus(): MemoryPortStatus {
    return {
      adapter: 'local',
      isRemoteConfigured: false,
      statusText: 'Local storage memory adapter active (default source of truth)',
    };
  }

  public async loadFacts(): Promise<readonly MemoryFact[]> {
    const envelope = this.storage.load();
    if (!envelope) {
      return Object.freeze([]);
    }
    return envelope.payload.memoryFacts;
  }

  public async writeBack(fact: MemoryFact): Promise<{ readonly success: boolean; readonly error?: string }> {
    // Invariant INV-107 & AC-106-3: Only confirmed facts may be written back!
    if (fact.status !== 'confirmed') {
      const errorMsg = `MemoryPort invariant violation (INV-107): only confirmed facts can be written back. Got status '${fact.status}'.`;
      throw new Error(errorMsg);
    }

    const envelope = this.storage.load();
    const existingFacts = envelope?.payload.memoryFacts ?? [];
    const existingProposals = envelope?.payload.proposals ?? [];
    const suppressions = envelope?.payload.suppressions ?? [];
    const promptBudget = envelope?.payload.promptBudget ?? { date: '1970-01-01', count: 0 };
    const acceptedPlanIds = envelope?.payload.acceptedPlanIds ?? [];

    // Replace or add the confirmed fact
    const updatedFacts = existingFacts.filter(f => f.key !== fact.key);
    updatedFacts.push(fact);

    // Remove from pending proposals if present
    const updatedProposals = existingProposals.filter(p => p.key !== fact.key);

    this.storage.save(
      {
        memoryFacts: updatedFacts,
        proposals: updatedProposals,
        suppressions,
        promptBudget,
        acceptedPlanIds,
      },
      fact.updatedAt
    );

    return Object.freeze({ success: true });
  }
}
