/**
 * Real Signal Factory
 * Governed by Invariants INV-101, INV-102 and Acceptance Criteria AC-204-1.
 *
 * Enforces fail-closed validation on timestamps, validFor bounds, and confidence,
 * attaching explicit 'real' source and label in types and runtime data.
 */

import {
  deepFreeze,
  type ConsentScope,
  type RealSignal,
} from '../../core/contracts/index.js';

export interface RealSignalParams<T = unknown> {
  readonly kind: string;
  readonly value: T;
  readonly issuedAt: string;
  readonly validFor: number;
  readonly confidence: number;
  readonly consentScope: ConsentScope;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Creates a validated, deeply-frozen RealSignal (INV-101, INV-102, AC-204-1).
 */
export function createRealSignal<T>(params: RealSignalParams<T>): RealSignal<T> {
  if (typeof params.validFor !== 'number' || !Number.isFinite(params.validFor) || params.validFor <= 0) {
    throw new Error(`validFor must be a finite positive number, got ${params.validFor}`);
  }
  if (
    typeof params.confidence !== 'number' ||
    !Number.isFinite(params.confidence) ||
    params.confidence < 0 ||
    params.confidence > 1
  ) {
    throw new Error(`confidence must be a finite number between 0 and 1, got ${params.confidence}`);
  }
  if (
    typeof params.issuedAt !== 'string' ||
    !ISO_DATE_PATTERN.test(params.issuedAt) ||
    !Number.isFinite(Date.parse(params.issuedAt))
  ) {
    throw new Error(`issuedAt must be a valid ISO-8601 string, got '${params.issuedAt}'`);
  }

  const clonedValue =
    params.value !== null && typeof params.value === 'object'
      ? structuredClone(params.value)
      : params.value;

  const signal: RealSignal<T> = {
    kind: params.kind,
    value: clonedValue,
    source: 'real',
    label: 'real',
    issuedAt: params.issuedAt,
    validFor: params.validFor,
    confidence: params.confidence,
    consentScope: params.consentScope,
  };

  return deepFreeze(signal);
}
