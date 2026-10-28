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
  InteractionState,
  MessageItem,
  WorkingSubstate,
} from './types.js';
import type { PreparedPlan, IntentCandidate } from '../../core/contracts/index.js';
import { defaultCommandInterpreter } from '../conversation/grammar.js';
import { departPreparer } from '../../plugins/depart/preparer.js';
import {
  createUserRequestOverride,
  type UserRequestOverride,
} from '../../plugins/depart/request-override.js';

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

  constructor(options: ActionStateStoreOptions = {}) {
    this.actionState = {
      status: 'idle',
      timestamp: new Date().toISOString(),
      ...options.initialActionState,
    };
    this.interactionState = options.initialInteractionState ?? 'HOME';
    this.reducedMotionOption = options.reducedMotion;
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

  public clearOverride(): void {
    this.currentOverride = null;
    this.pendingOverride = null;
  }

  public setCommandContext(ctx: ActionCommandContext): void {
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
      this.transcriptList.push({
        id: `msg-${Date.now()}-welcome`,
        sender: 'assistant',
        text: "I can help adjust your departure plan (V2a): ask 'Can I leave 15 minutes later?', 'Take the bus', 'Why this plan?', 'Looks good' to confirm, or 'Undo' to restore.",
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
    this.actionState = {
      status: 'working',
      substate,
      detail,
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

    // Interpret command using deterministic closed grammar (model-off)
    const cmd = defaultCommandInterpreter.interpret(trimmed, {
      availableModes: availableModes.length > 0 ? availableModes : ['drive', 'bus'],
      currentPlanIntent: ctx?.plan?.intentId,
    });

    // 1. ACCEPT ('Looks good', 'Accept', 'Confirm')
    if (cmd.intent === 'ACCEPT') {
      if (this.actionState.status === 'needs-confirmation' && this.actionState.pendingPlan) {
        const confirmedPlan = this.actionState.pendingPlan;
        this.pushHistory({
          planState: ctx?.plan ?? null,
          sceneId: ctx?.sceneId ?? 'current',
          actionState: { ...this.actionState },
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
      const explanation =
        ctx?.plan?.why?.derivation ??
        "This plan is derived from your schedule and travel estimate fixtures.";
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
      const deltaMinutes = cmd.slots.deltaMinutes ?? 15;
      this.beginCommand(
        trimmed,
        'Comparing departure options · Checking forecast · simulated',
        'comparing'
      );

      if (!ctx || !ctx.snapshot || !ctx.memory) {
        const errorMsg = 'No active departure context available to adjust.';
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

      const override = createUserRequestOverride({
        kind: 'leave_later',
        deltaMinutes,
        at: ctx.snapshot.asOf,
      });

      const candidate: IntentCandidate = ctx.candidate ?? {
        intent: 'depart',
        confidence: 1.0,
        evidence: ctx.snapshot.signals.filter(s => s.kind === 'calendar'),
      };

      const newPlan = departPreparer.prepareWithRequest(
        candidate,
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
        planState: ctx.plan ?? null,
        sceneId: ctx.sceneId ?? 'current',
        actionState: { ...this.actionState },
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
      this.beginCommand(
        trimmed,
        'Comparing departure options · Checking forecast · simulated',
        'comparing'
      );

      if (!ctx || !ctx.snapshot || !ctx.memory) {
        const errorMsg = 'No active route context available.';
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

      const override = createUserRequestOverride({
        kind: 'route_preference',
        mode,
        at: ctx.snapshot.asOf,
      });

      const candidate: IntentCandidate = ctx.candidate ?? {
        intent: 'depart',
        confidence: 1.0,
        evidence: ctx.snapshot.signals.filter(s => s.kind === 'calendar'),
      };

      const newPlan = departPreparer.prepareWithRequest(
        candidate,
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
        planState: ctx.plan ?? null,
        sceneId: ctx.sceneId ?? 'current',
        actionState: { ...this.actionState },
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

    // 6. UNSUPPORTED (Honest capability answers)
    this.beginCommand(trimmed);
    const responseText =
      cmd.honestAnswer ??
      "I can help adjust your departure plan: ask 'Can I leave 15 minutes later?', 'Take the bus', 'Why this plan?', 'Looks good' to confirm, or 'Undo' to restore.";

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
