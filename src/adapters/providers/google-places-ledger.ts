/**
 * Google Places billed-call ledger (DEMO_RESCUE D7): per-day counts by SKU with a hard stop.
 * Persisted to gitignored .yori-runtime/google-places-ledger.json so restarts cannot reset it.
 * Counts only; never stores keys, coordinates or place data.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { GooglePlacesLedger } from './google-places-adapter.js';

export const DEFAULT_GOOGLE_PLACES_DAILY_CAP = 150;

interface LedgerState {
  date: string;
  total: number;
  bySku: Record<string, number>;
  lifetimeTotal: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class FileGooglePlacesLedger implements GooglePlacesLedger {
  private readonly filePath: string;
  private readonly dailyCap: number;

  constructor(options: { filePath?: string; dailyCap?: number } = {}) {
    this.filePath = options.filePath ?? path.resolve(process.cwd(), '.yori-runtime', 'google-places-ledger.json');
    this.dailyCap = options.dailyCap ?? DEFAULT_GOOGLE_PLACES_DAILY_CAP;
  }

  public read(): LedgerState {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<LedgerState>;
      const state: LedgerState = {
        date: typeof raw.date === 'string' ? raw.date : today(),
        total: typeof raw.total === 'number' ? raw.total : 0,
        bySku: raw.bySku && typeof raw.bySku === 'object' ? (raw.bySku as Record<string, number>) : {},
        lifetimeTotal: typeof raw.lifetimeTotal === 'number' ? raw.lifetimeTotal : 0,
      };
      return state.date === today() ? state : { date: today(), total: 0, bySku: {}, lifetimeTotal: state.lifetimeTotal };
    } catch {
      return { date: today(), total: 0, bySku: {}, lifetimeTotal: 0 };
    }
  }

  public tryReserve(sku: string): boolean {
    const state = this.read();
    if (state.total >= this.dailyCap) return false;
    state.total += 1;
    state.lifetimeTotal += 1;
    state.bySku[sku] = (state.bySku[sku] ?? 0) + 1;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
    } catch {
      // A ledger that cannot be written must not allow uncounted calls.
      return false;
    }
    return true;
  }
}

/** In-memory ledger for tests and recorded runs. */
export class MemoryGooglePlacesLedger implements GooglePlacesLedger {
  public total = 0;
  public readonly bySku: Record<string, number> = {};
  constructor(private readonly dailyCap: number = DEFAULT_GOOGLE_PLACES_DAILY_CAP) {}
  public tryReserve(sku: string): boolean {
    if (this.total >= this.dailyCap) return false;
    this.total += 1;
    this.bySku[sku] = (this.bySku[sku] ?? 0) + 1;
    return true;
  }
}
