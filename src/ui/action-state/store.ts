/**
 * Action-State Store and State Machine Implementation
 * Governed by LIVING_CONTEXT_V2.md Section 2 and §8 D3/D4/D5.
 */

import { parseMemoryStatement, type MemoryStatement } from '../conversation/memory-statements.js';
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
  type InterpretedCommand,
  type CommandInterpretationContext,
  type SupportedEssentialCategory,
} from '../conversation/grammar.js';
import { roundCoordinate3Decimals, OVERPASS_ATTRIBUTION } from '../../adapters/providers/overpass-places-adapter.js';
import { GOOGLE_PLACES_ATTRIBUTION } from '../../adapters/providers/google-places-adapter.js';
import type { LocationCoords } from '../../adapters/providers/location-port.js';
import { defaultModelCommandInterpreter } from '../conversation/model-interpreter.js';
import {
  globalDecisionLogger,
  type EngineStatus,
} from '../../adapters/model/decision-log.js';
import { departPreparer } from '../../plugins/depart/preparer.js';
import { lunchPreparer } from '../../plugins/lunch/preparer.js';
import { fuelPreparer } from '../../plugins/fuel/index.js';
import { defaultLocationPort, type LocationStatus } from '../../adapters/providers/location-port.js';
import {
  createUserRequestOverride,
  type UserRequestOverride,
} from '../../plugins/depart/request-override.js';
import { formatTime } from '../living-context/presentation.js';
import { derivePlanTimingFacts } from '../view-models/timing.js';
import {
  validateAssistantReply,
  containsSensitiveTraits,
  extractDistanceTokens,
} from '../../adapters/model/fact-checker.js';
import type { SuppliedFacts, AppliedAction } from '../../adapters/model/types.js';
import { buildHumanDerivation, humanizeMemoryKey } from '../review/why-sheet.js';
import { classifyFactSource, provenanceLabel } from '../view-models/provenance.js';
import {
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  createLunchPlacesEvidenceBundle,
  createFuelEvidenceBundle,
} from '../view-models/grounding.js';
import {
  agentTrace,
  AgentTraceBus,
  type AgentTraceRun,
  type AgentTraceStep,
  type AgentTraceLunchCard,
} from '../conversation/agent-trace.js';

