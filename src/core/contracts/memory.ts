/**
 * Core Contracts: Memory & Facts
 * Governed by Invariant INV-107 (learn-and-correct, HABIT-LEARN 2026-11-04) and AC-101-1.
 */

import { deepFreeze } from './signal.js';

/**
 * 'confirmed' = something the user said or did on purpose (user_confirmed / user_stated);
 * 'learned'   = a habit Yori learned from the user's own in-app choices (source 'observed');
 * 'pending' / 'rejected' are legacy states kept readable for stored data; nothing is gated on them.
 */
export type MemoryStatus = 'confirmed' | 'learned' | 'pending' | 'rejected';

export type MemorySource = 'user_confirmed' | 'user_stated' | 'observed' | 'user_feedback' | 'seed' | 'inferred';

/** Facts that shape recommendations: what the user told Yori and what Yori learned. */
export function isActiveMemoryFact(f: { status?: string } | null | undefined): boolean {
  return Boolean(f && (f.status === 'confirmed' || f.status === 'learned'));
}

export interface MemoryProvenance {
  readonly source: MemorySource;
  readonly recordedAt: string; // ISO 8601 string
  readonly evidenceSignalIds?: readonly string[];
  readonly note?: string;
}

/**
 * MemoryFact
 * INV-107 (learn-and-correct): Yori learns habits from the user's own in-app choices and applies
 * them without asking; what the user tells Yori is saved as stated. Every fact is visible to the
 * user with its basis and can be forgotten; nothing waits for a confirm step.
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
