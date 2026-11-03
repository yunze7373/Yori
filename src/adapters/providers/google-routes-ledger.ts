/**
 * Google Routes billed-call ledger (DEMO_RESCUE D6): per-day counts by travel mode with a hard
 * stop that refuses BEFORE the call. Persisted to gitignored .yori-runtime/google-routes-ledger.json
 * so restarts cannot reset it. Counts only; never stores keys, coordinates or route data.
 */

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_GOOGLE_ROUTES_DAILY_CAP = 60;

export interface GoogleRoutesLedger {
  /** Reserves one billed call; false = refuse (cap reached or the ledger cannot be written). */
  tryReserve(mode: string): boolean;
}

interface LedgerState {
  date: string;
  total: number;
  byMode: Record<string, number>;
  lifetimeTotal: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class FileGoogleRoutesLedger implements GoogleRoutesLedger {
  private readonly filePath: string;
  private readonly dailyCap: number;

  constructor(options: { filePath?: string; dailyCap?: number } = {}) {
    this.filePath = options.filePath ?? path.resolve(process.cwd(), '.yori-runtime', 'google-routes-ledger.json');
    // The cap is lowering-only: a larger value never raises the code limit.
    this.dailyCap = Math.min(options.dailyCap ?? DEFAULT_GOOGLE_ROUTES_DAILY_CAP, DEFAULT_GOOGLE_ROUTES_DAILY_CAP);
  }

  public read(): LedgerState {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<LedgerState>;
      const state: LedgerState = {
        date: typeof raw.date === 'string' ? raw.date : today(),
        total: typeof raw.total === 'number' ? raw.total : 0,
        byMode: raw.byMode && typeof raw.byMode === 'object' ? (raw.byMode as Record<string, number>) : {},
        lifetimeTotal: typeof raw.lifetimeTotal === 'number' ? raw.lifetimeTotal : 0,
      };
      return state.date === today() ? state : { date: today(), total: 0, byMode: {}, lifetimeTotal: state.lifetimeTotal };
    } catch {
      return { date: today(), total: 0, byMode: {}, lifetimeTotal: 0 };
    }
  }

  public tryReserve(mode: string): boolean {
    const state = this.read();
    if (state.total >= this.dailyCap) return false;
    state.total += 1;
    state.lifetimeTotal += 1;
    state.byMode[mode] = (state.byMode[mode] ?? 0) + 1;
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
export class MemoryGoogleRoutesLedger implements GoogleRoutesLedger {
  public total = 0;
  public readonly byMode: Record<string, number> = {};
  constructor(private readonly dailyCap: number = DEFAULT_GOOGLE_ROUTES_DAILY_CAP) {}
  public tryReserve(mode: string): boolean {
    if (this.total >= this.dailyCap) return false;
    this.total += 1;
    this.byMode[mode] = (this.byMode[mode] ?? 0) + 1;
    return true;
  }
}
