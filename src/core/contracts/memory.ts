/**
 * Core Contracts: Memory & Facts
 * Governed by Invariants INV-107 and Acceptance Criteria AC-101-1.
 */

import { deepFreeze } from './signal.js';

export type MemoryStatus = 'confirmed' | 'pending' | 'rejected';

export type MemorySource = 'user_confirmed' | 'user_feedback' | 'seed' | 'inferred';

export interface MemoryProvenance {
  readonly source: MemorySource;
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
  readonly updatedAt: string; // Required timestamp; no ambient clock read in core
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Helper to create an immutable MemoryFact record.
 * Requires explicit updatedAt timestamp from the caller (or Clock) to preserve deterministic replay.
 */
export function createMemoryFact<T>(
  key: string,
  value: T,
  status: MemoryStatus,
  provenance: MemoryProvenance,
  updatedAt: string
): Readonly<MemoryFact<T>> {
  if (
    typeof updatedAt !== 'string' ||
    !ISO_DATE_PATTERN.test(updatedAt) ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    throw new Error(`updatedAt must be a valid ISO-8601 string, got '${updatedAt}'`);
  }

  const clonedValue =
    value !== null && typeof value === 'object'
      ? structuredClone(value)
      : value;

  const fact: MemoryFact<T> = {
    key,
    value: clonedValue,
    status,
    provenance: {
      source: provenance.source,
      recordedAt: provenance.recordedAt,
      ...(provenance.evidenceSignalIds ? { evidenceSignalIds: [...provenance.evidenceSignalIds] } : {}),
      ...(provenance.note ? { note: provenance.note } : {}),
    },
    updatedAt,
  };

  return deepFreeze(fact);
}
