/**
 * Living Context App Component
 * Governed by Architecture Rev3 Sections 5, 6 and Invariants INV-102, INV-103, INV-105, INV-107, INV-108, INV-110.
 *
 * Implements:
 * - Scene Switcher driven by scenario player (Clear = D1, Rain = D2, Away-lunch = D3, Quiet = D4, etc.)
 * - Always-visible 'Demo · simulated context' chip (INV-102)
 * - NOW (<=1 item), AHEAD (<=3 items), FOR YOU (pending memory items)
 * - Map rendered ONLY when spatial evidence exists
 * - Honest quiet state and fail-closed notice states
 * - Review loop actions: Accept (with Undo), Adjust (prep/buffer: for this time only vs remember preference), Dismiss (reasons -> same-day suppression + pending proposal)
 * - Why Sheet: human sentences from evidence signals, memory facts, and derivation
 * - Me page (Today/Me tabs): budget meter, confirmed preferences, pending proposals (with Confirm/Not true), rejected audit, data controls
 * - Storage persistence via WebStorageDriver (AC-105-4)
 */

import { STRINGS } from './strings.js';
import { runPipeline, type PipelineResult } from '../../core/pipeline/index.js';
import { staticPluginRegistry } from '../../plugins/registry.js';
import {
  d1Scenario,
  d1MemoryFacts,
  D1_INITIAL_CLOCK,
  d2Scenario,
  d2MemoryFacts,
  d3Scenario,
  d3MemoryFacts,
  d4ScenarioBusy,
  d4MemoryFacts,
  d6ScenarioMissingWeather,
  D6_EVALUATION_CLOCK,
} from '../../../tests/fixtures/index.js';
import {
  createScenarioPlayer,
  createFixedClock,
} from '../../app/scenario-player/index.js';
import type {
  SpatialMapEvidence,
  PreparedPlan,
  MemoryFact,
  SuppressionReason,
  ContextSnapshot,
} from '../../core/contracts/index.js';
import { createMemoryFact, createSimulatedSignal } from '../../core/contracts/index.js';
import {
  escapeHtml,
  getGreeting,
  formatNowPlan,
  formatAheadPlan,
  formatNoticeMessage,
  humanizeProposalTitle,
} from './presentation.js';
import {
  YoriStorage,
  WebStorageDriver,
} from '../../core/storage/index.js';
import { renderWhySheet } from '../review/why-sheet.js';
import { renderAdjustDialog, type AdjustDialogValues } from '../review/adjust-dialog.js';
import { renderDismissDialog } from '../review/dismiss-dialog.js';
import { renderMeView } from '../me/me-view.js';
import { createMemoryPort } from '../../adapters/xmemo/index.js';
import { DEFAULT_DAILY_PROMPT_BUDGET } from '../../core/policy/index.js';
import { coordinateReasoning } from '../../app/reasoning-coordinator.js';

export type DemoSceneId =
  | 'clear'
  | 'rain'
  | 'away-lunch'
  | 'busy-lunch'
  | 'missing-weather'
  | 'corrupt-storage'
  | 'multi-candidate';

export interface AppState {
  currentScene: DemoSceneId;
  pipelineResult: PipelineResult;
  spatialMapEvidence: SpatialMapEvidence | null;
  storageError: boolean;
  storage: YoriStorage;
  snapshotAsOf: string;
  snapshotTimezone: string;
}

