/**
 * Core Shared Policy Engine
 * Governed by Invariants INV-105, INV-106, INV-108, INV-109 and Architecture Rev3 Section 3.
 *
 * Core only; plugins never carry suppression, ranking, or prompt-budget logic.
 *
 * Capabilities:
 * - Reason-coded suppression (already_done, user_busy, user_suppressed, budget_exhausted, low_confidence, stale_signal)
 * - Daily proactive prompt budget (default cap 3/day per snapshot local date)
 * - Fail-closed notice generation for missing or stale signals (D6)
 * - Deterministic ranking (confidence x evidence recency x preference fit)
 */

import type {
  IntentCandidate,
  SuppressionReason,
  SuppressionCode,
  ContextSnapshot,
  MemoryFact,
} from '../contracts/index.js';

export interface FailClosedNotice {
  readonly kind: 'fail_closed_notice';
  readonly type: 'fail_closed_notice';
  readonly reason: string;
  readonly missingOrStaleSignalKind: string;
  readonly isStale: boolean;
  readonly noticeText: string;
}

export interface PolicyEvaluationContext {
  readonly snapshot: ContextSnapshot;
  readonly memory: readonly MemoryFact[];
  readonly promptCountToday?: number;
  readonly maxDailyPrompts?: number;
}

export interface SharedPolicySurface {
  rankCandidates(
    candidates: readonly IntentCandidate[],
    context?: PolicyEvaluationContext
  ): readonly IntentCandidate[];
  checkSuppression(
    candidate: IntentCandidate,
    context?: PolicyEvaluationContext
  ): SuppressionReason | null;
  evaluateSignals(
    snapshot: ContextSnapshot,
    asOfOverride?: string
  ): readonly FailClosedNotice[];
  getDailyPromptBudget(): { readonly maxDaily: number; readonly usedToday: number };
  createFailClosedNotice(
    signalKind: string,
    reason: string,
    isStale?: boolean
  ): FailClosedNotice;
}

export const DEFAULT_DAILY_PROMPT_BUDGET = 3; // INV-105

export class SharedPolicyEngine implements SharedPolicySurface {
  constructor(private readonly maxDailyPrompts: number = DEFAULT_DAILY_PROMPT_BUDGET) {}

  public getDailyPromptBudget(): { readonly maxDaily: number; readonly usedToday: number } {
    return { maxDaily: this.maxDailyPrompts, usedToday: 0 };
  }

  public createFailClosedNotice(
    signalKind: string,
    reason: string,
    isStale = true
  ): FailClosedNotice {
    return Object.freeze({
      kind: 'fail_closed_notice' as const,
      type: 'fail_closed_notice' as const,
      reason,
      missingOrStaleSignalKind: signalKind,
      isStale,
      noticeText: `Degraded fail-closed: ${signalKind} data is ${isStale ? 'stale' : 'missing'} (${reason}).`,
    });
  }

  /**
   * Evaluates environment signals for missing or expired dependencies.
   * Produces visible FailClosedNotice entries (INV-106).
   */
  public evaluateSignals(
    snapshot: ContextSnapshot,
    asOfOverride?: string
  ): readonly FailClosedNotice[] {
    const notices: FailClosedNotice[] = [];
    if (!snapshot || !Array.isArray(snapshot.signals)) {
      return Object.freeze(notices);
    }

    const snapshotAsOfMs = asOfOverride ? Date.parse(asOfOverride) : Date.parse(snapshot.asOf);

    // 1. Check for expired signals in snapshot
    for (const signal of snapshot.signals) {
      if (typeof signal.validFor === 'number' && typeof signal.issuedAt === 'string') {
        const issuedAtMs = Date.parse(signal.issuedAt);
        if (Number.isFinite(issuedAtMs) && Number.isFinite(snapshotAsOfMs)) {
          if (snapshotAsOfMs - issuedAtMs > signal.validFor) {
            notices.push(
              this.createFailClosedNotice(
                signal.kind,
                `Signal expired (${Math.round((snapshotAsOfMs - issuedAtMs) / 60000)}m > ${Math.round(signal.validFor / 60000)}m validity)`,
                true
              )
            );
          }
        }
      }
    }

    // 2. Check for missing environmental signals required by planned scenarios (e.g. weather for depart)
    const hasCalendar = snapshot.signals.some(s => s.kind === 'calendar');
    const hasWeather = snapshot.signals.some(s => s.kind === 'weather');

    if (hasCalendar && !hasWeather) {
      notices.push(
        this.createFailClosedNotice(
          'weather',
          'Weather signal is missing from environment snapshot',
          false
        )
      );
    }

    return Object.freeze(notices);
  }

