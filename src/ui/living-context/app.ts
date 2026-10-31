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
  ContextSignal,
  RealSignal,
} from '../../core/contracts/index.js';
import {
  createMemoryFact,
  createSimulatedSignal,
  freezeSnapshot,
} from '../../core/contracts/index.js';
import type { WeatherData } from '../../adapters/providers/weather-types.js';
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
import { renderSourcesSheet } from './sources-view.js';
import { renderAdjustDialog, type AdjustDialogValues } from '../review/adjust-dialog.js';
import { renderDismissDialog } from '../review/dismiss-dialog.js';
import { attachModalAccessibility, restoreInvokingFocus } from '../review/modal-accessibility.js';
import { renderMeView } from '../me/me-view.js';
import { createCompositeMemoryPort, type MemoryPort } from '../../adapters/xmemo/index.js';
import { DEFAULT_DAILY_PROMPT_BUDGET } from '../../core/policy/index.js';
import { coordinateReasoning } from '../../app/reasoning-coordinator.js';
import { createActionStateStore, type ActionStateStore } from '../action-state/index.js';
import {
  renderAskBar,
  attachAskBarEvents,
  renderConversationOverlay,
  attachConversationEvents,
} from '../conversation/index.js';
import {
  defaultModelCommandInterpreter,
  ModelCommandInterpreter,
} from '../conversation/model-interpreter.js';
import {
  buildHomeComposition,
  deriveTripDetailVM,
  deriveRestaurantDetailVM,
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  createLunchPlacesEvidenceBundle,
  createFuelEvidenceBundle,
  type EvidenceBundle,
} from '../view-models/index.js';
import { defaultLocationPort, DEFAULT_DEMO_COORDS } from '../../adapters/providers/location-port.js';
import { mockFuelAdapter } from '../../plugins/fuel/adapter.js';
import { mockLunchAdapter } from '../../plugins/lunch/adapter.js';
import { buildGroundedNavigateUrl } from '../navigation/navigate-url.js';
import { globalDecisionLogger } from '../../adapters/model/decision-log.js';
import { renderV2Home } from './v2-home-view.js';
import {
  renderTripDetail,
  renderRestaurantDetail,
  renderPlansView,
  renderForYouView,
} from './v2-detail-views.js';
import {
  getAllConnectorsStatus,
  renderConnectorsView,
  locationConnectorPort,
  xmemoConnectorPort,
  notificationsConnectorPort,
  type ConnectorId,
  type ConnectorStatus,
} from '../connectors/index.js';

export type DemoSceneId =
  | 'clear'
  | 'rain'
  | 'away-lunch'
  | 'lunch'
  | 'busy-lunch'
  | 'missing-weather'
  | 'corrupt-storage'
  | 'multi-candidate'
  | 'fuel';

export type UiVersion = 'v1' | 'v2';

/**
 * Resolve UI version from raw input or build-time environment.
 * CUTLINE_CHECK_V2 passed with outcome CONTINUE (docs/architecture/LIVING_CONTEXT_V2.md §11).
 * Promoted to 'v2' as default in task PREVIEW-HEAD-TRUTH (INBOX-20261031-15EADE).
 * When raw is undefined, null, or empty string, defaults to 'v2'.
 * Explicit 'v1' acts as the verified rollback path.
 * Unknown or invalid tokens safely fail closed to 'v1'.
 */
export function resolveUiVersion(raw?: string | null): UiVersion {
  if (raw === undefined || raw === null) {
    return 'v2';
  }
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed === '') {
    return 'v2';
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'v2') {
    return 'v2';
  }
  if (lower === 'v1') {
    return 'v1';
  }
  return 'v1';
}

/**
 * Resolve the effective UI version for the current runtime.
 * Query string parameter `?ui=v1|v2` takes precedence (for testing and side-by-side inspection),
 * falling back to build-time `import.meta.env.VITE_YORI_UI` or `process.env.VITE_YORI_UI`.
 */
