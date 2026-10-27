/**
 * Depart Intent Detector
 * Governed by Invariant INV-108, AC-102-1, AC-102-2.
 *
 * Detects upcoming departure intent from ContextSnapshot calendar signals.
 * Fails closed on missing or invalid inputs, rejecting impossible dates,
 * out-of-horizon events (past or >24h future), and missing timezones.
 */

import type {
  IntentDetector,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  ContextSignal,
} from '../../core/contracts/index.js';
import { validateCalendarDate } from './engine.js';

/**
 * Depart planning horizon constants.
 * Upcoming events within 24 hours are planned. Past events beyond the 15-minute grace window are ignored.
 */
export const DEPART_PLANNING_HORIZON_MS = 24 * 60 * 60 * 1000; // 24 hours
export const DEPART_PAST_GRACE_WINDOW_MS = 15 * 60 * 1000;     // 15 minutes

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

    // 2. Reject impossible calendar dates (e.g. 2026-02-31) or offset-less date strings
    if (!validateCalendarDate(startTime)) {
      return null;
    }

    // 3. Fail-closed check: verify signal is not expired
    const snapshotAsOfMs = Date.parse(snapshot.asOf);
    if (!Number.isFinite(snapshotAsOfMs)) {
      return null;
    }

    if (
      typeof calendarSignal.validFor === 'number' &&
      typeof calendarSignal.issuedAt === 'string'
    ) {
      const issuedAtMs = Date.parse(calendarSignal.issuedAt);
      if (
        Number.isFinite(issuedAtMs) &&
        snapshotAsOfMs - issuedAtMs > calendarSignal.validFor
      ) {
        return null; // Calendar signal expired
      }
    }

    // 4. Planning Horizon Check (Finding 5):
    // Reject appointments that are in the past (> 15m ago) or beyond the 24h planning horizon
    const apptMs = Date.parse(startTime);
    if (!Number.isFinite(apptMs)) {
      return null;
    }

    const timeUntilApptMs = apptMs - snapshotAsOfMs;
    if (timeUntilApptMs < -DEPART_PAST_GRACE_WINDOW_MS) {
      return null; // Past event
    }
    if (timeUntilApptMs > DEPART_PLANNING_HORIZON_MS) {
      return null; // Beyond 24-hour planning horizon
    }

    // 5. Timezone Extraction (Finding 1):
    // Read IANA timezone from calendar signal, snapshot, or timezone signal.
    // If no timezone is available, fail closed (no plan). Never default to LA!
    const timezoneSignal = snapshot.signals.find(s => s.kind === 'timezone');
    const timezone =
      (typeof value.timezone === 'string' && value.timezone.trim()) ||
      (typeof value.timeZone === 'string' && value.timeZone.trim()) ||
      (typeof snapshot.timezone === 'string' && snapshot.timezone.trim()) ||
      (typeof timezoneSignal?.value === 'string' && (timezoneSignal.value as string).trim()) ||
      undefined;

    if (!timezone) {
      return null; // Fail closed if no timezone is available
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
        timezone,
      }),
    });
  }
}

export const departDetector = new DepartDetector();
