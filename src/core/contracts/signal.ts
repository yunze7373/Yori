/**
 * Core Contracts: Context Signals & Snapshots
 * Governed by Invariants INV-101, INV-102, and Acceptance Criteria AC-101-1, AC-101-3.
 */

export type SignalSource = 'simulated' | 'real';

export type ConsentScope = 'device_only' | 'local_only' | 'network_model' | 'network_sync';

/**
 * ContextSignal
 * Every signal is sourced ('simulated' | 'real'), timestamped ('issuedAt'),
 * validity-bounded ('validFor'), scored with confidence (0..1), and scoped by consent.
 * (INV-101, AC-101-1)
 */
export interface ContextSignal<T = unknown> {
  readonly kind: string;
  readonly value: T;
  readonly source: SignalSource;
  readonly issuedAt: string;       // ISO 8601 string
  readonly validFor: number;       // validity window in milliseconds (> 0)
  readonly confidence: number;     // 0.0 to 1.0
  readonly consentScope: ConsentScope;
  readonly label?: 'simulated' | 'real'; // INV-102: explicit source label
}

/**
 * Simulated Context Signal (INV-102, AC-101-3)
 * Statically guaranteed to carry 'simulated' source and label.
 */
export interface SimulatedSignal<T = unknown> extends ContextSignal<T> {
  readonly source: 'simulated';
  readonly label: 'simulated';
}

/**
 * Real Context Signal (INV-102)
 * Statically guaranteed to carry 'real' source and label.
 */
export interface RealSignal<T = unknown> extends ContextSignal<T> {
  readonly source: 'real';
  readonly label: 'real';
}

/**
 * MockAdapterSignalParams
 * Parameters accepted by mock adapters.
 * Note: 'source' is omitted because mock adapters are strictly forbidden
 * from emitting anything other than 'simulated' signals (AC-101-3, INV-102).
 */
export interface MockSignalParams<T = unknown> {
  kind: string;
  value: T;
  issuedAt: string;
  validFor: number;
  confidence: number;
  consentScope: ConsentScope;
}

/**
 * Helper to recursively deep-freeze an object or array.
 */
export function deepFreeze<T>(item: T): T {
  if (item === null || typeof item !== 'object' || Object.isFrozen(item)) {
    return item;
  }
  Object.freeze(item);
  for (const key of Object.getOwnPropertyNames(item)) {
    const val = (item as Record<string, unknown>)[key];
    if (val !== null && (typeof val === 'object' || typeof val === 'function')) {
      deepFreeze(val);
    }
  }
  return item;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Factory for creating simulated signals from mock/simulated sources.
 * Enforces fail-closed validation on timestamps, durations, and confidence,
 * and attaches explicit simulated labelling in types and runtime data (AC-101-3, INV-102).
 */
export function createSimulatedSignal<T>(params: MockSignalParams<T>): SimulatedSignal<T> {
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

  // Clone nested value if object to guarantee deep immutability
  const clonedValue =
    params.value !== null && typeof params.value === 'object'
      ? structuredClone(params.value)
      : params.value;

  const signal: SimulatedSignal<T> = {
    kind: params.kind,
    value: clonedValue,
    source: 'simulated' as const,
    label: 'simulated' as const,
    issuedAt: params.issuedAt,
    validFor: params.validFor,
    confidence: params.confidence,
    consentScope: params.consentScope,
  };

  return deepFreeze(signal);
}

/**
 * ContextSnapshot
 * Immutable snapshot of contextual signals as-of a specific point in time.
 * (INV-101)
 */
export interface ContextSnapshot {
  readonly id: string;
  readonly asOf: string; // ISO 8601 string
  readonly timezone?: string; // Optional IANA timezone name (e.g. from Scenario)
  readonly signals: readonly ContextSignal[];
}

/**
 * Deeply freeze a ContextSnapshot to enforce immutable runtime integrity (INV-101).
 * Clones signals and their values so external mutations can never alter snapshot contents.
 */
export function freezeSnapshot(snapshot: ContextSnapshot): Readonly<ContextSnapshot> {
  const clonedSnapshot: ContextSnapshot = {
    id: snapshot.id,
    asOf: snapshot.asOf,
    timezone: snapshot.timezone,
    signals: snapshot.signals.map(s => {
      const clonedVal =
        s.value !== null && typeof s.value === 'object'
          ? structuredClone(s.value)
          : s.value;
      return {
        ...s,
        value: clonedVal,
      };
    }),
  };

  return deepFreeze(clonedSnapshot);
}
