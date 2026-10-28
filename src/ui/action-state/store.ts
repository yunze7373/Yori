/**
 * Action-State Store and State Machine Implementation
 * Governed by LIVING_CONTEXT_V2.md Section 2.
 */

import type {
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
import type { PreparedPlan } from '../../core/contracts/index.js';

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
        text: 'Hello! I am Yori. This preview introduces the conversation shell and focus management. Commands will arrive in the next build (V2a).',
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
    if (this.interactionState === 'CONVERSATION') {
      this.closeConversation('esc_pressed');
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Guarded Transitions (§2.1 Action States & §2.2 Interaction States)
  // ---------------------------------------------------------------------------

  /**
   * idle / settled / updated ──command──▶ working (substate: default | comparing)
   * interactionState: CONVERSATION ──▶ PROCESSING
   */
  public beginCommand(text: string, detail?: string, substate?: WorkingSubstate): boolean {
    const current = this.actionState.status;
    if (current === 'working' || current === 'needs-confirmation') {
      // Cannot start a new command while already working or awaiting user confirmation
      return false;
    }

    this.actionState = {
      status: 'working',
      substate: substate ?? 'default',
      detail: detail ?? text,
      timestamp: new Date().toISOString(),
    };
    this.interactionState = 'PROCESSING';
    this.notify();
    return true;
  }

  /**
   * working ──result──▶ updated
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
   * working ──needs input──▶ needs-confirmation
   * interactionState: PROCESSING ──▶ CONVERSATION (stays open until confirm/reject)
   */
  public resolveNeedsConfirmation(detail: string): boolean {
    if (this.actionState.status !== 'working') {
      return false;
    }

    this.actionState = {
      status: 'needs-confirmation',
      detail,
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

    this.actionState = {
      status: 'updated',
      resultSummary: summary,
      plan,
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

  public submitMessage(text: string): { collapsed: boolean; rule: AutoCollapseRule; response: string } {
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

    // Enter PROCESSING state via beginCommand guard
    this.beginCommand(trimmed);

    // In V0, command parsing arrives in V2a. Present honest capability placeholder.
    const responseText = 'Commands arrive in the next build (V2a). You can explore the full-page conversation shell, pin toggling, and Esc/close navigation.';
    this.transcriptList.push({
      id: `msg-${Date.now()}-a`,
      sender: 'assistant',
      text: responseText,
      timestamp: new Date().toISOString(),
      isPlaceholder: true,
    });

    // Resolve as long-form / unsupported preview (stays open in CONVERSATION)
    this.resolveLongForm(responseText);

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
    this.actionState = { ...restored.actionState, timestamp: new Date().toISOString() };
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
