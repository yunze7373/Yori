/**
 * Live Signal Envelope & Factory
 * Governed by LIVE_FIRST Architecture (ARCH-LIVE-FIRST-PROVIDERS),
 * Invariants INV-101 (immutability), INV-102 (source isolation), INV-106 (bounded validity).
 *
 * Defines the LiveSignal envelope:
 * - provider: string identifier of the signal source
 * - asOf: ISO 8601 timestamp when the signal was observed
 * - validFor: finite positive duration in milliseconds
 * - confidence: finite number 0.0 to 1.0
 * - provenance: 'live' | 'simulated' | 'user'
 * - status: 'available' | 'unavailable' | 'permission_needed' | 'stale' | 'error'
 * - consentScope: 'device_only' | 'local_only' | 'network_model' | 'network_sync'
 *
 * Deeply frozen before delivery (INV-101).
 * Compatible with core ContextSignal shape (AC-EXT-1: zero core diff).
 */

import {
  deepFreeze,
  type ConsentScope,
  type ContextSignal,
  type SignalSource,
} from '../../core/contracts/index.js';

export type LiveProvenance = 'live' | 'simulated' | 'user';

export type LiveSignalStatus =
  | 'available'
  | 'unavailable'
  | 'permission_needed'
  | 'stale'
  | 'error';

export interface LiveSignalNotice {
  readonly code: string;
  readonly message: string;
  readonly humanNotice: string;
  readonly provider: string;
  readonly fetchedAt?: string;
}

export interface LiveSignalError {
  readonly code: string;
  readonly message: string;
  readonly fetchedAt?: string;
}

/**
 * LiveSignal
 * The official signal envelope for live and simulated proactive signals.
 * Extends ContextSignal so it can be placed directly into ContextSnapshot.signals
 * without requiring any src/core modification.
 */
export interface LiveSignal<T = unknown> extends ContextSignal<T> {
  readonly provider: string;
  readonly asOf: string; // ISO 8601 string (identical to issuedAt)
  readonly validFor: number; // validity window in milliseconds (> 0, INV-106)
  readonly confidence: number; // 0.0 to 1.0
  readonly provenance: LiveProvenance; // INV-102: explicit source provenance
  readonly status: LiveSignalStatus;
  readonly consentScope: ConsentScope;
  readonly kind: string;
  readonly value: T;
  readonly source: SignalSource; // 'real' for live/user, 'simulated' for simulated
  readonly label: 'real' | 'simulated';
  readonly issuedAt: string; // ISO 8601 string (ContextSignal compatibility)
  readonly notice?: LiveSignalNotice;
  readonly error?: LiveSignalError;
}

