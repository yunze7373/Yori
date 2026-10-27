/**
 * Depart Time Calculation Engine
 * Governed by AC-102-1, AC-102-2, AC-102-3 and Architecture Rev3 Section 4 & 7.
 *
 * Invariants & Requirements:
 * - Pure time computation: strictly injected clock and explicit IANA timezone.
 * - Zero ambient clock calls: deterministic inputs only.
 * - leave = appt - travel - buffer
 * - prepare = leave - prep
 * - DST-safe across seasonal transitions (spring forward, fall back).
 * - Flags alreadyDue when prepareAt <= now without dropping/hiding the plan.
 * - Rejects impossible calendar dates (e.g. 2026-02-31) that Date.parse rolls over.
 * - Rejects invalid numbers (NaN, Infinity, negative minutes).
 */

export interface DepartTimingInput {
  readonly apptTime: string;      // ISO string
  readonly travelMinutes: number; // finite >= 0
  readonly bufferMinutes: number; // finite >= 0
  readonly prepMinutes: number;   // finite >= 0
  readonly timeZone: string;      // explicit IANA timezone name
  readonly nowTime: string;       // ISO string from injected clock/snapshot
}

export interface DepartTimingResult {
  readonly apptMs: number;
  readonly leaveMs: number;
  readonly prepareMs: number;
  readonly nowMs: number;
  readonly leaveIso: string;
  readonly prepareIso: string;
  readonly leaveTime12: string;   // e.g. "2:25 PM"
  readonly prepareTime12: string; // e.g. "2:05 PM"
  readonly leaveTime24: string;   // e.g. "14:25"
  readonly prepareTime24: string; // e.g. "14:05"
  readonly apptTime24: string;    // e.g. "15:00"
  readonly alreadyDue: boolean;
  readonly derivation: string;
}

const ISO_CALENDAR_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/**
 * Validates that an ISO string does not represent an impossible calendar date
 * (e.g. 2026-02-31, 2026-02-29 on non-leap years, 2026-04-31).
 */
export function validateCalendarDate(isoString: string): boolean {
  if (typeof isoString !== 'string' || !isoString.trim()) {
    return false;
  }
  const match = ISO_CALENDAR_PATTERN.exec(isoString.trim());
  if (!match) {
    return false;
  }

  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const day = parseInt(match[3]!, 10);

  if (month < 1 || month > 12) {
    return false;
  }

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDay = daysInMonth[month - 1]!;

  if (day < 1 || day > maxDay) {
    return false;
  }

  if (match[4] !== undefined && match[5] !== undefined) {
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = match[6] ? parseInt(match[6], 10) : 0;
    if (hour > 23 || minute > 59 || second > 59) {
      return false;
    }
  }

  return true;
}

/**
 * Formats epoch milliseconds as 12-hour time (e.g. "2:05 PM") in the given IANA timezone.
 * Uses Intl.DateTimeFormat directly with numeric timestamp.
 */
export function formatTime12(epochMs: number, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return formatter.format(epochMs);
}

/**
 * Formats epoch milliseconds as 24-hour time (e.g. "14:05") in the given IANA timezone.
 * Uses Intl.DateTimeFormat directly with numeric timestamp.
 */
export function formatTime24(epochMs: number, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(epochMs);
}

/**
 * Deterministic departure timing computation engine.
 * Pure function: calculates leave and prepare times, DST-safe, with alreadyDue flag.
 */
export function computeDepartTiming(input: DepartTimingInput): DepartTimingResult {
  // 1. Validate calendar dates
  if (!validateCalendarDate(input.apptTime)) {
    throw new Error(`Impossible or invalid appointment calendar date: '${input.apptTime}'`);
  }
  if (!validateCalendarDate(input.nowTime)) {
    throw new Error(`Impossible or invalid nowTime calendar date: '${input.nowTime}'`);
  }

  // 2. Validate numeric durations (finite, non-negative)
  if (typeof input.travelMinutes !== 'number' || !Number.isFinite(input.travelMinutes) || input.travelMinutes < 0) {
    throw new Error(`travelMinutes must be a finite non-negative number, got ${input.travelMinutes}`);
  }
  if (typeof input.bufferMinutes !== 'number' || !Number.isFinite(input.bufferMinutes) || input.bufferMinutes < 0) {
    throw new Error(`bufferMinutes must be a finite non-negative number, got ${input.bufferMinutes}`);
  }
  if (typeof input.prepMinutes !== 'number' || !Number.isFinite(input.prepMinutes) || input.prepMinutes < 0) {
    throw new Error(`prepMinutes must be a finite non-negative number, got ${input.prepMinutes}`);
  }

  // 3. Validate IANA timezone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone });
  } catch {
    throw new Error(`Invalid IANA timeZone: '${input.timeZone}'`);
  }

  // 4. Parse timestamps to epoch milliseconds
  const apptMs = Date.parse(input.apptTime);
  const nowMs = Date.parse(input.nowTime);

  if (Number.isNaN(apptMs) || Number.isNaN(nowMs)) {
    throw new Error(`Date.parse failed for apptTime='${input.apptTime}' or nowTime='${input.nowTime}'`);
  }

  // 5. Formula: leave = appt - travel - buffer; prepare = leave - prep
  const travelMs = input.travelMinutes * 60_000;
  const bufferMs = input.bufferMinutes * 60_000;
  const prepMs = input.prepMinutes * 60_000;

  const leaveMs = apptMs - travelMs - bufferMs;
  const prepareMs = leaveMs - prepMs;

  // 6. alreadyDue: prepareAt has already passed
  const alreadyDue = prepareMs <= nowMs;

  // 7. Format times in the explicit IANA timezone
  const leaveTime12 = formatTime12(leaveMs, input.timeZone);
  const prepareTime12 = formatTime12(prepareMs, input.timeZone);
  const leaveTime24 = formatTime24(leaveMs, input.timeZone);
  const prepareTime24 = formatTime24(prepareMs, input.timeZone);
  const apptTime24 = formatTime24(apptMs, input.timeZone);

  // Derivation string for Why proof
  const derivation = `${leaveTime24} leave = ${apptTime24} appt - ${input.travelMinutes}m travel - ${input.bufferMinutes}m buffer; ${prepareTime24} prepare = ${leaveTime24} leave - ${input.prepMinutes}m prep`;

  return Object.freeze({
    apptMs,
    leaveMs,
    prepareMs,
    nowMs,
    leaveIso: new Date(leaveMs).toISOString(),
    prepareIso: new Date(prepareMs).toISOString(),
    leaveTime12,
    prepareTime12,
    leaveTime24,
    prepareTime24,
    apptTime24,
    alreadyDue,
    derivation,
  });
}
