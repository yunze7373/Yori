/**
 * Core Contracts: Memory & Facts
 * Governed by Invariants INV-107 and Acceptance Criteria AC-101-1.
 */

export type MemoryStatus = 'confirmed' | 'pending' | 'rejected';

export interface MemoryProvenance {
  readonly source: 'user_confirmed' | 'user_feedback' | 'seed' | 'inferred' | string;
  readonly recordedAt: string; // ISO 8601 string
  readonly evidenceSignalIds?: readonly string[];
  readonly note?: string;
}

/**
 * MemoryFact
 * Memory writes only on user confirm; feedback creates pending proposals, never direct mutation (INV-107).
 */
export interface MemoryFact<T = unknown> {
  readonly key: string;
  readonly value: T;
  readonly status: MemoryStatus;
  readonly provenance: MemoryProvenance;
  readonly updatedAt: string;
}

/**
 * Helper to create an immutable MemoryFact record.
 */
export function createMemoryFact<T>(
  key: string,
  value: T,
  status: MemoryStatus,
  provenance: MemoryProvenance,
  updatedAt: string = new Date().toISOString()
): Readonly<MemoryFact<T>> {
  return Object.freeze({
    key,
    value,
    status,
    provenance: Object.freeze({ ...provenance }),
    updatedAt,
  });
}
