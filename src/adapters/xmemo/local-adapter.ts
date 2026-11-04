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
    // INV-107 (learn-and-correct): what the user told Yori ('confirmed') and what Yori learned
    // from the user's own choices ('learned') are written; 'pending' and anything else never are.
    if (fact.status !== 'confirmed' && fact.status !== 'learned') {
      const errorMsg = `MemoryPort invariant violation (INV-107): only stated or learned facts can be written back. Got status '${fact.status}'.`;
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
        ...((envelope?.payload as object) ?? {}),
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

  /** HABIT-LEARN Forget: removes the fact (and any legacy proposal) for this key from this device. */
  public async forget(key: string, at: string): Promise<{ readonly success: boolean; readonly error?: string }> {
    const envelope = this.storage.load();
    if (!envelope) return Object.freeze({ success: true });
    this.storage.save(
      {
        ...(envelope.payload as any),
        memoryFacts: envelope.payload.memoryFacts.filter(f => f.key !== key),
        proposals: envelope.payload.proposals.filter(p => p.key !== key),
      },
      at
    );
    return Object.freeze({ success: true });
  }
}
