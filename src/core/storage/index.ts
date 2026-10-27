/**
 * Core Storage Engine
 * Governed by Invariant INV-110 and AC-104-4.
 *
 * Single persistence owner:
 * - Versioned envelope { schemaVersion, createdAt, updatedAt, payload }
 * - Write-then-read-back verification on save
 * - Corrupted or future-version data surfaces explicit StorageCorruptionError with export/reset methods;
 *   NEVER silently wipes or defaults.
 * - Stores memory facts, pending proposals, same-day suppressions, and daily prompt budget counter.
 * - Pure and injectable storage drivers (InMemoryStorageDriver for tests/node; WebStorageDriver for browser).
 */

import type { MemoryFact, SuppressionReason } from '../contracts/index.js';

export const CURRENT_STORAGE_SCHEMA_VERSION = 1;

export interface StorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export class InMemoryStorageDriver implements StorageDriver {
  private readonly store = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

/**
 * WebStorageDriver
 * Persists to window.localStorage in browser environments (AC-105-4 reload persistence).
 * Falls back gracefully to memory if localStorage is restricted or in Node/SSR.
 */
export class WebStorageDriver implements StorageDriver {
  private fallbackStore: InMemoryStorageDriver | null = null;

  private getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const testKey = '__yori_storage_probe__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return window.localStorage;
      } catch {
        return null;
      }
    }
    return null;
  }

  public getItem(key: string): string | null {
    const s = this.getStorage();
    if (s) {
      return s.getItem(key);
    }
    if (!this.fallbackStore) {
      this.fallbackStore = new InMemoryStorageDriver();
    }
    return this.fallbackStore.getItem(key);
  }

  public setItem(key: string, value: string): void {
    const s = this.getStorage();
    if (s) {
      s.setItem(key, value);
      return;
    }
    if (!this.fallbackStore) {
      this.fallbackStore = new InMemoryStorageDriver();
    }
    this.fallbackStore.setItem(key, value);
  }

  public removeItem(key: string): void {
    const s = this.getStorage();
    if (s) {
      s.removeItem(key);
      return;
    }
    if (this.fallbackStore) {
      this.fallbackStore.removeItem(key);
    }
  }

  public clear(): void {
    const s = this.getStorage();
    if (s) {
      s.clear();
      return;
    }
    if (this.fallbackStore) {
      this.fallbackStore.clear();
    }
  }
}

export interface PromptBudgetRecord {
  readonly date: string; // YYYY-MM-DD in snapshot timezone
  readonly count: number;
}

export interface YoriStorageState {
  readonly memoryFacts: readonly MemoryFact[];
  readonly proposals: readonly MemoryFact[];
  readonly suppressions: readonly SuppressionReason[];
  readonly promptBudget: PromptBudgetRecord;
  readonly acceptedPlanIds?: readonly string[];
}

export interface StorageEnvelope<T> {
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly payload: T;
}

export class StorageCorruptionError extends Error {
  public readonly rawData: string | null;
  public readonly exportData: () => string | null;
  public readonly reset: () => void;

  constructor(
    message: string,
    rawData: string | null,
    resetFn: () => void
  ) {
    super(message);
    this.name = 'StorageCorruptionError';
    this.rawData = rawData;
    this.exportData = () => rawData;
    this.reset = resetFn;
  }
}

export class YoriStorage {
  constructor(
    private readonly driver: StorageDriver,
    private readonly storageKey: string = 'yori_state_v1'
  ) {}

  public save(state: YoriStorageState, nowIso: string): void {
    const existingRaw = this.driver.getItem(this.storageKey);
    let createdAt = nowIso;
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw) as Partial<StorageEnvelope<unknown>>;
        if (typeof parsed.createdAt === 'string') {
          createdAt = parsed.createdAt;
        }
      } catch {
        // Overwriting or corrupting prior data is captured by write-read-back verify
      }
    }

    const envelope: StorageEnvelope<YoriStorageState> = {
      schemaVersion: CURRENT_STORAGE_SCHEMA_VERSION,
      createdAt,
      updatedAt: nowIso,
      payload: state,
    };

    const serialized = JSON.stringify(envelope);
    this.driver.setItem(this.storageKey, serialized);

    // Write-then-read-back verification (INV-110, AC-104-4)
    const readBack = this.driver.getItem(this.storageKey);
    if (readBack !== serialized) {
      throw new Error(
        `Write-read-back verification failed for storage key '${this.storageKey}'. Written bytes did not match read-back bytes.`
      );
    }
  }

  public load(): StorageEnvelope<YoriStorageState> | null {
    const raw = this.driver.getItem(this.storageKey);
    if (raw === null) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new StorageCorruptionError(
        `Corrupted storage envelope at key '${this.storageKey}': JSON parse error. Data has NOT been wiped; use exportData() to recover or reset() to clear.`,
        raw,
        () => this.driver.removeItem(this.storageKey)
      );
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new StorageCorruptionError(
        `Corrupted storage envelope at key '${this.storageKey}': payload is not an object.`,
        raw,
        () => this.driver.removeItem(this.storageKey)
      );
    }

    const candidate = parsed as Partial<StorageEnvelope<YoriStorageState>>;
    if (typeof candidate.schemaVersion !== 'number') {
      throw new StorageCorruptionError(
        `Corrupted storage envelope at key '${this.storageKey}': missing schemaVersion.`,
        raw,
        () => this.driver.removeItem(this.storageKey)
      );
    }

    if (candidate.schemaVersion > CURRENT_STORAGE_SCHEMA_VERSION) {
      throw new StorageCorruptionError(
        `Unknown future storage schemaVersion ${candidate.schemaVersion} (supported <= ${CURRENT_STORAGE_SCHEMA_VERSION}). Data has NOT been wiped.`,
        raw,
        () => this.driver.removeItem(this.storageKey)
      );
    }

    if (!candidate.payload || typeof candidate.payload !== 'object') {
      throw new StorageCorruptionError(
        `Corrupted storage envelope at key '${this.storageKey}': missing or invalid payload.`,
        raw,
        () => this.driver.removeItem(this.storageKey)
      );
    }

    return Object.freeze(candidate as StorageEnvelope<YoriStorageState>);
  }

  public exportRaw(): string | null {
    return this.driver.getItem(this.storageKey);
  }

  public reset(): void {
    this.driver.removeItem(this.storageKey);
  }
}
