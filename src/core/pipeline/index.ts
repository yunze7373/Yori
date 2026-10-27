/**
 * Core Pipeline Entry
 * Governed by Architecture Rev3 Sections 2, 3, 5 and Invariants INV-105, INV-106, INV-108, INV-109, INV-110.
 *
 * Core execution flow:
 * 1. Evaluate environmental signals for missing/stale data via shared policy (INV-106).
 * 2. Execute registered plugin detectors.
 * 3. Evaluate candidate suppression via shared policy engine (INV-108).
 * 4. Execute plugin preparers for unsuppressed candidates.
 * 5. Deterministically rank candidates via shared policy engine.
 * 6. Compose LivingContext (NOW, AHEAD, FOR YOU, map, asOf).
 *
 * Carried P3: Core pipeline files never import src/plugins/*. Plugins are passed in or injected.
 * Both synchronous execution and async execution are supported.
 */

import type {
  ContextSnapshot,
  MemoryFact,
  LivingContext,
  SuppressionReason,
  Plugin,
  PreparedPlan,
  IntentCandidate,
} from '../contracts/index.js';
import {
  sharedPolicy,
  type SharedPolicySurface,
  type FailClosedNotice,
} from '../policy/index.js';
import type { YoriStorage } from '../storage/index.js';

export interface PipelineInput {
  readonly snapshot: ContextSnapshot;
  readonly memory: readonly MemoryFact[];
  readonly clock?: { now(): string } | string;
  readonly plugins?: readonly Plugin[];
  readonly policy?: SharedPolicySurface;
  readonly storage?: YoriStorage;
  readonly promptCountToday?: number;
  readonly maxDailyPrompts?: number;
}

export interface PipelineResult {
  readonly livingContext: LivingContext;
  readonly suppressions: readonly SuppressionReason[];
  readonly notices: readonly FailClosedNotice[];
}

export type PipelineResultPromise = Promise<PipelineResult> & PipelineResult;

let defaultPluginsProvider: (() => readonly Plugin[]) | null = null;

/**
 * Injects a default plugin provider from the app or plugin assembly layer.
 * Core pipeline files NEVER import from src/plugins (INV-109).
 */
export function setDefaultPluginsProvider(provider: () => readonly Plugin[]): void {
  defaultPluginsProvider = provider;
}

/**
 * Returns currently registered default plugins or empty array if none injected.
 */
export function getDefaultPlugins(): readonly Plugin[] {
  return defaultPluginsProvider ? defaultPluginsProvider() : Object.freeze([]);
}

/**
 * Runs the central proactive agent pipeline.
 * Evaluates signals, executes detectors/preparers, enforces shared suppression policy,
 * deterministically ranks candidates, and composes LivingContext.
 */
export function runPipeline(input: PipelineInput): PipelineResultPromise {
  const plugins = input.plugins ?? getDefaultPlugins();
  const policy = input.policy ?? sharedPolicy;

  const evaluationClock =
    typeof input.clock === 'string'
      ? input.clock
      : input.clock?.now() ?? input.snapshot.asOf;

  // 1. Evaluate environmental signals for missing or expired dependencies (INV-106, D6)
  const notices: FailClosedNotice[] = [...policy.evaluateSignals(input.snapshot, evaluationClock)];
  const suppressions: SuppressionReason[] = [];

  // Determine current daily prompt count for budget enforcement (INV-105)
  let promptCountToday = input.promptCountToday;
  if (promptCountToday === undefined && input.storage) {
    try {
      const stored = input.storage.load();
      if (stored) {
        promptCountToday = stored.payload.promptBudget.count;
      }
    } catch {
      // In case of uninitialized or corrupted storage, default count is undefined
    }
  }

  const policyContext = {
    snapshot: input.snapshot,
    memory: input.memory,
    promptCountToday,
    maxDailyPrompts: input.maxDailyPrompts,
  };

  const detectedCandidates: Array<{ plugin: Plugin; candidate: IntentCandidate }> = [];

  // 2. Run detectors across all plugins
  for (const plugin of plugins) {
    const rawCandidate = plugin.detector.detect(input.snapshot, input.memory);
    if (!rawCandidate) {
      continue;
    }

    if (typeof (rawCandidate as Promise<unknown>).then === 'function') {
      throw new Error(
        `Plugin '${plugin.id}' returned a Promise from detector, but synchronous pipeline execution is in effect.`
      );
    }

    detectedCandidates.push({ plugin, candidate: rawCandidate as IntentCandidate });
  }

  // 3. Evaluate shared suppression policy (INV-108)
  const unsuppressedCandidates: Array<{ plugin: Plugin; candidate: IntentCandidate }> = [];

  for (const item of detectedCandidates) {
    const suppression = policy.checkSuppression(item.candidate, policyContext);
    if (suppression) {
      suppressions.push(suppression);
      continue; // Suppressed candidates never reach preparation (INV-108)
    }
    unsuppressedCandidates.push(item);
  }

  // 4. Prepare plans for unsuppressed candidates
  const preparedItems: Array<{ candidate: IntentCandidate; plan: PreparedPlan }> = [];

  for (const item of unsuppressedCandidates) {
    const rawPlan = item.plugin.preparer.prepare(item.candidate, input.snapshot, input.memory);
    if (!rawPlan) {
      continue;
    }

    if (typeof (rawPlan as Promise<unknown>).then === 'function') {
      throw new Error(
        `Plugin '${item.plugin.id}' returned a Promise from preparer, but synchronous pipeline execution is in effect.`
      );
    }

    preparedItems.push({ candidate: item.candidate, plan: rawPlan as PreparedPlan });
  }

  // 5. Rank unsuppressed candidates deterministically via shared policy
  const candidatesOnly = preparedItems.map(p => p.candidate);
  const rankedCandidates = policy.rankCandidates(candidatesOnly, policyContext);

  // Re-order prepared plans matching the ranked candidate order
  const rankedPlans: PreparedPlan[] = [];
  for (const rc of rankedCandidates) {
    const match = preparedItems.find(p => p.candidate === rc);
    if (match) {
      rankedPlans.push(match.plan);
    }
  }

  // 6. Compose LivingContext (Architecture Rev3 Section 5)
  // NOW: at most 1 item (single most relevant current plan)
  const now: PreparedPlan | null = rankedPlans.length > 0 ? rankedPlans[0]! : null;
  // AHEAD: at most 3 upcoming plans, ranked by shared policy
  const ahead: PreparedPlan[] = rankedPlans.slice(1, 4);
  // FOR YOU: pending memory proposals / insights awaiting user confirmation (INV-107)
  const forYou: MemoryFact[] = input.memory.filter(m => m.status === 'pending') as MemoryFact[];

  const livingContext: LivingContext = Object.freeze({
    now,
    ahead: Object.freeze(ahead),
    forYou: Object.freeze(forYou),
    map: null,
    asOf: input.snapshot.asOf,
  });

  const result: PipelineResult = Object.freeze({
    livingContext,
    suppressions: Object.freeze(suppressions),
    notices: Object.freeze(notices),
  });

  // Support both synchronous immediate consumption and asynchronous Promise await (Carried P3)
  const promise = Promise.resolve(result);
  return Object.assign(promise, result);
}