export interface CreateLiveSignalParams<T = unknown> {
  readonly kind: string;
  readonly value: T;
  readonly provider: string;
  readonly asOf: string;
  readonly validFor: number;
  readonly confidence: number;
  readonly provenance: LiveProvenance;
  readonly consentScope: ConsentScope;
  readonly status?: LiveSignalStatus;
  readonly notice?: LiveSignalNotice;
  readonly error?: LiveSignalError;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * Creates a validated, deeply frozen LiveSignal (INV-101, INV-102, INV-106).
 */
export function createLiveSignal<T>(params: CreateLiveSignalParams<T>): LiveSignal<T> {
  if (typeof params.provider !== 'string' || params.provider.trim().length === 0) {
    throw new Error(`provider must be a non-empty string, got '${params.provider}'`);
  }

  if (typeof params.kind !== 'string' || params.kind.trim().length === 0) {
    throw new Error(`kind must be a non-empty string, got '${params.kind}'`);
  }

  if (
    typeof params.validFor !== 'number' ||
    !Number.isFinite(params.validFor) ||
    params.validFor <= 0
  ) {
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
    typeof params.asOf !== 'string' ||
    !ISO_DATE_PATTERN.test(params.asOf) ||
    !Number.isFinite(Date.parse(params.asOf))
  ) {
    throw new Error(`asOf must be a valid ISO-8601 string, got '${params.asOf}'`);
  }

  const validProvenances: readonly LiveProvenance[] = ['live', 'simulated', 'user'];
  if (!validProvenances.includes(params.provenance)) {
    throw new Error(`provenance must be 'live' | 'simulated' | 'user', got '${params.provenance}'`);
  }

  const validScopes: readonly ConsentScope[] = [
    'device_only',
    'local_only',
    'network_model',
    'network_sync',
  ];
  if (!validScopes.includes(params.consentScope)) {
    throw new Error(`consentScope must be a valid ConsentScope, got '${params.consentScope}'`);
  }

  // Determine source and label: 'simulated' if provenance is simulated, otherwise 'real'
  const source: SignalSource = params.provenance === 'simulated' ? 'simulated' : 'real';
  const label: 'real' | 'simulated' = source;

  // Default status
  let status: LiveSignalStatus = params.status ?? (params.error ? 'error' : 'available');

  // Clone nested values to guarantee deep immutability
  const clonedValue =
    params.value !== null && typeof params.value === 'object'
      ? structuredClone(params.value)
      : params.value;

  const clonedNotice = params.notice ? structuredClone(params.notice) : undefined;
  const clonedError = params.error ? structuredClone(params.error) : undefined;

  const signal: LiveSignal<T> = {
    kind: params.kind,
    value: clonedValue,
    provider: params.provider,
    asOf: params.asOf,
    issuedAt: params.asOf,
    validFor: params.validFor,
    confidence: params.confidence,
    provenance: params.provenance,
    status,
    consentScope: params.consentScope,
    source,
    label,
    ...(clonedNotice ? { notice: clonedNotice } : {}),
    ...(clonedError ? { error: clonedError } : {}),
  };

  return deepFreeze(signal);
}

/**
 * Checks whether a LiveSignal has expired relative to a reference timestamp (INV-106).
 */
export function isLiveSignalExpired(
  signal: LiveSignal,
  referenceTime: string | Date = new Date().toISOString()
): boolean {
  const refMs =
    typeof referenceTime === 'string' ? Date.parse(referenceTime) : referenceTime.getTime();
  if (!Number.isFinite(refMs)) {
    throw new Error(`Invalid reference time: '${referenceTime}'`);
  }

  const asOfMs = Date.parse(signal.asOf);
  return refMs > asOfMs + signal.validFor;
}

/**
 * Degrades an expired LiveSignal to 'unavailable' (or 'stale') status with an explicit
 * human-first notice, never silently fabricating or continuing to serve stale data (INV-103, INV-106).
 */
export function degradeIfExpired<T>(
  signal: LiveSignal<T>,
  referenceTime: string | Date = new Date().toISOString()
): LiveSignal<T> {
  if (!isLiveSignalExpired(signal, referenceTime)) {
    return signal;
  }

  const refIso =
    typeof referenceTime === 'string' ? referenceTime : referenceTime.toISOString();
  const expiresAtIso = new Date(Date.parse(signal.asOf) + signal.validFor).toISOString();

  return createLiveSignal<T>({
    kind: signal.kind,
    value: signal.value,
    provider: signal.provider,
    asOf: signal.asOf,
    validFor: signal.validFor,
    confidence: 0,
    provenance: signal.provenance,
    consentScope: signal.consentScope,
    status: 'unavailable',
    notice: {
      code: 'signal_expired',
      message: `Signal ${signal.kind} from ${signal.provider} expired at ${expiresAtIso} (checked at ${refIso})`,
      humanNotice: `${signal.kind} data is unavailable (expired)`,
      provider: signal.provider,
      fetchedAt: signal.asOf,
    },
    error: {
      code: 'signal_expired',
      message: `Expired at ${expiresAtIso}`,
      fetchedAt: signal.asOf,
    },
  });
}

/**
 * Factory for honest empty LiveSignals when a provider is absent, permission is denied,
 * or an error occurs. Enforces human-first notices (INV-103).
 */
export function createEmptyLiveSignal<T = null>(params: {
  readonly kind: string;
  readonly provider: string;
  readonly asOf?: string;
  readonly reason: 'missing_provider' | 'permission_denied' | 'disabled' | 'error' | 'timeout';
  readonly humanNotice: string;
  readonly consentScope?: ConsentScope;
  readonly errorDetails?: string;
}): LiveSignal<T> {
  const asOf = params.asOf || new Date().toISOString();
  const statusMap: Record<typeof params.reason, LiveSignalStatus> = {
    missing_provider: 'unavailable',
    disabled: 'unavailable',
    permission_denied: 'permission_needed',
    error: 'error',
    timeout: 'unavailable',
  };

  return createLiveSignal<T>({
    kind: params.kind,
    value: null as unknown as T,
    provider: params.provider,
    asOf,
    validFor: 60000, // 1 minute default validity for empty status
    confidence: 0,
    provenance: 'live',
    consentScope: params.consentScope || 'device_only',
    status: statusMap[params.reason],
    notice: {
      code: params.reason,
      message: params.errorDetails || params.humanNotice,
      humanNotice: params.humanNotice,
      provider: params.provider,
      fetchedAt: asOf,
    },
    error: {
      code: params.reason,
      message: params.errorDetails || params.humanNotice,
      fetchedAt: asOf,
    },
  });
}
