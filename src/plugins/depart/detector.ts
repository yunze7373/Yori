/**
 * Depart Intent Detector
 * Governed by Invariant INV-108, AC-102-1, AC-102-2.
 *
 * Detects upcoming departure intent from ContextSnapshot calendar signals.
 * Fails closed on missing or invalid inputs, rejecting impossible dates.
 */

import type {
  IntentDetector,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  ContextSignal,
} from '../../core/contracts/index.js';
import { validateCalendarDate } from './engine.js';

export class DepartDetector implements IntentDetector {
  public readonly id = 'depart-detector';
  public readonly targetIntent = 'depart';

  public detect(
    snapshot: ContextSnapshot,
    _memory: readonly MemoryFact[]
  ): IntentCandidate | null {
    if (!snapshot || !Array.isArray(snapshot.signals)) {
      return null;
    }

    // 1. Locate calendar signal
    const calendarSignal = snapshot.signals.find(s => s.kind === 'calendar');
    if (!calendarSignal || !calendarSignal.value || typeof calendarSignal.value !== 'object') {
      return null;
    }

    const value = calendarSignal.value as Record<string, unknown>;
    const startTime = (value.startTime ?? value.time ?? value.apptTime) as string | undefined;

    if (!startTime || typeof startTime !== 'string') {
      return null;
    }

    // 2. Reject impossible calendar dates (e.g. 2026-02-31)
    if (!validateCalendarDate(startTime)) {
      return null;
    }

    // 3. Fail-closed check: verify signal is not expired
    if (
      typeof calendarSignal.validFor === 'number' &&
      typeof calendarSignal.issuedAt === 'string'
    ) {
      const issuedAtMs = Date.parse(calendarSignal.issuedAt);
      const snapshotAsOfMs = Date.parse(snapshot.asOf);
      if (
        Number.isFinite(issuedAtMs) &&
        Number.isFinite(snapshotAsOfMs) &&
        snapshotAsOfMs - issuedAtMs > calendarSignal.validFor
      ) {
        return null; // Calendar signal expired
      }
    }

    const title = typeof value.title === 'string' ? value.title : 'Appointment';
    const evidence: readonly ContextSignal[] = Object.freeze([calendarSignal]);

    return Object.freeze({
      intent: 'depart',
      confidence: typeof calendarSignal.confidence === 'number' ? calendarSignal.confidence : 1.0,
      evidence,
      metadata: Object.freeze({
        title,
        startTime,
        endTime: typeof value.endTime === 'string' ? value.endTime : undefined,
        location: typeof value.location === 'string' ? value.location : undefined,
      }),
    });
  }
}

export const departDetector = new DepartDetector();
