/**
 * Action-State and Interaction State Model
 * Governed by LIVING_CONTEXT_V2.md Section 2.
 */

import type {
  PreparedPlan,
  ContextSnapshot,
  MemoryFact,
  IntentCandidate,
} from '../../core/contracts/index.js';
import type { UserRequestOverride } from '../../plugins/depart/request-override.js';
import type { EngineStatus } from '../../adapters/model/decision-log.js';
import type { CommandInterpreter, SituationAttribution } from '../conversation/grammar.js';

export interface ActionCommandContext {
  readonly plan: PreparedPlan | null;
  readonly snapshot?: ContextSnapshot;
  readonly memory?: readonly MemoryFact[];
  readonly candidate?: IntentCandidate;
  readonly sceneId?: string;
  readonly userConfirmedKeys?: ReadonlySet<string>;
  readonly evidenceBundle?: { getRecord(id: string): unknown; hasRecord?(id: string): boolean; getAllRecords?(): readonly { id: string }[] };
}

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
  pendingPlan?: PreparedPlan;
  resultSummary?: string;
  notice?: string;
  timestamp: string;
  override?: UserRequestOverride | null;
}

export type InteractionState = 'HOME' | 'CONVERSATION' | 'PROCESSING';

export type AutoCollapseRule =
  | 'executable_determinate'
  | 'needs_confirmation'
  | 'long_form_discussion'
  | 'unsupported_ask'
  | 'pinned'
  | 'degraded_failure';

export interface DepartureComparisonItem {
  readonly deltaMinutes: number;
  readonly headline: string;
  readonly leaveTime: string;
  readonly arrivalTime: string;
  readonly marginMinutes: number;
  readonly isLateRisk: boolean;
  readonly plan: PreparedPlan;
  readonly isRecommended?: boolean;
  readonly recommendationReasonCode?: string;
}

export interface MessageItem {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  isPlaceholder?: boolean;
  inFlight?: boolean;
  needsConfirmation?: boolean;
  pendingPlan?: PreparedPlan;
  workingDetail?: string;
  comparisonOptions?: readonly DepartureComparisonItem[];
}

export interface ActionHistorySnapshot {
  planState: PreparedPlan | null;
  sceneId: string;
  actionState: ActionStateRecord;
  override?: UserRequestOverride | null;
  timestamp: string;
  evidenceBundle?: any;
  snapshot?: ContextSnapshot | null;
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
  interpreter?: CommandInterpreter;
}

export interface ActionStateStore {
  getActionState(): ActionStateRecord;
  getInteractionState(): InteractionState;
  isPinned(): boolean;
  canUndo(): boolean;
  getTranscript(): readonly MessageItem[];
  getSnapshot(): ActionStoreSnapshot;
  isReducedMotion(): boolean;
  getCurrentOverride(): UserRequestOverride | null;
  clearOverride(): void;
  getActiveEvidenceBundle(): any;
  getActiveSnapshot(): ContextSnapshot | undefined;

  getEngineStatus(): EngineStatus;
  getEngineStatusLabel(): string;
  getSituationAttribution(): SituationAttribution | undefined;
  setInterpreter(interpreter: CommandInterpreter): void;
  isInFlight(): boolean;
  cancelInFlight(): void;
  isLiveMode(): boolean;
  /** D2: Live registers the on-demand nearby search used by an Ask for food nearby (null = off). */
  setNearbyRequestHandler(handler: ((source: 'ask') => void) | null): void;
  /** D4: Live registers live reasoning over the real lunch candidates (null = off). */
  setCandidateReasoner(
    reasoner: ((request: 'why' | 'closer' | 'quieter') => Promise<{ reason: string; statusLabel: string }>) | null
  ): void;

  setCommandContext(ctx: ActionCommandContext): void;
  getCommandContext(): ActionCommandContext | undefined;

  openConversation(): void;
  closeConversation(reason?: string): void;
  togglePin(): boolean;
  setPinned(pinned: boolean): void;
  handleEsc(): boolean;

  // Guarded transition methods (§2.1 & §2.2)
  beginCommand(text: string, detail?: string, substate?: WorkingSubstate): boolean;
  resolveExecutable(summary: string, plan?: PreparedPlan): boolean;
  resolveNeedsConfirmation(detail: string, pendingPlan?: PreparedPlan): boolean;
  confirmPending(summary: string, plan?: PreparedPlan): boolean;
  rejectPending(): boolean;
  resolveDegraded(notice: string): boolean;
  resolveLongForm(response: string): boolean;
  settle(): boolean;
  resetToIdle(): boolean;

  evaluateAutoCollapse(rule: AutoCollapseRule): boolean;
  submitMessage(
    text: string,
    contextOverride?: ActionCommandContext
  ): { collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan };
  submitMessageAsync?(
    text: string,
    contextOverride?: ActionCommandContext
  ): Promise<{ collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan }>;
  pushHistory(snapshot: ActionHistorySnapshot): void;
  undo(): ActionHistorySnapshot | null;
  getHistory(): readonly ActionHistorySnapshot[];
  getLastHistorySnapshot(): ActionHistorySnapshot | null;
  applyPlanAdjustment(plan: PreparedPlan, summary: string, override?: UserRequestOverride): void;

  subscribe(listener: (snapshot: ActionStoreSnapshot) => void): () => void;
}
