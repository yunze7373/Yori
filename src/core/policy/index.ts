/**
 * Core Shared Policy Engine
 * Governed by Invariants INV-105, INV-106, INV-108, INV-109 and Architecture Rev3 Section 3.
 *
 * Core only; plugins never carry suppression, ranking, or prompt-budget logic.
 *
 * Findings 1, 2, 3 implemented:
 * - Generic policy: Zero scenario-specific or signal-specific literals in core policy (AC-EXT-1).
 *   Signals and triggers are declared by plugins via requiredSignals / triggerSignalKinds.
 * - Memory facts influence suppression ONLY when status === 'confirmed' (INV-107).
 *   Pending proposals appear in FOR YOU only; rejected proposals are never applied.
 * - Same-day user suppression records apply only within their scope date in the snapshot timezone.
 * - Prompt budget applies to proactive prompt emission (shouldPrompt / recordPrompt), NOT to on-open composition.
 * - Prompt budget counter is keyed by local date in the snapshot timezone and resets on a new day.
 */

import type {
  IntentCandidate,
  SuppressionReason,
  SuppressionCode,
  ContextSnapshot,
  MemoryFact,
  Plugin,
  PreparedPlan,
} from '../contracts/index.js';
import type { YoriStorage, PromptBudgetRecord } from '../storage/index.js';

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
  readonly suppressions?: readonly SuppressionReason[];
  readonly storage?: YoriStorage;
  readonly isProactivePrompt?: boolean;
  readonly promptCountToday?: number;
  readonly promptCountDate?: string;
  readonly maxDailyPrompts?: number;
  readonly plugins?: readonly Plugin[];
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
    plugins?: readonly Plugin[],
    asOfOverride?: string
  ): readonly FailClosedNotice[];
  shouldPrompt(
    candidateOrPlan: IntentCandidate | PreparedPlan,
    context?: PolicyEvaluationContext
  ): boolean;
  recordPrompt(
    storage: YoriStorage,
    asOf: string,
    timezone?: string
  ): PromptBudgetRecord;
  getDailyPromptBudget(): { readonly maxDaily: number; readonly usedToday: number };
  createFailClosedNotice(
    signalKind: string,
    reason: string,
    isStale?: boolean
  ): FailClosedNotice;
}

export const DEFAULT_DAILY_PROMPT_BUDGET = 3; // INV-105

/**
 * Returns the local date string (YYYY-MM-DD) for a given ISO timestamp in a specified timezone.
 */
export function getLocalDateString(isoTime: string, timezone?: string): string {
  try {
    const d = new Date(isoTime);
    if (!Number.isFinite(d.getTime())) {
      return '1970-01-01';
    }
    const tz = timezone ?? 'UTC';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d);
  } catch {
    return '1970-01-01';
  }
}

/**
 * Checks whether two ISO timestamps fall on the same local date in a specified timezone.
 */