export function computeSceneState(
  scene: DemoSceneId,
  storage?: YoriStorage
): {
  pipelineResult: PipelineResult;
  spatialMapEvidence: SpatialMapEvidence | null;
  storageError: boolean;
  storage: YoriStorage;
  snapshotAsOf: string;
  snapshotTimezone: string;
  snapshot: ContextSnapshot;
  combinedMemory: readonly MemoryFact[];
} {
  const plugins = staticPluginRegistry.getAll();
  const effectiveStorage = storage ?? new YoriStorage(new WebStorageDriver());

  // Load existing persistent state if available
  let loadedEnvelope = null;
  let isCorrupted = false;
  try {
    loadedEnvelope = effectiveStorage.load();
  } catch {
    isCorrupted = true;
  }

  const storedSuppressions = loadedEnvelope?.payload.suppressions ?? [];
  const storedProposals = loadedEnvelope?.payload.proposals ?? [];
  const storedConfirmedFacts = loadedEnvelope?.payload.memoryFacts ?? [];

  switch (scene) {
    case 'clear': {
      const clock = createFixedClock(D1_INITIAL_CLOCK);
      const player = createScenarioPlayer(d1Scenario, clock);
      const snapshots = player.getSnapshots();
      const latestSnapshot = snapshots[snapshots.length - 1]!;

      // Merge seed facts with stored facts & proposals
      const combinedMemory = [
        ...d1MemoryFacts.filter(f => !storedConfirmedFacts.some(sc => sc.key === f.key)),
        ...storedConfirmedFacts,
        ...storedProposals,
      ];

      const result = runPipeline({
        snapshot: latestSnapshot,
        memory: combinedMemory,
        clock: D1_INITIAL_CLOCK,
        plugins,
        storage: effectiveStorage,
        suppressions: storedSuppressions,
      });

      const calendarSig = latestSnapshot.signals.find(s => s.kind === 'calendar');
      const mapEvidence: SpatialMapEvidence | null = calendarSig
        ? {
            placeOrRoute: { name: 'Piano Studio (Downtown)', destination: '123 Harmony Way' },
            spatialEvidence: calendarSig,
          }
        : null;

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: latestSnapshot.asOf,
        snapshotTimezone: latestSnapshot.timezone || 'America/Los_Angeles',
        snapshot: latestSnapshot,
        combinedMemory,
      };
    }

    case 'rain': {
      const clock = createFixedClock('2026-10-28T20:35:00.000Z');
      const player = createScenarioPlayer(d2Scenario, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T20:35:00.000Z');

      const combinedMemory = [
        ...d2MemoryFacts.filter(f => !storedConfirmedFacts.some(sc => sc.key === f.key)),
        ...storedConfirmedFacts,
        ...storedProposals,
      ];

      const result = runPipeline({
        snapshot,
        memory: combinedMemory,
        clock: '2026-10-28T20:35:00.000Z',
        plugins,
        storage: effectiveStorage,
        suppressions: storedSuppressions,
      });

      const calendarSig = snapshot.signals.find(s => s.kind === 'calendar');
      const mapEvidence: SpatialMapEvidence | null = calendarSig
        ? {
            placeOrRoute: { name: 'Piano Studio (Rain Route)', destination: '123 Harmony Way' },
            spatialEvidence: calendarSig,
          }
        : null;

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory,
      };
    }

    case 'away-lunch': {
      const clock = createFixedClock('2026-10-28T19:10:00.000Z');
      const player = createScenarioPlayer(d3Scenario, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T19:10:00.000Z');

      const combinedMemory = [
        ...d3MemoryFacts.filter(f => !storedConfirmedFacts.some(sc => sc.key === f.key)),
        ...storedConfirmedFacts,
        ...storedProposals,
      ];

      const result = runPipeline({
        snapshot,
        memory: combinedMemory,
        clock: '2026-10-28T19:10:00.000Z',
        plugins,
        storage: effectiveStorage,
        suppressions: storedSuppressions,
      });

      const locSig = snapshot.signals.find(s => s.kind === 'location_status');
      const mapEvidence: SpatialMapEvidence | null = locSig
        ? {
            placeOrRoute: { name: 'Downtown Dining District', area: 'Downtown' },
            spatialEvidence: locSig,
          }
        : null;

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory,
      };
    }

    case 'busy-lunch': {
      const clock = createFixedClock('2026-10-28T19:10:00.000Z');
      const player = createScenarioPlayer(d4ScenarioBusy, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T19:10:00.000Z');

      const combinedMemory = [
        ...d4MemoryFacts.filter(f => !storedConfirmedFacts.some(sc => sc.key === f.key)),
        ...storedConfirmedFacts,
        ...storedProposals,
      ];

      const result = runPipeline({
        snapshot,
        memory: combinedMemory,
        clock: '2026-10-28T19:10:00.000Z',
        plugins,
        storage: effectiveStorage,
        suppressions: storedSuppressions,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: null,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory,
      };
    }

    case 'missing-weather': {
      const clock = createFixedClock(D6_EVALUATION_CLOCK);
      const player = createScenarioPlayer(d6ScenarioMissingWeather, clock);
      const snapshot = player.getSnapshotAt(D6_EVALUATION_CLOCK);
      const result = runPipeline({
        snapshot,
        memory: storedConfirmedFacts,
        clock: D6_EVALUATION_CLOCK,
        plugins,
        storage: effectiveStorage,
        suppressions: storedSuppressions,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: null,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory: storedConfirmedFacts,
      };
    }

    case 'corrupt-storage': {
      const clock = createFixedClock(D1_INITIAL_CLOCK);
      const player = createScenarioPlayer(d1Scenario, clock);
      const snapshot = player.getSnapshotAt(D1_INITIAL_CLOCK);

      // Seed driver with invalid/corrupt envelope if not already set
      if (!isCorrupted) {
        effectiveStorage.reset();
        const rawDriver = (effectiveStorage as unknown as { driver: { setItem: (k: string, v: string) => void } }).driver;
        rawDriver.setItem(
          'yori_state_v1',
          JSON.stringify({
            schemaVersion: 999,
            createdAt: D1_INITIAL_CLOCK,
            updatedAt: D1_INITIAL_CLOCK,
            payload: { corrupted: true, notes: 'Invalid future schema' },
          })
        );
        isCorrupted = true;
      }

      const result = runPipeline({
        snapshot,
        memory: [],
        clock: D1_INITIAL_CLOCK,
        plugins,
        storage: effectiveStorage,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: null,
        storageError: isCorrupted,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory: [],
      };
    }

    case 'multi-candidate': {
      // User is away in lunch window (12:10 PM) with a scheduled piano lesson at 3:00 PM
      const calendarSig = createSimulatedSignal({
        kind: 'calendar',
        value: {
          title: 'Piano lesson',
          startTime: '2026-10-28T15:00:00-07:00',
          endTime: '2026-10-28T16:00:00-07:00',
          location: 'Piano Studio (Downtown)',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 36000000,
        confidence: 1.0,
        consentScope: 'device_only',
      });
      const travelSig = createSimulatedSignal({
        kind: 'travel_estimate',
        value: {
          mode: 'drive',
          travelMinutes: 30,
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 36000000,
        confidence: 0.9,
        consentScope: 'device_only',
      });
      const weatherSig = createSimulatedSignal({
        kind: 'weather',
        value: {
          condition: 'clear',
          precipProbability: 0.0,
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 36000000,
        confidence: 0.95,
        consentScope: 'device_only',
      });
      const locationSig = createSimulatedSignal({
        kind: 'location_status',
        value: {
          isHome: false,
          currentArea: 'Downtown',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.95,
        consentScope: 'device_only',
      });
      const scheduleSig = createSimulatedSignal({
        kind: 'schedule_window',
        value: {
          freeUntil: '2026-10-28T14:00:00-07:00',
          nextEvent: 'Piano lesson at 3:00 PM',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });
      const eatingSig = createSimulatedSignal({
        kind: 'eating_status',
        value: {
          eatenToday: false,
          lastMeal: 'Breakfast 08:30',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 0.9,
        consentScope: 'device_only',
      });

      const snapshot: ContextSnapshot = {
        id: 'snapshot-multi-candidate',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [calendarSig, travelSig, weatherSig, locationSig, scheduleSig, eatingSig],
      };

      const combinedMemory = [
        ...d1MemoryFacts.filter(f => !storedConfirmedFacts.some(sc => sc.key === f.key)),
        ...d3MemoryFacts.filter(f => !storedConfirmedFacts.some(sc => sc.key === f.key)),
        ...storedConfirmedFacts,
        ...storedProposals,
      ];

      const result = runPipeline({
        snapshot,
        memory: combinedMemory,
        clock: '2026-10-28T19:10:00.000Z',
        plugins,
        storage: effectiveStorage,
        suppressions: storedSuppressions,
      });

      const mapEvidence: SpatialMapEvidence = {
        placeOrRoute: { name: 'Downtown Dining District', area: 'Downtown' },
        spatialEvidence: locationSig,
      };

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory,
      };
    }
  }
}

export function renderApp(
  root: HTMLElement,
  initialScene: DemoSceneId = 'clear',
  customStorage?: YoriStorage
): void {
  let currentScene = initialScene;
  let activeTab: 'today' | 'me' = 'today';
  const sharedStorage = customStorage ?? new YoriStorage(new WebStorageDriver());
  const memoryPort = createMemoryPort(sharedStorage);

  let activeModal:
    | null
    | { type: 'why'; plan: PreparedPlan }
    | { type: 'adjust'; plan: PreparedPlan; values: AdjustDialogValues }
    | { type: 'dismiss'; plan: PreparedPlan } = null;

  let actionFeedbackMessage: string | null = null;
  const timingOverrides: Record<string, { prepMinutes: number; bufferMinutes: number }> = {};

  let coordinatedScene: DemoSceneId | null = null;
  let reasoningRequestId = 0;
  let reasoningState: {
    scene: DemoSceneId;
    now: PreparedPlan | null;
    ahead: readonly PreparedPlan[];
    rationales: Record<string, string>;
  } | null = null;

  let xmemoStatus: { enabled: boolean; connected: boolean; statusText?: string } = {
    enabled: false,
    connected: false,
  };

  if (typeof window !== 'undefined' && window.location?.search?.includes('xmemo=connected')) {
    actionFeedbackMessage = 'XMemo account connected successfully';
    activeTab = 'me';
  }

  async function checkXMemoStatus() {
    try {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch('/api/xmemo/status', { cache: 'no-store' });
        if (resp.ok) {
          const newStatus = (await resp.json()) as { enabled: boolean; connected: boolean; statusText?: string };
          xmemoStatus = newStatus;
          update();
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  void checkXMemoStatus();

  function update() {
    const {
      pipelineResult,
      spatialMapEvidence,
      storageError,
      storage,
      snapshotAsOf,
      snapshotTimezone,
      snapshot,
      combinedMemory,
    } = computeSceneState(currentScene, sharedStorage);

    // Ensure initial storage envelope exists if clean
    let storedEnvelope = null;
    if (!storageError) {
      try {
        storedEnvelope = storage.load();
        if (!storedEnvelope) {
          storage.save(
            {
              memoryFacts: [],
              proposals: [],
              suppressions: [],
              promptBudget: { date: snapshotAsOf.slice(0, 10), count: 0 },
              acceptedPlanIds: [],
            },
            snapshotAsOf
          );
          storedEnvelope = storage.load();
        }
      } catch {
        // error handled by UI
      }
    }

    const living = pipelineResult.livingContext;
    const nowPlan = reasoningState && reasoningState.scene === currentScene ? reasoningState.now : living.now;
    const aheadPlans = reasoningState && reasoningState.scene === currentScene ? reasoningState.ahead : living.ahead;
    const notices = pipelineResult.notices;
    const acceptedPlanIds: readonly string[] = storedEnvelope?.payload.acceptedPlanIds ?? [];

    const greeting = getGreeting(snapshotAsOf, snapshotTimezone);
    const nowPresentation = nowPlan ? formatNowPlan(nowPlan) : null;
    const isNowAccepted = nowPlan ? acceptedPlanIds.includes(nowPlan.id) : false;

    // Build Main Content based on activeTab
    let mainContentHtml = '';

    if (activeTab === 'me') {
      const memoryFacts = storedEnvelope?.payload.memoryFacts ?? [];
      const proposals = storedEnvelope?.payload.proposals ?? [];
      const promptBudget = storedEnvelope?.payload.promptBudget ?? {
        date: snapshotAsOf.slice(0, 10),
        count: 0,
      };

      mainContentHtml = renderMeView({
        memoryFacts,
        proposals,
        promptBudget,
        maxDailyPrompts: DEFAULT_DAILY_PROMPT_BUDGET,
        timezone: snapshotTimezone,
        actionNotice: actionFeedbackMessage ?? undefined,
        isPersistent: storage.isPersistent(),
        xmemoStatus,
      });
    } else {
      mainContentHtml = `
        ${
          storageError
            ? `
          <div class="error-box" role="alert" aria-live="assertive">
            <h2 class="error-title">${escapeHtml(STRINGS.storageError.title)}</h2>
            <p>${escapeHtml(STRINGS.storageError.message)}</p>
            <div class="error-actions">
              <button type="button" class="btn btn-secondary" id="btn-export-storage">${escapeHtml(STRINGS.storageError.exportBtn)}</button>
              <button type="button" class="btn btn-danger" id="btn-reset-storage">${escapeHtml(STRINGS.storageError.resetBtn)}</button>
            </div>
            <div id="storage-action-feedback" class="storage-feedback" role="status">
              ${actionFeedbackMessage ? escapeHtml(actionFeedbackMessage) : ''}
            </div>
          </div>
        `
            : ''
        }

        ${
          notices.length > 0
            ? notices
                .map(
                  n => `
          <div class="notice-box" role="status">
            <strong>${escapeHtml(STRINGS.notices.degradedNoticeHeader)}</strong> ${escapeHtml(formatNoticeMessage(n))}
          </div>
        `
                )
                .join('')
            : ''
        }

        <!-- Hero Grid: Map (if evidence exists) + NOW -->
        <div class="hero-grid">
          ${
            spatialMapEvidence
              ? `
            <section class="card map-card" aria-label="${escapeHtml(STRINGS.map.label)}">
              <div class="map-header">
                <span class="section-label">${escapeHtml(STRINGS.map.label)}</span>
                <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
              </div>
              <div class="map-svg-illustration" role="img" aria-label="${escapeHtml(STRINGS.map.abstractStreetDescription)}">
                <svg width="100%" height="100%" viewBox="0 0 320 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect width="100%" height="100%" fill="#E9F1E8" rx="12"/>
                  <!-- Abstract street grid -->
                  <line x1="20" y1="40" x2="300" y2="40" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
                  <line x1="20" y1="95" x2="300" y2="95" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
                  <line x1="85" y1="15" x2="85" y2="125" stroke="#CADBC9" stroke-width="6" stroke-linecap="round"/>
                  <line x1="210" y1="15" x2="210" y2="125" stroke="#CADBC9" stroke-width="8" stroke-linecap="round"/>
                  <!-- Route path -->
                  <path d="M 85 95 L 210 95 L 210 40" stroke="#2F6F64" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round"/>
                  <!-- Origin and Destination markers -->
                  <circle cx="85" cy="95" r="5" fill="#16382F"/>
                  <circle cx="210" cy="40" r="8" fill="#2F6F64" />
                  <circle cx="210" cy="40" r="14" stroke="#2F6F64" stroke-width="2" stroke-dasharray="4 2"/>
                </svg>
              </div>
              <div class="map-place-info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                ${escapeHtml(String((spatialMapEvidence.placeOrRoute as Record<string, string>).name || 'Destination'))}
              </div>
            </section>
          `
              : ''
          }

          ${
            nowPresentation && nowPlan
              ? `
            <section class="card now-card" aria-label="${escapeHtml(STRINGS.sections.now)}" data-plan-id="${escapeHtml(nowPlan.id)}">
              <div>
                <span class="section-label">${escapeHtml(STRINGS.sections.now)}</span>
                <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
                <h2 class="now-subject">${escapeHtml(nowPresentation.title)}</h2>
                <div class="now-title" id="now-title">${escapeHtml(nowPresentation.headline)}</div>
              </div>

              ${
                nowPresentation.isRain
                  ? `
                <div class="rain-banner" role="status">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>
                    <line x1="8" y1="19" x2="8" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                    <line x1="16" y1="19" x2="16" y2="21"></line>
                  </svg>
                  <span>${escapeHtml(nowPresentation.rainBanner || '')}</span>
                </div>
                <div class="checklist-container" aria-label="Recommended Checklist">
                  <span class="checklist-chip" id="chip-umbrella">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"></path>
                    </svg>
                    ${escapeHtml(nowPresentation.umbrellaChip || '')}
                  </span>
                </div>
              `
                  : ''
              }

              ${
                nowPresentation.options && nowPresentation.options.length > 0
                  ? `
                <div class="options-grid" aria-label="Available Options">
                  ${nowPresentation.options
                    .map(
                      opt => `
                    <div class="option-tile">
                      <span class="option-label">${escapeHtml(opt.label)}</span>
                      ${opt.meta ? `<span class="option-meta">${escapeHtml(opt.meta)}</span>` : ''}
                    </div>
                  `
                    )
                    .join('')}
                </div>
              `
                  : ''
              }

              ${
                nowPresentation.habitNote
                  ? `<div class="habit-note">${escapeHtml(nowPresentation.habitNote)}</div>`
                  : ''
              }

              ${
                nowPresentation.mockPlacesNotice
                  ? `<div class="mock-places-notice">${escapeHtml(nowPresentation.mockPlacesNotice)}</div>`
                  : ''
              }

              <div class="now-basis">
                <p>${escapeHtml(nowPresentation.basis)}</p>
              </div>

              <!-- Functional Review Loop Action Row (S4-1) -->
              <div class="action-row" aria-label="Plan Actions">
                ${
                  isNowAccepted
                    ? `
                  <span class="badge-accepted">${escapeHtml(STRINGS.actions.accepted)}</span>
                  <button type="button" class="btn btn-outline" id="btn-undo-accept" data-plan-id="${escapeHtml(nowPlan.id)}">
                    ${escapeHtml(STRINGS.actions.undo)}
                  </button>
                  <button type="button" class="btn btn-outline" id="btn-why" data-plan-id="${escapeHtml(nowPlan.id)}">
                    ${escapeHtml(STRINGS.actions.why)}
                  </button>
                `
                    : `
                  <button type="button" class="btn btn-primary" id="btn-accept" data-plan-id="${escapeHtml(nowPlan.id)}">
                    ${escapeHtml(STRINGS.actions.accept)}
                  </button>
                  <button type="button" class="btn btn-outline" id="btn-adjust" data-plan-id="${escapeHtml(nowPlan.id)}">
                    ${escapeHtml(STRINGS.actions.adjust)}
                  </button>
                  <button type="button" class="btn btn-outline" id="btn-dismiss" data-plan-id="${escapeHtml(nowPlan.id)}">
                    ${escapeHtml(STRINGS.actions.dismiss)}
                  </button>
                  <button type="button" class="btn btn-outline" id="btn-why" data-plan-id="${escapeHtml(nowPlan.id)}">
                    ${escapeHtml(STRINGS.actions.why)}
                  </button>
                `
                }
              </div>
            </section>
          `
              : `
            <section class="card quiet-card" aria-label="Quiet State">
              <div class="quiet-icon" aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
              </div>
              <h2 class="quiet-title">${escapeHtml(STRINGS.quietState.title)}</h2>
              <p class="quiet-subtitle">${escapeHtml(STRINGS.quietState.subtitle)}</p>
            </section>
          `
          }
        </div>

        <!-- Secondary Grid: AHEAD & FOR YOU -->
        <div class="secondary-grid">
          <section aria-label="${escapeHtml(STRINGS.sections.ahead)}">
            <h2 class="section-label">${escapeHtml(STRINGS.sections.ahead)}</h2>
            <div class="ahead-list">
              ${
                aheadPlans.length > 0
                  ? aheadPlans
                      .map(item => {
                        const aheadPres = formatAheadPlan(item);
                        return `
                <div class="item-row" data-plan-id="${escapeHtml(item.id)}">
                  <div>
                    <div class="item-title">${escapeHtml(aheadPres.title)}</div>
                    <div class="item-subtitle">${escapeHtml(aheadPres.subtitle)}</div>
                  </div>
                  <div style="display: flex; gap: 8px; align-items: center;">
                    <button type="button" class="btn btn-sm btn-outline btn-ahead-why" data-plan-id="${escapeHtml(item.id)}">
                      ${escapeHtml(STRINGS.actions.why)}
                    </button>
                    <span class="card-badge">${escapeHtml(STRINGS.header.simulatedBadge)}</span>
                  </div>
                </div>
              `;
                      })
                      .join('')
                  : `
                <div class="item-row" style="color: var(--color-muted);">
                  <span>No upcoming moments scheduled</span>
                </div>
              `
              }
            </div>
          </section>

          <section aria-label="${escapeHtml(STRINGS.sections.forYou)}">
            <h2 class="section-label">${escapeHtml(STRINGS.sections.forYou)}</h2>
            <div class="for-you-list" id="for-you-proposals-list">
              ${
                living.forYou.length > 0
                  ? living.forYou
                      .map(
                        fact => `
                <div class="item-row pending-for-you-row" id="for-you-${escapeHtml(fact.key)}">
                  <div style="flex: 1;">
                    <div class="item-title">${escapeHtml(humanizeProposalTitle(fact.key))}</div>
                    <div class="item-subtitle">${fact.provenance.note ? escapeHtml(fact.provenance.note) : escapeHtml(STRINGS.proposals.awaitingConfirmation)}</div>
                  </div>
                  <div class="proposal-actions">
                    <button type="button" class="btn btn-sm btn-primary btn-confirm-proposal" data-key="${escapeHtml(fact.key)}">
                      ${escapeHtml(STRINGS.actions.confirm)}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline btn-reject-proposal" data-key="${escapeHtml(fact.key)}">
                      ${escapeHtml(STRINGS.actions.notTrue)}
                    </button>
                  </div>
                </div>
              `
                      )
                      .join('')
                  : `
                <div class="item-row" style="color: var(--color-muted);">
                  <span>No memory confirmations pending</span>
                </div>
              `
              }
            </div>
          </section>
        </div>
      `;
    }

    root.innerHTML = `
      <div class="app-layout">
        <header class="header-bar" role="banner">
          <div class="main-container" style="padding-bottom: 0;">
            <div class="top-meta">
              <span class="demo-chip" aria-label="Simulation Status">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                ${escapeHtml(STRINGS.header.demoChip)}
              </span>

              <!-- Desktop Navigation Links -->
              <nav class="desktop-nav" aria-label="Desktop Navigation">
                <button type="button" class="nav-pill ${activeTab === 'today' ? 'active' : ''}" data-tab="today" id="desktop-nav-today">
                  ${escapeHtml(STRINGS.tabs.today)}
                </button>
                <button type="button" class="nav-pill ${activeTab === 'me' ? 'active' : ''}" data-tab="me" id="desktop-nav-me">
                  ${escapeHtml(STRINGS.tabs.me)}
                </button>
              </nav>

              <div class="scene-switcher">
                <label for="scene-select" class="scene-select-label">Demo Scene:</label>
                <select id="scene-select" class="scene-select" aria-label="Switch Demo Scenario">
                  <option value="clear" ${currentScene === 'clear' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.clear)}</option>
                  <option value="rain" ${currentScene === 'rain' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.rain)}</option>
                  <option value="away-lunch" ${currentScene === 'away-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.awayLunch)}</option>
                  <option value="busy-lunch" ${currentScene === 'busy-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.busyLunch)}</option>
                  <option value="missing-weather" ${currentScene === 'missing-weather' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.missingWeather)}</option>
                  <option value="corrupt-storage" ${currentScene === 'corrupt-storage' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.corruptStorage)}</option>
                  <option value="multi-candidate" ${currentScene === 'multi-candidate' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.multiCandidate)}</option>
                </select>
              </div>
            </div>

            <div class="greeting-section">
              <h1 class="greeting-title">${escapeHtml(greeting.greeting)}</h1>
              <p class="greeting-subheading">${escapeHtml(greeting.subheading)}</p>
            </div>
          </div>
        </header>

        <main class="main-container" role="main">
          ${mainContentHtml}
        </main>

        <!-- Bottom Tab Bar (Mobile) -->
        <nav class="bottom-tab-bar" aria-label="Main Navigation">
          <button type="button" class="tab-item ${activeTab === 'today' ? 'active' : ''}" id="tab-today" aria-current="${activeTab === 'today' ? 'page' : 'false'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.today)}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="Coming soon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.explore)}</span>
          </button>
          <button type="button" class="tab-item disabled" disabled aria-disabled="true" title="Coming soon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.ask)}</span>
          </button>
          <button type="button" class="tab-item ${activeTab === 'me' ? 'active' : ''}" id="tab-me" aria-current="${activeTab === 'me' ? 'page' : 'false'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>${escapeHtml(STRINGS.tabs.me)}</span>
          </button>
        </nav>

        <!-- Active Modals (Why sheet, Adjust, Dismiss) -->
        ${
          activeModal?.type === 'why'
            ? renderWhySheet(
                activeModal.plan,
                reasoningState?.rationales[activeModal.plan.id],
                snapshotTimezone
              )
            : activeModal?.type === 'adjust'
            ? renderAdjustDialog(activeModal.values)
            : activeModal?.type === 'dismiss'
            ? renderDismissDialog(activeModal.plan.intentId)
            : ''
        }
      </div>
    `;

    // -------------------------------------------------------------
    // EVENT BINDINGS
    // -------------------------------------------------------------

    // 1. Scene Switcher
    const selectEl = root.querySelector('#scene-select') as HTMLSelectElement | null;
    if (selectEl) {
      selectEl.addEventListener('change', e => {
        currentScene = (e.target as HTMLSelectElement).value as DemoSceneId;
        actionFeedbackMessage = null;
        coordinatedScene = null;
        reasoningRequestId++;
        reasoningState = null;
        update();
      });
    }

    // 2. Navigation Tab Switching (Mobile & Desktop)
    const todayBtn = root.querySelector('#tab-today');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        activeTab = 'today';
        update();
      });
    }

    const meBtn = root.querySelector('#tab-me');
    if (meBtn) {
      meBtn.addEventListener('click', async () => {
        activeTab = 'me';
        update();
        await checkXMemoStatus();
      });
    }

    const desktopTodayBtn = root.querySelector('#desktop-nav-today');
    if (desktopTodayBtn) {
      desktopTodayBtn.addEventListener('click', () => {
        activeTab = 'today';
        update();
      });
    }

    const desktopMeBtn = root.querySelector('#desktop-nav-me');
    if (desktopMeBtn) {
      desktopMeBtn.addEventListener('click', async () => {
        activeTab = 'me';
        update();
        await checkXMemoStatus();
      });
    }

    // 3. Plan Review Actions: Accept
    const acceptBtn = root.querySelector('#btn-accept') as HTMLButtonElement | null;
    if (acceptBtn && nowPlan) {
      acceptBtn.addEventListener('click', () => {
        const envelope = sharedStorage.load();
        const existingAccepted = envelope?.payload.acceptedPlanIds ?? [];
        if (!existingAccepted.includes(nowPlan.id)) {
          const updatedAccepted = [...existingAccepted, nowPlan.id];
          sharedStorage.save(
            {
              memoryFacts: envelope?.payload.memoryFacts ?? [],
              proposals: envelope?.payload.proposals ?? [],
              suppressions: envelope?.payload.suppressions ?? [],
              promptBudget: envelope?.payload.promptBudget ?? { date: snapshotAsOf.slice(0, 10), count: 0 },
              acceptedPlanIds: updatedAccepted,
            },
            snapshotAsOf
          );
        }
        update();
      });
    }

    // 4. Plan Review Actions: Undo Accept
    const undoAcceptBtn = root.querySelector('#btn-undo-accept') as HTMLButtonElement | null;
    if (undoAcceptBtn && nowPlan) {
      undoAcceptBtn.addEventListener('click', () => {
        const envelope = sharedStorage.load();
        const existingAccepted = envelope?.payload.acceptedPlanIds ?? [];
        const updatedAccepted = existingAccepted.filter(id => id !== nowPlan.id);
        sharedStorage.save(
          {
            memoryFacts: envelope?.payload.memoryFacts ?? [],
            proposals: envelope?.payload.proposals ?? [],
            suppressions: envelope?.payload.suppressions ?? [],
            promptBudget: envelope?.payload.promptBudget ?? { date: snapshotAsOf.slice(0, 10), count: 0 },
            acceptedPlanIds: updatedAccepted,
          },
          snapshotAsOf
        );
        update();
      });
    }

    // 5. Plan Review Actions: Why Sheet
    const whyBtn = root.querySelector('#btn-why') as HTMLButtonElement | null;
    if (whyBtn && nowPlan) {
      whyBtn.addEventListener('click', () => {
        activeModal = { type: 'why', plan: nowPlan };
        update();
      });
    }

    // Ahead items Why button
    root.querySelectorAll('.btn-ahead-why').forEach(btn => {
      btn.addEventListener('click', e => {
        const planId = (e.currentTarget as HTMLElement).getAttribute('data-plan-id');
        const match = aheadPlans.find(p => p.id === planId);
        if (match) {
          activeModal = { type: 'why', plan: match };
          update();
        }
      });
    });

    // 6. Plan Review Actions: Adjust
    const adjustBtn = root.querySelector('#btn-adjust') as HTMLButtonElement | null;
    if (adjustBtn && nowPlan) {
      adjustBtn.addEventListener('click', () => {
        const existingTiming = timingOverrides[nowPlan.id] || { prepMinutes: 20, bufferMinutes: 5 };
        activeModal = { type: 'adjust', plan: nowPlan, values: existingTiming };
        update();
      });
    }

    // 7. Plan Review Actions: Dismiss
    const dismissBtn = root.querySelector('#btn-dismiss') as HTMLButtonElement | null;
    if (dismissBtn && nowPlan) {
      dismissBtn.addEventListener('click', () => {
        activeModal = { type: 'dismiss', plan: nowPlan };
        update();
      });
    }

    // -------------------------------------------------------------
    // MODAL HANDLERS
    // -------------------------------------------------------------

    // Why Sheet Close
    const closeWhyBtn = root.querySelector('#btn-close-why');
    const doneWhyBtn = root.querySelector('#btn-why-sheet-done');
    const closeWhy = () => {
      activeModal = null;
      update();
    };
    if (closeWhyBtn) closeWhyBtn.addEventListener('click', closeWhy);
    if (doneWhyBtn) doneWhyBtn.addEventListener('click', closeWhy);

    // Adjust Dialog Handlers
    const closeAdjustBtn = root.querySelector('#btn-close-adjust');
    if (closeAdjustBtn) {
      closeAdjustBtn.addEventListener('click', () => {
        activeModal = null;
        update();
      });
    }

    const adjustForTodayBtn = root.querySelector('#btn-adjust-for-today');
    if (adjustForTodayBtn && activeModal?.type === 'adjust') {
      const planToAdjust = activeModal.plan;
      adjustForTodayBtn.addEventListener('click', () => {
        const prepInput = root.querySelector('#input-prep-minutes') as HTMLInputElement | null;
        const bufferInput = root.querySelector('#input-buffer-minutes') as HTMLInputElement | null;
        const prepMinutes = prepInput ? parseInt(prepInput.value, 10) || 20 : 20;
        const bufferMinutes = bufferInput ? parseInt(bufferInput.value, 10) || 5 : 5;

        timingOverrides[planToAdjust.id] = { prepMinutes, bufferMinutes };
        activeModal = null;
        update();
      });
    }

    const adjustRememberBtn = root.querySelector('#btn-adjust-remember');
    if (adjustRememberBtn && activeModal?.type === 'adjust') {
      const planToAdjust = activeModal.plan;
      adjustRememberBtn.addEventListener('click', () => {
        const prepInput = root.querySelector('#input-prep-minutes') as HTMLInputElement | null;
        const bufferInput = root.querySelector('#input-buffer-minutes') as HTMLInputElement | null;
        const prepMinutes = prepInput ? parseInt(prepInput.value, 10) || 20 : 20;
        const bufferMinutes = bufferInput ? parseInt(bufferInput.value, 10) || 5 : 5;

        // Create pending proposal (never direct confirmed write!) (INV-107)
        const proposal: MemoryFact = createMemoryFact(
          'prep_buffer_preference',
          { prepMinutes, bufferMinutes },
          'pending',
          {
            source: 'user_feedback',
            recordedAt: snapshotAsOf,
            note: 'Adjusted prep and buffer preference',
          },
          snapshotAsOf
        );

        const envelope = sharedStorage.load();
        const existingProposals = envelope?.payload.proposals ?? [];
        const updatedProposals = existingProposals.filter(p => p.key !== proposal.key);
        updatedProposals.push(proposal);

        sharedStorage.save(
          {
            memoryFacts: envelope?.payload.memoryFacts ?? [],
            proposals: updatedProposals,
            suppressions: envelope?.payload.suppressions ?? [],
            promptBudget: envelope?.payload.promptBudget ?? { date: snapshotAsOf.slice(0, 10), count: 0 },
            acceptedPlanIds: envelope?.payload.acceptedPlanIds ?? [],
          },
          snapshotAsOf
        );

        timingOverrides[planToAdjust.id] = { prepMinutes, bufferMinutes };
        activeModal = null;
        update();
      });
    }

    // Dismiss Dialog Handlers
    const closeDismissBtn = root.querySelector('#btn-close-dismiss');
    const cancelDismissBtn = root.querySelector('#btn-cancel-dismiss');
    const closeDismiss = () => {
      activeModal = null;
      update();
    };
    if (closeDismissBtn) closeDismissBtn.addEventListener('click', closeDismiss);
    if (cancelDismissBtn) cancelDismissBtn.addEventListener('click', closeDismiss);

    const confirmDismissBtn = root.querySelector('#btn-confirm-dismiss') as HTMLButtonElement | null;
    if (confirmDismissBtn && activeModal?.type === 'dismiss') {
      const planToDismiss = activeModal.plan;
      confirmDismissBtn.addEventListener('click', () => {
        const checkedRadio = root.querySelector('input[name="dismiss-reason"]:checked') as HTMLInputElement | null;
        const reasonKey = checkedRadio ? checkedRadio.value : 'dont_suggest_today';

        let reasonText = "User dismissed: Don't suggest this today";
        let proposalNote = STRINGS.dismissDialog.noteDismissToday.replace('{intent}', planToDismiss.intentId);
        if (reasonKey === 'busy_today') {
          reasonText = "User dismissed: Busy during this time";
          proposalNote = STRINGS.dismissDialog.noteDismissBusy.replace('{intent}', planToDismiss.intentId);
        } else if (reasonKey === 'not_needed') {
          reasonText = "User dismissed: Not needed";
          proposalNote = STRINGS.dismissDialog.noteDismissNotNeeded.replace('{intent}', planToDismiss.intentId);
        }

        const suppression: SuppressionReason = {
          code: 'user_suppressed',
          reason: reasonText,
          scope: 'today',
          recordedAt: snapshotAsOf,
          targetIntent: planToDismiss.intentId,
        };

        const envelope = sharedStorage.load();
        const existingSuppressions = envelope?.payload.suppressions ?? [];
        const updatedSuppressions = existingSuppressions.filter(
          s => !(s.code === 'user_suppressed' && s.targetIntent === planToDismiss.intentId)
        );
        updatedSuppressions.push(suppression);

        // Also create a pending proposal for preferences when relevant (INV-107)
        const existingProposals = envelope?.payload.proposals ?? [];
        const updatedProposals = [...existingProposals];

        if (reasonKey === 'dont_suggest_today') {
          const proposalKey = `suppress_${planToDismiss.intentId}_recommendations`;
          const pendingProposal = createMemoryFact(
            proposalKey,
            'user_requested_today',
            'pending',
            {
              source: 'user_feedback',
              recordedAt: snapshotAsOf,
              note: proposalNote,
            },
            snapshotAsOf
          );
          const filtered = updatedProposals.filter(p => p.key !== proposalKey);
          filtered.push(pendingProposal);
          updatedProposals.length = 0;
          updatedProposals.push(...filtered);
        }

        sharedStorage.save(
          {
            memoryFacts: envelope?.payload.memoryFacts ?? [],
            proposals: updatedProposals,
            suppressions: updatedSuppressions,
            promptBudget: envelope?.payload.promptBudget ?? { date: snapshotAsOf.slice(0, 10), count: 0 },
            acceptedPlanIds: envelope?.payload.acceptedPlanIds ?? [],
          },
          snapshotAsOf
        );

        activeModal = null;
        update();
      });
    }

    // -------------------------------------------------------------
    // PROPOSAL CONFIRM & REJECT HANDLERS (INV-107)
    // -------------------------------------------------------------
    root.querySelectorAll('.btn-confirm-proposal').forEach(btn => {
      btn.addEventListener('click', async e => {
        const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
        if (!key) return;

        const envelope = sharedStorage.load();
        const proposals = envelope?.payload.proposals ?? [];
        const match = proposals.find(p => p.key === key);
        if (match) {
          // Promote to confirmed
          const confirmedFact = createMemoryFact(
            match.key,
            match.value,
            'confirmed',
            {
              source: 'user_confirmed',
              recordedAt: snapshotAsOf,
              note: match.provenance.note,
            },
            snapshotAsOf
          );

          // Write back confirmed fact through MemoryPort (AC-106-3)
          await memoryPort.writeBack(confirmedFact);
          actionFeedbackMessage = `Preference confirmed: ${key.replace(/_/g, ' ')}`;
          update();
        }
      });
    });

    root.querySelectorAll('.btn-reject-proposal').forEach(btn => {
      btn.addEventListener('click', e => {
        const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
        if (!key) return;

        const envelope = sharedStorage.load();
        const proposals = envelope?.payload.proposals ?? [];
        const match = proposals.find(p => p.key === key);
        if (match) {
          // Update status to rejected
          const rejectedFact = createMemoryFact(
            match.key,
            match.value,
            'rejected',
            {
              source: 'user_feedback',
              recordedAt: snapshotAsOf,
              note: 'Declined by user',
            },
            snapshotAsOf
          );

          const updatedProposals = proposals.filter(p => p.key !== key);
          updatedProposals.push(rejectedFact);

          sharedStorage.save(
            {
              memoryFacts: envelope?.payload.memoryFacts ?? [],
              proposals: updatedProposals,
              suppressions: envelope?.payload.suppressions ?? [],
              promptBudget: envelope?.payload.promptBudget ?? { date: snapshotAsOf.slice(0, 10), count: 0 },
              acceptedPlanIds: envelope?.payload.acceptedPlanIds ?? [],
            },
            snapshotAsOf
          );

          actionFeedbackMessage = `Proposal marked not true: ${key.replace(/_/g, ' ')}`;
          update();
        }
      });
    });

    // -------------------------------------------------------------
    // STORAGE DATA CONTROLS (EXPORT / RESET)
    // -------------------------------------------------------------
    const handleExport = () => {
      const raw = sharedStorage.exportRaw() || '{"status": "empty"}';
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yori-storage-backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      actionFeedbackMessage = STRINGS.storageError.exportedNotice;
      update();
    };

    const exportBtn = root.querySelector('#btn-export-storage');
    if (exportBtn) exportBtn.addEventListener('click', handleExport);

    const meExportBtn = root.querySelector('#btn-me-export');
    if (meExportBtn) meExportBtn.addEventListener('click', handleExport);

    let confirmingReset = false;
    const handleReset = (btnEl: HTMLButtonElement) => {
      if (!confirmingReset) {
        confirmingReset = true;
        btnEl.textContent = STRINGS.me.confirmResetBtn;
        btnEl.style.backgroundColor = '#991B1B';
        return;
      }
      sharedStorage.reset();
      confirmingReset = false;
      actionFeedbackMessage = STRINGS.me.resetNotice;
      currentScene = 'clear';
      update();
    };

    const resetBtn = root.querySelector('#btn-reset-storage') as HTMLButtonElement | null;
    if (resetBtn) resetBtn.addEventListener('click', () => handleReset(resetBtn));

    const meResetBtn = root.querySelector('#btn-me-reset') as HTMLButtonElement | null;
    if (meResetBtn) meResetBtn.addEventListener('click', () => handleReset(meResetBtn));

    const connectBtn = root.querySelector('#btn-xmemo-connect');
    if (connectBtn) {
      connectBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/xmemo/auth-url', { method: 'POST' });
          if (res.ok) {
            const data = (await res.json()) as { authUrl?: string };
            if (data.authUrl) {
              window.location.href = data.authUrl;
            }
          }
        } catch {
          // ignore error
        }
      });
    }

    const disconnectBtn = root.querySelector('#btn-xmemo-disconnect');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/xmemo/disconnect', { method: 'POST' });
          if (res.ok) {
            xmemoStatus = { enabled: true, connected: false };
            actionFeedbackMessage = 'XMemo disconnected';
            update();
          }
        } catch {
          // ignore error
        }
      });
    }

    // Coordinate reasoning asynchronously after deterministic composition (Requirement 4)
    if (coordinatedScene !== currentScene) {
      const allPlans = [living.now, ...living.ahead].filter((p): p is PreparedPlan => p !== null);
      if (allPlans.length > 0) {
        coordinatedScene = currentScene;
        const requestScene = currentScene;
        const requestId = ++reasoningRequestId;

        coordinateReasoning(living, snapshot, combinedMemory)
          .then(res => {
            // Guard against scene race: only apply if the user hasn't switched scene (Finding 2)
            if (currentScene !== requestScene || requestId !== reasoningRequestId) {
              return;
            }
            if (res.applied) {
              const rationales: Record<string, string> = {};
              res.rationaleMap.forEach((text, id) => {
                rationales[id] = text;
              });
              reasoningState = {
                scene: requestScene,
                now: res.now,
                ahead: res.ahead,
                rationales,
              };
              update();
            }
          })
          .catch(() => {
            // Silently handled in UI with deterministic order preserved
          });
      }
    }
  }

  update();
}
