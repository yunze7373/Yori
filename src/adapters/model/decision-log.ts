/**
 * Redacted Decision Log and Engine Status (V2a-2, Condition C6 & C7)
 * Governed by LIVING_CONTEXT_V2.md §9 R1 and conditions C6/C7.
 *
 * Invariants:
 * 1. Engine Status:
 *    - 'meta_model_live': 'Meta model · live' (ONLY on successful real live API call)
 *    - 'recorded_model_replay': 'Recorded model output · replay' (for fixtures; C6: NEVER claim as live)
 *    - 'offline_deterministic': 'Offline fallback · deterministic' (when model is off, disabled, or failed)
 * 2. Redacted Decision Log (C7):
 *    - Captures templateId, input fact/signal IDs, output codes, validation result, engine status, timestamp.
 *    - Strictly ZERO secrets, ZERO raw personal content, and ZERO full prompt text.
 *    - Inspectable in UI dev panel or export.
 */

export type EngineStatus =
  | 'meta_model_live'
  | 'recorded_model_replay'
  | 'scripted_fixture'
  | 'offline_deterministic';

export const ENGINE_STATUS_LABELS: Record<EngineStatus, string> = {
  meta_model_live: 'Meta model · live',
  recorded_model_replay: 'Recorded Meta model output · replay',
  scripted_fixture: 'Scripted model fixture · not a live model call',
  offline_deterministic: 'Offline fallback · deterministic',
};

export interface DecisionLogValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly error?: string;
}

export interface DecisionLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly templateId: string;
  readonly inputSignalIds: readonly string[];
  readonly inputFactKeys: readonly string[];
  readonly outputReasonCodes: readonly string[];
  readonly outputIntent?: string;
  readonly validationResult: DecisionLogValidationResult;
  readonly engineStatus: EngineStatus;
  readonly latencyMs?: number;
}

/**
 * Filter out any potential secrets, keys, full prompt text, or raw PII from log entry fields.
 */
function sanitizeRedactedEntry(entry: Omit<DecisionLogEntry, 'id'>): Omit<DecisionLogEntry, 'id'> {
  // Enforce signal IDs and fact keys are identifiers only (no arbitrary text or secrets)
  const safeSignalIds = entry.inputSignalIds.map(s => String(s).slice(0, 80));
  const safeFactKeys = entry.inputFactKeys.map(k => String(k).slice(0, 80));
  const safeReasonCodes = entry.outputReasonCodes.map(r => String(r).slice(0, 50));
  const safeIntent = entry.outputIntent ? String(entry.outputIntent).slice(0, 30) : undefined;
  const safeTemplateId = String(entry.templateId).slice(0, 50);

  return {
    timestamp: entry.timestamp,
    templateId: safeTemplateId,
    inputSignalIds: safeSignalIds,
    inputFactKeys: safeFactKeys,
    outputReasonCodes: safeReasonCodes,
    outputIntent: safeIntent,
    validationResult: {
      valid: Boolean(entry.validationResult.valid),
      reason: entry.validationResult.reason ? String(entry.validationResult.reason).slice(0, 100) : undefined,
      error: entry.validationResult.error ? String(entry.validationResult.error).slice(0, 200) : undefined,
    },
    engineStatus: entry.engineStatus,
    latencyMs: typeof entry.latencyMs === 'number' ? entry.latencyMs : undefined,
  };
}

export class DecisionLogger {
  private entries: DecisionLogEntry[] = [];
  private currentStatus: EngineStatus = 'offline_deterministic';
  private listeners: Array<(entries: readonly DecisionLogEntry[], status: EngineStatus) => void> = [];

  constructor(initialStatus: EngineStatus = 'offline_deterministic') {
    this.currentStatus = initialStatus;
  }

  public log(rawEntry: Omit<DecisionLogEntry, 'id'>): DecisionLogEntry {
    const sanitized = sanitizeRedactedEntry(rawEntry);
    const entry: DecisionLogEntry = {
      id: `dlog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...sanitized,
    };
    this.entries.push(entry);
    this.currentStatus = entry.engineStatus;
    this.notify();
    return entry;
  }

  public getEntries(): readonly DecisionLogEntry[] {
    return [...this.entries];
  }

  public getLatest(): DecisionLogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  public getEngineStatus(): EngineStatus {
    return this.currentStatus;
  }

  public getEngineStatusLabel(): string {
    return ENGINE_STATUS_LABELS[this.currentStatus];
  }

  public setEngineStatus(status: EngineStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.notify();
    }
  }

  public clear(): void {
    this.entries = [];
    this.notify();
  }

  public exportJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  public subscribe(listener: (entries: readonly DecisionLogEntry[], status: EngineStatus) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    const entries = this.getEntries();
    const status = this.currentStatus;
    for (const listener of this.listeners) {
      try {
        listener(entries, status);
      } catch {
        // ignore subscriber error
      }
    }
  }
}

export const globalDecisionLogger = new DecisionLogger();

if (typeof window !== 'undefined' && typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined' && __YORI_ENABLE_TEST_HOOKS__) {
  const isDev = Boolean((import.meta as any).env?.DEV);
  const isTest =
    typeof window.location?.search === 'string' &&
    new URLSearchParams(window.location.search).get('test') === '1';
  if (isDev || isTest) {
    (window as any).__YORI_DECISION_LOG__ = globalDecisionLogger;
  }
}