export function getEffectiveUiVersion(): UiVersion {
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlUi = params.get('ui');
      if (urlUi !== null) {
        return resolveUiVersion(urlUi);
      }
    } catch {
      // ignore
    }
  }

  const envRaw =
    (typeof process !== 'undefined' && process.env ? process.env.VITE_YORI_UI : undefined) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env
      ? ((import.meta as any).env.VITE_YORI_UI as string | undefined)
      : undefined);
  return resolveUiVersion(envRaw);
}

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
  storage?: YoriStorage,
  liveWeatherSignal?: ContextSignal | null,
  externalMemoryFacts?: readonly MemoryFact[]
): {
  pipelineResult: PipelineResult;
  spatialMapEvidence: SpatialMapEvidence | null;
  storageError: boolean;
  storage: YoriStorage;
  snapshotAsOf: string;
  snapshotTimezone: string;
  snapshot: ContextSnapshot;
  combinedMemory: readonly MemoryFact[];
  evidenceBundle?: EvidenceBundle;
} {
  const plugins = staticPluginRegistry.getAll();
  const effectiveStorage = storage ?? new YoriStorage(new WebStorageDriver());

  function injectWeather(snap: ContextSnapshot): ContextSnapshot {
    if (!liveWeatherSignal || scene === 'missing-weather') return snap;
    return freezeSnapshot({
      ...snap,
      signals: [
        ...snap.signals.filter(s => s.kind !== 'weather'),
        liveWeatherSignal,
      ],
    });
  }

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

  const activeConfirmedFacts: MemoryFact[] = [...storedConfirmedFacts.filter(f => f.status === 'confirmed')];
  if (externalMemoryFacts && externalMemoryFacts.length > 0) {
    const localKeys = new Set(activeConfirmedFacts.map(f => f.key));
    for (const ef of externalMemoryFacts) {
      if (ef.status === 'confirmed' && !localKeys.has(ef.key)) {
        activeConfirmedFacts.push(ef);
      }
    }
  }
  const userPrep = activeConfirmedFacts.find(f => f.key === 'prep_buffer_preference');
  if (userPrep && typeof userPrep.value === 'object' && userPrep.value !== null) {
    const val = userPrep.value as { prepMinutes?: number; bufferMinutes?: number };
    if (
      typeof val.bufferMinutes === 'number' &&
      Number.isInteger(val.bufferMinutes) &&
      val.bufferMinutes >= 0 &&
      val.bufferMinutes <= 60 &&
      !activeConfirmedFacts.some(f => f.key === 'prep_buffer_minutes')
    ) {
      activeConfirmedFacts.push(
        createMemoryFact(
          'prep_buffer_minutes',
          val.bufferMinutes,
          'confirmed',
          userPrep.provenance,
          userPrep.updatedAt
        )
      );
    }
    if (
      typeof val.prepMinutes === 'number' &&
      Number.isInteger(val.prepMinutes) &&
      val.prepMinutes >= 0 &&
      val.prepMinutes <= 120 &&
      !activeConfirmedFacts.some(f => f.key === 'prep_duration_minutes')
    ) {
      activeConfirmedFacts.push(
        createMemoryFact(
          'prep_duration_minutes',
          val.prepMinutes,
          'confirmed',
          userPrep.provenance,
          userPrep.updatedAt
        )
      );
    }
  }

  const storedUserConfirmedKeys = new Set(activeConfirmedFacts.map(f => f.key));

  switch (scene) {
    case 'clear': {
      const clock = createFixedClock(D1_INITIAL_CLOCK);
      const player = createScenarioPlayer(d1Scenario, clock);
      const snapshots = player.getSnapshots();
      const rawSnapshot = snapshots[snapshots.length - 1]!;
      const latestSnapshot = injectWeather(rawSnapshot);

      // Merge seed facts with stored facts & proposals
      const combinedMemory = [
        ...d1MemoryFacts.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
        ...activeConfirmedFacts,
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
      const rawSnapshot = player.getSnapshotAt('2026-10-28T20:35:00.000Z');
      const snapshot = injectWeather(rawSnapshot);

      const combinedMemory = [
        ...d2MemoryFacts.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
        ...activeConfirmedFacts,
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

      const rainBundle = createRainEvidenceBundle({
        snapshot,
        sceneClockIso: snapshot.asOf,
        timezone: snapshot.timezone || 'America/Los_Angeles',
        userConfirmedKeys: storedUserConfirmedKeys,
        memoryFacts: combinedMemory,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory,
        evidenceBundle: rainBundle,
      };
    }

    case 'away-lunch': {
      const clock = createFixedClock('2026-10-28T19:10:00.000Z');
      const player = createScenarioPlayer(d3Scenario, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T19:10:00.000Z');

      const combinedMemory = [
        ...d3MemoryFacts.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
        ...activeConfirmedFacts,
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

      const awayLunchBundle = createLunchEvidenceBundle({
        snapshot,
        sceneClockIso: snapshot.asOf,
        timezone: snapshot.timezone || 'America/Los_Angeles',
        userConfirmedKeys: storedUserConfirmedKeys,
        memory: combinedMemory,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory,
        evidenceBundle: awayLunchBundle,
      };
    }

    case 'lunch': {
      const locPortStatus = defaultLocationPort.getLocation();
      const isLocationAvailable = locPortStatus.status === 'available' && locPortStatus.coords;

      const locSig = createSimulatedSignal({
        kind: 'location_status',
        value: {
          isHome: false,
          currentArea: 'Downtown',
          status: locPortStatus.status,
          lat: locPortStatus.coords?.lat,
          lng: locPortStatus.coords?.lng,
          source: locPortStatus.source || 'fixture',
          accuracy: locPortStatus.accuracy,
          notice: locPortStatus.notice,
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      const tempSnapshot: ContextSnapshot = {
        id: 'snapshot-lunch-temp',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [locSig],
      };

      const placesSignals = isLocationAvailable ? mockLunchAdapter.signals(tempSnapshot) : [];
      const placesSig =
        placesSignals[0] ??
        createSimulatedSignal({
          kind: 'places_lunch',
          value: {
            status: isLocationAvailable ? 'empty' : 'error',
            places: [],
            originCoords: locPortStatus.coords,
          },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        });
      const places = (placesSig.value as any).places ?? [];

      const schedSig = createSimulatedSignal({
        kind: 'schedule_window',
        value: {
          freeUntil: '2026-10-28T22:00:00.000Z',
          windowStart: '2026-10-28T19:10:00.000Z',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      const eatingSig = createSimulatedSignal({
        kind: 'eating_status',
        value: { eatenToday: false },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      const snapshot: ContextSnapshot = freezeSnapshot({
        id: 'snapshot-lunch-v5',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [locSig, schedSig, eatingSig, placesSig],
      });

      const combinedMemory = [
        ...d3MemoryFacts.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
        ...activeConfirmedFacts,
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

      const topCandidate = result.livingContext.now?.optionsOrSteps?.[0] as any;
      const mapEvidence: SpatialMapEvidence | null =
        isLocationAvailable && topCandidate
          ? {
              placeOrRoute: {
                name: topCandidate.name,
                destination: topCandidate.address || `${topCandidate.coords?.lat}, ${topCandidate.coords?.lng}`,
              },
              spatialEvidence: locSig,
            }
          : null;

      const lunchBundle = createLunchPlacesEvidenceBundle({
        places,
        snapshot,
        originCoords: locPortStatus.coords,
        userConfirmedKeys: storedUserConfirmedKeys,
        memory: combinedMemory,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory,
        evidenceBundle: lunchBundle,
      };
    }

    case 'busy-lunch': {
      const clock = createFixedClock('2026-10-28T19:10:00.000Z');
      const player = createScenarioPlayer(d4ScenarioBusy, clock);
      const snapshot = player.getSnapshotAt('2026-10-28T19:10:00.000Z');

      const combinedMemory = [
        ...d4MemoryFacts.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
        ...activeConfirmedFacts,
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

      const rawSnapshot: ContextSnapshot = {
        id: 'snapshot-multi-candidate',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [calendarSig, travelSig, weatherSig, locationSig, scheduleSig, eatingSig],
      };
      const snapshot = injectWeather(rawSnapshot);

      // UI-DEMO-FY: Seed a demo routine proposal if neither confirmed nor rejected in storage
      const hasPrepConfirmed = activeConfirmedFacts.some(f => f.key === 'prep_buffer_preference');
      const hasPrepProposal = storedProposals.some(p => p.key === 'prep_buffer_preference');
      const demoProposals: MemoryFact[] = (!hasPrepConfirmed && !hasPrepProposal)
        ? [
            createMemoryFact(
              'prep_buffer_preference',
              { prepMinutes: 20, bufferMinutes: 10 },
              'pending',
              {
                source: 'seed',
                recordedAt: snapshot.asOf,
                note: 'Demo profile · sample preference',
              },
              snapshot.asOf
            ),
          ]
        : [];

      const combinedMemory = [
        ...d1MemoryFacts.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
        ...d3MemoryFacts.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
        ...activeConfirmedFacts,
        ...storedProposals,
        ...demoProposals,
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

    case 'fuel': {
      const locPortStatus = defaultLocationPort.getLocation();
      const isLocationAvailable = locPortStatus.status === 'available' && locPortStatus.coords;

      const locSig = createSimulatedSignal({
        kind: 'location_status',
        value: {
          status: locPortStatus.status,
          lat: locPortStatus.coords?.lat,
          lng: locPortStatus.coords?.lng,
          source: locPortStatus.source || 'fixture',
          accuracy: locPortStatus.accuracy,
          notice: locPortStatus.notice,
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      const tempSnapshot: ContextSnapshot = {
        id: 'snapshot-fuel-temp',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [locSig],
      };

      const placesSignals = isLocationAvailable ? mockFuelAdapter.signals(tempSnapshot) : [];
      const placesSig =
        placesSignals[0] ??
        createSimulatedSignal({
          kind: 'places_fuel',
          value: {
            status: isLocationAvailable ? 'empty' : 'error',
            places: [],
            originCoords: locPortStatus.coords,
          },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1.0,
          consentScope: 'device_only',
        });
      const places = (placesSig.value as any).places ?? [];

      const fuelSig = createSimulatedSignal({
        kind: 'fuel_percent',
        value: { fuelPercent: 18, needsFuel: true },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      const schedSig = createSimulatedSignal({
        kind: 'schedule_window',
        value: {
          freeUntil: '2026-10-28T22:00:00.000Z',
          nextEvent: 'Evening commute',
        },
        issuedAt: '2026-10-28T19:10:00.000Z',
        validFor: 3600000,
        confidence: 1.0,
        consentScope: 'device_only',
      });

      const snapshot: ContextSnapshot = freezeSnapshot({
        id: 'snapshot-fuel-d5',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [fuelSig, locSig, schedSig, placesSig],
      });

      const result = runPipeline({
        snapshot,
        memory: storedConfirmedFacts,
        clock: '2026-10-28T19:10:00.000Z',
        plugins,
        storage: effectiveStorage,
        suppressions: storedSuppressions,
      });

      const topCandidate = result.livingContext.now?.optionsOrSteps?.[0] as any;
      const mapEvidence: SpatialMapEvidence | null =
        isLocationAvailable && topCandidate
          ? {
              placeOrRoute: {
                name: topCandidate.name,
                destination: topCandidate.address || `${topCandidate.coords?.lat}, ${topCandidate.coords?.lng}`,
              },
              spatialEvidence: locSig,
            }
          : null;

      const fuelBundle = createFuelEvidenceBundle({
        places,
        snapshot,
        originCoords: locPortStatus.coords,
      });

      return {
        pipelineResult: result,
        spatialMapEvidence: mapEvidence,
        storageError: false,
        storage: effectiveStorage,
        snapshotAsOf: snapshot.asOf,
        snapshotTimezone: snapshot.timezone || 'America/Los_Angeles',
        snapshot,
        combinedMemory: storedConfirmedFacts,
        evidenceBundle: fuelBundle,
      };
    }
  }
}

/**
 * Handles confirmation of a memory proposal honestly via MemoryPort (BACKLOG-20261031-XKEYDEL-P2).
 * Fails closed if writeBack returns unsuccessful or throws:
 * - Does NOT promote the proposal to confirmed.
 * - Proposal remains pending in memory / storage.
 * - Does NOT show 'Preference confirmed'.
 * - Shows honest, calm non-technical failure message.
 * - Logs sanitized reason without leaking fact key values or tokens.
 */
export async function handleConfirmProposal(
  key: string,
  sharedStorage: YoriStorage,
  combinedMemory: readonly MemoryFact[],
  memoryPort: MemoryPort,
  snapshotAsOf: string
): Promise<{
  readonly success: boolean;
  readonly message: string;
  readonly warning?: string;
}> {
  const envelope = sharedStorage.load();
  const proposals = envelope?.payload.proposals ?? [];
  const match =
    proposals.find(p => p.key === key) ??
    combinedMemory.find(p => p.key === key && p.status === 'pending');
  if (!match) {
    return { success: false, message: 'Proposal not found' };
  }

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

  try {
    // Write back confirmed fact through MemoryPort (AC-106-3)
    const result = await memoryPort.writeBack(confirmedFact);
    if (!result || !result.success) {
      // Remote write back failed: keep proposal pending and show calm, honest failure message
      const rawReason = result?.error ?? 'remote_write_unsuccessful';
      const sanitizedReason = rawReason.replace(/[^\w\s-]/g, '').slice(0, 80);
      console.warn(`[YoriMemory] writeBack failed: ${sanitizedReason}`);
      return {
        success: false,
        message: 'Unable to save preference right now. Your setting has not been saved.',
        warning: sanitizedReason,
      };
    }

    return {
      success: true,
      message: `Preference confirmed: ${key.replace(/_/g, ' ')}`,
    };
  } catch (err: unknown) {
    const sanitizedReason = err instanceof Error ? err.name : 'UnknownError';
    console.warn(`[YoriMemory] writeBack exception: ${sanitizedReason}`);
    return {
      success: false,
      message: 'Unable to save preference right now. Your setting has not been saved.',
      warning: sanitizedReason,
    };
  }
}

/**
 * Handles rejection of a memory proposal ('Not true') (BACKLOG-20261031-XKEYDEL-P2).
 */
export function handleRejectProposal(
  key: string,
  sharedStorage: YoriStorage,
  combinedMemory: readonly MemoryFact[],
  snapshotAsOf: string
): {
  readonly success: boolean;
  readonly message: string;
} {
  try {
    const envelope = sharedStorage.load();
    const proposals = envelope?.payload.proposals ?? [];
    const match =
      proposals.find(p => p.key === key) ??
      combinedMemory.find(p => p.key === key && p.status === 'pending');
    if (!match) {
      return { success: false, message: 'Proposal not found' };
    }

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

    return {
      success: true,
      message: `Proposal marked not true: ${key.replace(/_/g, ' ')}`,
    };
  } catch (err: unknown) {
    const sanitizedReason = err instanceof Error ? err.name : 'UnknownError';
    console.warn(`[YoriMemory] rejectProposal exception: ${sanitizedReason}`);
    return {
      success: false,
      message: 'Unable to decline proposal right now. Please try again.',
    };
  }
}

export function renderApp(
  root: HTMLElement,
  initialScene: DemoSceneId = 'clear',
  customStorage?: YoriStorage,
  uiVersionOverride?: UiVersion | string,
  customMemoryPort?: MemoryPort
): void {
  const uiVersion: UiVersion = resolveUiVersion(uiVersionOverride ?? getEffectiveUiVersion());
  root.setAttribute('data-ui-version', uiVersion);
  let currentScene = initialScene;
  let activeTab: 'today' | 'home' | 'plans' | 'for-you' | 'me' = 'today';
  let activeDetail: {
    type: 'trip' | 'restaurant' | 'connectors';
    planId?: string;
    candidateId?: string;
    selectedMode?: string;
    isSaved?: boolean;
    originatingElementId?: string;
  } | null = null;

  let demoPanelOpen = false;
  let demoPanelCleanup: (() => void) | null = null;

  let isDevMode = false;
  if (typeof window !== 'undefined') {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('dev') === '1' || p.get('test') === '1' || Boolean((import.meta as any).env?.DEV)) {
        isDevMode = true;
        sessionStorage.setItem('yori_dev', '1');
      } else if (sessionStorage.getItem('yori_dev') === '1') {
        isDevMode = true;
      }
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('yori:open-demo-panel', () => {
      demoPanelOpen = true;
      update();
    });
  }

  const testHooksEnabled =
    typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined'
      ? __YORI_ENABLE_TEST_HOOKS__
      : Boolean((import.meta as any).env?.DEV);

  const isDevOrTest =
    testHooksEnabled &&
    (Boolean((import.meta as any).env?.DEV) ||
      (typeof window !== 'undefined' &&
        typeof window.location?.search === 'string' &&
        new URLSearchParams(window.location.search).get('test') === '1'));

  if (isDevOrTest && typeof window !== 'undefined' && window.location?.search) {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlScene = params.get('scene') as DemoSceneId | null;
      if (urlScene) {
        currentScene = urlScene;
      }
      const geoConsent = params.get('geo_consent') || params.get('geo');
      if (geoConsent === 'prompt') {
        defaultLocationPort.setLocation('prompt');
      } else if (geoConsent === 'denied') {
        defaultLocationPort.setLocation('denied');
      } else if (geoConsent === 'unavailable') {
        defaultLocationPort.setLocation('unavailable');
      }
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      if (activeDetail) {
        const origId = activeDetail.originatingElementId;
        activeDetail = null;
        update();
        if (origId) {
          requestAnimationFrame(() => {
            const el = document.getElementById(origId) ?? root.querySelector('.now-card, .v2-candidate-card');
            const toFocus = el?.matches('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')
              ? el
              : el?.querySelector<HTMLElement>('button, a, [tabindex]:not([tabindex="-1"])') ?? el;
            (toFocus as HTMLElement)?.focus();
          });
        }
      }
    });
  }
  const sharedStorage = customStorage ?? new YoriStorage(new WebStorageDriver());
  const memoryPort = customMemoryPort ?? createCompositeMemoryPort(sharedStorage);
  let activeLoadedFacts: readonly MemoryFact[] = [];
  const actionStore: ActionStateStore = createActionStateStore();
  let conversationCleanup: (() => void) | null = null;

  let currentEvidenceBundle: EvidenceBundle | undefined = undefined;

  if (isDevOrTest && typeof window !== 'undefined') {
    (window as any).__YORI_SET_LOCATION__ = (
      status: 'available' | 'unavailable' | 'denied' | 'prompt',
      coords?: { lat: number; lng: number }
    ) => {
      defaultLocationPort.setLocation(status, coords);
      update();
    };
    (window as any).__YORI_SET_PLACES_ERROR__ = (shouldError: boolean) => {
      const provider = mockFuelAdapter.getProvider();
      if ('setSimulateError' in provider && typeof (provider as any).setSimulateError === 'function') {
        (provider as any).setSimulateError(shouldError);
      }
      const lunchProvider = mockLunchAdapter.getProvider();
      if ('setSimulateError' in lunchProvider && typeof (lunchProvider as any).setSimulateError === 'function') {
        (lunchProvider as any).setSimulateError(shouldError);
      }
      update();
    };
    (window as any).__YORI_DECISION_LOGGER__ = globalDecisionLogger;
    (window as any).__YORI_BUILD_NAV_URL__ = buildGroundedNavigateUrl;
    (window as any).__YORI_GET_CURRENT_EVIDENCE_BUNDLE__ = () => currentEvidenceBundle;
    (window as any).__YORI_ACTION_STORE__ = actionStore;
    (window as any).__YORI_MODEL_INTERPRETER__ = defaultModelCommandInterpreter;
    (window as any).__YORI_MODEL_COMMAND_INTERPRETER_CLASS__ = ModelCommandInterpreter;
  }

  let activeModal:
    | null
    | { type: 'why'; plan: PreparedPlan }
    | { type: 'sources'; mode: 'demo' | 'live' }
    | { type: 'adjust'; plan: PreparedPlan; values: AdjustDialogValues }
    | { type: 'dismiss'; plan: PreparedPlan } = null;
  let modalInvokingId: string | null = null;
  let modalInvokingSelector: string | null = null;
  let modalCleanup: (() => void) | null = null;

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

  let xmemoStatus: {
    enabled: boolean;
    connected: boolean;
    statusText?: string;
    connectionState?: 'off' | 'connected-mock' | 'error-fallback';
  } = {
    enabled: false,
    connected: false,
    connectionState: 'off',
  };

  let weatherStatus: {
    enabled: boolean;
    provider?: string;
    attribution?: { text: string; url: string; license?: string };
    demoCity?: { name: string; latitude: number; longitude: number; timezone: string };
  } = {
    enabled: false,
  };
  let liveWeatherSignal: RealSignal<WeatherData> | null = null;
  let contextMode: 'demo' | 'live' = 'demo';
  if (typeof window !== 'undefined' && window.location?.search) {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get('mode') === 'live') {
        contextMode = 'live';
        defaultLocationPort.setLocation('prompt');
        defaultModelCommandInterpreter.setMode('live');
      }
    } catch {
      // ignore
    }
  }
  let liveLocationStatus = defaultLocationPort.getLocation();

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
          xmemoStatus = {
            ...newStatus,
            connectionState: newStatus.enabled && newStatus.connected ? 'connected-mock' : 'off',
          };
          activeLoadedFacts = await memoryPort.loadFacts();
          const portStatus = memoryPort.getStatus();
          if (portStatus.connectionState) {
            xmemoStatus.connectionState = portStatus.connectionState;
          }
          update();
        }
      }
    } catch {
      // Fallback silently
      try {
        activeLoadedFacts = await memoryPort.loadFacts();
        const portStatus = memoryPort.getStatus();
        if (portStatus.connectionState) {
          xmemoStatus.connectionState = portStatus.connectionState;
        }
      } catch {
        // ignore
      }
      update();
    }
  }

  async function checkWeatherStatus() {
    try {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch('/api/weather/status', { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          if (data.enabled) {
            weatherStatus = data;
            try {
              const currResp = await fetch('/api/weather/current', { cache: 'no-store' });
              if (currResp.ok) {
                const currData = await currResp.json();
                if (currData.signals && currData.signals.length > 0) {
                  liveWeatherSignal = currData.signals[0];
                  update();
                }
              }
            } catch {
              // fail-closed
            }
          }
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  let latestConnectorStatuses: Record<ConnectorId, ConnectorStatus> = {
    location: { id: 'location', state: 'unavailable', detail: 'Checking location...', source: 'navigator.permissions', updatedAt: new Date().toISOString() },
    calendar: { id: 'calendar', state: 'unavailable', detail: 'Not available yet', source: 'None', updatedAt: new Date().toISOString() },
    weather: { id: 'weather', state: 'owner_gated', detail: 'Live weather is off (owner setting)', source: 'Open-Meteo', updatedAt: new Date().toISOString() },
    xmemo: { id: 'xmemo', state: 'owner_gated', detail: 'XMemo OAuth disabled (owner gated)', source: 'XMemo OAuth', updatedAt: new Date().toISOString() },
    notifications: { id: 'notifications', state: 'unavailable', detail: 'Notifications not supported', source: 'Notification API', updatedAt: new Date().toISOString() },
  };

  async function refreshConnectorStatuses() {
    try {
      latestConnectorStatuses = await getAllConnectorsStatus();
    } catch {
      // ignore
    }
  }

  void checkXMemoStatus();
  void checkWeatherStatus();
  void refreshConnectorStatuses();

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
      evidenceBundle,
    } = computeSceneState(
      currentScene,
      sharedStorage,
      weatherStatus.enabled ? liveWeatherSignal : null,
      activeLoadedFacts
    );

    currentEvidenceBundle = evidenceBundle;

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

    const acceptedPlanIds: readonly string[] = storedEnvelope?.payload.acceptedPlanIds ?? [];
    const storedSuppressions = storedEnvelope?.payload.suppressions ?? [];
    const rawStoredConfirmed = storedEnvelope?.payload.memoryFacts ?? [];
    const activeStoredConfirmed: MemoryFact[] = [...rawStoredConfirmed.filter(f => f.status === 'confirmed')];
    const uPrep = activeStoredConfirmed.find(f => f.key === 'prep_buffer_preference');
    if (uPrep && typeof uPrep.value === 'object' && uPrep.value !== null) {
      const val = uPrep.value as { prepMinutes?: number; bufferMinutes?: number };
      if (
        typeof val.bufferMinutes === 'number' &&
        Number.isInteger(val.bufferMinutes) &&
        val.bufferMinutes >= 0 &&
        val.bufferMinutes <= 60 &&
        !activeStoredConfirmed.some(f => f.key === 'prep_buffer_minutes')
      ) {
        activeStoredConfirmed.push(
          createMemoryFact('prep_buffer_minutes', val.bufferMinutes, 'confirmed', uPrep.provenance, uPrep.updatedAt)
        );
      }
      if (
        typeof val.prepMinutes === 'number' &&
        Number.isInteger(val.prepMinutes) &&
        val.prepMinutes >= 0 &&
        val.prepMinutes <= 120 &&
        !activeStoredConfirmed.some(f => f.key === 'prep_duration_minutes')
      ) {
        activeStoredConfirmed.push(
          createMemoryFact('prep_duration_minutes', val.prepMinutes, 'confirmed', uPrep.provenance, uPrep.updatedAt)
        );
      }
    }
    const userConfirmedKeys = new Set(activeStoredConfirmed.map(f => f.key));

    const syncedKeys = new Set<string>();
    if (activeLoadedFacts && activeLoadedFacts.length > 0) {
      for (const f of activeLoadedFacts) {
        if ((f.provenance?.source as unknown as string) === 'xmemo') {
          syncedKeys.add(f.key);
          if (f.key === 'prep_buffer_preference') {
            syncedKeys.add('prep_buffer_minutes');
            syncedKeys.add('prep_duration_minutes');
          }
        }
      }
    }

    const living = pipelineResult.livingContext;
    const baseNowPlan = reasoningState && reasoningState.scene === currentScene ? reasoningState.now : living.now;
    const actionState = actionStore.getActionState();
    const storePlan =
      actionState.status === 'updated' || (actionState.status === 'working' && actionState.plan)
        ? actionState.plan
        : undefined;
    const nowPlan = storePlan ?? baseNowPlan;

    const effectiveEvidenceBundle =
      ((nowPlan?.intentId === 'fuel' || nowPlan?.intentId === 'lunch' || nowPlan?.intentId === 'depart')
        ? actionStore.getActiveEvidenceBundle()
        : undefined) ??
      (nowPlan?.intentId === 'depart' && actionStore.getCurrentOverride()
        ? createRainEvidenceBundle({
            snapshot,
            override: actionStore.getCurrentOverride(),
            sceneClockIso: snapshot?.asOf,
            timezone: snapshot?.timezone,
            userConfirmedKeys,
            memoryFacts: combinedMemory,
          })
        : evidenceBundle);
    const effectiveSnapshot =
      ((nowPlan?.intentId === 'fuel' || nowPlan?.intentId === 'lunch' || nowPlan?.intentId === 'depart') ? actionStore.getActiveSnapshot() : undefined) ?? snapshot;

    currentEvidenceBundle = effectiveEvidenceBundle;
    const aheadPlans = reasoningState && reasoningState.scene === currentScene ? reasoningState.ahead : living.ahead;
    const notices = pipelineResult.notices;

    // Keep ActionStateStore command context synchronized with the pipeline-admitted plan and candidate
    const admittedCandidate =
      nowPlan && nowPlan.intentId === 'depart'
        ? {
            intent: 'depart' as const,
            confidence: 1.0,
            evidence: snapshot.signals.filter(s => s.kind === 'calendar'),
          }
        : nowPlan && nowPlan.intentId === 'lunch'
        ? {
            intent: 'lunch' as const,
            confidence: 1.0,
            evidence: snapshot.signals.filter(
              s =>
                s.kind === 'mock_places' ||
                s.kind === 'location_status' ||
                s.kind === 'schedule_window' ||
                s.kind === 'eating_status'
            ),
          }
        : undefined;

    const effectiveNowIso = contextMode === 'live' ? new Date().toISOString() : snapshotAsOf;
    const effectiveTz =
      contextMode === 'live'
        ? (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Los_Angeles')
        : snapshotTimezone;
    const baseGreeting = getGreeting(effectiveNowIso, effectiveTz);

    const hasPreparedCard = Boolean(
      contextMode !== 'live' &&
      (
        (nowPlan && !acceptedPlanIds.includes(nowPlan.id) && !storedSuppressions.some(s => s.targetIntent === nowPlan.intentId || (s as any).intentId === nowPlan.intentId)) ||
        (nowPlan && acceptedPlanIds.includes(nowPlan.id)) ||
        (admittedCandidate && !storedSuppressions.some(s => s.targetIntent === 'lunch' || (s as any).intentId === 'lunch')) ||
        (living.forYou && living.forYou.length > 0)
      ) &&
      currentScene !== 'busy-lunch' &&
      currentScene !== 'corrupt-storage'
    );

    const greeting =
      uiVersion === 'v2'
        ? {
            greeting: baseGreeting.greeting,
            subheading: hasPreparedCard ? STRINGS.header.subheadingPrepared : STRINGS.header.subheadingQuiet,
          }
        : contextMode === 'live'
        ? {
            greeting: baseGreeting.greeting,
            subheading: `Live context · Device time ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
          }
        : baseGreeting;

    const sourcesSubline =
      contextMode === 'demo'
        ? 'Demo · simulated scenes'
        : (() => {
            const parts = ['Device clock'];
            if (weatherStatus.enabled && liveWeatherSignal) {
              parts.push('Weather');
            }
            if (liveLocationStatus.status === 'available') {
              parts.push('Location');
            }
            if (xmemoStatus.enabled && xmemoStatus.connected) {
              parts.push('Memories');
            }
            return parts.join(' · ');
          })();

    actionStore.setCommandContext({
      plan: contextMode === 'live' ? null : (nowPlan ?? null),
      candidate: contextMode === 'live' ? undefined : admittedCandidate,
      snapshot,
      memory: combinedMemory,
      sceneId: contextMode === 'live' ? 'live' : currentScene,
      userConfirmedKeys,
    });
    const nowPresentation = nowPlan ? formatNowPlan(nowPlan) : null;
    const isNowAccepted = nowPlan ? acceptedPlanIds.includes(nowPlan.id) : false;

    // Build Main Content based on activeTab
    let mainContentHtml = '';

    if (activeTab === 'me') {
      const memoryFacts = activeLoadedFacts.length > 0
        ? activeLoadedFacts
        : (storedEnvelope?.payload.memoryFacts ?? []);
      const storedProposals = storedEnvelope?.payload.proposals ?? [];
      const pendingFromMemory = combinedMemory.filter(
        m => m.status === 'pending' && !storedProposals.some(p => p.key === m.key)
      );
      const proposals = [...storedProposals, ...pendingFromMemory];
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
    } else if (uiVersion === 'v2') {
      let v2BodyHtml = '';
      if (activeDetail?.type === 'trip' && nowPlan) {
        const tripVM = deriveTripDetailVM({
          plan: nowPlan,
          spatialEvidence: spatialMapEvidence,
          selectedMode: activeDetail.selectedMode,
          userConfirmedKeys,
          snapshot,
          acceptedPlanIds,
        });
        v2BodyHtml = renderTripDetail(tripVM);
      } else if (activeDetail?.type === 'restaurant' && nowPlan) {
        const firstOpt = nowPlan.optionsOrSteps?.[0];
        const defaultCandId =
          typeof firstOpt !== 'string' && firstOpt ? firstOpt.id : 'cand-1';
        const candidateId = activeDetail.candidateId || defaultCandId;
        const restaurantBundle =
          effectiveEvidenceBundle ??
          createLunchEvidenceBundle({
            sceneClockIso: snapshot?.asOf ?? '2026-10-28T19:10:00.000Z',
            timezone: snapshotTimezone,
            userConfirmedKeys,
            isConfirmedTaste: userConfirmedKeys.has('taste_preference_lunch_cuisine'),
            memory: combinedMemory,
          });
        const restaurantVM = deriveRestaurantDetailVM({
          candidateId,
          plan: nowPlan,
          spatialEvidence: spatialMapEvidence,
          isSaved: activeDetail.isSaved ?? false,
          userConfirmedKeys,
          snapshot,
          timezone: snapshotTimezone,
          evidenceBundle: restaurantBundle,
        });
        v2BodyHtml = renderRestaurantDetail(restaurantVM);
      } else if (activeTab === 'plans') {
        v2BodyHtml = renderPlansView(aheadPlans);
      } else if (activeTab === 'for-you') {
        const proposalsVM = living.forYou.map(f => {
          const isConfirmed = userConfirmedKeys.has(f.key);
          const title = humanizeProposalTitle(f.key);
          const basis = isConfirmed
            ? 'Confirmed preference'
            : 'Derived from sample demo profile';
          return { key: f.key, title, basis, value: f.value };
        });
        v2BodyHtml = renderForYouView(proposalsVM);
      } else if (contextMode === 'live') {
        v2BodyHtml = `
          <section class="live-context-container" aria-label="Live Context Dashboard">
            <!-- Calendar Section -->
            <div class="live-card live-notice-card" id="notice-calendar-disconnected" role="status">
              <div class="live-card-row">
                <div class="live-card-icon" aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>
                <div class="live-card-body">
                  <div class="live-card-header">
                    <h2 class="live-card-title">Calendar</h2>
                    <span class="live-source-chip">Not connected</span>
                  </div>
                  <p class="live-card-desc">No calendar connected</p>
                </div>
              </div>
            </div>

            <!-- Weather Section -->
            ${
              weatherStatus.enabled && liveWeatherSignal
                ? `
              <div class="live-card" id="live-weather-card">
                <div class="live-card-row">
                  <div class="live-card-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                    </svg>
                  </div>
                  <div class="live-card-body">
                    <div class="live-card-header">
                      <h2 class="live-card-title">Live Weather</h2>
                      <span class="live-source-chip">Source: Open-Meteo API (Live)</span>
                    </div>
                    <p class="live-card-desc">${(() => {
                      const val = liveWeatherSignal.value as any;
                      if (!val) return 'Weather unavailable';
                      const metrics: string[] = [];
                      if (val.temperatureC !== undefined && val.temperatureC !== null) {
                        metrics.push(`${val.temperatureC}°C`);
                      } else if (val.temperature !== undefined && val.temperature !== null) {
                        metrics.push(`${val.temperature}°F`);
                      }
                      if (typeof val.condition === 'string' && val.condition.trim() !== '') {
                        metrics.push(val.condition.trim());
                      } else if (typeof val.summary === 'string' && val.summary.trim() !== '') {
                        metrics.push(val.summary.trim());
                      }

                      const city =
                        typeof val.city === 'string' && val.city.trim() !== ''
                          ? val.city.trim()
                          : typeof weatherStatus?.demoCity?.name === 'string' && weatherStatus.demoCity.name.trim() !== ''
                            ? weatherStatus.demoCity.name.trim()
                            : '';

                      const items: string[] = [];
                      if (metrics.length > 0) {
                        items.push(metrics.join(' · '));
                      }
                      if (city) {
                        items.push(`Weather for ${city} · fixed demo city (not your location)`);
                      }

                      if (items.length > 0) {
                        return escapeHtml(items.join(' · '));
                      }
                      return 'Weather unavailable';
                    })()}</p>
                  </div>
                </div>
              </div>
              `
                : `
              <div class="live-card live-notice-card" id="notice-weather-off" role="status">
                <div class="live-card-row">
                  <div class="live-card-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                    </svg>
                  </div>
                  <div class="live-card-body">
                    <div class="live-card-header">
                      <h2 class="live-card-title">Weather</h2>
                      <span class="live-source-chip">Provenance: Offline Default</span>
                    </div>
                    <p class="live-card-desc">Live weather is off</p>
                  </div>
                </div>
              </div>
              `
            }

            <!-- Location Section -->
            ${
              liveLocationStatus.status === 'available' && liveLocationStatus.coords
                ? `
              <div class="live-card" id="live-location-card">
                <div class="live-card-row">
                  <div class="live-card-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </div>
                  <div class="live-card-body">
                    <div class="live-card-header">
                      <h2 class="live-card-title">Location</h2>
                      <span class="live-source-chip">Source: Browser Geolocation (Consented)</span>
                    </div>
                    <p class="live-card-desc">Location shared · used for this session only (accuracy ~${Math.round(liveLocationStatus.accuracy ?? 100)}m)</p>
                  </div>
                </div>
              </div>
              `
                : liveLocationStatus.status === 'denied' || liveLocationStatus.status === 'unavailable'
                ? `
              <div class="live-card live-notice-card" id="notice-location-denied" role="status">
                <div class="live-card-row">
                  <div class="live-card-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </div>
                  <div class="live-card-body">
                    <div class="live-card-header">
                      <h2 class="live-card-title">Location</h2>
                      <span class="live-source-chip">Provenance: Consented Geolocation</span>
                    </div>
                    <p class="live-card-desc">Location not shared</p>
                  </div>
                </div>
              </div>
              `
                : `
              <div class="live-card" id="live-location-prompt-card">
                <div class="live-card-row">
                  <div class="live-card-icon" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </div>
                  <div class="live-card-body">
                    <div class="live-card-header">
                      <h2 class="live-card-title">Location</h2>
                      <span class="live-source-chip">Source: Consented Geolocation (One-shot)</span>
                    </div>
                    <p class="live-card-desc">Connect location to enable local departures and recommendations.</p>
                    <div class="live-card-actions">
                      <button type="button" class="btn btn-primary btn-sm" id="btn-connect-location">Connect location</button>
                    </div>
                  </div>
                </div>
              </div>
              `
            }
          </section>
        `;
      } else {
        const v2Composition = buildHomeComposition({
          plan: nowPlan,
          spatialEvidence: spatialMapEvidence,
          aheadPlans,
          proposals: living.forYou.map(f => ({ key: f.key, value: f.value })),
          acceptedPlanIds,
          userConfirmedKeys,
          snapshot: effectiveSnapshot,
          canUndo: actionStore.canUndo(),
          evidenceBundle: effectiveEvidenceBundle,
        });
        v2BodyHtml = renderV2Home(v2Composition);
      }

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

        ${v2BodyHtml}
      `;
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

    if (conversationCleanup) {
      conversationCleanup();
      conversationCleanup = null;
    }

    if (demoPanelCleanup) {
      demoPanelCleanup();
      demoPanelCleanup = null;
    }

    if (activeDetail?.type === 'connectors') {
      root.innerHTML = `
        <div class="app-layout" data-ui-version="${uiVersion}">
          ${renderConnectorsView(latestConnectorStatuses)}
        </div>
      `;

      const backBtn = root.querySelector('#btn-connectors-back');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          const origId = activeDetail?.originatingElementId;
          activeDetail = null;
          update();
          if (origId) {
            requestAnimationFrame(() => {
              restoreInvokingFocus(origId);
            });
          }
        });
      }

      const onConnectorsKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          window.removeEventListener('keydown', onConnectorsKeyDown);
          const origId = activeDetail?.originatingElementId;
          activeDetail = null;
          update();
          if (origId) {
            requestAnimationFrame(() => {
              restoreInvokingFocus(origId);
            });
          }
        }
      };
      window.addEventListener('keydown', onConnectorsKeyDown, { once: true });

      const connectLocBtn = root.querySelector('#btn-connect-location');
      if (connectLocBtn) {
        connectLocBtn.addEventListener('click', async () => {
          connectLocBtn.setAttribute('disabled', 'true');
          await locationConnectorPort.connect();
          await refreshConnectorStatuses();
          update();
        });
      }

      const revokeLocBtn = root.querySelector('#btn-revoke-location');
      if (revokeLocBtn) {
        revokeLocBtn.addEventListener('click', async () => {
          revokeLocBtn.setAttribute('disabled', 'true');
          await locationConnectorPort.revoke();
          await refreshConnectorStatuses();
          update();
        });
      }

      const checkLocBtn = root.querySelector('#btn-check-location');
      if (checkLocBtn) {
        checkLocBtn.addEventListener('click', async () => {
          checkLocBtn.setAttribute('disabled', 'true');
          await refreshConnectorStatuses();
          update();
        });
      }

      const connectXmemoBtn = root.querySelector('#btn-connect-xmemo');
      if (connectXmemoBtn) {
        connectXmemoBtn.addEventListener('click', async () => {
          connectXmemoBtn.setAttribute('disabled', 'true');
          await xmemoConnectorPort.connect();
          await refreshConnectorStatuses();
          update();
        });
      }

      const disconnectXmemoBtn = root.querySelector('#btn-disconnect-xmemo');
      if (disconnectXmemoBtn) {
        disconnectXmemoBtn.addEventListener('click', async () => {
          disconnectXmemoBtn.setAttribute('disabled', 'true');
          await xmemoConnectorPort.disconnect();
          await refreshConnectorStatuses();
          update();
        });
      }

      const connectNotifBtn = root.querySelector('#btn-connect-notifications');
      if (connectNotifBtn) {
        connectNotifBtn.addEventListener('click', async () => {
          connectNotifBtn.setAttribute('disabled', 'true');
          await notificationsConnectorPort.connect();
          await refreshConnectorStatuses();
          update();
        });
      }

      const checkNotifBtn = root.querySelector('#btn-check-notifications');
      if (checkNotifBtn) {
        checkNotifBtn.addEventListener('click', async () => {
          checkNotifBtn.setAttribute('disabled', 'true');
          await refreshConnectorStatuses();
          update();
        });
      }

      return;
    }

    root.innerHTML = `
      <div class="app-layout" data-ui-version="${uiVersion}">
        <header class="header-bar" role="banner">
          <div class="main-container" style="padding-bottom: 0;">
            ${
              uiVersion === 'v2'
                ? `
            <div class="v2-header-row">
              <div class="header-left">
                <span class="v2-brand-wordmark">Yori</span>
              </div>
              <nav class="v2-desktop-nav desktop-nav" aria-label="Desktop Navigation">
                <button type="button" class="nav-pill ${activeTab === 'today' || activeTab === 'home' ? 'active' : ''}" data-tab="home" id="desktop-nav-home">
                  Home
                </button>
                <button type="button" class="nav-pill ${activeTab === 'plans' ? 'active' : ''}" data-tab="plans" id="desktop-nav-plans">
                  Plans
                </button>
                <button type="button" class="nav-pill ${activeTab === 'for-you' ? 'active' : ''}" data-tab="for-you" id="desktop-nav-for-you">
                  For You
                </button>
                <button type="button" class="nav-pill ${activeTab === 'me' ? 'active' : ''}" data-tab="me" id="desktop-nav-me">
                  Me
                </button>
              </nav>
              <div class="header-right">
                ${
                  isDevMode
                    ? `
                <button
                  type="button"
                  class="btn-dev-demo-controls"
                  id="btn-dev-demo-controls"
                  aria-label="Demo controls for presentation"
                  title="Demo controls (Presentation)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <span>Demo controls</span>
                </button>
                `
                    : ''
                }
                <button
                  type="button"
                  class="header-avatar-btn"
                  id="btn-header-avatar"
                  aria-label="Profile and settings"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                </button>
              </div>
            </div>
            `
                : `
            <div class="top-meta">
              <div class="mode-switch-group" role="group" aria-label="Context Mode Switch">
                <button type="button" class="btn-mode-toggle ${contextMode === 'demo' ? 'active' : ''}" id="btn-mode-demo" aria-pressed="${contextMode === 'demo' ? 'true' : 'false'}">Demo scenes</button>
                <button type="button" class="btn-mode-toggle ${contextMode === 'live' ? 'active' : ''}" id="btn-mode-live" aria-pressed="${contextMode === 'live' ? 'true' : 'false'}">Live context</button>
              </div>
              ${
                contextMode === 'demo'
                  ? `
              <span class="demo-chip" aria-label="Simulation Status">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
                ${escapeHtml(STRINGS.header.demoChip)}
              </span>
              `
                  : `
              <span class="live-context-chip" id="chip-live-context" aria-label="Live Runtime Active">
                <span class="live-dot" aria-hidden="true"></span>
                Live context
              </span>
              `
              }
              ${
                weatherStatus.enabled && liveWeatherSignal
                  ? `
              <span class="live-weather-chip" id="chip-live-weather" aria-label="Live Weather Active">
                ${escapeHtml(STRINGS.header.liveWeatherBadge)}
              </span>
              `
                  : ''
              }

              <!-- Desktop Navigation Links -->
              <nav class="desktop-nav" aria-label="Desktop Navigation">
                <button type="button" class="nav-pill ${activeTab === 'today' ? 'active' : ''}" data-tab="today" id="desktop-nav-today">
                  ${escapeHtml(STRINGS.tabs.today)}
                </button>
                <button type="button" class="nav-pill ${activeTab === 'me' ? 'active' : ''}" data-tab="me" id="desktop-nav-me">
                  ${escapeHtml(STRINGS.tabs.me)}
                </button>
              </nav>

              ${
                contextMode === 'demo'
                  ? `
              <div class="scene-switcher">
                <label for="scene-select" class="scene-select-label">Demo Scene:</label>
                <select id="scene-select" class="scene-select" aria-label="Switch Demo Scenario">
                  <option value="clear" ${currentScene === 'clear' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.clear)}</option>
                  <option value="rain" ${currentScene === 'rain' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.rain)}</option>
                  <option value="away-lunch" ${currentScene === 'away-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.awayLunch)}</option>
                  <option value="lunch" ${currentScene === 'lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.lunch)}</option>
                  <option value="busy-lunch" ${currentScene === 'busy-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.busyLunch)}</option>
                  <option value="missing-weather" ${currentScene === 'missing-weather' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.missingWeather)}</option>
                  <option value="corrupt-storage" ${currentScene === 'corrupt-storage' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.corruptStorage)}</option>
                  <option value="multi-candidate" ${currentScene === 'multi-candidate' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.multiCandidate)}</option>
                  <option value="fuel" ${currentScene === 'fuel' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.fuel)}</option>
                </select>
              </div>
              `
                  : `
              <div class="live-runtime-badge-container">
                <span class="live-runtime-pill" id="pill-live-runtime">Live Runtime · Device Clock</span>
              </div>
              `
              }
            </div>
            `
            }

            <div class="greeting-section">
              ${
                uiVersion === 'v2'
                  ? `
              <div class="v2-botanical-leaf" aria-hidden="true">
                <svg width="68" height="68" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.12">
                  <path d="M50 90 C 50 50, 80 30, 90 10 C 70 20, 50 50, 50 90 Z"/>
                  <path d="M50 90 C 50 50, 20 30, 10 10 C 30 20, 50 50, 50 90 Z"/>
                  <path d="M50 90 L 50 15"/>
                  <path d="M50 70 C 60 60, 70 55, 75 50"/>
                  <path d="M50 70 C 40 60, 30 55, 25 50"/>
                  <path d="M50 45 C 60 38, 70 32, 75 28"/>
                  <path d="M50 45 C 40 38, 30 32, 25 28"/>
                </svg>
              </div>
              `
                  : ''
              }
              <h1 class="greeting-title">${escapeHtml(greeting.greeting)}</h1>
              <p class="greeting-subheading">${escapeHtml(greeting.subheading)}</p>

              ${
                uiVersion === 'v2'
                  ? `
              <div class="v2-context-pill-container">
                <button
                  type="button"
                  class="context-pill ${contextMode === 'live' ? 'live' : 'demo'}"
                  id="pill-context-status"
                  aria-label="View sources and truth status"
                >
                  <div class="context-pill-content">
                    <div class="context-pill-header">
                      <span class="context-pill-dot" aria-hidden="true"></span>
                      <span class="context-pill-title">${contextMode === 'live' ? STRINGS.header.livePill : STRINGS.header.demoPill}</span>
                      <span class="context-pill-chevron" aria-hidden="true">›</span>
                    </div>
                    <div class="context-pill-subtitle">${escapeHtml(sourcesSubline)}</div>
                  </div>
                </button>
              </div>
              `
                  : ''
              }

              ${
                weatherStatus.enabled && liveWeatherSignal
                  ? `
              <div class="weather-attribution" id="weather-attribution">
                <a href="${escapeHtml(weatherStatus.attribution?.url || 'https://open-meteo.com/')}" target="_blank" rel="noopener noreferrer">${escapeHtml(weatherStatus.attribution?.text || STRINGS.header.weatherAttribution)}</a>
              </div>
              `
                  : ''
              }
            </div>
          </div>
        </header>

        <main class="main-container" role="main">
          ${mainContentHtml}
          ${uiVersion === 'v2' && (activeTab === 'today' || activeTab === 'home') && !activeDetail ? renderAskBar() : ''}
        </main>

        <!-- Bottom Tab Bar (Mobile) -->
        <nav class="bottom-tab-bar" aria-label="Main Navigation">
          ${
            uiVersion === 'v2'
              ? `
          <button type="button" class="tab-item ${activeTab === 'today' || activeTab === 'home' ? 'active' : ''}" id="tab-home" aria-current="${activeTab === 'today' || activeTab === 'home' ? 'page' : 'false'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>Home</span>
          </button>
          <button type="button" class="tab-item ${activeTab === 'plans' ? 'active' : ''}" id="tab-plans" aria-current="${activeTab === 'plans' ? 'page' : 'false'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>Plans</span>
          </button>
          <button type="button" class="tab-item ${activeTab === 'for-you' ? 'active' : ''}" id="tab-for-you" aria-current="${activeTab === 'for-you' ? 'page' : 'false'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            <span>For You</span>
          </button>
          <button type="button" class="tab-item ${activeTab === 'me' ? 'active' : ''}" id="tab-me" aria-current="${activeTab === 'me' ? 'page' : 'false'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>Me</span>
          </button>
          `
              : `
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
          `
          }
        </nav>

        <!-- Active Modals (Why sheet, Adjust, Dismiss, Sources) -->
        ${
          activeModal?.type === 'why'
            ? renderWhySheet(
                activeModal.plan,
                reasoningState?.rationales[activeModal.plan.id],
                snapshotTimezone,
                userConfirmedKeys,
                actionStore.getSituationAttribution(),
                syncedKeys
              )
            : activeModal?.type === 'sources'
            ? renderSourcesSheet(activeModal.mode, snapshot, weatherStatus.enabled, defaultLocationPort.getLocation(), latestConnectorStatuses)
            : activeModal?.type === 'adjust'
            ? renderAdjustDialog(activeModal.values)
            : activeModal?.type === 'dismiss'
            ? renderDismissDialog(activeModal.plan.intentId)
            : ''
        }

        <!-- V2 Full-Page Conversation Shell -->
        ${
          uiVersion === 'v2' && actionStore.getInteractionState() === 'CONVERSATION'
            ? renderConversationOverlay(actionStore)
            : ''
        }

        <!-- Rev3 Isolated Demo Controls Presentation Panel (UI-HOME-QUIET) -->
        ${
          uiVersion === 'v2' && demoPanelOpen
            ? `
          <div class="demo-panel-overlay" id="demo-panel-overlay">
            <div
              class="demo-panel"
              id="demo-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="demo-panel-title"
            >
              <div class="demo-panel-header">
                <h2 class="demo-panel-title" id="demo-panel-title">${escapeHtml(STRINGS.header.demoPanelTitle)}</h2>
                <button
                  type="button"
                  class="btn-close-demo-panel"
                  id="btn-close-demo-panel"
                  aria-label="Close demo controls"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div class="demo-panel-body">
                <div class="demo-panel-section">
                  <span class="demo-panel-section-label">Context Mode</span>
                  <div class="mode-switch-group" role="group" aria-label="Context Mode Switch">
                    <button type="button" class="btn-mode-toggle ${contextMode === 'demo' ? 'active' : ''}" id="btn-mode-demo" aria-pressed="${contextMode === 'demo' ? 'true' : 'false'}">Demo scenes</button>
                    <button type="button" class="btn-mode-toggle ${contextMode === 'live' ? 'active' : ''}" id="btn-mode-live" aria-pressed="${contextMode === 'live' ? 'true' : 'false'}">Live context</button>
                  </div>
                </div>

                ${
                  contextMode === 'demo'
                    ? `
                <div class="demo-panel-section">
                  <label for="scene-select" class="demo-panel-section-label">Demo Scene</label>
                  <div class="scene-switcher" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                    <select id="scene-select" class="scene-select" aria-label="Switch Demo Scenario">
                      <option value="clear" ${currentScene === 'clear' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.clear)}</option>
                      <option value="rain" ${currentScene === 'rain' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.rain)}</option>
                      <option value="away-lunch" ${currentScene === 'away-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.awayLunch)}</option>
                      <option value="lunch" ${currentScene === 'lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.lunch)}</option>
                      <option value="busy-lunch" ${currentScene === 'busy-lunch' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.busyLunch)}</option>
                      <option value="missing-weather" ${currentScene === 'missing-weather' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.missingWeather)}</option>
                      <option value="corrupt-storage" ${currentScene === 'corrupt-storage' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.corruptStorage)}</option>
                      <option value="multi-candidate" ${currentScene === 'multi-candidate' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.multiCandidate)}</option>
                      <option value="fuel" ${currentScene === 'fuel' ? 'selected' : ''}>${escapeHtml(STRINGS.scenes.fuel)}</option>
                    </select>
                    <button type="button" class="btn btn-outline btn-sm v2-replay-btn" id="btn-replay-before-you-ask" aria-label="Replay Before You Ask transition">Replay: Before You Ask</button>
                  </div>
                </div>
                `
                    : `
                <div class="demo-panel-section">
                  <span class="demo-panel-section-label">Live Runtime</span>
                  <div class="live-runtime-badge-container">
                    <span class="live-runtime-pill" id="pill-live-runtime">Live Runtime · Device Clock</span>
                  </div>
                </div>
                `
                }

                <div class="demo-panel-section">
                  <span class="demo-panel-section-label">Technical Status</span>
                  <div class="demo-panel-badges">
                    <span class="v2-preview-badge" id="badge-ui-version" aria-label="V2 Shell Active">
                      ${escapeHtml(STRINGS.header.v2Badge)}
                    </span>
                    ${
                      contextMode === 'demo'
                        ? `
                    <span class="demo-chip" aria-label="Simulation Status">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
                        <path d="M12 6v6l4 2"/>
                      </svg>
                      ${escapeHtml(STRINGS.header.demoChip)}
                    </span>
                    `
                        : `
                    <span class="live-context-chip" id="chip-live-context" aria-label="Live Runtime Active">
                      <span class="live-dot" aria-hidden="true"></span>
                      Live context
                    </span>
                    `
                    }
                    ${
                      weatherStatus.enabled && liveWeatherSignal
                        ? `
                    <span class="live-weather-chip" id="chip-live-weather" aria-label="Live Weather Active">
                      ${escapeHtml(STRINGS.header.liveWeatherBadge)}
                    </span>
                    `
                        : ''
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        `
            : ''
        }
      </div>
    `;

    // -------------------------------------------------------------
    // EVENT BINDINGS
    // -------------------------------------------------------------

    // Rev3 UI-HOME-QUIET: Context Pill (Opens Dedicated Sources & Provenance Sheet)
    const pillStatusBtn = root.querySelector('#pill-context-status');
    if (pillStatusBtn) {
      pillStatusBtn.addEventListener('click', () => {
        modalInvokingId = 'pill-context-status';
        modalInvokingSelector = '#pill-context-status';
        activeModal = { type: 'sources', mode: contextMode };
        update();
      });
    }

    const devDemoBtn = root.querySelector('#btn-dev-demo-controls');
    if (devDemoBtn) {
      devDemoBtn.addEventListener('click', () => {
        modalInvokingId = 'btn-dev-demo-controls';
        demoPanelOpen = true;
        update();
      });
    }

    const avatarBtn = root.querySelector('#btn-header-avatar');
    if (avatarBtn) {
      avatarBtn.addEventListener('click', async () => {
        activeTab = 'me';
        activeDetail = null;
        update();
        await checkXMemoStatus();
      });
    }

    const linkAheadSeeAll = root.querySelector('#link-ahead-see-all');
    if (linkAheadSeeAll) {
      linkAheadSeeAll.addEventListener('click', () => {
        activeTab = 'plans';
        activeDetail = null;
        update();
      });
    }

    const linkForYouSeeAll = root.querySelector('#link-foryou-see-all');
    if (linkForYouSeeAll) {
      linkForYouSeeAll.addEventListener('click', () => {
        activeTab = 'for-you';
        activeDetail = null;
        update();
      });
    }

    if (demoPanelOpen) {
      const demoOverlay = root.querySelector<HTMLElement>('#demo-panel-overlay');
      const demoDialog = root.querySelector<HTMLElement>('#demo-panel');
      if (demoOverlay && demoDialog) {
        demoPanelCleanup = attachModalAccessibility({
          backdrop: demoOverlay,
          dialog: demoDialog,
          onClose: () => {
            demoPanelOpen = false;
            update();
            restoreInvokingFocus(modalInvokingId || 'btn-dev-demo-controls');
          },
        });
      }

      const closePanelBtn = root.querySelector('#btn-close-demo-panel');
      if (closePanelBtn) {
        closePanelBtn.addEventListener('click', () => {
          demoPanelOpen = false;
          update();
          restoreInvokingFocus(modalInvokingId || 'btn-dev-demo-controls');
        });
      }
    }
    // -------------------------------------------------------------

    // 0a. Context Mode Switcher [Demo scenes | Live context]
    const modeDemoBtn = root.querySelector('#btn-mode-demo') as HTMLButtonElement | null;
    if (modeDemoBtn) {
      modeDemoBtn.addEventListener('click', () => {
        if (contextMode === 'demo') return;
        contextMode = 'demo';
        defaultLocationPort.setLocation('available', DEFAULT_DEMO_COORDS);
        defaultLocationPort.setSimulated(true);
        defaultModelCommandInterpreter.setMode('scripted_fixture');
        liveLocationStatus = defaultLocationPort.getLocation();
        update();
      });
    }

    const modeLiveBtn = root.querySelector('#btn-mode-live') as HTMLButtonElement | null;
    if (modeLiveBtn) {
      modeLiveBtn.addEventListener('click', () => {
        if (contextMode === 'live') return;
        contextMode = 'live';
        defaultLocationPort.setLocation('prompt');
        defaultModelCommandInterpreter.setMode('live');
        liveLocationStatus = defaultLocationPort.getLocation();
        update();
      });
    }

    // 0b. Connect Location (One-shot Consented Browser Geolocation)
    const connectLocBtn = root.querySelector('#btn-connect-location') as HTMLButtonElement | null;
    if (connectLocBtn) {
      connectLocBtn.addEventListener('click', async () => {
        connectLocBtn.disabled = true;
        defaultLocationPort.setSimulated(false);
        defaultLocationPort.setLiveEnabled(true);
        if (typeof defaultLocationPort.consentAndRequest === 'function') {
          liveLocationStatus = await defaultLocationPort.consentAndRequest();
        } else {
          liveLocationStatus = defaultLocationPort.getLocation();
        }
        update();
      });
    }

    // 1. Scene Switcher
    const selectEl = root.querySelector('#scene-select') as HTMLSelectElement | null;
    if (selectEl) {
      selectEl.addEventListener('change', e => {
        currentScene = (e.target as HTMLSelectElement).value as DemoSceneId;
        actionStore.resetToIdle();
        actionStore.clearOverride();
        actionFeedbackMessage = null;
        coordinatedScene = null;
        reasoningRequestId++;
        reasoningState = null;
        update();
      });
    }

    // 1b. Replay Before You Ask (R3: Clear -> Rain transition)
    const replayBeforeYouAskBtn = root.querySelector('#btn-replay-before-you-ask') as HTMLButtonElement | null;
    if (replayBeforeYouAskBtn) {
      replayBeforeYouAskBtn.addEventListener('click', () => {
        actionStore.resetToIdle();
        actionStore.clearOverride();
        actionFeedbackMessage = null;
        coordinatedScene = null;
        reasoningRequestId++;
        reasoningState = null;

        // Step 1: Switch to clear scene first
        currentScene = 'clear';
        update();

        // Step 2: Transition to rain scene (delay 600ms, or instant 0ms if reduced motion)
        const isReduced = actionStore.isReducedMotion();
        const transitionDelay = isReduced ? 0 : 600;

        setTimeout(() => {
          currentScene = 'rain';
          actionFeedbackMessage = 'Rain forecast arrived · Umbrella recommended';
          update();

          const nowCard = root.querySelector('.now-card');
          if (nowCard && !isReduced) {
            nowCard.classList.add('v2-highlight-changed');
            setTimeout(() => {
              nowCard.classList.remove('v2-highlight-changed');
            }, 2500);
          }
        }, transitionDelay);
      });
    }

    // 2. Navigation Tab Switching (Mobile & Desktop)
    const homeBtn = root.querySelector('#tab-home');
    if (homeBtn) {
      homeBtn.addEventListener('click', () => {
        activeTab = 'today';
        activeDetail = null;
        update();
      });
    }

    const todayBtn = root.querySelector('#tab-today');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        activeTab = 'today';
        activeDetail = null;
        update();
      });
    }

    const plansBtn = root.querySelector('#tab-plans');
    if (plansBtn) {
      plansBtn.addEventListener('click', () => {
        activeTab = 'plans';
        activeDetail = null;
        update();
      });
    }

    const forYouBtn = root.querySelector('#tab-for-you');
    if (forYouBtn) {
      forYouBtn.addEventListener('click', () => {
        activeTab = 'for-you';
        activeDetail = null;
        update();
      });
    }

    const meBtn = root.querySelector('#tab-me');
    if (meBtn) {
      meBtn.addEventListener('click', async () => {
        activeTab = 'me';
        activeDetail = null;
        update();
        await checkXMemoStatus();
      });
    }

    const desktopHomeBtn = root.querySelector('#desktop-nav-home');
    if (desktopHomeBtn) {
      desktopHomeBtn.addEventListener('click', () => {
        activeTab = 'today';
        activeDetail = null;
        update();
      });
    }

    const desktopPlansBtn = root.querySelector('#desktop-nav-plans');
    if (desktopPlansBtn) {
      desktopPlansBtn.addEventListener('click', () => {
        activeTab = 'plans';
        activeDetail = null;
        update();
      });
    }

    const desktopForYouBtn = root.querySelector('#desktop-nav-for-you');
    if (desktopForYouBtn) {
      desktopForYouBtn.addEventListener('click', () => {
        activeTab = 'for-you';
        activeDetail = null;
        update();
      });
    }

    const desktopTodayBtn = root.querySelector('#desktop-nav-today');
    if (desktopTodayBtn) {
      desktopTodayBtn.addEventListener('click', () => {
        activeTab = 'today';
        activeDetail = null;
        update();
      });
    }

    const desktopMeBtn = root.querySelector('#desktop-nav-me');
    if (desktopMeBtn) {
      desktopMeBtn.addEventListener('click', async () => {
        activeTab = 'me';
        activeDetail = null;
        update();
        await checkXMemoStatus();
      });
    }

    // 2b. V2 Detail View Interactions (TripDetail & RestaurantDetail)
    if (uiVersion === 'v2') {
      // Open TripDetail from 'Details →' button or NOW card
      const tripDetailsBtn = root.querySelector('#btn-view-trip-details');
      if (tripDetailsBtn && nowPlan) {
        tripDetailsBtn.addEventListener('click', e => {
          e.stopPropagation();
          activeDetail = {
            type: 'trip',
            planId: nowPlan.id,
            originatingElementId: 'btn-view-trip-details',
          };
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({ detail: activeDetail }, '', window.location.href);
          }
          update();
        });
      }

      const nowCardJourney = root.querySelector('.now-card.v2-journey-card');
      if (nowCardJourney && nowPlan) {
        nowCardJourney.addEventListener('click', e => {
          const target = e.target as HTMLElement;
          if (target.closest('button, a, input, select')) return;
          activeDetail = {
            type: 'trip',
            planId: nowPlan.id,
            originatingElementId: 'now-title',
          };
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({ detail: activeDetail }, '', window.location.href);
          }
          update();
        });
      }

      // Open RestaurantDetail from candidate cards
      root.querySelectorAll<HTMLElement>('.v2-candidate-card').forEach(card => {
        const candId = card.getAttribute('data-candidate-id');
        const openCandidate = () => {
          activeDetail = {
            type: 'restaurant',
            candidateId: candId ?? undefined,
            originatingElementId: candId ? `btn-detail-${candId}` : (card.id || undefined),
          };
          if (typeof window !== 'undefined' && window.history?.pushState) {
            window.history.pushState({ detail: activeDetail }, '', window.location.href);
          }
          update();
        };

        card.addEventListener('click', e => {
          const target = e.target as HTMLElement;
          if (target.closest('.v2-directions-btn')) return;
          openCandidate();
        });

        const detailBtn = card.querySelector<HTMLElement>('.v2-view-detail-link');
        if (detailBtn) {
          detailBtn.addEventListener('click', e => {
            e.stopPropagation();
            openCandidate();
          });
        }
      });

      // Directions button on candidate cards (V5-FUEL verified navigate handoff)
      root.querySelectorAll<HTMLElement>('.v2-directions-btn').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const candId = btn.getAttribute('data-candidate-id');
          if (!candId) return;

          const candidate = (nowPlan?.optionsOrSteps as any[])?.find(
            (o: any) => o && (o.id === candId || `candidate-${o.id}` === candId)
          );
          if (!candidate) return;

          const bundle =
            effectiveEvidenceBundle ??
            (nowPlan?.intentId === 'fuel'
              ? createFuelEvidenceBundle({ snapshot: effectiveSnapshot })
              : effectiveSnapshot?.signals?.some(s => s.kind === 'places_lunch')
                ? createLunchPlacesEvidenceBundle({ snapshot: effectiveSnapshot, userConfirmedKeys, memory: combinedMemory })
                : nowPlan?.intentId === 'depart'
                  ? createRainEvidenceBundle({ snapshot: effectiveSnapshot, userConfirmedKeys, memoryFacts: combinedMemory })
                  : createLunchEvidenceBundle({ snapshot: effectiveSnapshot, userConfirmedKeys, memory: combinedMemory }));

          const navPlatform =
            typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent || '')
              ? 'ios'
              : typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent || '')
              ? 'android'
              : 'desktop';

          const recId = (candidate as any).recordId || candidate.id;
          const navUrl = buildGroundedNavigateUrl(
            {
              id: recId,
              name: candidate.name || candidate.label,
              coords: candidate.coords,
              sourceRef: { recordId: recId, field: 'name' },
            },
            bundle,
            { platform: navPlatform }
          );

          if (navUrl) {
            root.querySelector('#navigate-confirm-backdrop')?.remove();

            const invokingBtn = btn;
            const headerEl = root.querySelector<HTMLElement>('.header-bar');
            const mainEl = root.querySelector<HTMLElement>('main.main-container');
            const navEl = root.querySelector<HTMLElement>('.bottom-tab-bar');

            headerEl?.setAttribute('inert', '');
            headerEl?.setAttribute('aria-hidden', 'true');
            mainEl?.setAttribute('inert', '');
            mainEl?.setAttribute('aria-hidden', 'true');
            navEl?.setAttribute('inert', '');
            navEl?.setAttribute('aria-hidden', 'true');

            const mapsAppName = navPlatform === 'ios' ? 'Apple Maps' : 'Google Maps';
            const modalEl = document.createElement('div');
            modalEl.className = 'v2-navigate-modal-backdrop';
            modalEl.id = 'navigate-confirm-backdrop';
            modalEl.innerHTML = `
              <div class="v2-navigate-modal" id="navigate-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="nav-modal-title">
                <div class="v2-modal-header">
                  <h2 id="nav-modal-title" tabindex="-1" data-slot="chrome" data-slot-reason="Navigation modal title">Start Navigation</h2>
                  <span class="v2-illustration-badge" data-slot="chrome" data-slot-reason="Navigation verified handoff badge">Verified handoff</span>
                </div>
                <p class="v2-modal-body">
                  <span data-slot="chrome" data-slot-reason="Navigation directions prefix">Open driving directions to </span>
                  <strong data-source-ref="${escapeHtml(recId)}.name" data-slot="domain">${escapeHtml(candidate.name || candidate.label)}</strong>
                  <span data-slot="chrome" data-slot-reason="Navigation directions suffix"> in ${escapeHtml(mapsAppName)}?</span>
                </p>
                <div class="v2-modal-url-preview">
                  <span class="v2-url-label" data-slot="chrome" data-slot-reason="Verified URL label">Verified Destination URL:</span>
                  <code class="v2-url-code" id="navigate-verified-url" data-slot="chrome" data-slot-reason="Verified URL preview">${escapeHtml(navUrl)}</code>
                </div>
                <div class="v2-modal-actions">
                  <button type="button" class="btn btn-secondary" id="btn-cancel-navigate" data-slot="chrome" data-slot-reason="Cancel navigation button">Cancel</button>
                  <a
                    href="${escapeHtml(navUrl)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-primary"
                    id="btn-confirm-navigate"
                    role="button"
                    data-slot="chrome"
                    data-slot-reason="Confirm navigation button"
                  >
                    Open Maps
                  </a>
                </div>
              </div>
            `;
            root.appendChild(modalEl);

            const navModalCard = modalEl.querySelector<HTMLElement>('#navigate-confirm-modal')!;
            let navCleanup: (() => void) | null = null;
            const closeModal = () => {
              if (navCleanup) {
                navCleanup();
                navCleanup = null;
              }
              headerEl?.removeAttribute('inert');
              headerEl?.removeAttribute('aria-hidden');
              mainEl?.removeAttribute('inert');
              mainEl?.removeAttribute('aria-hidden');
              navEl?.removeAttribute('inert');
              navEl?.removeAttribute('aria-hidden');
              modalEl.remove();
              invokingBtn?.focus();
            };

            navCleanup = attachModalAccessibility({
              backdrop: modalEl,
              dialog: navModalCard,
              onClose: closeModal,
            });

            modalEl.querySelector('#btn-cancel-navigate')?.addEventListener('click', closeModal);
            modalEl.querySelector('#btn-confirm-navigate')?.addEventListener('click', ev => {
              if (isDevOrTest && (window as any).__YORI_TEST_INTERCEPT_NAV__) {
                ev.preventDefault();
                (window as any).__YORI_LAST_NAV_URL__ = navUrl;
                closeModal();
              }
            });
          }
        });
      });

      // TripDetail: Back button & mode tabs
      const tripBackBtn = root.querySelector('#trip-detail-back-btn');
      if (tripBackBtn) {
        tripBackBtn.addEventListener('click', () => {
          const origId = activeDetail?.originatingElementId;
          activeDetail = null;
          update();
          if (origId) {
            requestAnimationFrame(() => {
              const el = document.getElementById(origId) ?? root.querySelector('.now-card');
              (el as HTMLElement)?.focus();
            });
          }
        });
      }

      root.querySelectorAll<HTMLElement>('.v2-mode-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const mode = tab.getAttribute('data-mode');
          if (mode && activeDetail?.type === 'trip') {
            activeDetail.selectedMode = mode;
            update();
          }
        });
      });

      // RestaurantDetail: Back button, Save, Directions
      const restBackBtn = root.querySelector('#restaurant-detail-back-btn');
      if (restBackBtn) {
        restBackBtn.addEventListener('click', () => {
          const origId = activeDetail?.originatingElementId;
          activeDetail = null;
          update();
          if (origId) {
            requestAnimationFrame(() => {
              const el = document.getElementById(origId) ?? root.querySelector('.v2-candidate-card');
              const toFocus = el?.matches('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ? el
                : el?.querySelector<HTMLElement>('button, a, [tabindex]:not([tabindex="-1"])') ?? el;
              (toFocus as HTMLElement)?.focus();
            });
          }
        });
      }

      const restSaveBtn = root.querySelector('#btn-restaurant-save');
      if (restSaveBtn) {
        restSaveBtn.addEventListener('click', () => {
          if (activeDetail && activeDetail.type === 'restaurant') {
            activeDetail.isSaved = !activeDetail.isSaved;
            update();
          }
        });
      }

      const directionsBtn = root.querySelector('#btn-restaurant-directions');
      const directionsPanel = root.querySelector<HTMLElement>('#restaurant-directions-panel');
      if (directionsBtn && directionsPanel) {
        directionsBtn.addEventListener('click', () => {
          const isHidden = directionsPanel.style.display === 'none' || !directionsPanel.style.display;
          directionsPanel.style.display = isHidden ? 'block' : 'none';
          directionsBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
        });
      }
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

    // 4. Plan Review Actions: Undo Accept or Session Override
    const undoAcceptBtn = root.querySelector('#btn-undo-accept') as HTMLButtonElement | null;
    if (undoAcceptBtn && nowPlan) {
      undoAcceptBtn.addEventListener('click', () => {
        const envelope = sharedStorage.load();
        const existingAccepted = envelope?.payload.acceptedPlanIds ?? [];
        if (existingAccepted.includes(nowPlan.id)) {
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
          actionFeedbackMessage = 'Plan restored. Acceptance undone.';
          update();
          return;
        }

        if (actionStore.canUndo()) {
          actionStore.undo();
          actionFeedbackMessage = 'Plan restored. Changes undone.';
          update();
          return;
        }
        update();
      });
    }

    // 5. Plan Review Actions: Why Sheet
    const whyBtn = root.querySelector('#btn-why') as HTMLButtonElement | null;
    if (whyBtn && nowPlan) {
      whyBtn.addEventListener('click', () => {
        modalInvokingId = 'btn-why';
        modalInvokingSelector = '#btn-why';
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
          modalInvokingId = null;
          modalInvokingSelector = `.btn-ahead-why[data-plan-id="${planId}"]`;
          activeModal = { type: 'why', plan: match };
          update();
        }
      });
    });

    // 6. Plan Review Actions: Adjust
    const adjustBtn = root.querySelector('#btn-adjust') as HTMLButtonElement | null;
    if (adjustBtn && nowPlan) {
      adjustBtn.addEventListener('click', () => {
        modalInvokingId = 'btn-adjust';
        modalInvokingSelector = '#btn-adjust';
        const existingTiming = timingOverrides[nowPlan.id] || { prepMinutes: 20, bufferMinutes: 5 };
        activeModal = { type: 'adjust', plan: nowPlan, values: existingTiming };
        update();
      });
    }

    // 7. Plan Review Actions: Dismiss
    const dismissBtn = root.querySelector('#btn-dismiss') as HTMLButtonElement | null;
    if (dismissBtn && nowPlan) {
      dismissBtn.addEventListener('click', () => {
        modalInvokingId = 'btn-dismiss';
        modalInvokingSelector = '#btn-dismiss';
        activeModal = { type: 'dismiss', plan: nowPlan };
        update();
      });
    }

    // -------------------------------------------------------------
    // MODAL HANDLERS
    // -------------------------------------------------------------
    if (modalCleanup) {
      modalCleanup();
      modalCleanup = null;
    }

    const closeModal = () => {
      if (modalCleanup) {
        modalCleanup();
        modalCleanup = null;
      }
      activeModal = null;
      update();
      restoreInvokingFocus(modalInvokingId, modalInvokingSelector);
    };

    if (activeModal) {
      const modalBackdrop = root.querySelector<HTMLElement>(
        '#why-sheet-backdrop, #adjust-dialog-backdrop, #dismiss-dialog-backdrop'
      );
      const modalCard = modalBackdrop?.querySelector<HTMLElement>('.modal-card');

      if (modalBackdrop && modalCard) {
        modalCleanup = attachModalAccessibility({
          backdrop: modalBackdrop,
          dialog: modalCard,
          onClose: closeModal,
        });
      }

      // Why Sheet Close Buttons
      const closeWhyBtn = root.querySelector('#btn-close-why');
      const doneWhyBtn = root.querySelector('#btn-why-sheet-done');
      if (closeWhyBtn) closeWhyBtn.addEventListener('click', closeModal);
      if (doneWhyBtn) doneWhyBtn.addEventListener('click', closeModal);

      // Adjust Dialog Handlers
      const closeAdjustBtn = root.querySelector('#btn-close-adjust');
      if (closeAdjustBtn) closeAdjustBtn.addEventListener('click', closeModal);

      const adjustForTodayBtn = root.querySelector('#btn-adjust-for-today');
      if (adjustForTodayBtn && activeModal?.type === 'adjust') {
        const planToAdjust = activeModal.plan;
        adjustForTodayBtn.addEventListener('click', () => {
          const prepInput = root.querySelector('#input-prep-minutes') as HTMLInputElement | null;
          const bufferInput = root.querySelector('#input-buffer-minutes') as HTMLInputElement | null;
          const prepMinutes = prepInput ? parseInt(prepInput.value, 10) || 20 : 20;
          const bufferMinutes = bufferInput ? parseInt(bufferInput.value, 10) || 5 : 5;

          timingOverrides[planToAdjust.id] = { prepMinutes, bufferMinutes };
          closeModal();
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
          closeModal();
        });
      }

      // Dismiss Dialog Handlers
      const closeDismissBtn = root.querySelector('#btn-close-dismiss');
      const cancelDismissBtn = root.querySelector('#btn-cancel-dismiss');
      if (closeDismissBtn) closeDismissBtn.addEventListener('click', closeModal);
      if (cancelDismissBtn) cancelDismissBtn.addEventListener('click', closeModal);

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

          closeModal();
        });
      }
    }

    // -------------------------------------------------------------
    // PROPOSAL CONFIRM & REJECT HANDLERS (INV-107 & XKEYDEL-P2)
    // -------------------------------------------------------------
    root.querySelectorAll('.btn-confirm-proposal').forEach(btn => {
      btn.addEventListener('click', async e => {
        const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
        if (!key) return;

        const outcome = await handleConfirmProposal(
          key,
          sharedStorage,
          combinedMemory,
          memoryPort,
          snapshotAsOf
        );
        activeLoadedFacts = await memoryPort.loadFacts();
        actionFeedbackMessage = outcome.message;
        update();
      });
    });

    root.querySelectorAll('.btn-reject-proposal').forEach(btn => {
      btn.addEventListener('click', e => {
        const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
        if (!key) return;

        const outcome = handleRejectProposal(
          key,
          sharedStorage,
          combinedMemory,
          snapshotAsOf
        );
        actionFeedbackMessage = outcome.message;
        update();
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
      try {
        activeLoadedFacts = [];
        void memoryPort.loadFacts().then(f => {
          activeLoadedFacts = f;
        });
      } catch {
        activeLoadedFacts = [];
      }
      confirmingReset = false;
      actionFeedbackMessage = STRINGS.me.resetNotice;
      currentScene = 'clear';
      update();
    };

    const resetBtn = root.querySelector('#btn-reset-storage') as HTMLButtonElement | null;
    if (resetBtn) resetBtn.addEventListener('click', () => handleReset(resetBtn));

    const meResetBtn = root.querySelector('#btn-me-reset') as HTMLButtonElement | null;
    if (meResetBtn) meResetBtn.addEventListener('click', () => handleReset(meResetBtn));

    const meConnectorsBtn = root.querySelector('#btn-me-connectors');
    if (meConnectorsBtn) {
      meConnectorsBtn.addEventListener('click', async () => {
        activeDetail = {
          type: 'connectors',
          originatingElementId: 'btn-me-connectors',
        };
        if (typeof window !== 'undefined' && window.history?.pushState) {
          window.history.pushState({ detail: activeDetail }, '', window.location.href);
        }
        await refreshConnectorStatuses();
        update();
      });
    }

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
            xmemoStatus = { enabled: true, connected: false, connectionState: 'off' };
            try {
              activeLoadedFacts = await memoryPort.loadFacts();
            } catch {
              activeLoadedFacts = [];
            }
            actionFeedbackMessage = 'XMemo disconnected';
            update();
          }
        } catch {
          // ignore error
        }
      });
    }

    // -------------------------------------------------------------
    // V5-GEO: GEOLOCATION & MANUAL LOCATION EVENT BINDINGS
    // -------------------------------------------------------------
    const reqLocBtn = root.querySelector('#btn-request-location');
    if (reqLocBtn) {
      reqLocBtn.addEventListener('click', async () => {
        if (
          'consentAndRequest' in defaultLocationPort &&
          typeof (defaultLocationPort as any).consentAndRequest === 'function'
        ) {
          await (defaultLocationPort as any).consentAndRequest();
        } else {
          if (
            'grantConsent' in defaultLocationPort &&
            typeof (defaultLocationPort as any).grantConsent === 'function'
          ) {
            (defaultLocationPort as any).grantConsent();
          }
          if (
            'requestCurrentPosition' in defaultLocationPort &&
            typeof (defaultLocationPort as any).requestCurrentPosition === 'function'
          ) {
            await (defaultLocationPort as any).requestCurrentPosition();
          }
        }
        update();
      });
    }

    const denyLocBtn = root.querySelector('#btn-deny-location');
    if (denyLocBtn) {
      denyLocBtn.addEventListener('click', () => {
        if ('denyConsent' in defaultLocationPort && typeof (defaultLocationPort as any).denyConsent === 'function') {
          (defaultLocationPort as any).denyConsent();
        } else {
          defaultLocationPort.setLocation('denied');
        }
        update();
      });
    }

    const manualToggleBtn = root.querySelector('#btn-manual-location-toggle');
    if (manualToggleBtn) {
      manualToggleBtn.addEventListener('click', () => {
        const section = root.querySelector('#v2-manual-location-section');
        if (section) {
          const isHidden = window.getComputedStyle(section).display === 'none';
          (section as HTMLElement).style.display = isHidden ? 'flex' : 'none';
          manualToggleBtn.setAttribute('aria-expanded', String(isHidden));
        }
      });
    }

    const changeLocBtn = root.querySelector('#btn-change-location');
    if (changeLocBtn) {
      changeLocBtn.addEventListener('click', () => {
        const section = root.querySelector('#v2-manual-location-section');
        if (section) {
          const isHidden = window.getComputedStyle(section).display === 'none';
          (section as HTMLElement).style.display = isHidden ? 'flex' : 'none';
          changeLocBtn.setAttribute('aria-expanded', String(isHidden));
        }
      });
    }

    const sfBtn = root.querySelector('#btn-city-sf');
    if (sfBtn) {
      sfBtn.addEventListener('click', () => {
        defaultLocationPort.setLocation('available', { lat: 37.7749, lng: -122.4194 });
        update();
      });
    }

    const laBtn = root.querySelector('#btn-city-la');
    if (laBtn) {
      laBtn.addEventListener('click', () => {
        defaultLocationPort.setLocation('available', { lat: 34.0522, lng: -118.2437 });
        update();
      });
    }

    const applyCoordsBtn = root.querySelector('#btn-apply-manual-coords');
    if (applyCoordsBtn) {
      applyCoordsBtn.addEventListener('click', () => {
        const latInput = root.querySelector('#input-manual-lat') as HTMLInputElement | null;
        const lngInput = root.querySelector('#input-manual-lng') as HTMLInputElement | null;
        const lat = latInput ? parseFloat(latInput.value) : NaN;
        const lng = lngInput ? parseFloat(lngInput.value) : NaN;
        if (!isNaN(lat) && !isNaN(lng)) {
          defaultLocationPort.setLocation('available', { lat, lng });
          update();
        }
      });
    }

    // -------------------------------------------------------------
    // V2 ASK BAR & CONVERSATION SHELL (V0 - LIVING_CONTEXT_V2.md §2)
    // -------------------------------------------------------------
    if (uiVersion === 'v2') {
      attachAskBarEvents(root, () => {
        actionStore.openConversation();
        update();
      });

      const headerEl = root.querySelector<HTMLElement>('.header-bar');
      const mainEl = root.querySelector<HTMLElement>('main.main-container');
      const navEl = root.querySelector<HTMLElement>('.bottom-tab-bar');

      const isModalOrConversationOpen =
        actionStore.getInteractionState() === 'CONVERSATION' || activeModal !== null || demoPanelOpen;

      if (isModalOrConversationOpen) {
        headerEl?.setAttribute('inert', '');
        headerEl?.setAttribute('aria-hidden', 'true');
        mainEl?.setAttribute('inert', '');
        mainEl?.setAttribute('aria-hidden', 'true');
        navEl?.setAttribute('inert', '');
        navEl?.setAttribute('aria-hidden', 'true');
      } else {
        headerEl?.removeAttribute('inert');
        headerEl?.removeAttribute('aria-hidden');
        mainEl?.removeAttribute('inert');
        mainEl?.removeAttribute('aria-hidden');
        navEl?.removeAttribute('inert');
        navEl?.removeAttribute('aria-hidden');
      }

      if (actionStore.getInteractionState() === 'CONVERSATION') {
        conversationCleanup = attachConversationEvents(root, actionStore, () => {
          headerEl?.removeAttribute('inert');
          headerEl?.removeAttribute('aria-hidden');
          mainEl?.removeAttribute('inert');
          mainEl?.removeAttribute('aria-hidden');
          navEl?.removeAttribute('inert');
          navEl?.removeAttribute('aria-hidden');
          update();
          const askBarEl = root.querySelector<HTMLButtonElement>('#ask-bar');
          askBarEl?.focus();
        });
      }
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