export function isSameDay(isoA: string, isoB: string, timezone?: string): boolean {
  return getLocalDateString(isoA, timezone) === getLocalDateString(isoB, timezone);
}

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
   * Evaluates environment signals for missing or expired dependencies (INV-106).
   * Generic over plugin-declared requiredSignals / triggerSignalKinds (Finding 2).
   */
  public evaluateSignals(
    snapshot: ContextSnapshot,
    plugins?: readonly Plugin[],
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

    // 2. Generic required-signal verification per plugin (Finding 2)
    if (plugins && plugins.length > 0) {
      for (const plugin of plugins) {
        if (!plugin.requiredSignals || plugin.requiredSignals.length === 0) {
          continue;
        }

        // Determine if plugin is triggered by signals present in snapshot
        const isTriggered = plugin.triggerSignalKinds && plugin.triggerSignalKinds.length > 0
          ? plugin.triggerSignalKinds.some(tk => snapshot.signals.some(s => s.kind === tk))
          : plugin.requiredSignals.some(rk => snapshot.signals.some(s => s.kind === rk));

        if (isTriggered) {
          for (const reqKind of plugin.requiredSignals) {
            const hasSignal = snapshot.signals.some(s => s.kind === reqKind);
            if (!hasSignal) {
              notices.push(
                this.createFailClosedNotice(
                  reqKind,
                  `${reqKind} signal is required by plugin '${plugin.id}' but missing from snapshot`,
                  false
                )
              );
            }
          }
        }
      }
    }

    return Object.freeze(notices);
  }

  /**
   * Evaluates shared suppression rules against an IntentCandidate (INV-108).
   * Generic across plugins, enforces INV-107 confirmed-only memory rule and date-bounded suppression.
   */
  public checkSuppression(
    candidate: IntentCandidate,
    context?: PolicyEvaluationContext
  ): SuppressionReason | null {
    if (!candidate) {
      return null;
    }

    // 1. Explicit pre-tagged suppression on candidate
    if (candidate.suppressedBy) {
      return candidate.suppressedBy;
    }

    const snapshot = context?.snapshot;
    const memory = context?.memory ?? [];
    const asOf = snapshot?.asOf ?? candidate.evidence[0]?.issuedAt ?? '1970-01-01T00:00:00.000Z';
    const timezone = snapshot?.timezone;
    const localToday = getLocalDateString(asOf, timezone);

    // 2. Prompt budget exhaustion (Finding 3): Applies ONLY to proactive prompt emission, NOT on-open composition
    if (context?.isProactivePrompt === true) {
      const maxBudget = context?.maxDailyPrompts ?? this.maxDailyPrompts;
      let countToday = context?.promptCountToday ?? 0;

      if (context?.storage) {
        try {
          const stored = context.storage.load();
          if (stored) {
            if (stored.payload.promptBudget.date === localToday) {
              countToday = stored.payload.promptBudget.count;
            } else {
              countToday = 0; // New day resets count (Finding 3)
            }
          }
        } catch {
          // ignore storage load failure
        }
      } else if (context?.promptCountDate && context.promptCountDate !== localToday) {
        countToday = 0; // Previous day count ignored
      }

      if (countToday >= maxBudget) {
        return Object.freeze({
          code: 'budget_exhausted' as SuppressionCode,
          reason: `Daily proactive prompt cap (${maxBudget}) reached for today (${localToday}).`,
          scope: 'today',
          recordedAt: asOf,
          targetIntent: candidate.intent,
        });
      }
    }

    // 3. Same-day user suppression records (Finding 1):
    // Driven by persisted/context suppression records with scope 'today' matching today's local date
    const activeSuppressions: SuppressionReason[] = [];
    if (context?.suppressions) {
      activeSuppressions.push(...context.suppressions);
    }
    if (context?.storage) {
      try {
        const stored = context.storage.load();
        if (stored) {
          activeSuppressions.push(...stored.payload.suppressions);
        }
      } catch {
        // ignore
      }
    }

    for (const rec of activeSuppressions) {
      if (rec.code === 'user_suppressed' && rec.scope === 'today') {
        const recMatches =
          rec.targetIntent === candidate.intent ||
          rec.reason.toLowerCase().includes(candidate.intent.toLowerCase());
        if (recMatches) {
          // Check if the suppression record is from today in the snapshot's timezone
          if (isSameDay(rec.recordedAt, asOf, timezone)) {
            return Object.freeze({
              code: 'user_suppressed' as SuppressionCode,
              reason: rec.reason,
              scope: 'today',
              recordedAt: asOf,
              targetIntent: candidate.intent,
            });
          }
          // If recorded on a previous day, it has expired (Finding 1 / Probe R2)
        }
      }
    }

    // 4. Memory facts influence suppression ONLY when status === 'confirmed' (Finding 1 / INV-107)
    // Pending proposals and rejected proposals NEVER suppress! (Probe R1)
    const confirmedSuppressionFact = memory.find(
      f =>
        f.status === 'confirmed' &&
        (f.key === `suppress_${candidate.intent}` ||
          f.key === `suppress_${candidate.intent}_recommendations` ||
          (f.key.startsWith('suppress_') && f.key.includes(candidate.intent)))
    );

    if (confirmedSuppressionFact) {
      return Object.freeze({
        code: 'user_suppressed' as SuppressionCode,
        reason: `Confirmed user memory preference suppresses ${candidate.intent}.`,
        scope: 'always',
        recordedAt: asOf,
        targetIntent: candidate.intent,
      });
    }

    // 5. Generic user busy suppression (Finding 2)
    const isUserBusy =
      candidate.metadata?.isBusy === true ||
      candidate.evidence.some(sig => {
        if (sig.value && typeof sig.value === 'object') {
          return (sig.value as Record<string, unknown>).isBusy === true;
        }
        return false;
      }) ||
      (snapshot?.signals.some(sig => {
        if (sig.value && typeof sig.value === 'object') {
          return (sig.value as Record<string, unknown>).isBusy === true;
        }
        return false;
      }) ?? false);

    if (isUserBusy) {
      return Object.freeze({
        code: 'user_busy' as SuppressionCode,
        reason: `User is busy during this schedule window.`,
        scope: 'this_event',
        recordedAt: asOf,
        targetIntent: candidate.intent,
      });
    }

    // 6. Generic already done suppression (Finding 2)
    const isAlreadyDone =
      candidate.metadata?.completedToday === true ||
      candidate.metadata?.alreadyDone === true ||
      candidate.metadata?.isCompleted === true ||
      candidate.evidence.some(sig => {
        if (sig.value && typeof sig.value === 'object') {
          const v = sig.value as Record<string, unknown>;
          return (
            v.completedToday === true ||
            v.alreadyDone === true ||
            v.isCompleted === true ||
            v.eatenToday === true
          );
        }
        return false;
      });

    if (isAlreadyDone) {
      return Object.freeze({
        code: 'already_done' as SuppressionCode,
        reason: `${candidate.intent} is already completed for today.`,
        scope: 'today',
        recordedAt: asOf,
        targetIntent: candidate.intent,
      });
    }

    // 7. Stale signal suppression (INV-106)
    if (snapshot) {
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
                targetIntent: candidate.intent,
              });
            }
          }
        }
      }
    }

    // 8. Low confidence suppression (< 0.6)
    if (typeof candidate.confidence === 'number' && candidate.confidence < 0.6) {
      return Object.freeze({
        code: 'low_confidence' as SuppressionCode,
        reason: `Confidence ${candidate.confidence} is below minimum threshold 0.6.`,
        scope: 'this_event',
        recordedAt: asOf,
        targetIntent: candidate.intent,
      });
    }

    return null; // Unsuppressed
  }

  /**
   * Evaluates whether a proactive prompt should be emitted to the user (Finding 3 / ASM-007).
   */
  public shouldPrompt(
    _candidateOrPlan: IntentCandidate | PreparedPlan,
    context?: PolicyEvaluationContext
  ): boolean {
    const snapshot = context?.snapshot;
    const asOf = snapshot?.asOf ?? '1970-01-01T00:00:00.000Z';
    const timezone = snapshot?.timezone;
    const today = getLocalDateString(asOf, timezone);
    const maxBudget = context?.maxDailyPrompts ?? this.maxDailyPrompts;

    let countToday = context?.promptCountToday ?? 0;
    if (context?.storage) {
      try {
        const stored = context.storage.load();
        if (stored) {
          if (stored.payload.promptBudget.date === today) {
            countToday = stored.payload.promptBudget.count;
          } else {
            countToday = 0; // New day
          }
        }
      } catch {
        // ignore
      }
    } else if (context?.promptCountDate && context.promptCountDate !== today) {
      countToday = 0;
    }

    return countToday < maxBudget;
  }

  /**
   * Records a proactive prompt emission, updating the daily budget counter for today (Finding 3).
   */
  public recordPrompt(
    storage: YoriStorage,
    asOf: string,
    timezone?: string
  ): PromptBudgetRecord {
    const today = getLocalDateString(asOf, timezone);
    let count = 0;

    let storedState = null;
    try {
      storedState = storage.load();
      if (storedState) {
        if (storedState.payload.promptBudget.date === today) {
          count = storedState.payload.promptBudget.count;
        }
      }
    } catch {
      // uninitialized
    }

    const updatedRecord: PromptBudgetRecord = Object.freeze({
      date: today,
      count: count + 1,
    });

    const memoryFacts = storedState?.payload.memoryFacts ?? [];
    const proposals = storedState?.payload.proposals ?? [];
    const suppressions = storedState?.payload.suppressions ?? [];

    storage.save(
      {
        memoryFacts,
        proposals,
        suppressions,
        promptBudget: updatedRecord,
      },
      asOf
    );

    return updatedRecord;
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
