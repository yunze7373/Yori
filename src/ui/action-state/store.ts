/**
 * Action-State Store and State Machine Implementation
 * Governed by LIVING_CONTEXT_V2.md Section 2 and §8 D3/D4/D5.
 */

import type {
  ActionCommandContext,
  ActionStateRecord,
  ActionStateStore,
  ActionStateStoreOptions,
  ActionStoreSnapshot,
  ActionHistorySnapshot,
  AutoCollapseRule,
  DepartureComparisonItem,
  InteractionState,
  MessageItem,
  WorkingSubstate,
} from './types.js';
import type { PreparedPlan, IntentCandidate, ContextSnapshot } from '../../core/contracts/index.js';
import { createSimulatedSignal } from '../../core/contracts/index.js';
import type { PlaceItem } from '../../adapters/providers/places-types.js';
import { mockFuelAdapter } from '../../plugins/fuel/adapter.js';
import { mockLunchAdapter } from '../../plugins/lunch/adapter.js';
import {
  type CommandInterpreter,
  type SituationAttribution,
} from '../conversation/grammar.js';
import { defaultModelCommandInterpreter } from '../conversation/model-interpreter.js';
import {
  globalDecisionLogger,
  type EngineStatus,
} from '../../adapters/model/decision-log.js';
import { departPreparer } from '../../plugins/depart/preparer.js';
import { lunchPreparer } from '../../plugins/lunch/preparer.js';
import { fuelPreparer } from '../../plugins/fuel/index.js';
import { defaultLocationPort } from '../../adapters/providers/location-port.js';
import {
  createUserRequestOverride,
  type UserRequestOverride,
} from '../../plugins/depart/request-override.js';
import { formatTime } from '../living-context/presentation.js';
import { derivePlanTimingFacts } from '../view-models/timing.js';
import { buildHumanDerivation, humanizeMemoryKey } from '../review/why-sheet.js';
import { classifyFactSource, provenanceLabel } from '../view-models/provenance.js';
import {
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  createLunchPlacesEvidenceBundle,
  createFuelEvidenceBundle,
} from '../view-models/grounding.js';

