/**
 * Action-State and Interaction State Model
 * Governed by LIVING_CONTEXT_V2.md Section 2.
 */

import type { PreparedPlan } from '../../core/contracts/index.js';

export type ActionStatus =
  | 'idle'
  | 'working'
  | 'updated'
  | 'needs-confirmation'
  | 'degraded'
  | 'settled';

export type WorkingSubstate = 'default' | 'comparing';

export interface ActionStateRecord {
  status: ActionStatus;
  substate?: WorkingSubstate;
  detail?: string;
  plan?: PreparedPlan;
  resultSummary?: string;
  notice?: string;
  timestamp: string;
}

export type InteractionState = 'HOME' | 'CONVERSATION' | 'PROCESSING';

export type AutoCollapseRule =
  | 'executable_determinate'
  | 'needs_confirmation'
  | 'long_form_discussion'
  | 'unsupported_ask'
  | 'pinned'
  | 'degraded_failure';

export interface MessageItem {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  isPlaceholder?: boolean;
}

export interface ActionHistorySnapshot {
  planState: PreparedPlan | null;
  sceneId: string;
  actionState: ActionStateRecord;
  timestamp: string;
}

export interface ActionStoreSnapshot {
  actionState: ActionStateRecord;
  interactionState: InteractionState;
  isPinned: boolean;
  canUndo: boolean;
  transcript: readonly MessageItem[];
}

export interface ActionStateStoreOptions {
  initialActionState?: Partial<ActionStateRecord>;
  initialInteractionState?: InteractionState;
  reducedMotion?: boolean;
}

export interface ActionStateStore {
  getActionState(): ActionStateRecord;
  getInteractionState(): InteractionState;
  isPinned(): boolean;
  canUndo(): boolean;
  getTranscript(): readonly MessageItem[];
  getSnapshot(): ActionStoreSnapshot;
  isReducedMotion(): boolean;

  openConversation(): void;
  closeConversation(reason?: string): void;
  togglePin(): boolean;
  setPinned(pinned: boolean): void;
  handleEsc(): boolean;

  startWorking(detail?: string, substate?: WorkingSubstate): void;
  setUpdated(summary: string, plan?: PreparedPlan): void;
  setNeedsConfirmation(detail: string): void;
  setDegraded(notice: string): void;
  setSettled(): void;
  resetToIdle(): void;

  evaluateAutoCollapse(rule: AutoCollapseRule): boolean;
  submitMessage(text: string): { collapsed: boolean; rule: AutoCollapseRule; response: string };
  pushHistory(snapshot: ActionHistorySnapshot): void;
  undo(): ActionHistorySnapshot | null;

  subscribe(listener: (snapshot: ActionStoreSnapshot) => void): () => void;
}
