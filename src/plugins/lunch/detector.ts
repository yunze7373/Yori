/**
 * Lunch Intent Detector
 * Governed by Invariants INV-108, INV-109, and AC-103-1.
 *
 * Detects lunch intent when away from home during a valid lunch window with an adequate free schedule window.
 *
 * Requirements (Finding 4):
 * - User must be away from home (isHome === false; if isHome === true, returns null).
 * - Snapshot local time must be within declared lunch window (11:00 - 14:30 local in snapshot's timezone).
 * - User must have a free window of at least 20 minutes (or schedule conflict / already ate, which are passed to policy).
 * - Zero suppression in plugin: user_busy and already_done are evaluated exclusively by shared core policy.
 */

import type {
  IntentDetector,
  IntentCandidate,
  ContextSnapshot,
  MemoryFact,
  ContextSignal,
} from '../../core/contracts/index.js';

export const LUNCH_WINDOW_START_HOUR = 11; // 11:00 AM
export const LUNCH_WINDOW_END_HOUR = 14;   // 14:30 (2:30 PM)
export const LUNCH_WINDOW_END_MINUTE = 30;
export const MINIMUM_LUNCH_WINDOW_MINUTES = 20;

/** D2: an explicit "Nearby now" tap or Ask request stays fresh for 30 minutes. */
export const NEARBY_REQUEST_FRESH_MS = 30 * 60 * 1000;
export const NEARBY_REQUEST_SOURCES = ['nearby_now', 'ask'] as const;

/**
 * D2 (DEMO_RESCUE): true when the snapshot carries a fresh, explicit user request for nearby
 * food (`user_request` signal, intent 'lunch', source 'nearby_now' | 'ask'). Such a request lifts
 * ONLY the meal-window check; home, schedule and all shared core policy still apply.
 */
export function hasFreshNearbyRequest(snapshot: ContextSnapshot): ContextSignal | null {
  const asOfMs = Date.parse(snapshot.asOf);
  if (!Number.isFinite(asOfMs)) return null;
  for (const sig of snapshot.signals) {
    if (sig.kind !== 'user_request' || !sig.value || typeof sig.value !== 'object') continue;
    const val = sig.value as Record<string, unknown>;
    if (val.intent !== 'lunch') continue;
    if (!(NEARBY_REQUEST_SOURCES as readonly unknown[]).includes(val.source)) continue;
    const at = Date.parse(typeof val.requestedAt === 'string' ? val.requestedAt : sig.issuedAt);
    if (!Number.isFinite(at)) continue;
    const age = asOfMs - at;
    if (age >= 0 && age <= NEARBY_REQUEST_FRESH_MS) return sig;
  }
  return null;
}

/**
 * Checks whether an ISO timestamp falls within the local lunch window (11:00 - 14:30).
 */
export function isWithinLunchWindow(isoTime: string, timezone?: string): boolean {
  try {
    const d = new Date(isoTime);
    if (!Number.isFinite(d.getTime())) {
      return false;
    }
    const tz = timezone ?? 'UTC';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    let hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    if (hour === 24) hour = 0;
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const minuteOfDay = hour * 60 + minute;
    // 11:00 is 660 minutes; 14:30 is 870 minutes
    return minuteOfDay >= 660 && minuteOfDay <= 870;
  } catch {
    return false;
  }
}

