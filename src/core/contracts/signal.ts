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
 * Factory for creating simulated signals from mock/simulated sources.
 * Enforces simulated labelling in types and runtime data (AC-101-3, INV-102).
 */
export function createSimulatedSignal<T>(params: MockSignalParams<T>): SimulatedSignal<T> {
  if (params.validFor <= 0) {
    throw new Error(`validFor must be positive, got ${params.validFor}`);
  }
  if (params.confidence < 0 || params.confidence > 1) {
    throw new Error(`confidence must be between 0 and 1, got ${params.confidence}`);
  }

  return Object.freeze({
    kind: params.kind,
    value: params.value,
    source: 'simulated' as const,
    label: 'simulated' as const,
    issuedAt: params.issuedAt,
    validFor: params.validFor,
    confidence: params.confidence,
    consentScope: params.consentScope,
  });
}

/**
 * ContextSnapshot
 * Immutable snapshot of contextual signals as-of a specific point in time.
 * (INV-101)
 */
export interface ContextSnapshot {
  readonly id: string;
  readonly asOf: string; // ISO 8601 string
  readonly signals: readonly ContextSignal[];
}

/**
 * Deeply freeze a ContextSnapshot to enforce immutable runtime integrity (INV-101).
 */
export function freezeSnapshot(snapshot: ContextSnapshot): Readonly<ContextSnapshot> {
  const frozenSignals = Object.freeze(snapshot.signals.map(s => Object.freeze({ ...s })));
  return Object.freeze({
    id: snapshot.id,
    asOf: snapshot.asOf,
    signals: frozenSignals,
  });
}