function checkSystemReducedMotion(): boolean {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

export class DefaultActionStateStore implements ActionStateStore {
  private actionState: ActionStateRecord;
  private interactionState: InteractionState;
  private pinned = false;
  private historyStack: ActionHistorySnapshot[] = [];
  private transcriptList: MessageItem[] = [];
  private subscribers = new Set<(snapshot: ActionStoreSnapshot) => void>();
  private readonly reducedMotionOption?: boolean;
  private commandContext?: ActionCommandContext;
  private currentOverride: UserRequestOverride | null = null;
  private pendingOverride: UserRequestOverride | null = null;
  private interpreter: CommandInterpreter;
  private currentSituationAttribution?: SituationAttribution;
  private pendingFuelDisambiguation = false;
  private activeEvidenceBundle?: any = undefined;
  private activeSnapshot?: ContextSnapshot = undefined;

  constructor(options: ActionStateStoreOptions = {}) {
    this.actionState = {
      status: 'idle',
      timestamp: new Date().toISOString(),
      ...options.initialActionState,
    };
    this.interactionState = options.initialInteractionState ?? 'HOME';
    this.reducedMotionOption = options.reducedMotion;
    this.interpreter = options.interpreter ?? defaultModelCommandInterpreter;
  }

  public getActionState(): ActionStateRecord {
    return { ...this.actionState };
  }

  public getInteractionState(): InteractionState {
    return this.interactionState;
  }

  public isPinned(): boolean {
    return this.pinned;
  }

  public canUndo(): boolean {
    return this.historyStack.length > 0;
  }

  public getTranscript(): readonly MessageItem[] {
    return [...this.transcriptList];
  }

  public isReducedMotion(): boolean {
    if (typeof this.reducedMotionOption === 'boolean') {
      return this.reducedMotionOption;
    }
    return checkSystemReducedMotion();
  }

  public getCurrentOverride(): UserRequestOverride | null {
    return this.currentOverride;
  }

  public getActiveEvidenceBundle(): any {
    return this.activeEvidenceBundle;
  }

  public getActiveSnapshot(): ContextSnapshot | undefined {
    return this.activeSnapshot;
  }

  public clearOverride(): void {
    this.currentOverride = null;
    this.pendingOverride = null;
    this.currentSituationAttribution = undefined;
    this.activeEvidenceBundle = undefined;
    this.activeSnapshot = undefined;
  }

  public getEngineStatus(): EngineStatus {
    return globalDecisionLogger.getEngineStatus();
  }

  public getEngineStatusLabel(): string {
    return globalDecisionLogger.getEngineStatusLabel();
  }

  public getSituationAttribution(): SituationAttribution | undefined {
    return this.currentSituationAttribution;
  }

  public setInterpreter(interpreter: CommandInterpreter): void {
    this.interpreter = interpreter;
  }

  public setCommandContext(ctx: ActionCommandContext): void {
    // Carry-over (b): If scene changed, clear any stale pending confirmation and reset transcript
    if (
      this.commandContext &&
      ctx.sceneId &&
      this.commandContext.sceneId &&
      ctx.sceneId !== this.commandContext.sceneId
    ) {
      this.transcriptList = [];
      if (this.actionState.status === 'needs-confirmation') {
        this.actionState = {
          status: 'idle',
          timestamp: new Date().toISOString(),
        };
        this.pendingOverride = null;
        this.currentSituationAttribution = undefined;
        this.notify();
      }
    }
    this.commandContext = ctx;
  }

  public getCommandContext(): ActionCommandContext | undefined {
    return this.commandContext;
  }

  public getSnapshot(): ActionStoreSnapshot {
    return {
      actionState: this.getActionState(),
      interactionState: this.interactionState,
      isPinned: this.pinned,
      canUndo: this.canUndo(),
      transcript: this.getTranscript(),
    };
  }

  public openConversation(): void {
    this.interactionState = 'CONVERSATION';
    if (this.transcriptList.length === 0) {
      const isLunch =
        this.commandContext?.sceneId === 'away-lunch' ||
        this.commandContext?.sceneId === 'busy-lunch' ||
        this.commandContext?.plan?.intentId === 'lunch';
      const isFuel =
        this.commandContext?.sceneId === 'fuel' ||
        this.commandContext?.plan?.intentId === 'fuel';
      const welcomeText = isFuel
        ? "I can help find nearby gas stations: ask 'find gas', 'Why this station?', 'Looks good' to confirm, or 'Undo' to restore."
        : isLunch
        ? "I can help with lunch recommendations: ask 'quieter', 'vegetarian', 'closer', 'Why this restaurant?', 'Looks good' to confirm, or 'Undo' to restore."
        : "I can help adjust your departure plan: ask 'Can I leave 15 minutes later?', 'Take the bus', 'Why this plan?', 'Looks good' to confirm, or 'Undo' to restore.";
      this.transcriptList.push({
        id: `msg-${Date.now()}-welcome`,
        sender: 'assistant',
        text: welcomeText,
        timestamp: new Date().toISOString(),
      });
    }
    this.notify();
  }

  public closeConversation(_reason?: string): void {
    this.interactionState = 'HOME';
    this.notify();
  }

  public togglePin(): boolean {
    this.pinned = !this.pinned;
    this.notify();
    return this.pinned;
  }

  public setPinned(pinned: boolean): void {
    this.pinned = pinned;
    this.notify();
  }

  public handleEsc(): boolean {
    if (this.interactionState === 'CONVERSATION' || this.interactionState === 'PROCESSING') {
      this.closeConversation('esc_pressed');
      return true;
    }
    return false;
  }

  /**
   * idle/settled ──command received──▶ working (PROCESSING)
   * Working state copy names the actual recomputation:
   * e.g. "Comparing departure options · Checking forecast · simulated" (D3)
   */
  public beginCommand(
    _text: string,
    detail: string = 'Comparing departure options · Checking forecast · simulated',
    substate: WorkingSubstate = 'default'
  ): boolean {
    if (this.actionState.status === 'working') {
      return false;
    }
    const priorPlan = this.actionState.plan;
    this.actionState = {
      status: 'working',
      substate,
      detail,
      plan: priorPlan,
      timestamp: new Date().toISOString(),
    };
    this.interactionState = 'PROCESSING';
    this.notify();
    return true;
  }

  /**
   * working ──determinate success──▶ updated
   * interactionState: PROCESSING ──▶ auto-collapse ──▶ HOME (or stays CONVERSATION if pinned)
   */
  public resolveExecutable(summary: string, plan?: PreparedPlan): boolean {
    if (this.actionState.status !== 'working') {
      return false;
    }

    this.actionState = {
      status: 'updated',
      resultSummary: summary,
      plan,
      override: this.currentOverride,
      timestamp: new Date().toISOString(),
    };

    if (this.pinned) {
      this.interactionState = 'CONVERSATION';
    } else {
      this.interactionState = 'HOME';
    }

    this.notify();
    return true;
  }

  /**
   * working ──needs input / late departure──▶ needs-confirmation
   * interactionState: PROCESSING ──▶ CONVERSATION (stays open until confirm/reject)
   */
  public resolveNeedsConfirmation(detail: string, pendingPlan?: PreparedPlan): boolean {
    if (this.actionState.status !== 'working') {
      return false;
    }

    this.actionState = {
      status: 'needs-confirmation',
      detail,
      pendingPlan,
      timestamp: new Date().toISOString(),
    };
    this.interactionState = 'CONVERSATION';
    this.notify();
    return true;
  }

  /**
   * needs-confirmation ──confirm──▶ updated
   * interactionState: CONVERSATION ──▶ auto-collapse ──▶ HOME (or stays CONVERSATION if pinned)
   */
  public confirmPending(summary: string, plan?: PreparedPlan): boolean {
    if (this.actionState.status !== 'needs-confirmation') {
      return false;
    }

    if (this.pendingOverride) {
      this.currentOverride = this.pendingOverride;
      this.pendingOverride = null;
    }

    this.actionState = {
      status: 'updated',
      resultSummary: summary,
      plan: plan ?? this.actionState.pendingPlan,
      override: this.currentOverride,
      timestamp: new Date().toISOString(),
    };

    if (this.pinned) {
      this.interactionState = 'CONVERSATION';
    } else {
      this.interactionState = 'HOME';
    }

    this.notify();
    return true;
  }

  /**
   * needs-confirmation ──reject──▶ idle (no change)
   * interactionState: stays CONVERSATION
   */
  public rejectPending(): boolean {
    if (this.actionState.status !== 'needs-confirmation') {
      return false;
    }

    this.pendingOverride = null;

    this.actionState = {
      status: 'idle',
      timestamp: new Date().toISOString(),
    };
    this.interactionState = 'CONVERSATION';
    this.notify();
    return true;
  }

  /**
   * working ──failure──▶ degraded (honest notice, home unchanged)
   * interactionState: stays CONVERSATION
   */
  public resolveDegraded(notice: string): boolean {
    if (this.actionState.status !== 'working') {
      return false;
    }

    this.actionState = {
      status: 'degraded',
      notice,
      timestamp: new Date().toISOString(),
    };
    this.interactionState = 'CONVERSATION';
    this.notify();
    return true;
  }

  /**
   * working ──long-form / discussion──▶ settled / CONVERSATION (stays open)
   */
  public resolveLongForm(_response: string): boolean {
    if (this.actionState.status !== 'working') {
      return false;
    }

    this.actionState = {
      status: 'settled',
      timestamp: new Date().toISOString(),
    };
    this.interactionState = 'CONVERSATION';
    this.notify();
    return true;
  }

  /**
   * updated / degraded ──settle──▶ settled
   */
  public settle(): boolean {
    const current = this.actionState.status;
    if (current !== 'updated' && current !== 'degraded') {
      return false;
    }

    this.actionState = {
      status: 'settled',
      timestamp: new Date().toISOString(),
    };
    this.notify();
    return true;
  }

  /**
   * Reset store action state to idle
   */
  public resetToIdle(): boolean {
    this.actionState = {
      status: 'idle',
      timestamp: new Date().toISOString(),
    };
    this.activeEvidenceBundle = undefined;
    this.activeSnapshot = undefined;
    this.notify();
    return true;
  }

  /**
   * Smart auto-collapse determination per LIVING_CONTEXT_V2.md §2.2 table:
   * | Situation | Behaviour |
   * | Executable command with a determinate result | Collapse to updated home |
   * | Result is needs-confirmation | Stay open until confirm/reject |
   * | Long-form answer, Why explanation, or multi-turn discussion | Stay open |
   * | Unsupported ask | Stay open with honest capability answer |
   * | User pinned the conversation | Never auto-collapse |
   * | Degraded/failure | Stay open with the notice; home unchanged |
   */
  public evaluateAutoCollapse(rule: AutoCollapseRule): boolean {
    if (this.pinned) {
      return false;
    }
    if (rule === 'executable_determinate') {
      this.interactionState = 'HOME';
      this.notify();
      return true;
    }
    return false;
  }

  public submitMessage(
    text: string,
    contextOverride?: ActionCommandContext
  ): { collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan } {
    const trimmed = text.trim();
    if (!trimmed) {
      return { collapsed: false, rule: 'unsupported_ask', response: '' };
    }

    const now = new Date().toISOString();
    this.transcriptList.push({
      id: `msg-${Date.now()}-u`,
      sender: 'user',
      text: trimmed,
      timestamp: now,
    });

    const ctx = contextOverride ?? this.commandContext;

    // Available modes from current plan options
    const availableModes: string[] = [];
    if (ctx?.plan?.optionsOrSteps) {
      for (const opt of ctx.plan.optionsOrSteps) {
        if (typeof opt !== 'string' && opt.mode) {
          availableModes.push(opt.mode);
        }
      }
    }

    // Resolve evidence bundle for scene
    const evidenceBundle =
      ctx?.evidenceBundle ??
      (ctx?.plan?.intentId === 'depart' || ctx?.sceneId === 'rain'
        ? createRainEvidenceBundle({
            plan: ctx?.plan ?? undefined,
            snapshot: ctx?.snapshot,
            override: this.currentOverride,
            sceneClockIso: ctx?.snapshot?.asOf,
            timezone: ctx?.plan?.timezone ?? ctx?.snapshot?.timezone,
            isConfirmedHabit: ctx?.userConfirmedKeys?.has('rain_transport_preference'),
          })
        : ctx?.plan?.intentId === 'lunch' || ctx?.sceneId === 'away-lunch'
          ? createLunchEvidenceBundle({
              plan: ctx?.plan ?? undefined,
              snapshot: ctx?.snapshot,
              sceneClockIso: ctx?.snapshot?.asOf,
              timezone: ctx?.plan?.timezone ?? ctx?.snapshot?.timezone,
              isConfirmedTaste: ctx?.userConfirmedKeys?.has('taste_preference_lunch_cuisine'),
            })
          : undefined);

    // Gather available signals from context
    const availableSignalIds: string[] = [];
    if (ctx?.snapshot?.signals) {
      for (const s of ctx.snapshot.signals) {
        if (s.issuedAt) availableSignalIds.push(`${s.kind}:${s.issuedAt}`);
        availableSignalIds.push(s.kind);
      }
    }
    if (ctx?.plan?.why?.evidenceSignals) {
      for (const s of ctx.plan.why.evidenceSignals) {
        if (s.issuedAt) availableSignalIds.push(`${s.kind}:${s.issuedAt}`);
        availableSignalIds.push(s.kind);
      }
    }
    const bundleWithRecords = evidenceBundle as { getAllRecords?(): readonly { id: string }[] } | undefined;
    if (bundleWithRecords && typeof bundleWithRecords.getAllRecords === 'function') {
      for (const rec of bundleWithRecords.getAllRecords()) {
        if (!availableSignalIds.includes(rec.id)) {
          availableSignalIds.push(rec.id);
        }
      }
    }

    // Gather known facts from memory and plan (any provenance)
    const knownFactKeysSet = new Set<string>();
    if (ctx?.memory) {
      for (const f of ctx.memory) {
        knownFactKeysSet.add(f.key);
      }
    }
    if (ctx?.plan?.why?.memoryFactsUsed) {
      for (const f of ctx.plan.why.memoryFactsUsed) {
        knownFactKeysSet.add(f.key);
      }
    }
    const knownFactKeys = Array.from(knownFactKeysSet);

    // Gather confirmed facts using the central provenance classifier (amendment R1)
    const confirmedFactKeys: string[] = [];
    if (ctx?.memory) {
      for (const f of ctx.memory) {
        if (classifyFactSource(f, ctx.userConfirmedKeys) === 'user_confirmed') {
          confirmedFactKeys.push(f.key);
        }
      }
    }
    if (ctx?.plan?.why?.memoryFactsUsed) {
      for (const f of ctx.plan.why.memoryFactsUsed) {
        if (
          classifyFactSource(f, ctx.userConfirmedKeys) === 'user_confirmed' &&
          !confirmedFactKeys.includes(f.key)
        ) {
          confirmedFactKeys.push(f.key);
        }
      }
    }

    const validTimes: string[] = [];
    const validPlaces: string[] = [];
    if (ctx?.plan) {
      if (ctx.plan.leaveAt) validTimes.push(ctx.plan.leaveAt);
      if (ctx.plan.prepareAt) validTimes.push(ctx.plan.prepareAt);
      if (ctx.plan.apptAt) validTimes.push(ctx.plan.apptAt);
      if (ctx.plan.subjectTitle) validPlaces.push(ctx.plan.subjectTitle);
      if ((ctx.plan as any).destination) validPlaces.push((ctx.plan as any).destination);
    }

    // Interpret command using configured interpreter (ModelCommandInterpreter or Deterministic)
    const cmd = this.interpreter.interpret(trimmed, {
      availableModes: availableModes.length > 0 ? availableModes : ['drive', 'bus'],
      currentPlanIntent: ctx?.plan?.intentId,
      availableSignalIds,
      knownFactKeys,
      confirmedFactKeys,
      validTimes,
      validPlaces,
      sceneId: ctx?.sceneId,
      evidenceBundle,
    });

    if (cmd.situationAttribution) {
      this.currentSituationAttribution = {
        ...cmd.situationAttribution,
        citedFactKeys: cmd.citedFactKeys ?? cmd.situationAttribution.citedFactKeys,
      };
    }

    // 1. ACCEPT ('Looks good', 'Accept', 'Confirm')
    if (cmd.intent === 'ACCEPT') {
      if (this.pendingFuelDisambiguation) {
        this.pendingFuelDisambiguation = false;
        return this.submitMessage('find gas');
      }

      if (this.actionState.status === 'needs-confirmation' && this.actionState.pendingPlan) {
        const confirmedPlan = this.actionState.pendingPlan;
        this.pushHistory({
          planState: this.actionState.plan ?? ctx?.plan ?? null,
          sceneId: ctx?.sceneId ?? 'current',
          actionState: {
            ...this.actionState,
            status: this.currentOverride ? 'updated' : 'idle',
            plan: this.actionState.plan ?? ctx?.plan ?? undefined,
          },
          override: this.currentOverride,
          timestamp: now,
        });
        this.confirmPending('Plan confirmed for this time only', confirmedPlan);
        const response = 'Confirmed for this time only. Your departure plan is updated.';
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: response,
          timestamp: new Date().toISOString(),
        });
        const collapsed = this.evaluateAutoCollapse('executable_determinate');
        this.notify();
        return { collapsed, rule: 'executable_determinate', response, plan: confirmedPlan };
      }

      this.settle();
      const response = 'Plan accepted.';
      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: response,
        timestamp: new Date().toISOString(),
      });
      const collapsed = this.evaluateAutoCollapse('executable_determinate');
      this.notify();
      return { collapsed, rule: 'executable_determinate', response };
    }

    // 2. UNDO ('Undo', 'Revert')
    if (cmd.intent === 'UNDO') {
      const restored = this.undo();
      const response = restored
        ? 'Restored prior plan. Changes have been undone.'
        : 'Nothing to undo.';
      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: response,
        timestamp: new Date().toISOString(),
      });
      const collapsed = this.evaluateAutoCollapse('executable_determinate');
      this.notify();
      return {
        collapsed,
        rule: 'executable_determinate',
        response,
        plan: restored?.planState ?? undefined,
      };
    }

    // 3. WHY ('Why?', 'Why this plan?')
    if (cmd.intent === 'WHY') {
      this.beginCommand(trimmed);

      let explanation: string;
      const activePlan = this.actionState.plan ?? ctx?.plan;
      if (!activePlan) {
        explanation = "There is no active plan right now.";
      } else {
        const userConfirmed =
          ctx?.userConfirmedKeys ??
          new Set(
            ctx?.memory
              ?.filter(f => f.status === 'confirmed' && (f.provenance as any)?.source === 'user_confirmed')
              .map(f => f.key) ?? []
          );
        const baseDerivation = buildHumanDerivation(activePlan, userConfirmed);

        const memoryFactsUsed = activePlan.why?.memoryFactsUsed ?? [];
        if (memoryFactsUsed.length > 0) {
          const notes = memoryFactsUsed.map(f => {
            const kind = classifyFactSource(f, userConfirmed, ctx?.memory);
            const prov = kind === 'user_confirmed' ? 'Confirmed preference' : provenanceLabel(kind);
            return `${humanizeMemoryKey(f.key)} (${prov})`;
          });
          explanation = `${baseDerivation} Selected using your ${notes.join(', ')}.`;
        } else {
          explanation = baseDerivation;
        }
      }

      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: explanation,
        timestamp: new Date().toISOString(),
      });
      this.resolveLongForm(explanation);
      this.notify();
      return { collapsed: false, rule: 'long_form_discussion', response: explanation };
    }

    // 4. LEAVE_LATER ('Can I leave later?', 'Leave 15 minutes later')
    if (cmd.intent === 'LEAVE_LATER') {
      if (!ctx || !ctx.plan || ctx.plan.intentId !== 'depart' || !ctx.candidate || !ctx.snapshot || !ctx.memory) {
        const noPlanMsg = "There's no departure plan to adjust right now.";
        this.resolveDegraded(noPlanMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: noPlanMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: noPlanMsg };
      }

      // Comparison flow when deltaMinutes is not specified
      if (cmd.slots.deltaMinutes === undefined) {
        this.beginCommand(
          trimmed,
          'Comparing departure options · Checking forecast · simulated',
          'comparing'
        );

        const tz = ctx.plan.timezone;
        // Derive timing facts from base plan using single shared timing helper
        const baseTiming = derivePlanTimingFacts(ctx.plan);
        const currentMarginMinutes = Math.max(0, baseTiming?.marginMinutes ?? 0);

        // Latest on-time option: delta equals current margin (e.g. 5m in rain or clear)
        const safeDelta = currentMarginMinutes;
        // Later option with late risk: safeDelta + 10m (e.g. 15m in rain/clear), or 15m if safeDelta = 0
        const lateDelta = safeDelta > 0 ? safeDelta + 10 : 15;

        const safeOverride = createUserRequestOverride({
          kind: 'leave_later',
          deltaMinutes: safeDelta,
          at: now,
        });
        const lateOverride = createUserRequestOverride({
          kind: 'leave_later',
          deltaMinutes: lateDelta,
          at: now,
        });

        const safePlan = departPreparer.prepareWithRequest(ctx.candidate, ctx.snapshot, ctx.memory, safeOverride);
        const latePlan = departPreparer.prepareWithRequest(ctx.candidate, ctx.snapshot, ctx.memory, lateOverride);

        // Derive timing facts directly from each override's preparer output
        const safeTiming = safePlan ? derivePlanTimingFacts(safePlan) : undefined;
        const lateTiming = latePlan ? derivePlanTimingFacts(latePlan) : undefined;

        const safeLeaveStr = safeTiming?.leaveAt
          ? formatTime(safeTiming.leaveAt, tz)
          : `${safeDelta}m later`;
        const safeArriveStr = safeTiming?.arrivalAt
          ? formatTime(safeTiming.arrivalAt, tz)
          : (safePlan?.apptAt ? formatTime(safePlan.apptAt, tz) : '');

        const lateLeaveStr = lateTiming?.leaveAt
          ? formatTime(lateTiming.leaveAt, tz)
          : `${lateDelta}m later`;
        const lateArriveStr = lateTiming?.arrivalAt
          ? formatTime(lateTiming.arrivalAt, tz)
          : '';

        const safeMargin = safeTiming?.marginMinutes ?? 0;

        const isSafeRecommended = cmd.recommendedOptionDelta === safeDelta;
        const comparisonOptions: DepartureComparisonItem[] = [];
        if (safePlan && safeTiming) {
          comparisonOptions.push({
            deltaMinutes: safeDelta,
            headline: safePlan.headline,
            leaveTime: safeLeaveStr,
            arrivalTime: safeArriveStr,
            marginMinutes: safeMargin,
            isLateRisk: safeTiming.isLate,
            plan: safePlan,
            isRecommended: isSafeRecommended,
            recommendationReasonCode: isSafeRecommended ? cmd.reasonCodes?.[0] : undefined,
          });
        }
        if (latePlan && lateTiming) {
          const isLateRecommended = cmd.recommendedOptionDelta === lateDelta;
          comparisonOptions.push({
            deltaMinutes: lateDelta,
            headline: latePlan.headline,
            leaveTime: lateLeaveStr,
            arrivalTime: lateArriveStr,
            marginMinutes: lateTiming.marginMinutes,
            isLateRisk: lateTiming.isLate,
            plan: latePlan,
            isRecommended: isLateRecommended,
            recommendationReasonCode: isLateRecommended ? cmd.reasonCodes?.[0] : undefined,
          });
        }

        let comparisonText: string;
        if (lateTiming) {
          const latenessMin = Math.abs(lateTiming.marginMinutes);
          if (safeDelta > 0) {
            comparisonText = `Comparing departure options: You can leave up to ${safeDelta} minutes later (${safeLeaveStr}) and still arrive on time (0m buffer). Leaving ${lateDelta} minutes later (${lateLeaveStr}) arrives at ${lateArriveStr} (${latenessMin}m late) for ${ctx.plan.subjectTitle}. Which option would you prefer?`;
          } else {
            comparisonText = `Comparing departure options: You are on the latest departure to arrive on time (${safeLeaveStr}, 0m buffer). Leaving ${lateDelta} minutes later (${lateLeaveStr}) arrives at ${lateArriveStr} (${latenessMin}m late) for ${ctx.plan.subjectTitle}. Which option would you prefer?`;
          }
        } else {
          comparisonText = `Comparing departure options: You can leave up to ${safeDelta} minutes later (${safeLeaveStr}) and arrive at ${safeArriveStr} on time (${safeMargin}m buffer). Which option would you prefer?`;
        }

        this.resolveNeedsConfirmation(comparisonText, safePlan ?? undefined);

        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: comparisonText,
          timestamp: new Date().toISOString(),
          needsConfirmation: true,
          pendingPlan: safePlan ?? undefined,
          comparisonOptions,
        });

        this.notify();
        return {
          collapsed: false,
          rule: 'needs_confirmation',
          response: comparisonText,
          plan: safePlan ?? undefined,
        };
      }

      // Explicit delta flow
      const deltaMinutes = cmd.slots.deltaMinutes;
      this.beginCommand(
        trimmed,
        'Comparing departure options · Checking forecast · simulated',
        'comparing'
      );

      const override = createUserRequestOverride({
        kind: 'leave_later',
        deltaMinutes,
        at: now,
      });

      const newPlan = departPreparer.prepareWithRequest(
        ctx.candidate,
        ctx.snapshot,
        ctx.memory,
        override
      );

      if (!newPlan) {
        const errorMsg = 'Could not calculate departure with the requested time shift.';
        this.resolveDegraded(errorMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: errorMsg };
      }

      // Invariant: If delta arrives after appointment start, goes to needs-confirmation (never silent late plan)
      if (newPlan.requiresConfirmation) {
        this.pendingOverride = override;
        this.resolveNeedsConfirmation(
          `Leaving ${deltaMinutes} min later arrives after your appointment start time.`,
          newPlan
        );
        const lateMsg = `Leaving ${deltaMinutes} minutes later moves your departure to ${newPlan.headline}. You will arrive late for ${newPlan.subjectTitle}. Would you like to confirm this plan for this time only?`;
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: lateMsg,
          timestamp: new Date().toISOString(),
          needsConfirmation: true,
          pendingPlan: newPlan,
        });
        this.notify();
        return { collapsed: false, rule: 'needs_confirmation', response: lateMsg, plan: newPlan };
      }

      // On-time execution: determinate result
      this.pushHistory({
        planState: this.actionState.plan ?? ctx.plan ?? null,
        sceneId: ctx.sceneId ?? 'current',
        actionState: {
          ...this.actionState,
          status: this.currentOverride ? 'updated' : 'idle',
          plan: this.actionState.plan ?? ctx.plan ?? undefined,
        },
        override: this.currentOverride,
        timestamp: now,
      });

      this.currentOverride = override;

      this.resolveExecutable(
        `Depart plan updated to leave ${deltaMinutes} min later.`,
        newPlan
      );

      const successMsg = `Updated your plan to leave ${deltaMinutes} minutes later: ${newPlan.headline}.`;
      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      });

      const collapsed = this.evaluateAutoCollapse('executable_determinate');
      this.notify();
      return {
        collapsed,
        rule: 'executable_determinate',
        response: successMsg,
        plan: newPlan,
      };
    }

    // 5. CHANGE_ROUTE ('Take the bus', 'Change route to driving')
    if (cmd.intent === 'CHANGE_ROUTE') {
      const mode = cmd.slots.mode ?? 'drive';
      if (!ctx || !ctx.plan || ctx.plan.intentId !== 'depart' || !ctx.candidate || !ctx.snapshot || !ctx.memory) {
        const noPlanMsg = "There's no departure plan to adjust right now.";
        this.resolveDegraded(noPlanMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: noPlanMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: noPlanMsg };
      }

      this.beginCommand(
        trimmed,
        'Comparing departure options · Checking forecast · simulated',
        'comparing'
      );

      const override = createUserRequestOverride({
        kind: 'route_preference',
        mode,
        at: now,
      });

      const newPlan = departPreparer.prepareWithRequest(
        ctx.candidate,
        ctx.snapshot,
        ctx.memory,
        override
      );

      if (!newPlan) {
        const errorMsg = `Could not switch route to ${mode}.`;
        this.resolveDegraded(errorMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: errorMsg };
      }

      this.pushHistory({
        planState: this.actionState.plan ?? ctx.plan ?? null,
        sceneId: ctx.sceneId ?? 'current',
        actionState: {
          ...this.actionState,
          status: this.currentOverride ? 'updated' : 'idle',
          plan: this.actionState.plan ?? ctx.plan ?? undefined,
        },
        override: this.currentOverride,
        timestamp: now,
      });

      this.currentOverride = override;

      this.resolveExecutable(`Primary route switched to ${mode}.`, newPlan);
      const successMsg = `Switched primary route to ${mode}: ${newPlan.headline}.`;
      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      });

      const collapsed = this.evaluateAutoCollapse('executable_determinate');
      this.notify();
      return {
        collapsed,
        rule: 'executable_determinate',
        response: successMsg,
        plan: newPlan,
      };
    }

    // 6. FIND_LUNCH ('Find a quieter vegetarian lunch spot', 'Find lunch nearby', 'quieter + vegetarian')
    if (cmd.intent === 'FIND_LUNCH') {
      const filters = cmd.slots.filters ?? [];
      const filtersDesc = filters.length > 0 ? filters.join(' and ') : 'lunch';

      const locStatus = defaultLocationPort.getLocation();
      const isDynamicLunch = ctx?.sceneId === 'lunch' || ctx?.snapshot?.signals?.some(s => s.kind === 'places_lunch');

      if (isDynamicLunch) {
        if (locStatus.status === 'prompt') {
          const degradedMsg = 'Location permission needed to search for nearby lunch spots. Please grant location access.';
          this.resolveDegraded(degradedMsg);
          this.transcriptList.push({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: degradedMsg,
            timestamp: new Date().toISOString(),
          });
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: degradedMsg };
        }
        if (locStatus.status === 'denied') {
          const degradedMsg = 'Location permission was denied. Cannot find lunch places without location access.';
          this.resolveDegraded(degradedMsg);
          this.transcriptList.push({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: degradedMsg,
            timestamp: new Date().toISOString(),
          });
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: degradedMsg };
        }
        if (locStatus.status === 'unavailable' || !locStatus.coords) {
          const degradedMsg = 'Location is currently unavailable. Please enter coordinates manually.';
          this.resolveDegraded(degradedMsg);
          this.transcriptList.push({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: degradedMsg,
            timestamp: new Date().toISOString(),
          });
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: degradedMsg };
        }

        try {
          const provider = mockLunchAdapter.getProvider();
          if (provider.searchNearbySync) {
            provider.searchNearbySync({ location: locStatus.coords, category: 'restaurant', radiusMeters: 10000 });
          }
        } catch {
          const errorMsg = 'Unable to search for lunch places: places provider failure. Fails closed.';
          this.resolveDegraded(errorMsg);
          this.transcriptList.push({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: errorMsg,
            timestamp: new Date().toISOString(),
          });
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: errorMsg };
        }
      }

      if (!ctx || !ctx.plan || ctx.plan.intentId !== 'lunch' || !ctx.candidate || !ctx.snapshot || !ctx.memory) {
        const noPlanMsg = "There's no active lunch recommendation to filter right now.";
        this.resolveDegraded(noPlanMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: noPlanMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: noPlanMsg };
      }

      this.beginCommand(
        trimmed,
        'Filtering lunch options · simulated',
        'comparing'
      );

      const override = createUserRequestOverride({
        kind: 'lunch_filter',
        filters,
        at: now,
      });

      const newPlan = lunchPreparer.prepareWithRequest(
        ctx.candidate,
        ctx.snapshot,
        ctx.memory,
        override
      );

      if (!newPlan) {
        const errorMsg = 'Could not find lunch options matching your requested filter.';
        this.resolveDegraded(errorMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: errorMsg };
      }

      this.pushHistory({
        planState: this.actionState.plan ?? ctx.plan ?? null,
        sceneId: ctx.sceneId ?? 'current',
        actionState: {
          ...this.actionState,
          status: this.currentOverride ? 'updated' : 'idle',
          plan: this.actionState.plan ?? ctx.plan ?? undefined,
        },
        override: this.currentOverride,
        timestamp: now,
      });

      this.currentOverride = override;

      this.resolveExecutable(
        `Lunch recommendations updated to prioritize ${filtersDesc}.`,
        newPlan
      );

      if (isDynamicLunch && ctx.snapshot) {
        const lunchBundle = createLunchPlacesEvidenceBundle({
          snapshot: ctx.snapshot,
          originCoords: locStatus.coords,
          userConfirmedKeys: ctx.userConfirmedKeys,
        });
        this.activeEvidenceBundle = lunchBundle;
        this.activeSnapshot = ctx.snapshot;
      }

      const topOption = newPlan.optionsOrSteps?.[0];
      const topName =
        typeof topOption === 'object' && topOption !== null
          ? (topOption as { name?: string; label?: string }).name || (topOption as { name?: string; label?: string }).label
          : 'top recommendation';

      const successMsg = `Updated lunch options based on your request (${filtersDesc}): ${topName} is now your top recommendation.`;
      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      });

      const collapsed = this.evaluateAutoCollapse('executable_determinate');
      this.notify();
      return {
        collapsed,
        rule: 'executable_determinate',
        response: successMsg,
        plan: newPlan,
      };
    }

    // 7. FIND_FUEL ('gas', 'find gas', '加油')
    if (cmd.intent === 'FIND_FUEL') {
      if (cmd.slots.ambiguous) {
        this.pendingFuelDisambiguation = true;
        this.beginCommand(trimmed);
        const question = cmd.honestAnswer ?? 'Did you mean: find a gas station?';
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: question,
          timestamp: new Date().toISOString(),
        });
        this.resolveNeedsConfirmation(question);
        this.notify();
        return { collapsed: false, rule: 'needs_confirmation', response: question };
      }

      this.pendingFuelDisambiguation = false;
      this.beginCommand(trimmed, 'Finding nearby gas stations · simulated', 'comparing');

      const locStatus = defaultLocationPort.getLocation();
      if (locStatus.status !== 'available' || !locStatus.coords) {
        const degradedMsg =
          'Cannot search for gas stations: location is unavailable or denied. Location is required to find nearby fuel.';
        this.resolveDegraded(degradedMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: degradedMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: degradedMsg };
      }

      const override = createUserRequestOverride({
        kind: 'fuel_search',
        at: now,
      });

      const fuelCandidate: IntentCandidate = {
        intent: 'fuel',
        confidence: 1.0,
        evidence: [],
      };

      let places: readonly PlaceItem[] = [];
      let placesStatus: 'ok' | 'empty' | 'error' = 'ok';
      let placesError: string | undefined;

      try {
        const provider = mockFuelAdapter.getProvider();
        places = provider.searchNearbySync
          ? provider.searchNearbySync({ location: locStatus.coords, category: 'gas_station', radiusMeters: 10000 })
          : [];
        placesStatus = places.length > 0 ? 'ok' : 'empty';
      } catch (err: unknown) {
        placesStatus = 'error';
        placesError = err instanceof Error ? err.message : 'Places provider failure';
        places = [];
      }

      if (placesStatus === 'error') {
        const errorMsg = 'Unable to search for gas stations: places provider failure. Fails closed.';
        this.resolveDegraded(errorMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: errorMsg };
      }

      const placesSig = createSimulatedSignal({
        kind: 'places_fuel',
        value: {
          status: placesStatus,
          places,
          error: placesError,
          originCoords: locStatus.coords,
        },
        issuedAt: now,
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      const effectiveSnapshot: ContextSnapshot = {
        id: ctx?.snapshot?.id ?? 'snap-fuel-store',
        asOf: ctx?.snapshot?.asOf ?? now,
        timezone: ctx?.snapshot?.timezone ?? 'America/Los_Angeles',
        signals: [...(ctx?.snapshot?.signals ?? []).filter(s => s.kind !== 'places_fuel'), placesSig],
      };

      const fuelBundle = createFuelEvidenceBundle({ snapshot: effectiveSnapshot, places, originCoords: locStatus.coords });
      this.activeEvidenceBundle = fuelBundle;
      this.activeSnapshot = effectiveSnapshot;

      const newPlan = fuelPreparer.prepareWithRequest(
        fuelCandidate,
        effectiveSnapshot,
        ctx?.memory ?? [],
        override,
        locStatus.coords
      );

      if (!newPlan) {
        const errorMsg = 'No gas stations found nearby in fixture data.';
        this.resolveDegraded(errorMsg);
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        });
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: errorMsg };
      }

      this.pushHistory({
        planState: this.actionState.plan ?? ctx?.plan ?? null,
        sceneId: ctx?.sceneId ?? 'current',
        actionState: {
          ...this.actionState,
          status: this.currentOverride ? 'updated' : 'idle',
          plan: this.actionState.plan ?? ctx?.plan ?? undefined,
        },
        override: this.currentOverride,
        timestamp: now,
        evidenceBundle: fuelBundle,
        snapshot: effectiveSnapshot,
      });

      this.currentOverride = override;

      const topOption = newPlan.optionsOrSteps?.[0];
      const topName =
        typeof topOption === 'object' && topOption !== null
          ? (topOption as { name?: string; label?: string }).name || (topOption as { name?: string; label?: string }).label
          : 'nearby gas station';

      const successMsg = `Found nearby gas stations: ${topName} is the closest.`;
      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      });

      this.resolveExecutable(
        'Nearby gas stations found.',
        newPlan
      );

      const collapsed = this.evaluateAutoCollapse('executable_determinate');
      this.notify();
      return {
        collapsed,
        rule: 'executable_determinate',
        response: successMsg,
        plan: newPlan,
      };
    }

    // 8. UNSUPPORTED (Honest capability answers)
    this.beginCommand(trimmed);
    const isLunch =
      this.commandContext?.sceneId === 'away-lunch' ||
      this.commandContext?.sceneId === 'busy-lunch' ||
      this.commandContext?.plan?.intentId === 'lunch';
    const isFuel =
      this.commandContext?.sceneId === 'fuel' ||
      this.commandContext?.plan?.intentId === 'fuel';
    const fallbackText = isFuel
      ? "I can help find nearby gas stations: ask 'find gas', 'Why this station?', 'Looks good' to confirm, or 'Undo' to restore."
      : isLunch
      ? "I can help with lunch recommendations: ask 'quieter', 'vegetarian', 'closer', 'Why this restaurant?', 'Looks good' to confirm, or 'Undo' to restore."
      : "I can help adjust your departure plan: ask 'Can I leave 15 minutes later?', 'Take the bus', 'Why this plan?', 'Looks good' to confirm, or 'Undo' to restore.";
    const responseText = cmd.honestAnswer ?? fallbackText;

    this.transcriptList.push({
      id: `msg-${Date.now()}-a`,
      sender: 'assistant',
      text: responseText,
      timestamp: new Date().toISOString(),
    });

    this.resolveDegraded(responseText);
    const rule: AutoCollapseRule = this.pinned ? 'pinned' : 'unsupported_ask';
    this.notify();
    return { collapsed: false, rule, response: responseText };
  }

  public pushHistory(snapshot: ActionHistorySnapshot): void {
    this.historyStack.push(snapshot);
    this.notify();
  }

  public undo(): ActionHistorySnapshot | null {
    if (this.historyStack.length === 0) {
      return null;
    }
    const restored = this.historyStack.pop()!;
    this.actionState = {
      ...restored.actionState,
      plan: restored.planState ?? undefined,
      timestamp: new Date().toISOString(),
    };
    this.currentOverride = restored.override ?? null;
    this.activeEvidenceBundle = restored.evidenceBundle;
    this.activeSnapshot = restored.snapshot ?? undefined;
    this.notify();
    return restored;
  }

  public subscribe(listener: (snapshot: ActionStoreSnapshot) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.subscribers) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in ActionStateStore listener:', err);
      }
    }
  }
}

export function createActionStateStore(options: ActionStateStoreOptions = {}): ActionStateStore {
  return new DefaultActionStateStore(options);
}