export function getTimezoneFromSnapshot(snapshot: ContextSnapshot): string {
  if (snapshot.timezone && snapshot.timezone.trim()) {
    return snapshot.timezone.trim();
  }
  const tzSig = snapshot.signals.find(s => s.kind === 'timezone');
  if (tzSig && typeof tzSig.value === 'string' && tzSig.value.trim()) {
    return tzSig.value.trim();
  }
  // Check if any signal has an explicit offset like -07:00
  for (const s of snapshot.signals) {
    if (s.value && typeof s.value === 'object') {
      const v = s.value as Record<string, unknown>;
      for (const val of Object.values(v)) {
        if (typeof val === 'string') {
          const match = val.match(/([+-]\d{2}:\d{2})$/);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
    }
  }
  return 'UTC';
}

export class LunchDetector implements IntentDetector {
  public readonly id = 'lunch-detector';
  public readonly targetIntent = 'lunch';

  public detect(
    snapshot: ContextSnapshot,
    _memory: readonly MemoryFact[]
  ): IntentCandidate | null {
    if (!snapshot || !Array.isArray(snapshot.signals) || snapshot.signals.length === 0) {
      return null;
    }

    const timezone = getTimezoneFromSnapshot(snapshot);

    // 1. Lunch window check (Finding 4): Snapshot local time must be in 11:00 - 14:30,
    //    unless the user explicitly asked for nearby food just now (D2 on-demand path).
    const nearbyRequest = hasFreshNearbyRequest(snapshot);
    if (!nearbyRequest && !isWithinLunchWindow(snapshot.asOf, timezone)) {
      return null;
    }

    const signals = snapshot.signals;

    // Locate lunch-relevant environmental signals
    const locationSignal = signals.find(s => s.kind === 'location_status' || s.kind === 'location');
    const scheduleSignal = signals.find(s => s.kind === 'schedule_window');
    const eatingSignal = signals.find(s => s.kind === 'eating_status');
    const mockPlacesSignal = signals.find(s => s.kind === 'mock_places' || s.kind === 'places_lunch');

    // 2. Location check (Finding 4): If user is explicitly at home (isHome === true), no lunch recommendation
    if (locationSignal && locationSignal.value && typeof locationSignal.value === 'object') {
      const locVal = locationSignal.value as Record<string, unknown>;
      if (locVal.isHome === true) {
        return null;
      }
    }

    // Must have at least one lunch-relevant signal
    const relevantSignals: ContextSignal[] = [];
    if (locationSignal) relevantSignals.push(locationSignal);
    if (scheduleSignal) relevantSignals.push(scheduleSignal);
    if (eatingSignal) relevantSignals.push(eatingSignal);
    if (mockPlacesSignal) relevantSignals.push(mockPlacesSignal);
    if (nearbyRequest) relevantSignals.push(nearbyRequest);

    if (relevantSignals.length === 0) {
      return null;
    }

    // 3. Free window check (Finding 4)
    let isUserBusy = false;
    if (scheduleSignal && scheduleSignal.value && typeof scheduleSignal.value === 'object') {
      const schedVal = scheduleSignal.value as Record<string, unknown>;
      if (schedVal.isBusy === true) {
        isUserBusy = true;
      } else if (typeof schedVal.freeUntil === 'string') {
        const freeUntilMs = Date.parse(schedVal.freeUntil);
        const asOfMs = Date.parse(snapshot.asOf);
        if (Number.isFinite(freeUntilMs) && Number.isFinite(asOfMs)) {
          const freeMinutes = (freeUntilMs - asOfMs) / (60 * 1000);
          if (freeMinutes < MINIMUM_LUNCH_WINDOW_MINUTES) {
            // Free window is too short for lunch (< 20 mins)
            return null;
          }
        }
      }
    }

    // 4. Eating status check (Finding 4)
    let hasEatenToday = false;
    if (eatingSignal && eatingSignal.value && typeof eatingSignal.value === 'object') {
      const eatVal = eatingSignal.value as Record<string, unknown>;
      if (eatVal.eatenToday === true) {
        hasEatenToday = true;
      }
    }

    // Base confidence: lower to 0.7 if eating status is unconfirmed/missing, 0.9 if confirmed not eaten
    let confidence = 0.9;
    if (!eatingSignal) {
      confidence = 0.75;
    }

    return Object.freeze({
      intent: 'lunch',
      confidence,
      evidence: Object.freeze(relevantSignals),
      urgency: 'medium',
      suggestedPlanningHorizonMs: 3600000,
      suppressedBy: undefined, // Zero suppression in plugins (INV-108)
      metadata: Object.freeze({
        isBusy: isUserBusy,
        completedToday: hasEatenToday,
        userRequested: Boolean(nearbyRequest),
      }),
    });
  }
}

export const lunchDetector = new LunchDetector();