export function extractLunchCard(opt: unknown): AgentTraceLunchCard | undefined {
  if (!opt || typeof opt !== 'object') return undefined;
  const o = opt as any;
  const name = o.name || o.label;
  if (!name || typeof name !== 'string') return undefined;
  return {
    name,
    straightLineDistanceLabel: typeof o.straightLineDistanceLabel === 'string' ? o.straightLineDistanceLabel : undefined,
    openingStatus: typeof o.openingStatus === 'string' ? o.openingStatus : (o.openNow === true ? 'open' : o.openNow === false ? 'closed' : undefined),
    rating: typeof o.rating === 'number' ? o.rating : undefined,
    userRatingCount: typeof o.userRatingCount === 'number' ? o.userRatingCount : undefined,
    priceLevel: typeof o.priceLevel === 'number' || typeof o.priceLevel === 'string' ? o.priceLevel : undefined,
    cuisine: typeof o.cuisine === 'string' ? o.cuisine : undefined,
    attribution: typeof o.attribution === 'string'
      ? o.attribution
      : (o.provenance === 'google' ? 'Powered by Google' : o.provenance === 'osm' ? 'OpenStreetMap' : undefined),
    photoUrl: o.photo?.uri && typeof o.photo.uri === 'string' && /^https?:\/\//i.test(o.photo.uri) ? o.photo.uri : undefined,
    photoAttribution: Array.isArray(o.photo?.authorAttributions) && o.photo.authorAttributions[0]?.displayName
      ? o.photo.authorAttributions[0].displayName
      : undefined,
    noiseLevel: typeof o.noiseLevel === 'string' ? o.noiseLevel : undefined,
  };
}

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
  private locationRequestHandler: (() => Promise<LocationStatus>) | null = null;
  private traceBus: AgentTraceBus;
  private activeTraceRunId: string | null = null;

  constructor(options: ActionStateStoreOptions = {}) {
    this.actionState = {
      status: 'idle',
      timestamp: new Date().toISOString(),
      ...options.initialActionState,
    };
    this.interactionState = options.initialInteractionState ?? 'HOME';
    this.reducedMotionOption = options.reducedMotion;
    this.interpreter = options.interpreter ?? defaultModelCommandInterpreter;
    this.locationRequestHandler = options.locationRequestHandler ?? null;
    this.traceBus = options.traceBus ?? agentTrace;

    this.traceBus.subscribe((run) => {
      if (this.activeTraceRunId === run.id) {
        const idx = this.transcriptList.findIndex((m) => m.inFlight);
        if (idx !== -1) {
          this.transcriptList[idx] = { ...this.transcriptList[idx]!, traceRun: run };
          this.notify();
        }
      }
    });
  }

  public getTraceBus(): AgentTraceBus {
    return this.traceBus;
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

  public isInFlight(): boolean {
    return (this.interpreter as any)?.isInFlight?.() ?? false;
  }

  public cancelInFlight(): void {
    const runToCancel = this.activeTraceRunId ?? this.traceBus.getActiveRun()?.id;
    if (runToCancel) {
      this.traceBus.cancelRun(runToCancel, 'Request cancelled');
    }
    (this.interpreter as any)?.cancelInFlight?.();
    const inflightMsg = this.transcriptList.find((m) => m.inFlight);
    if (inflightMsg) {
      const run = runToCancel ? this.traceBus.getRun(runToCancel) : undefined;
      this.transcriptList = this.transcriptList.map((m) =>
        m.id === inflightMsg.id
          ? {
              ...m,
              inFlight: false,
              text: 'Request cancelled.',
              traceRun: run ?? m.traceRun,
            }
          : m
      );
    }
    this.activeTraceRunId = null;
    this.notify();
  }

  /**
   * D2 (DEMO_RESCUE): Live registers this so an Ask request for food nearby triggers the same
   * single-flight Overpass refresh as the "Nearby now" button, at any hour.
   */
  private nearbyRequestHandler: ((source: 'ask') => void) | null = null;

  /**
   * D4 (DEMO_RESCUE): Live registers live reasoning over the real lunch candidates. "Why this?",
   * "closer" and "quieter" on a Live lunch plan are answered by it (Muse Spark when live and in
   * budget, otherwise the labelled deterministic answer); the answer lands in the transcript.
   */
  private candidateReasoner:
    | ((request: 'why' | 'closer' | 'quieter') => Promise<{ reason: string; statusLabel: string }>)
    | null = null;

  public setCandidateReasoner(
    reasoner: ((request: 'why' | 'closer' | 'quieter') => Promise<{ reason: string; statusLabel: string }>) | null
  ): void {
    this.candidateReasoner = reasoner;
  }

  // HABIT-LEARN: "I'm vegetarian" / "remember I like quiet places" are saved as stated, directly.
  private memoryStatementHandler: ((statement: MemoryStatement) => void) | null = null;
  public setMemoryStatementHandler(handler: ((statement: MemoryStatement) => void) | null): void {
    this.memoryStatementHandler = handler;
  }

  /** Answers a memory statement without a proposal or a Confirm step; null when it is not one. */
  private tryMemoryStatement(
    trimmed: string,
    now: string
  ): { collapsed: boolean; rule: AutoCollapseRule; response: string } | null {
    const statement = parseMemoryStatement(trimmed);
    if (!statement || !this.memoryStatementHandler) return null;
    this.memoryStatementHandler(statement);
    this.transcriptList.push({
      id: `msg-${Date.now()}-a`,
      sender: 'assistant',
      text: statement.reply,
      timestamp: now,
    });
    this.notify();
    return { collapsed: false, rule: 'long_form_discussion', response: statement.reply };
  }

  public setNearbyRequestHandler(handler: ((source: 'ask') => void) | null): void {
    this.nearbyRequestHandler = handler;
  }

  private placesFetcher?: (
    category: string,
    coords: LocationCoords
  ) => Promise<{ places: readonly PlaceItem[]; discovery?: string; attribution?: string }>;

  public setPlacesFetcher(
    fetcher: ((category: string, coords: LocationCoords) => Promise<{ places: readonly PlaceItem[]; discovery?: string; attribution?: string }>) | null
  ): void {
    this.placesFetcher = fetcher ?? undefined;
  }

  public setLocationRequestHandler(
    handler: (() => Promise<LocationStatus>) | null
  ): void {
    this.locationRequestHandler = handler;
  }

  public async requestLocationPermission(): Promise<LocationStatus> {
    if (this.locationRequestHandler) {
      return this.locationRequestHandler();
    }
    if (
      'consentAndRequest' in defaultLocationPort &&
      typeof (defaultLocationPort as any).consentAndRequest === 'function'
    ) {
      return (defaultLocationPort as any).consentAndRequest();
    }
    return defaultLocationPort.getLocation();
  }

  public async handleMessageAction(
    msgId: string,
    action: 'allow_location' | 'not_now'
  ): Promise<void> {
    const msg = this.transcriptList.find(m => m.id === msgId);
    let pendingText: string | undefined;
    if (msg) {
      delete msg.actions;
      pendingText = msg.pendingUtterance;
      delete msg.pendingUtterance;
    }

    if (action === 'allow_location') {
      const run = this.traceBus.startRun();
      this.activeTraceRunId = run.id;
      const permStep = this.traceBus.startStep(
        run.id,
        'permission',
        'Location permission',
        'Requesting browser location…'
      );
      const locStatus = await this.requestLocationPermission();
      if (locStatus.status === 'available' && locStatus.coords) {
        this.traceBus.finishStep(permStep.id, 'Permission granted', 'Browser');
        if (pendingText) {
          this.notify();
          if (typeof this.submitMessageAsync === 'function') {
            await this.submitMessageAsync(pendingText, undefined, run);
          } else {
            this.submitMessage(pendingText, undefined, run);
          }
          return;
        }
      } else {
        this.traceBus.failStep(permStep.id, 'Permission denied', 'Browser');
        this.traceBus.completeRun(run.id, 'offline');
        const denyLine = "No problem — I'll work with what I have.";
        this.transcriptList.push({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: denyLine,
          timestamp: new Date().toISOString(),
          traceRun: run,
        });
        this.activeTraceRunId = null;
        this.notify();
        return;
      }
    } else if (action === 'not_now') {
      if (this.activeTraceRunId) {
        this.traceBus.cancelRun(this.activeTraceRunId, 'Not now');
        this.activeTraceRunId = null;
      }
      const notNowLine = "No problem — I'll work with what I have.";
      this.transcriptList.push({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: notNowLine,
        timestamp: new Date().toISOString(),
      });
      this.notify();
      return;
    }

    this.notify();
  }

  public isLiveMode(): boolean {
    return (this.interpreter as any)?.isLiveMode?.() ?? false;
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
      // D3: Live with nothing on Home yet gets a greeting that matches what Live can do now.
      const isLiveIdle = this.commandContext?.sceneId === 'live' && !this.commandContext?.plan;

      let suggestions: readonly string[];
      if (isLiveIdle) {
        suggestions = ['Lunch nearby', 'Somewhere quiet', 'Closer to me', 'Supermarket nearby'];
      } else if (isFuel) {
        suggestions = ['Find gas nearby'];
      } else if (isLunch) {
        suggestions = ['Somewhere quieter', 'Vegetarian options', 'Closer to me'];
      } else {
        suggestions = ['Leave 15 minutes later', 'Take the bus'];
      }

      const welcomeText = "Here's what I can look into for you.";
      this.transcriptList.push({
        id: `msg-${Date.now()}-welcome`,
        sender: 'assistant',
        text: welcomeText,
        suggestions,
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

    const ctx = this.commandContext;
    if (this.currentOverride && (ctx?.plan?.intentId === 'depart' || ctx?.sceneId === 'rain')) {
      const rainBundle = createRainEvidenceBundle({
        snapshot: ctx?.snapshot,
        override: this.currentOverride,
        sceneClockIso: ctx?.snapshot?.asOf,
        timezone: ctx?.plan?.timezone ?? ctx?.snapshot?.timezone,
        userConfirmedKeys: ctx?.userConfirmedKeys,
        isConfirmedHabit: ctx?.userConfirmedKeys?.has('rain_transport_preference'),
        memoryFacts: ctx?.memory,
      });
      this.activeEvidenceBundle = rainBundle;
      this.activeSnapshot = ctx?.snapshot;
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
    contextOverride?: ActionCommandContext,
    existingRun?: AgentTraceRun
  ): { collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan } {
    if (this.isInFlight()) {
      return { collapsed: false, rule: 'unsupported_ask', response: '' };
    }
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

    const remembered = this.tryMemoryStatement(trimmed, now);
    if (remembered) return remembered;

    if (contextOverride && !this.commandContext) {
      this.commandContext = contextOverride;
    }

    const run = existingRun ?? this.traceBus.startRun();
    this.activeTraceRunId = run.id;

    const localStep = this.traceBus.startStep(
      run.id,
      'local',
      'Grammar match',
      'Interpreting command…',
      'offline'
    );
    const { ctx, interpCtx } = this.buildInterpretationContext(contextOverride);
    const cmd = this.interpreter.interpret(trimmed, interpCtx);
    this.traceBus.finishStep(localStep.id, 'Grammar match', 'offline');

    return this.applyCommand(trimmed, cmd, ctx, now, run, 'Local plan · deterministic');
  }

  public async submitMessageAsync(
    text: string,
    contextOverride?: ActionCommandContext,
    existingRun?: AgentTraceRun
  ): Promise<{ collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan }> {
    if (this.isInFlight()) {
      return { collapsed: false, rule: 'unsupported_ask', response: '' };
    }
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

    const rememberedAsync = this.tryMemoryStatement(trimmed, now);
    if (rememberedAsync) return rememberedAsync;

    if (contextOverride && !this.commandContext) {
      this.commandContext = contextOverride;
    }

    const { ctx, interpCtx } = this.buildInterpretationContext(contextOverride);
    const locStatus = defaultLocationPort.getLocation();
    const isLive =
      this.isLiveMode() ||
      this.nearbyRequestHandler !== null ||
      ctx?.sceneId === 'live' ||
      ctx?.snapshot?.signals?.some(s => (s as any).provenance === 'live' || s.kind === 'places_lunch');

    const quick = this.interpreter.interpret(trimmed, interpCtx);
    const quickNeedsLoc =
      quick.intent === 'FIND_LUNCH' ||
      quick.intent === 'FIND_FUEL' ||
      quick.intent === 'FIND_ESSENTIALS';
    if (isLive && quickNeedsLoc && (locStatus.status === 'prompt' || locStatus.status === 'denied')) {
      const run = existingRun ?? this.traceBus.startRun();
      this.activeTraceRunId = run.id;
      const permStep = this.traceBus.startStep(
        run.id,
        'permission',
        'Location permission',
        'Checking browser location permission…'
      );
      if (locStatus.status === 'prompt') {
        this.traceBus.finishStep(permStep.id, 'Location permission required', 'Browser');
      } else {
        this.traceBus.failStep(permStep.id, 'Location access blocked in browser settings', 'Browser');
        this.traceBus.completeRun(run.id, 'offline');
      }
      return this.applyCommand(trimmed, quick, ctx, now, run);
    }

    const run = existingRun ?? this.traceBus.startRun();
    this.activeTraceRunId = run.id;

    const inflightId = `msg-${Date.now()}-inflight`;
    this.transcriptList.push({
      id: inflightId,
      sender: 'assistant',
      text: 'Working on your request',
      timestamp: now,
      inFlight: true,
      traceRun: run,
    });
    this.notify();

    const modelStep = this.traceBus.startStep(
      run.id,
      'model',
      'Model reasoning',
      'Reasoning with live model…'
    );

    let cmd: InterpretedCommand;
    try {
      if (typeof (this.interpreter as any).interpretAsync === 'function') {
        try {
          cmd = await (this.interpreter as any).interpretAsync(trimmed, interpCtx);
        } catch {
          cmd = this.interpreter.interpret(trimmed, interpCtx);
        }
      } else {
        cmd = this.interpreter.interpret(trimmed, interpCtx);
      }
    } finally {
      const idx = this.transcriptList.findIndex(m => m.id === inflightId);
      if (idx !== -1) {
        this.transcriptList.splice(idx, 1);
      }
    }

    const engine = cmd.engineStatus;
    const isLiveEngine = engine === 'meta_model_live';
    const isBaseten = engine === 'baseten_fallback';
    const engineLabel = isLiveEngine
      ? 'Meta Muse Spark · live'
      : isBaseten
      ? 'Baseten fallback'
      : 'Local deterministic';
    const badge = isLiveEngine
      ? 'Meta Muse Spark'
      : isBaseten
      ? 'Baseten fallback'
      : 'offline';

    if (cmd.engineStatus === 'offline_deterministic' && (this.interpreter as any).isLiveMode?.()) {
      const isTimeout = cmd.fallbackReason === 'timeout';
      const isGrounding = cmd.fallbackReason === 'validation_failed' || cmd.fallbackReason === 'unlisted_fact_token';
      const isPaused = cmd.fallbackReason === 'model_paused';
      const label = isTimeout
        ? 'Model timeout · local fallback'
        : isGrounding
        ? 'Reply failed grounding · local fallback'
        : isPaused
        ? 'Model paused · local fallback'
        : 'Model unavailable · local fallback';
      this.traceBus.failStep(modelStep.id, label, 'offline');
    } else {
      this.traceBus.finishStep(modelStep.id, engineLabel, badge);
    }

    if (cmd.intent === 'FIND_ESSENTIALS') {
      return this.handleEssentialsAsync(trimmed, cmd, ctx, now, run, engineLabel);
    }

    return this.applyCommand(trimmed, cmd, ctx, now, run, engineLabel);
  }

  private buildInterpretationContext(contextOverride?: ActionCommandContext): {
    ctx: ActionCommandContext | undefined;
    interpCtx: CommandInterpretationContext;
  } {
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
            snapshot: ctx?.snapshot,
            override: this.currentOverride,
            sceneClockIso: ctx?.snapshot?.asOf,
            timezone: ctx?.plan?.timezone ?? ctx?.snapshot?.timezone,
            userConfirmedKeys: ctx?.userConfirmedKeys,
            isConfirmedHabit: ctx?.userConfirmedKeys?.has('rain_transport_preference'),
            memoryFacts: ctx?.memory,
          })
        : ctx?.plan?.intentId === 'lunch' || ctx?.sceneId === 'away-lunch'
          ? createLunchEvidenceBundle({
              snapshot: ctx?.snapshot,
              sceneClockIso: ctx?.snapshot?.asOf,
              timezone: ctx?.plan?.timezone ?? ctx?.snapshot?.timezone,
              userConfirmedKeys: ctx?.userConfirmedKeys,
              isConfirmedTaste: ctx?.userConfirmedKeys?.has('taste_preference_lunch_cuisine'),
              memory: ctx?.memory,
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

    // Gather known facts from MemoryPort memory facts (never plan overlay)
    const knownFactKeysSet = new Set<string>();
    if (ctx?.memory) {
      for (const f of ctx.memory) {
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

    const validTimes: string[] = [];
    const validPlaces: string[] = [];
    const suppliedDistances: string[] = [];
    const suppliedRatings: string[] = [];
    const suppliedDurations: string[] = [];
    const suppliedOpenStatuses: string[] = [];
    let suppliedWeather: string | undefined;

    if (ctx?.plan) {
      if (ctx.plan.leaveAt) validTimes.push(ctx.plan.leaveAt);
      if (ctx.plan.prepareAt) validTimes.push(ctx.plan.prepareAt);
      if (ctx.plan.apptAt) validTimes.push(ctx.plan.apptAt);
      if (ctx.plan.subjectTitle) validPlaces.push(ctx.plan.subjectTitle);
      if ((ctx.plan as any).destination) validPlaces.push((ctx.plan as any).destination);

      if (ctx.plan.optionsOrSteps) {
        for (const opt of ctx.plan.optionsOrSteps) {
          if (typeof opt === 'object' && opt !== null) {
            const o = opt as any;
            if (o.name && !validPlaces.includes(o.name)) validPlaces.push(o.name);
            if (o.label && !validPlaces.includes(o.label)) validPlaces.push(o.label);
            if (o.straightLineDistanceLabel) suppliedDistances.push(o.straightLineDistanceLabel);
            if (o.distanceMinutes !== undefined) {
              suppliedDurations.push(`${o.distanceMinutes} min`);
              suppliedDurations.push(`${o.distanceMinutes} minutes`);
              suppliedDurations.push(String(o.distanceMinutes));
            }
            if (o.rating !== undefined) suppliedRatings.push(String(o.rating));
            if (o.openingStatus) suppliedOpenStatuses.push(o.openingStatus);
            if (o.openNow !== undefined) suppliedOpenStatuses.push(o.openNow ? 'open' : 'closed');
          }
        }
      }
    }

    if (ctx?.snapshot?.signals) {
      for (const s of ctx.snapshot.signals) {
        if (s.kind === 'weather_current' || s.kind === 'weather') {
          suppliedWeather = (s as any).weather || (s as any).condition || s.kind;
        }
      }
    }

    const nonSensitiveHabits: string[] = [];
    if (ctx?.memory) {
      for (const f of ctx.memory) {
        const key = f.key.toLowerCase();
        if (
          !containsSensitiveTraits(key) &&
          !containsSensitiveTraits(String(f.value ?? ''))
        ) {
          nonSensitiveHabits.push(`${f.key}: ${String(f.value ?? '')}`);
        }
      }
    }

    return {
      ctx,
      interpCtx: {
        availableModes: availableModes.length > 0 ? availableModes : ['drive', 'bus'],
        currentPlanIntent: ctx?.plan?.intentId,
        availableSignalIds,
        knownFactKeys,
        confirmedFactKeys,
        validTimes,
        validPlaces,
        sceneId: ctx?.sceneId,
        evidenceBundle,
        suppliedFacts: {
          cardType: ctx?.plan?.intentId ?? ctx?.sceneId,
          places: validPlaces,
          times: validTimes,
          distances: suppliedDistances,
          ratings: suppliedRatings,
          durations: suppliedDurations,
          openStatuses: suppliedOpenStatuses,
          weather: suppliedWeather,
          routes: availableModes,
          habits: nonSensitiveHabits,
        },
      },
    };
  }

  private extractSuppliedFacts(ctx?: ActionCommandContext): SuppliedFacts {
    const times: string[] = [];
    const places: string[] = [];
    const distances: string[] = [];
    const ratings: string[] = [];
    const durations: string[] = [];
    const weather: string[] = [];
    const openStatuses: string[] = [];
    const habits: string[] = [];

    if (ctx?.plan) {
      if (ctx.plan.leaveAt) times.push(ctx.plan.leaveAt);
      if (ctx.plan.prepareAt) times.push(ctx.plan.prepareAt);
      if (ctx.plan.apptAt) times.push(ctx.plan.apptAt);
      if (ctx.plan.subjectTitle) places.push(ctx.plan.subjectTitle);
      if ((ctx.plan as any).destination) places.push((ctx.plan as any).destination);

      if (ctx.plan.optionsOrSteps) {
        for (const opt of ctx.plan.optionsOrSteps) {
          if (typeof opt === 'object' && opt !== null) {
            const o = opt as any;
            if (o.name && !places.includes(o.name)) places.push(o.name);
            if (o.label && !places.includes(o.label)) places.push(o.label);
            if (o.straightLineDistanceLabel) distances.push(o.straightLineDistanceLabel);
            if (o.label) {
              const labelDists = extractDistanceTokens(o.label);
              for (const ld of labelDists) {
                if (!distances.includes(ld)) distances.push(ld);
              }
            }
            if (o.distanceMinutes !== undefined) {
              durations.push(`${o.distanceMinutes} min`);
              durations.push(`${o.distanceMinutes} minutes`);
              durations.push(String(o.distanceMinutes));
            }
            if (o.rating !== undefined) ratings.push(String(o.rating));
            if (o.openingStatus) openStatuses.push(o.openingStatus);
            if (o.openNow !== undefined) openStatuses.push(o.openNow ? 'open' : 'closed');
          }
        }
      }
    }

    if (ctx?.snapshot?.signals) {
      for (const s of ctx.snapshot.signals) {
        if (s.kind === 'weather_current' || s.kind === 'weather') {
          const w = (s as any).weather || (s as any).condition || (s as any).value?.condition || s.kind;
          if (typeof w === 'string') weather.push(w);
          if ((s as any).value?.temperature !== undefined) {
            weather.push(`${(s as any).value.temperature}°C`);
            weather.push(String((s as any).value.temperature));
          }
        }
      }
    }

    if (ctx?.memory) {
      for (const f of ctx.memory) {
        const key = f.key.toLowerCase();
        if (
          !containsSensitiveTraits(key) &&
          !containsSensitiveTraits(String(f.value ?? ''))
        ) {
          habits.push(`${f.key}: ${String(f.value ?? '')}`);
        }
      }
    }

    return {
      times,
      places,
      distances,
      ratings,
      durations,
      weather,
      openStatuses,
      habits,
      prices: [],
    };
  }

  private pushAssistantMessage(
    item: MessageItem,
    run?: AgentTraceRun,
    planForCard?: PreparedPlan,
    engineLabel?: string,
    factCheck?: { ran: boolean; passed: boolean }
  ): void {
    if (run) {
      const isOffline = run.steps.some((s) => s.kind === 'local') || !this.isLiveMode();

      // Emit fact_check step ONLY when validateAssistantReply actually ran
      if (factCheck?.ran && !run.steps.some((s) => s.kind === 'fact_check') && !item.actions) {
        const factStep = this.traceBus.startStep(
          run.id,
          'fact_check',
          'Grounding check',
          'Validating reply against facts…',
          isOffline ? 'offline' : undefined
        );
        this.traceBus.finishStep(
          factStep.id,
          factCheck.passed ? 'Passed grounded check' : 'Reply replaced by template',
          isOffline ? 'offline' : undefined
        );
      }

      // Ensure render step
      if (!run.steps.some((s) => s.kind === 'render') && !item.actions) {
        const renderStep = this.traceBus.startStep(
          run.id,
          'render',
          'Answer presentation',
          'Rendering answer…',
          isOffline ? 'offline' : undefined
        );
        this.traceBus.finishStep(
          renderStep.id,
          isOffline ? 'Local plan · deterministic' : 'Answer ready',
          isOffline ? 'offline' : undefined
        );
      }

      // Extract lunch card if this is a lunch plan
      const effectivePlan = planForCard ?? this.commandContext?.plan ?? this.actionState.plan;
      let lunchCard: AgentTraceLunchCard | undefined;
      if (effectivePlan?.intentId === 'lunch' && effectivePlan.optionsOrSteps) {
        const top = effectivePlan.optionsOrSteps.find((o) => o && typeof o === 'object');
        if (top) {
          lunchCard = extractLunchCard(top);
        }
      }

      const finalEngine =
        engineLabel ??
        (run.steps.find((s) => s.kind === 'model')?.badge || (isOffline ? 'Local plan · deterministic' : 'Meta Muse Spark · live'));
      if (!item.actions) {
        this.traceBus.completeRun(run.id, finalEngine, lunchCard);
      }
      item.traceRun = run;
      if (lunchCard && !item.actions) {
        item.lunchCard = lunchCard;
      }
      if (this.activeTraceRunId === run.id && !item.actions) {
        this.activeTraceRunId = null;
      }
    }
    this.transcriptList.push(item);
  }

  private async handleEssentialsAsync(
    trimmed: string,
    cmd: InterpretedCommand,
    ctx?: ActionCommandContext,
    _now: string = new Date().toISOString(),
    run?: AgentTraceRun,
    engineLabel?: string,
    inflightMsgId?: string
  ): Promise<{ collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan }> {
    const isLive =
      this.isLiveMode() ||
      this.nearbyRequestHandler !== null ||
      ctx?.sceneId === 'live' ||
      ctx?.snapshot?.signals?.some(s => (s as any).provenance === 'live' || s.kind === 'places_lunch');

    const category = (cmd.slots.category as SupportedEssentialCategory) ?? 'supermarket';
    const categoryLabel =
      category === 'shopping_mall'
        ? 'shopping malls'
        : category === 'convenience'
        ? 'convenience stores'
        : category === 'pharmacy'
        ? 'pharmacies'
        : 'supermarkets';

    if (!isLive) {
      const offlineMsg = `Live places search is needed to find nearby ${categoryLabel}.`;
      this.resolveDegraded(offlineMsg);
      if (inflightMsgId) {
        const idx = this.transcriptList.findIndex(m => m.id === inflightMsgId);
        if (idx !== -1) {
          this.transcriptList[idx] = {
            id: inflightMsgId,
            sender: 'assistant',
            text: offlineMsg,
            timestamp: new Date().toISOString(),
            inFlight: false,
            traceRun: run,
          };
        }
      } else {
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: offlineMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
      }
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: offlineMsg };
    }

    const locStatus = defaultLocationPort.getLocation();
    if (locStatus.status === 'prompt') {
      const promptMsg = 'I need your location to find places near you.';
      this.resolveDegraded('Location permission required.');
      if (inflightMsgId) {
        const idx = this.transcriptList.findIndex(m => m.id === inflightMsgId);
        if (idx !== -1) {
          this.transcriptList.splice(idx, 1);
        }
      }
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: promptMsg,
        timestamp: new Date().toISOString(),
        actions: [
          {
            id: 'act-allow-loc',
            label: 'Allow location',
            variant: 'primary',
            action: 'allow_location',
          },
          {
            id: 'act-not-now',
            label: 'Not now',
            variant: 'secondary',
            action: 'not_now',
          },
        ],
        pendingUtterance: trimmed,
      }, run, undefined, 'offline');
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: promptMsg };
    }

    if (locStatus.status === 'denied' || !locStatus.coords) {
      const deniedMsg =
        'Location access is blocked in your browser settings. Please enable location in your browser to find places near you.';
      this.resolveDegraded(deniedMsg);
      if (inflightMsgId) {
        const idx = this.transcriptList.findIndex(m => m.id === inflightMsgId);
        if (idx !== -1) {
          this.transcriptList.splice(idx, 1);
        }
      }
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: deniedMsg,
        timestamp: new Date().toISOString(),
      }, run, undefined, 'offline');
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: deniedMsg };
    }

    const activeRun = run ?? this.traceBus.startRun();
    this.activeTraceRunId = activeRun.id;

    const placesStep = this.traceBus.startStep(
      activeRun.id,
      'places',
      'Places lookup',
      `Searching nearby ${categoryLabel}…`,
      'live'
    );

    let places: readonly PlaceItem[] = [];
    let discovery = 'osm';
    let attribution = OVERPASS_ATTRIBUTION;

    try {
      if (this.placesFetcher) {
        const fetchRes = await this.placesFetcher(category, locStatus.coords);
        places = fetchRes.places;
        discovery = fetchRes.discovery ?? 'osm';
        attribution = fetchRes.attribution ?? (discovery === 'google' ? GOOGLE_PLACES_ATTRIBUTION : OVERPASS_ATTRIBUTION);
      } else {
        const roundedLat = roundCoordinate3Decimals(locStatus.coords.lat);
        const roundedLng = roundCoordinate3Decimals(locStatus.coords.lng);
        const res = await fetch(`/api/places?lat=${roundedLat}&lng=${roundedLng}&amenity=${category}&radius=1500&fresh=1`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`Places API responded with HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          places?: readonly PlaceItem[];
          discovery?: string;
          attribution?: string;
        };
        places = data.places ?? [];
        discovery = data.discovery ?? 'osm';
        attribution = data.attribution ?? (discovery === 'google' ? GOOGLE_PLACES_ATTRIBUTION : OVERPASS_ATTRIBUTION);
      }
    } catch {
      this.traceBus.failStep(placesStep.id, `Places lookup unavailable`, 'offline');
      this.traceBus.completeRun(activeRun.id, engineLabel);
      const errMsg = `Unable to find nearby ${categoryLabel} right now.`;
      this.resolveDegraded(errMsg);
      if (inflightMsgId) {
        const idx = this.transcriptList.findIndex(m => m.id === inflightMsgId);
        if (idx !== -1) {
          this.transcriptList[idx] = {
            id: inflightMsgId,
            sender: 'assistant',
            text: errMsg,
            timestamp: new Date().toISOString(),
            inFlight: false,
            traceRun: activeRun,
          };
        }
      } else {
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errMsg,
          timestamp: new Date().toISOString(),
        }, activeRun, undefined, engineLabel);
      }
      this.activeTraceRunId = null;
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: errMsg };
    }

    const providerLabel = discovery === 'google' ? 'Google Places' : 'OpenStreetMap';

    if (places.length === 0) {
      this.traceBus.finishStep(placesStep.id, `0 places found via ${providerLabel}`, 'live');
      this.traceBus.completeRun(activeRun.id, engineLabel);
      const emptyMsg = `No ${categoryLabel} found nearby within 1.5 km on ${providerLabel}.`;
      this.resolveDegraded(emptyMsg);
      if (inflightMsgId) {
        const idx = this.transcriptList.findIndex(m => m.id === inflightMsgId);
        if (idx !== -1) {
          this.transcriptList[idx] = {
            id: inflightMsgId,
            sender: 'assistant',
            text: emptyMsg,
            timestamp: new Date().toISOString(),
            inFlight: false,
            traceRun: activeRun,
          };
        }
      } else {
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: emptyMsg,
          timestamp: new Date().toISOString(),
        }, activeRun, undefined, engineLabel);
      }
      this.activeTraceRunId = null;
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: emptyMsg };
    }

    this.traceBus.finishStep(placesStep.id, `Found ${places.length} places via ${providerLabel}`, 'live');

    // Sort by straightLineDistanceMeters
    const sorted = [...places].sort((a, b) => (a.straightLineDistanceMeters ?? 0) - (b.straightLineDistanceMeters ?? 0));
    const top = sorted[0]!;

    const topCard: AgentTraceLunchCard = {
      name: top.name,
      straightLineDistanceLabel: top.straightLineDistanceLabel,
      openingStatus: top.openingStatus,
      rating: top.rating,
      userRatingCount: top.userRatingCount,
      priceLevel: top.priceLevel,
      cuisine: top.cuisine,
      attribution: top.attribution ?? attribution,
      photoUrl: top.photo?.uri,
      photoAttribution: top.photo?.authorAttributions?.[0]?.displayName,
    };

    const renderStep = this.traceBus.startStep(activeRun.id, 'render', 'Answer presentation', 'Top recommendation ready');
    this.traceBus.finishStep(renderStep.id, 'Top recommendation ready');
    this.traceBus.completeRun(activeRun.id, engineLabel, topCard);

    const distPart = topCard.straightLineDistanceLabel ? ` · ${topCard.straightLineDistanceLabel}` : '';
    const openPart = topCard.openingStatus === 'open' ? ' · Open now' : topCard.openingStatus === 'closed' ? ' · Closed' : '';
    const responseText = `Found ${topCard.name}${distPart}${openPart}.`;

    if (inflightMsgId) {
      const idx = this.transcriptList.findIndex(m => m.id === inflightMsgId);
      if (idx !== -1) {
        this.transcriptList[idx] = {
          id: inflightMsgId,
          sender: 'assistant',
          text: responseText,
          timestamp: new Date().toISOString(),
          inFlight: false,
          traceRun: activeRun,
          lunchCard: topCard,
        };
      }
    } else {
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: responseText,
        timestamp: new Date().toISOString(),
        lunchCard: topCard,
      }, activeRun, undefined, engineLabel);
    }

    this.activeTraceRunId = null;
    this.resolveExecutable(responseText);
    this.notify();

    return {
      collapsed: false,
      rule: 'executable_determinate',
      response: responseText,
    };
  }

  private handleEssentialsSync(
    trimmed: string,
    cmd: InterpretedCommand,
    ctx?: ActionCommandContext,
    now: string = new Date().toISOString(),
    run?: AgentTraceRun,
    engineLabel?: string
  ): { collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan } {
    const isLive =
      this.isLiveMode() ||
      this.nearbyRequestHandler !== null ||
      ctx?.sceneId === 'live' ||
      ctx?.snapshot?.signals?.some(s => (s as any).provenance === 'live' || s.kind === 'places_lunch');

    const category = (cmd.slots.category as SupportedEssentialCategory) ?? 'supermarket';
    const categoryLabel =
      category === 'shopping_mall'
        ? 'shopping malls'
        : category === 'convenience'
        ? 'convenience stores'
        : category === 'pharmacy'
        ? 'pharmacies'
        : 'supermarkets';

    if (!isLive) {
      const offlineMsg = `Live places search is needed to find nearby ${categoryLabel}.`;
      this.resolveDegraded(offlineMsg);
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: offlineMsg,
        timestamp: new Date().toISOString(),
      }, run, undefined, engineLabel);
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: offlineMsg };
    }

    const locStatus = defaultLocationPort.getLocation();
    if (locStatus.status === 'prompt') {
      const promptMsg = 'I need your location to find places near you.';
      this.resolveDegraded('Location permission required.');
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: promptMsg,
        timestamp: new Date().toISOString(),
        actions: [
          {
            id: 'act-allow-loc',
            label: 'Allow location',
            variant: 'primary',
            action: 'allow_location',
          },
          {
            id: 'act-not-now',
            label: 'Not now',
            variant: 'secondary',
            action: 'not_now',
          },
        ],
        pendingUtterance: trimmed,
      }, run, undefined, 'offline');
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: promptMsg };
    }

    if (locStatus.status === 'denied' || !locStatus.coords) {
      const deniedMsg =
        'Location access is blocked in your browser settings. Please enable location in your browser to find places near you.';
      this.resolveDegraded(deniedMsg);
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: deniedMsg,
        timestamp: new Date().toISOString(),
      }, run, undefined, 'offline');
      this.notify();
      return { collapsed: false, rule: 'degraded_failure', response: deniedMsg };
    }

    const activeRun = run ?? this.traceBus.startRun();
    this.activeTraceRunId = activeRun.id;
    const inflightMsgId = `msg-${Date.now()}-a`;
    this.transcriptList.push({
      id: inflightMsgId,
      sender: 'assistant',
      text: 'Working on your request',
      timestamp: new Date().toISOString(),
      inFlight: true,
      traceRun: activeRun,
    });
    this.notify();

    void this.handleEssentialsAsync(trimmed, cmd, ctx, now, activeRun, engineLabel, inflightMsgId);

    return {
      collapsed: false,
      rule: 'executable_determinate',
      response: `Searching nearby ${categoryLabel}…`,
    };
  }

  private applyCommand(
    trimmed: string,
    cmd: InterpretedCommand,
    ctx?: ActionCommandContext,
    now: string = new Date().toISOString(),
    run?: AgentTraceRun,
    engineLabel?: string
  ): { collapsed: boolean; rule: AutoCollapseRule; response: string; plan?: PreparedPlan } {
    const suppliedFacts = this.extractSuppliedFacts(ctx);

    const isLive =
      this.isLiveMode() ||
      this.nearbyRequestHandler !== null ||
      ctx?.sceneId === 'live' ||
      ctx?.snapshot?.signals?.some(s => (s as any).provenance === 'live' || s.kind === 'places_lunch');

    const needsLocation =
      cmd.intent === 'FIND_LUNCH' ||
      cmd.intent === 'FIND_FUEL' ||
      cmd.intent === 'FIND_ESSENTIALS' ||
      (cmd.intent === 'WHY' && ctx?.plan?.intentId === 'lunch');

    if (isLive && needsLocation) {
      const locStatus = defaultLocationPort.getLocation();
      if (locStatus.status === 'prompt') {
        const promptMsg = 'I need your location to find places near you.';
        this.resolveDegraded('Location permission required.');
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: promptMsg,
          timestamp: new Date().toISOString(),
          actions: [
            {
              id: 'act-allow-loc',
              label: 'Allow location',
              variant: 'primary',
              action: 'allow_location',
            },
            {
              id: 'act-not-now',
              label: 'Not now',
              variant: 'secondary',
              action: 'not_now',
            },
          ],
          pendingUtterance: trimmed,
        }, run, undefined, 'offline');
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: promptMsg };
      }
      if (locStatus.status === 'denied') {
        const deniedMsg =
          'Location access is blocked in your browser settings. Please enable location in your browser to find places near you.';
        this.resolveDegraded(deniedMsg);
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: deniedMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, 'offline');
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: deniedMsg };
      }
    }

    // D4: live candidate reasoning for Live lunch plans (why / closer / quieter).
    const lunchFilters = cmd.intent === 'FIND_LUNCH' ? cmd.slots.filters ?? [] : [];
    const candidateRequest: 'why' | 'closer' | 'quieter' | null =
      cmd.intent === 'WHY'
        ? 'why'
        : lunchFilters.length === 1 && lunchFilters[0] === 'nearer'
        ? 'closer'
        : lunchFilters.length === 1 && lunchFilters[0] === 'quieter'
        ? 'quieter'
        : null;
    if (
      this.candidateReasoner &&
      candidateRequest &&
      ctx?.sceneId === 'live' &&
      ctx.plan?.intentId === 'lunch'
    ) {
      const msgId = `msg-${Date.now()}-a`;
      const candRun = run ?? this.traceBus.startRun();
      this.activeTraceRunId = candRun.id;
      const modelStep = this.traceBus.startStep(
        candRun.id,
        'model',
        'Candidate reasoning',
        'Evaluating candidates…'
      );
      this.transcriptList.push({
        id: msgId,
        sender: 'assistant',
        text: 'Working on your request',
        timestamp: new Date().toISOString(),
        inFlight: true,
        traceRun: candRun,
      });
      this.notify();
      void this.candidateReasoner(candidateRequest)
        .then(r => {
          this.traceBus.finishStep(modelStep.id, r.statusLabel, r.statusLabel.includes('live') ? 'Meta Muse Spark' : 'offline');
          const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, cmd.intent) : { valid: false };
          return { text: check.valid && cmd.reply ? cmd.reply : `${r.reason} · ${r.statusLabel}`, statusLabel: r.statusLabel, checkValid: check.valid };
        })
        .catch(() => {
          this.traceBus.failStep(modelStep.id, 'Candidate reasoning unavailable', 'offline');
          const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, cmd.intent) : { valid: false };
          return { text: check.valid && cmd.reply ? cmd.reply : 'I could not reason about these places right now.', statusLabel: 'offline', checkValid: check.valid };
        })
        .then(({ text, statusLabel, checkValid }) => {
          if (candRun.status === 'cancelled') {
            return;
          }
          if (cmd.reply) {
            const factStep = this.traceBus.startStep(candRun.id, 'fact_check', 'Grounding check', 'Validating reply against facts…');
            this.traceBus.finishStep(factStep.id, checkValid ? 'Passed grounded check' : 'Reply replaced by template');
          }
          const renderStep = this.traceBus.startStep(candRun.id, 'render', 'Answer presentation', 'Rendering answer…');
          this.traceBus.finishStep(renderStep.id, 'Answer ready');
          const topCard = extractLunchCard(ctx?.plan?.optionsOrSteps?.[0]);
          this.traceBus.completeRun(candRun.id, statusLabel, topCard);

          const idx = this.transcriptList.findIndex(m => m.id === msgId);
          if (idx !== -1) {
            if (!this.transcriptList[idx]!.inFlight && this.transcriptList[idx]!.text === 'Request cancelled.') {
              return;
            }
            this.transcriptList[idx] = {
              ...this.transcriptList[idx]!,
              text,
              inFlight: false,
              traceRun: candRun,
              lunchCard: topCard,
            };
          }
          this.activeTraceRunId = null;
          this.notify();
        });
      return { collapsed: false, rule: 'long_form_discussion', response: 'Thinking about these places…' };
    }

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
          evidenceBundle: this.activeEvidenceBundle,
          snapshot: ctx?.snapshot,
        });
        this.confirmPending('Plan confirmed for this time only', confirmedPlan);
        const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'ACCEPT') : { valid: false };
        const response = check.valid && cmd.reply ? cmd.reply : 'Confirmed for this time only. Your departure plan is updated.';
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: response,
          timestamp: new Date().toISOString(),
        }, run, confirmedPlan, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });
        const collapsed = this.evaluateAutoCollapse('executable_determinate');
        this.notify();
        return { collapsed, rule: 'executable_determinate', response, plan: confirmedPlan };
      }

      this.settle();
      const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'ACCEPT') : { valid: false };
      const response = check.valid && cmd.reply ? cmd.reply : 'Plan accepted.';
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: response,
        timestamp: new Date().toISOString(),
      }, run, undefined, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });
      const collapsed = this.evaluateAutoCollapse('executable_determinate');
      this.notify();
      return { collapsed, rule: 'executable_determinate', response };
    }

    // 2. UNDO ('Undo', 'Revert')
    if (cmd.intent === 'UNDO') {
      const restored = this.undo();
      const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'UNDO') : { valid: false };
      const response = check.valid && cmd.reply ? cmd.reply : (restored
        ? 'Restored prior plan. Changes have been undone.'
        : 'Nothing to undo.');
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: response,
        timestamp: new Date().toISOString(),
      }, run, restored?.planState ?? undefined, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });
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

      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: explanation,
        timestamp: new Date().toISOString(),
      }, run, activePlan ?? undefined, engineLabel);
      this.resolveLongForm(explanation);
      this.notify();
      return { collapsed: false, rule: 'long_form_discussion', response: explanation };
    }

    // 4. LEAVE_LATER ('Can I leave later?', 'Leave 15 minutes later')
    if (cmd.intent === 'LEAVE_LATER') {
      if (!ctx || !ctx.plan || ctx.plan.intentId !== 'depart' || !ctx.candidate || !ctx.snapshot || !ctx.memory) {
        const noPlanMsg = "There's no departure plan to adjust right now.";
        this.resolveDegraded(noPlanMsg);
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: noPlanMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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

        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: comparisonText,
          timestamp: new Date().toISOString(),
          needsConfirmation: true,
          pendingPlan: safePlan ?? undefined,
          comparisonOptions,
        }, run, safePlan ?? undefined, engineLabel);

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
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: lateMsg,
          timestamp: new Date().toISOString(),
          needsConfirmation: true,
          pendingPlan: newPlan,
        }, run, newPlan, engineLabel);
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
        evidenceBundle: this.activeEvidenceBundle,
        snapshot: ctx.snapshot,
      });

      this.currentOverride = override;

      const rainBundle = createRainEvidenceBundle({
        snapshot: ctx.snapshot,
        override,
        sceneClockIso: ctx.snapshot?.asOf,
        timezone: ctx.plan?.timezone ?? ctx.snapshot?.timezone,
        userConfirmedKeys: ctx.userConfirmedKeys,
        isConfirmedHabit: ctx.userConfirmedKeys?.has('rain_transport_preference'),
        memoryFacts: ctx.memory,
      });
      this.activeEvidenceBundle = rainBundle;
      this.activeSnapshot = ctx.snapshot;

      this.resolveExecutable(
        `Depart plan updated to leave ${deltaMinutes} min later.`,
        newPlan
      );

      const appliedAction: AppliedAction = {
        intent: 'LEAVE_LATER',
        deltaMinutes,
        leaveTime: newPlan.headline,
      };
      const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'LEAVE_LATER', appliedAction) : { valid: false };
      const successMsg = check.valid && cmd.reply ? cmd.reply : `Updated your plan to leave ${deltaMinutes} minutes later: ${newPlan.headline}.`;
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      }, run, newPlan, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });

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
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: noPlanMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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
        evidenceBundle: this.activeEvidenceBundle,
        snapshot: ctx.snapshot,
      });

      this.currentOverride = override;

      const rainBundle = createRainEvidenceBundle({
        snapshot: ctx.snapshot,
        override,
        sceneClockIso: ctx.snapshot?.asOf,
        timezone: ctx.plan?.timezone ?? ctx.snapshot?.timezone,
        userConfirmedKeys: ctx.userConfirmedKeys,
        isConfirmedHabit: ctx.userConfirmedKeys?.has('rain_transport_preference'),
        memoryFacts: ctx.memory,
      });
      this.activeEvidenceBundle = rainBundle;
      this.activeSnapshot = ctx.snapshot;

      this.resolveExecutable(`Primary route switched to ${mode}.`, newPlan);
      const appliedAction: AppliedAction = {
        intent: 'CHANGE_ROUTE',
        mode,
      };
      const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'CHANGE_ROUTE', appliedAction) : { valid: false };
      const successMsg = check.valid && cmd.reply ? cmd.reply : `Switched primary route to ${mode}: ${newPlan.headline}.`;
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      }, run, newPlan, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });

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
          const promptMsg = 'I need your location to find places near you.';
          this.resolveDegraded('Location permission required.');
          this.pushAssistantMessage({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: promptMsg,
            timestamp: new Date().toISOString(),
            actions: [
              {
                id: 'act-allow-loc',
                label: 'Allow location',
                variant: 'primary',
                action: 'allow_location',
              },
              {
                id: 'act-not-now',
                label: 'Not now',
                variant: 'secondary',
                action: 'not_now',
              },
            ],
            pendingUtterance: trimmed,
          }, run, undefined, engineLabel);
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: promptMsg };
        }
        if (locStatus.status === 'denied') {
          const deniedMsg =
            'Location access is blocked in your browser settings. Please enable location in your browser to find places near you.';
          this.resolveDegraded(deniedMsg);
          this.pushAssistantMessage({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: deniedMsg,
            timestamp: new Date().toISOString(),
          }, run, undefined, engineLabel);
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: deniedMsg };
        }
        if (locStatus.status === 'unavailable' || !locStatus.coords) {
          const degradedMsg = 'Location is currently unavailable. Please enter coordinates manually.';
          this.resolveDegraded(degradedMsg);
          this.pushAssistantMessage({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: degradedMsg,
            timestamp: new Date().toISOString(),
          }, run, undefined, engineLabel);
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: degradedMsg };
        }

        let placesStep: AgentTraceStep | undefined;
        if (run && !this.nearbyRequestHandler) {
          placesStep = this.traceBus.startStep(run.id, 'places', 'Places lookup', 'Checking simulated places…', 'simulated');
        }
        try {
          const provider = mockLunchAdapter.getProvider();
          let count = 0;
          if (provider.searchNearbySync) {
            const res = provider.searchNearbySync({ location: locStatus.coords, category: 'restaurant', radiusMeters: 10000 });
            count = Array.isArray(res) ? res.length : 0;
          }
          if (placesStep) {
            this.traceBus.finishStep(placesStep.id, `${count} simulated places (demo provider)`, 'simulated');
          }
        } catch {
          if (placesStep) {
            this.traceBus.failStep(placesStep.id, 'Places provider failure', 'simulated');
          }
          const errorMsg = 'Unable to search for lunch places: places provider failure. Fails closed.';
          this.resolveDegraded(errorMsg);
          this.pushAssistantMessage({
            id: `msg-${Date.now()}-a`,
            sender: 'assistant',
            text: errorMsg,
            timestamp: new Date().toISOString(),
          }, run, undefined, engineLabel);
          this.notify();
          return { collapsed: false, rule: 'degraded_failure', response: errorMsg };
        }
      }

      // D2: in Live, an unfiltered ask (or one with no lunch card to filter yet) runs the same
      // on-demand nearby search as "Nearby now"; results land on Home when the provider answers.
      const hasLunchPlan = Boolean(ctx?.plan && ctx.plan.intentId === 'lunch' && ctx.candidate && ctx.snapshot && ctx.memory);
      if (isDynamicLunch && this.nearbyRequestHandler && (filters.length === 0 || !hasLunchPlan)) {
        this.beginCommand(trimmed, 'Searching nearby', 'comparing');
        this.nearbyRequestHandler('ask');
        const defaultAskMsg =
          filters.length > 0
            ? `Looking for restaurants near you… Ask for ${filtersDesc} again once they show on Home.`
            : 'Looking for restaurants near you… They will show on Home in a moment.';
        const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'FIND_LUNCH') : { valid: false };
        const askMsg = check.valid && cmd.reply ? cmd.reply : defaultAskMsg;
        this.resolveExecutable(askMsg);
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: askMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });
        const collapsed = this.evaluateAutoCollapse('executable_determinate');
        this.notify();
        return { collapsed, rule: 'executable_determinate', response: askMsg };
      }

      if (!ctx || !ctx.plan || ctx.plan.intentId !== 'lunch' || !ctx.candidate || !ctx.snapshot || !ctx.memory) {
        const noPlanMsg = "There's no active lunch recommendation to filter right now.";
        this.resolveDegraded(noPlanMsg);
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: noPlanMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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
          memory: ctx.memory,
        });
        this.activeEvidenceBundle = lunchBundle;
        this.activeSnapshot = ctx.snapshot;
      }

      const topOption = newPlan.optionsOrSteps?.[0];
      const topName =
        typeof topOption === 'object' && topOption !== null
          ? (topOption as { name?: string; label?: string }).name || (topOption as { name?: string; label?: string }).label
          : 'top recommendation';

      const appliedAction: AppliedAction = {
        intent: 'FIND_LUNCH',
        topPickName: topName,
      };
      const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'FIND_LUNCH', appliedAction) : { valid: false };
      const successMsg = check.valid && cmd.reply ? cmd.reply : `Updated lunch options based on your request (${filtersDesc}): ${topName} is now your top recommendation.`;
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      }, run, newPlan, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });

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
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: question,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
        this.resolveNeedsConfirmation(question);
        this.notify();
        return { collapsed: false, rule: 'needs_confirmation', response: question };
      }

      this.pendingFuelDisambiguation = false;
      this.beginCommand(trimmed, 'Finding nearby gas stations · simulated', 'comparing');

      const locStatus = defaultLocationPort.getLocation();
      if (locStatus.status === 'prompt') {
        const promptMsg = 'I need your location to find places near you.';
        this.resolveDegraded('Location permission required.');
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: promptMsg,
          timestamp: new Date().toISOString(),
          actions: [
            {
              id: 'act-allow-loc',
              label: 'Allow location',
              variant: 'primary',
              action: 'allow_location',
            },
            {
              id: 'act-not-now',
              label: 'Not now',
              variant: 'secondary',
              action: 'not_now',
            },
          ],
          pendingUtterance: trimmed,
        }, run, undefined, engineLabel);
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: promptMsg };
      }
      if (locStatus.status === 'denied') {
        const deniedMsg =
          'Location access is blocked in your browser settings. Please enable location in your browser to find places near you.';
        this.resolveDegraded(deniedMsg);
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: deniedMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
        this.notify();
        return { collapsed: false, rule: 'degraded_failure', response: deniedMsg };
      }
      if (locStatus.status === 'unavailable' || !locStatus.coords) {
        const degradedMsg =
          'Cannot search for gas stations: location is unavailable or denied. Location is required to find nearby fuel.';
        this.resolveDegraded(degradedMsg);
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: degradedMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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

      let placesStep: AgentTraceStep | undefined;
      if (run) {
        placesStep = this.traceBus.startStep(run.id, 'places', 'Gas stations lookup', 'Searching simulated fuel stations…', 'simulated');
      }

      try {
        const provider = mockFuelAdapter.getProvider();
        places = provider.searchNearbySync
          ? provider.searchNearbySync({ location: locStatus.coords, category: 'gas_station', radiusMeters: 10000 })
          : [];
        placesStatus = places.length > 0 ? 'ok' : 'empty';
        if (placesStep) {
          this.traceBus.finishStep(placesStep.id, `${places.length} simulated stations (demo provider)`, 'simulated');
        }
      } catch (err: unknown) {
        placesStatus = 'error';
        placesError = err instanceof Error ? err.message : 'Places provider failure';
        places = [];
        if (placesStep) {
          this.traceBus.failStep(placesStep.id, 'Fuel stations lookup failed', 'simulated');
        }
      }

      if (placesStatus === 'error') {
        const errorMsg = 'Unable to search for gas stations: places provider failure. Fails closed.';
        this.resolveDegraded(errorMsg);
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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
        this.pushAssistantMessage({
          id: `msg-${Date.now()}-a`,
          sender: 'assistant',
          text: errorMsg,
          timestamp: new Date().toISOString(),
        }, run, undefined, engineLabel);
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

      const appliedAction: AppliedAction = {
        intent: 'FIND_FUEL',
        topPickName: topName,
      };
      const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'FIND_FUEL', appliedAction) : { valid: false };
      const successMsg = check.valid && cmd.reply ? cmd.reply : `Found nearby gas stations: ${topName} is the closest.`;
      this.pushAssistantMessage({
        id: `msg-${Date.now()}-a`,
        sender: 'assistant',
        text: successMsg,
        timestamp: new Date().toISOString(),
      }, run, newPlan, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });

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

    // 8. FIND_ESSENTIALS ('supermarket nearby', 'mall nearby', 'convenience store', 'pharmacy')
    if (cmd.intent === 'FIND_ESSENTIALS') {
      return this.handleEssentialsSync(trimmed, cmd, ctx, now, run, engineLabel);
    }

    // 9. UNSUPPORTED (Honest capability answers)
    this.beginCommand(trimmed);
    const isLunch =
      this.commandContext?.sceneId === 'away-lunch' ||
      this.commandContext?.sceneId === 'busy-lunch' ||
      this.commandContext?.plan?.intentId === 'lunch';
    const isFuel =
      this.commandContext?.sceneId === 'fuel' ||
      this.commandContext?.plan?.intentId === 'fuel';
    const fallbackText = isFuel
      ? "I can help find nearby gas stations."
      : isLunch
      ? "I can help with lunch recommendations."
      : "I can help adjust your departure plan.";

    const appliedAction: AppliedAction = {
      intent: 'UNSUPPORTED',
    };
    const check = cmd.reply ? validateAssistantReply(cmd.reply, suppliedFacts, 'UNSUPPORTED', appliedAction) : { valid: false };
    const responseText = check.valid && cmd.reply ? cmd.reply : (cmd.honestAnswer ?? fallbackText);

    this.pushAssistantMessage({
      id: `msg-${Date.now()}-a`,
      sender: 'assistant',
      text: responseText,
      timestamp: new Date().toISOString(),
    }, run, undefined, engineLabel, { ran: Boolean(cmd.reply), passed: Boolean(check.valid) });

    this.resolveDegraded(responseText);
    const rule: AutoCollapseRule = this.pinned ? 'pinned' : 'unsupported_ask';
    this.notify();
    return { collapsed: false, rule, response: responseText };
  }

  public pushHistory(snapshot: ActionHistorySnapshot): void {
    this.historyStack.push(snapshot);
    this.notify();
  }

  public getHistory(): readonly ActionHistorySnapshot[] {
    return [...this.historyStack];
  }

  public getLastHistorySnapshot(): ActionHistorySnapshot | null {
    return this.historyStack.length > 0 ? (this.historyStack[this.historyStack.length - 1] ?? null) : null;
  }

  public applyPlanAdjustment(plan: PreparedPlan, summary: string, override?: UserRequestOverride): void {
    const priorPlan = this.actionState.plan ?? this.commandContext?.plan ?? null;
    this.pushHistory({
      planState: priorPlan,
      sceneId: this.commandContext?.sceneId ?? 'current',
      actionState: { ...this.actionState },
      override: this.currentOverride,
      evidenceBundle: this.activeEvidenceBundle,
      snapshot: this.activeSnapshot,
      timestamp: new Date().toISOString(),
    });
    if (override) {
      this.currentOverride = override;
    }
    this.actionState = {
      status: 'updated',
      resultSummary: summary,
      plan,
      override: this.currentOverride,
      timestamp: new Date().toISOString(),
    };
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
