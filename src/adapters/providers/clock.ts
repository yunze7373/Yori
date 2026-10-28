/**
 * Clock Provider Seam
 * Governed by G-204 and Acceptance Criteria AC-204-1.
 *
 * Provides injectable clock abstraction with:
 * 1. RealSystemClock: reads real system time via new Date().toISOString()
 * 2. FixedClock / MockClock: returns deterministic anchored timestamps for replay & test invariance
 */

export interface Clock {
  /**
   * Returns current time as an ISO 8601 string.
   */
  now(): string;
}

/**
 * Real system clock provider reading the system clock.
 */
export class RealSystemClock implements Clock {
  public readonly kind = 'real-system-clock';
  public readonly source = 'real' as const;

  public now(): string {
    return new Date().toISOString();
  }
}

/**
 * Deterministic fixed clock for tests and replayable demo timelines.
 */
export class FixedClock implements Clock {
  public readonly kind = 'fixed-clock';
  public readonly source = 'simulated' as const;

  constructor(private readonly isoTimestamp: string) {
    if (!Number.isFinite(Date.parse(isoTimestamp))) {
      throw new Error(`Invalid ISO timestamp provided to FixedClock: '${isoTimestamp}'`);
    }
  }

  public now(): string {
    return this.isoTimestamp;
  }
}