  /**
   * Evaluates shared suppression rules against an IntentCandidate (INV-108).
   * Plugins NEVER decide suppression; all suppression reasons are recorded in pipeline output.
   */
  public checkSuppression(
    candidate: IntentCandidate,
    context?: PolicyEvaluationContext
  ): SuppressionReason | null {
    if (!candidate) {
      return null;
    }

    // 1. If candidate is already tagged with explicit suppression
    if (candidate.suppressedBy) {
      return candidate.suppressedBy;
    }

    const snapshot = context?.snapshot;
    const memory = context?.memory ?? [];
    const asOf = snapshot?.asOf ?? candidate.evidence[0]?.issuedAt ?? '1970-01-01T00:00:00.000Z';

    // 2. Prompt budget exhaustion (INV-105, AC-104-2)
    const maxBudget = context?.maxDailyPrompts ?? this.maxDailyPrompts;
    if (context?.promptCountToday !== undefined && context.promptCountToday >= maxBudget) {
      return Object.freeze({
        code: 'budget_exhausted' as SuppressionCode,
        reason: `Daily proactive prompt cap (${maxBudget}) reached for today.`,
        scope: 'today',
        recordedAt: asOf,
      });
    }

    // 3. User explicit suppression / decline ('today' scope per D5, INV-108)
    const suppressionFact = memory.find(
      f =>
        f.key === `suppress_${candidate.intent}_recommendations` ||
        f.key === `suppress_${candidate.intent}` ||
        (f.key === 'suppress_lunch_recommendations' && candidate.intent === 'lunch')
    );
    if (suppressionFact) {
      return Object.freeze({
        code: 'user_suppressed' as SuppressionCode,
        reason: `User explicitly suppressed ${candidate.intent} recommendations for today.`,
        scope: 'today',
        recordedAt: asOf,
      });
    }

    // 4. User busy suppression (D4 Variant A)
    if (snapshot) {
      const scheduleSignal = snapshot.signals.find(s => s.kind === 'schedule_window');
      if (scheduleSignal && scheduleSignal.value && typeof scheduleSignal.value === 'object') {
        const val = scheduleSignal.value as Record<string, unknown>;
        if (val.isBusy === true) {
          return Object.freeze({
            code: 'user_busy' as SuppressionCode,
            reason: `User is busy during this window (${String(val.currentEvent ?? 'schedule conflict')}).`,
            scope: 'this_event',
            recordedAt: asOf,
          });
        }
      }

      // 5. Already done suppression (D4 Variant B)
      if (candidate.intent === 'lunch') {
        const eatingSignal = snapshot.signals.find(s => s.kind === 'eating_status');
        if (eatingSignal && eatingSignal.value && typeof eatingSignal.value === 'object') {
          const val = eatingSignal.value as Record<string, unknown>;
          if (val.eatenToday === true) {
            return Object.freeze({
              code: 'already_done' as SuppressionCode,
              reason: `User has already eaten today (${String(val.lunchFinishedAt ?? 'earlier')}).`,
              scope: 'today',
              recordedAt: asOf,
            });
          }
        }
      }

      // 6. Stale signal suppression (INV-106)
      const snapshotAsOfMs = Date.parse(snapshot.asOf);
      for (const ev of candidate.evidence) {
        if (typeof ev.validFor === 'number' && typeof ev.issuedAt === 'string') {
          const issuedAtMs = Date.parse(ev.issuedAt);
          if (Number.isFinite(issuedAtMs) && Number.isFinite(snapshotAsOfMs)) {
            if (snapshotAsOfMs - issuedAtMs > ev.validFor) {
              return Object.freeze({
                code: 'stale_signal' as SuppressionCode,
                reason: `Evidence signal '${ev.kind}' is expired.`,
                scope: 'this_event',
                recordedAt: asOf,
              });
            }
          }
        }
      }
    }

    // 7. Low confidence suppression (< 0.6)
    if (typeof candidate.confidence === 'number' && candidate.confidence < 0.6) {
      return Object.freeze({
        code: 'low_confidence' as SuppressionCode,
        reason: `Confidence ${candidate.confidence} is below minimum threshold 0.6.`,
        scope: 'this_event',
        recordedAt: asOf,
      });
    }

    return null; // Unsuppressed
  }

  /**
   * Deterministically ranks unsuppressed candidates.
   * Score = confidence x preferenceMultiplier x recencyMultiplier.
   * Tie-break by intent identifier.
   */
  public rankCandidates(
    candidates: readonly IntentCandidate[],
    context?: PolicyEvaluationContext
  ): readonly IntentCandidate[] {
    if (!candidates || candidates.length === 0) {
      return Object.freeze([]);
    }

    const memory = context?.memory ?? [];
    const snapshotAsOfMs = context?.snapshot ? Date.parse(context.snapshot.asOf) : NaN;

    const scored = candidates.map(candidate => {
      let score = candidate.confidence;

      // Confirmed preference alignment bonus for candidate's intent
      const hasPreferenceMatch = memory.some(
        f =>
          f.status === 'confirmed' &&
          (f.key.toLowerCase().includes(candidate.intent.toLowerCase()) ||
            (typeof f.value === 'string' &&
              f.value.toLowerCase().includes(candidate.intent.toLowerCase())))
      );
      if (hasPreferenceMatch) {
        score *= 1.2;
      }

      // Evidence recency multiplier
      if (candidate.evidence.length > 0 && Number.isFinite(snapshotAsOfMs)) {
        const latestIssuedMs = Math.max(
          ...candidate.evidence.map(e => Date.parse(e.issuedAt)).filter(Number.isFinite)
        );
        if (Number.isFinite(latestIssuedMs)) {
          const ageHours = Math.max(0, (snapshotAsOfMs - latestIssuedMs) / 3600000);
          const recencyMultiplier = Math.max(0.5, 1.0 - ageHours * 0.05);
          score *= recencyMultiplier;
        }
      }

      return { candidate, score };
    });

    scored.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 1e-6) {
        return b.score - a.score;
      }
      return a.candidate.intent.localeCompare(b.candidate.intent);
    });

    return Object.freeze(scored.map(s => s.candidate));
  }
}

export const sharedPolicy = new SharedPolicyEngine();
export const sharedPolicyStub = sharedPolicy; // Backwards compatible alias
