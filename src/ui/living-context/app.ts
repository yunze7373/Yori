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
import {
  ContinuousTimelineController,
  TIMELINE_BEATS,
  CONTINUOUS_MEMORY_FACTS,
  buildSnapshotAt,
  deriveLivingHeaderFromSnapshot,
  type TimelineBeat,
  type TimelineBeatId,
} from '../../app/timeline/continuous-timeline.js';
import {
  buildLiveSnapshot,
  deriveLiveLivingHeaderFromSnapshot,
} from '../../adapters/providers/live-snapshot.js';
import {
  createLiveSignal,
  type LiveSignal,
} from '../../adapters/providers/live-signal.js';
import type {
  SpatialMapEvidence,
  PreparedPlan,
  PlanOption,
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
  formatTime,
  formatNowPlan,
  formatAheadPlan,
  formatNoticeMessage,
  humanizeProposalTitle,
} from './presentation.js';
import { isWeatherStale } from '../view-models/provenance.js';
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
import { createActionStateStore, computePlanDiff, type ActionStateStore, type PlanDiff } from '../action-state/index.js';
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
  isPlanAccepted,
  removeAcceptedPlan,
  deriveTripDetailVM,
  deriveRestaurantDetailVM,
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  createLunchPlacesEvidenceBundle,
  createFuelEvidenceBundle,
  type EvidenceBundle,
} from '../view-models/index.js';
import { defaultLocationPort, DEFAULT_DEMO_COORDS, type LocationPort, type LocationStatus } from '../../adapters/providers/location-port.js';
import { mockFuelAdapter } from '../../plugins/fuel/adapter.js';
import { mockLunchAdapter } from '../../plugins/lunch/adapter.js';
import { buildGroundedNavigateUrl } from '../navigation/navigate-url.js';
import { globalDecisionLogger } from '../../adapters/model/decision-log.js';
import { renderV2Home } from './v2-home-view.js';
import { initRealMaps } from './real-map.js';
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
import type {
  DestinationInfo,
  RouteResult,
  RouteStatus,
  NoRouteReason,
} from '../../adapters/providers/routing-types.js';
import {
  NO_ROUTE_REASON_LABELS,
  isRouteStale,
} from '../../adapters/providers/routing-types.js';
import { LiveDestinationAdapter } from '../../adapters/providers/destination-port.js';
import type { PlaceItem } from '../../adapters/providers/places-types.js';
import {
  rankPlacesByConfirmedPreferences,
  type RankedPlaceItem,
} from '../../adapters/providers/overpass-places-adapter.js';
import {
  determineCardKind,
  createInitialPanelState,
  panelSelectionReducer,
  type CardSelectionState,
} from './desktop-ia.js';
import { renderDesktopLeftNav } from './desktop-nav.js';
import { renderDesktopRightPanel } from './desktop-panel.js';
import type { HomeCompositionVM } from '../view-models/index.js';

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

export type ContextMode = 'demo' | 'live';

export function resolveContextMode(raw?: string | null): ContextMode {
  if (typeof raw !== 'string') return 'live';
  const lower = raw.trim().toLowerCase();
  return lower === 'demo' ? 'demo' : 'live';
}

/**
 * Resolve the effective default mode (default 'live' in production builds).
 * In production builds (__YORI_ENABLE_TEST_HOOKS__ is false), ?mode / ?default_mode / window.__YORI_DEFAULT_MODE__
 * cannot leak and default mode is strictly Live. Demo is reachable ONLY behind ?dev=1.
 */
export function getEffectiveDefaultMode(): ContextMode {
  const testHooksEnabled =
    typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined'
      ? __YORI_ENABLE_TEST_HOOKS__
      : Boolean((import.meta as any).env?.DEV);

  const isProd = !testHooksEnabled;

  if (typeof window !== 'undefined') {
    const win = window as any;
    // Window global hook is only available in dev/test builds
    if (typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined' && __YORI_ENABLE_TEST_HOOKS__) {
      if (typeof win.__YORI_DEFAULT_MODE__ === 'string') {
        return resolveContextMode(win.__YORI_DEFAULT_MODE__);
      }
    }

    if (window.location?.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        const hasDev = params.get('dev') === '1';

        if (isProd) {
          // In production: overrides cannot leak; Demo is reachable ONLY behind ?dev=1
          if (hasDev) {
            const modeParam = params.get('mode') || params.get('default_mode');
            if (modeParam !== null) {
              return resolveContextMode(modeParam);
            }
            return 'demo';
          }
          // In production without ?dev=1, always 'live'
          return 'live';
        } else {
          // In dev/test builds: mode parameters are accepted
          const modeParam = params.get('mode') || params.get('default_mode');
          if (modeParam !== null) {
            return resolveContextMode(modeParam);
          }
          if (hasDev) {
            return 'demo';
          }
        }
      } catch {
        // ignore
      }
    }
  }

  // If in dev/test build, allow env override
  if (!isProd) {
    const envRaw =
      (typeof process !== 'undefined' && process.env ? process.env.VITE_YORI_DEFAULT_MODE : undefined) ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env
        ? ((import.meta as any).env.VITE_YORI_DEFAULT_MODE as string | undefined)
        : undefined);
    if (envRaw) {
      return resolveContextMode(envRaw);
    }
    return 'demo';
  }

  // In production: default is strictly 'live'
  return 'live';
}

/**
 * Builds a deterministic, uniform acknowledged-moment signature for Live mode.
 * Combines intentId + local date + ordered candidate IDs + headline (Finding 5).
 */
export function buildLiveAckSignature(plan: PreparedPlan, asOfIso: string, timezone?: string): string {
  let localDate: string;
  try {
    const d = new Date(asOfIso);
    if (timezone) {
      localDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } else {
      localDate = asOfIso.slice(0, 10);
    }
  } catch {
    localDate = asOfIso.slice(0, 10);
  }

  const candidateIds = (plan.optionsOrSteps ?? [])
    .map(o => (typeof o === 'string' ? o : ((o as any).recordId || (o as any).placeId || (o as any).id || '')))
    .filter(Boolean)
    .join(',');

  return `${plan.intentId}:${localDate}:${candidateIds}:${plan.headline}`;
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
  externalMemoryFacts?: readonly MemoryFact[],
  locationPort?: LocationPort,
  timelineBeat?: TimelineBeat | null
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

  const effectiveLocationPort = locationPort ?? defaultLocationPort;
  const rawLocStatus = effectiveLocationPort.getLocation();
  // In demo scenes, NEVER blend real device geolocation coordinates into simulated scenes.
  // If the adapter holds a live device fix (status === 'available' and source === 'geolocation'),
  // demo scenes use the fixture location instead of device coordinates.
  const locPortStatus: LocationStatus =
    rawLocStatus.status === 'available' && rawLocStatus.source === 'geolocation'
      ? {
          status: 'available',
          coords: DEFAULT_DEMO_COORDS,
          source: 'fixture',
          updatedAt: rawLocStatus.updatedAt,
        }
      : rawLocStatus;

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

  if (timelineBeat) {
    const rawSnapshot = buildSnapshotAt(timelineBeat.clockIso);
    const latestSnapshot = injectWeather(rawSnapshot);

    const combinedMemory = [
      ...CONTINUOUS_MEMORY_FACTS.filter(f => !activeConfirmedFacts.some(sc => sc.key === f.key)),
      ...activeConfirmedFacts,
      ...storedProposals,
    ];

    const effectiveSuppressions = storedSuppressions;

    const result = runPipeline({
      snapshot: latestSnapshot,
      memory: combinedMemory,
      clock: timelineBeat.clockIso,
      plugins,
      storage: effectiveStorage,
      suppressions: effectiveSuppressions,
    });

    const calendarSig = latestSnapshot.signals.find(s => s.kind === 'calendar');
    const mapEvidence: SpatialMapEvidence | null = calendarSig
      ? {
          placeOrRoute: { name: 'Piano Studio (Downtown)', destination: '123 Harmony Way' },
          spatialEvidence: calendarSig,
        }
      : null;

    let evidenceBundle: EvidenceBundle | undefined;
    if (latestSnapshot.signals.some(s => s.kind === 'mock_places')) {
      evidenceBundle = createLunchEvidenceBundle({
        snapshot: latestSnapshot,
        sceneClockIso: timelineBeat.clockIso,
        timezone: latestSnapshot.timezone || 'America/Los_Angeles',
        userConfirmedKeys: storedUserConfirmedKeys,
        isConfirmedTaste: storedUserConfirmedKeys.has('taste_preference'),
      });
    } else if (calendarSig) {
      evidenceBundle = createRainEvidenceBundle({
        snapshot: latestSnapshot,
        sceneClockIso: timelineBeat.clockIso,
        timezone: latestSnapshot.timezone || 'America/Los_Angeles',
        userConfirmedKeys: storedUserConfirmedKeys,
        isConfirmedHabit: storedUserConfirmedKeys.has('rain_transport_preference'),
      });
    }

    return {
      pipelineResult: result,
      spatialMapEvidence: mapEvidence,
      storageError: false,
      storage: effectiveStorage,
      snapshotAsOf: latestSnapshot.asOf,
      snapshotTimezone: latestSnapshot.timezone || 'America/Los_Angeles',
      snapshot: latestSnapshot,
      combinedMemory,
      evidenceBundle,
    };
  }

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

export interface LiveChangeMomentState {
  readonly id: string;
  readonly detectedAt: string;
  readonly intentId: string;
  readonly cause: string;
  readonly causeMarker: string;
  readonly heroCauseEffect: string;
  readonly priorLeaveTime?: string;
  readonly newLeaveTime?: string;
  readonly statusTransition: string;
  acknowledged: boolean;
}

export interface LiveStateResult {
  readonly pipelineResult: PipelineResult;
  readonly spatialMapEvidence: SpatialMapEvidence | null;
  readonly storageError: boolean;
  readonly storage: YoriStorage;
  readonly snapshotAsOf: string;
  readonly snapshotTimezone: string;
  readonly snapshot: Readonly<ContextSnapshot>;
  readonly combinedMemory: readonly MemoryFact[];
  readonly evidenceBundle?: EvidenceBundle;
}

export function computeLiveState(
  storagePort?: YoriStorage,
  liveWeatherSignal?: ContextSignal | null,
  liveLocationStatus?: LocationStatus,
  externalMemoryFacts?: readonly MemoryFact[],
  livePlacesStatus?: { enabled: boolean; provider?: string },
  livePlacesList?: readonly RankedPlaceItem[],
  livePlacesError?: boolean,
  liveRoute?: RouteResult | null,
  liveDestination?: DestinationInfo | null,
  options?: {
    clockIso?: string;
    timezone?: string;
    customSignals?: readonly ContextSignal[];
    calendarSignal?: LiveSignal | null;
  }
): LiveStateResult {
  const effectiveStorage = storagePort ?? new YoriStorage(new WebStorageDriver());
  const snapshotAsOf = options?.clockIso || new Date().toISOString();
  let snapshotTimezone = options?.timezone;
  if (!snapshotTimezone) {
    try {
      snapshotTimezone = (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC') || 'UTC';
    } catch {
      snapshotTimezone = 'UTC';
    }
  }

  // Load storage envelope
  let loadedEnvelope = null;
  try {
    loadedEnvelope = effectiveStorage.load();
    if (!loadedEnvelope) {
      effectiveStorage.save(
        {
          memoryFacts: [],
          proposals: [],
          suppressions: [],
          promptBudget: { date: snapshotAsOf.slice(0, 10), count: 0 },
          acceptedPlanIds: [],
        },
        snapshotAsOf
      );
      loadedEnvelope = effectiveStorage.load();
    }
  } catch {
    // error handled
  }

  const storedSuppressions = loadedEnvelope?.payload.suppressions ?? [];
  const rawStoredConfirmed = loadedEnvelope?.payload.memoryFacts ?? [];
  const activeStoredConfirmed: MemoryFact[] = [...rawStoredConfirmed.filter((f: MemoryFact) => f.status === 'confirmed')];

  // Process prep_buffer_preference if present
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

  // Merge confirmed facts from externalMemoryFacts and activeStoredConfirmed (INV-107 confirmed-only)
  const extConfirmed = (externalMemoryFacts ?? []).filter(f => f && f.status === 'confirmed');
  const combinedMemory = [
    ...extConfirmed,
    ...activeStoredConfirmed.filter(sc => !extConfirmed.some(af => af.key === sc.key)),
  ];

  const storedUserConfirmedKeys = new Set(combinedMemory.map(f => f.key));

  // Build Location Signal
  let locationSignal: LiveSignal | null = null;
  const locStatus = liveLocationStatus ?? defaultLocationPort.getLocation();
  const isLocAvailable =
    (locStatus.status === 'available' || (locStatus as any).status === 'granted' || locStatus.isStale) &&
    (locStatus.coords != null || (locStatus as any).latitude != null);

  if (isLocAvailable) {
    const coords = locStatus.coords
      ? { lat: locStatus.coords.lat, lng: locStatus.coords.lng }
      : { lat: (locStatus as any).latitude, lng: (locStatus as any).longitude };
    const area = (locStatus as any).coords?.city || 'Location shared';
    let staleFixNotice: string | undefined;
    if (locStatus.isStale) {
      const fixAgeMs = Date.now() - (locStatus.updatedAt ? Date.parse(locStatus.updatedAt) : Date.now());
      const mins = Math.max(1, Math.round(fixAgeMs / 60000));
      staleFixNotice = `location from ${mins}m ago`;
    }
    locationSignal = createLiveSignal({
      kind: 'location_status',
      value: {
        status: locStatus.isStale ? 'stale' : 'available',
        coords,
        accuracy: locStatus.accuracy,
        isHome: false,
        label: area,
        currentArea: area,
        staleFixNotice,
      },
      provider: 'geolocation',
      asOf: snapshotAsOf,
      validFor: 60000,
      confidence: locStatus.isStale ? 0.7 : 1.0,
      provenance: 'live',
      consentScope: 'device_only',
      status: locStatus.isStale ? 'stale' : 'available',
    });
  } else if (locStatus.status === 'denied') {
    locationSignal = createLiveSignal({
      kind: 'location_status',
      value: {
        status: 'denied',
        isHome: false,
        notice: 'Location access denied by user',
      },
      provider: 'geolocation',
      asOf: snapshotAsOf,
      validFor: 60000,
      confidence: 0,
      provenance: 'live',
      consentScope: 'device_only',
      status: 'permission_needed',
    });
  } else if (locStatus.status === 'unavailable') {
    locationSignal = createLiveSignal({
      kind: 'location_status',
      value: {
        status: 'unavailable',
        isHome: false,
        notice: 'Location unavailable',
      },
      provider: 'geolocation',
      asOf: snapshotAsOf,
      validFor: 60000,
      confidence: 0,
      provenance: 'live',
      consentScope: 'device_only',
      status: 'unavailable',
    });
  } else if (locStatus.status === 'prompt') {
    locationSignal = createLiveSignal({
      kind: 'location_status',
      value: {
        status: 'prompt',
        isHome: false,
        notice: 'Location permission needed to find nearby lunch places',
      },
      provider: 'geolocation',
      asOf: snapshotAsOf,
      validFor: 60000,
      confidence: 0,
      provenance: 'live',
      consentScope: 'device_only',
      status: 'permission_needed',
    });
  }

  // Build Places Signal
  let placesSignal: LiveSignal | null = null;
  const placesStatus = livePlacesStatus ?? { enabled: false };
  const placesList = livePlacesList ?? [];
  const isPlacesErr = Boolean(livePlacesError);

  if (!placesStatus.enabled) {
    placesSignal = createLiveSignal({
      kind: 'places_lunch',
      value: { status: 'disabled', places: [] },
      provider: 'overpass',
      asOf: snapshotAsOf,
      validFor: 300000,
      confidence: 0,
      provenance: 'live',
      consentScope: 'local_only',
      status: 'unavailable',
    });
  } else if (isPlacesErr) {
    placesSignal = createLiveSignal({
      kind: 'places_lunch',
      value: { status: 'error', places: [] },
      provider: 'overpass',
      asOf: snapshotAsOf,
      validFor: 300000,
      confidence: 0,
      provenance: 'live',
      consentScope: 'local_only',
      status: 'error',
    });
  } else if (placesList.length === 0) {
    placesSignal = createLiveSignal({
      kind: 'places_lunch',
      value: { status: 'empty', places: [] },
      provider: 'overpass',
      asOf: snapshotAsOf,
      validFor: 300000,
      confidence: 1.0,
      provenance: 'live',
      consentScope: 'local_only',
      status: 'available',
    });
  } else {
    placesSignal = createLiveSignal({
      kind: 'places_lunch',
      value: {
        status: 'available',
        places: placesList.map(p => ({
          id: p.placeId,
          name: p.name,
          cuisine: p.cuisine,
          noiseLevel: p.noiseLevel,
          vegetarian: p.vegetarian,
          coords: p.coords,
          straightLineDistanceMeters: p.straightLineDistanceMeters,
          straightLineDistanceLabel: p.straightLineDistanceLabel,
          openNow: p.openingStatus === 'open',
          openingStatus: p.openingStatus,
          osmId: p.osmId,
          fetchedAt: p.fetchedAt,
          attribution: p.attribution,
        })),
      },
      provider: 'overpass',
      asOf: snapshotAsOf,
      validFor: 300000,
      confidence: 1.0,
      provenance: 'live',
      consentScope: 'local_only',
      status: 'available',
    });
  }

  // Build Route Signal
  let routeSignal: LiveSignal | null = null;
  if (liveRoute && !isRouteStale(liveRoute)) {
    routeSignal = createLiveSignal({
      kind: 'route',
      value: liveRoute,
      provider: 'osrm',
      asOf: liveRoute.fetchedAt || snapshotAsOf,
      validFor: 300000,
      confidence: 1.0,
      provenance: 'live',
      consentScope: 'local_only',
      status: 'available',
    });
  }

  // Weather Signal
  let weatherSig: LiveSignal | null = null;
  if (liveWeatherSignal) {
    if ((liveWeatherSignal as LiveSignal).validFor && (liveWeatherSignal as LiveSignal).asOf) {
      weatherSig = liveWeatherSignal as LiveSignal;
    } else {
      weatherSig = createLiveSignal({
        kind: 'weather',
        value: liveWeatherSignal.value,
        provider: 'open-meteo',
        asOf: liveWeatherSignal.issuedAt || snapshotAsOf,
        validFor: liveWeatherSignal.validFor || 300000,
        confidence: 1.0,
        provenance: 'live',
        consentScope: 'local_only',
        status: 'available',
      });
    }
  }

  // Build Snapshot
  const snapshot = buildLiveSnapshot({
    asOf: snapshotAsOf,
    timezone: snapshotTimezone,
    locationSignal,
    weatherSignal: weatherSig,
    placesSignal,
    routeSignal,
    calendarSignal: options?.calendarSignal,
    memoryFacts: combinedMemory,
    customSignals: options?.customSignals,
  });

  const plugins = staticPluginRegistry.getAll();
  const pipelineResult = runPipeline({
    snapshot,
    memory: combinedMemory,
    clock: snapshotAsOf,
    plugins,
    storage: effectiveStorage,
    suppressions: storedSuppressions,
  });

  // Map & Evidence
  let spatialMapEvidence: SpatialMapEvidence | null = null;
  let evidenceBundle: EvidenceBundle | undefined;

  const now = pipelineResult.livingContext.now;
  if (now?.intentId === 'lunch') {
    const topPlace = placesList[0];
    if (topPlace && placesSignal) {
      spatialMapEvidence = {
        placeOrRoute: {
          name: topPlace.name,
          destination: topPlace.address || topPlace.cuisine || 'Dining',
        },
        spatialEvidence: placesSignal,
      };
    }
    evidenceBundle = createLunchPlacesEvidenceBundle({
      places: placesList as any,
      snapshot,
      sceneClockIso: snapshotAsOf,
      timezone: snapshotTimezone,
      userConfirmedKeys: storedUserConfirmedKeys,
      isConfirmedTaste: storedUserConfirmedKeys.has('taste_preference') || storedUserConfirmedKeys.has('taste_preference_lunch_cuisine') || storedUserConfirmedKeys.has('favorite_cuisine'),
      memoryFacts: combinedMemory,
    });
  } else if (now?.intentId === 'depart') {
    if (liveDestination && routeSignal) {
      spatialMapEvidence = {
        placeOrRoute: {
          name: liveDestination.name,
          destination: liveDestination.name,
        },
        spatialEvidence: routeSignal,
      };
    }
    evidenceBundle = createRainEvidenceBundle({
      snapshot,
      sceneClockIso: snapshotAsOf,
      timezone: snapshotTimezone,
      userConfirmedKeys: storedUserConfirmedKeys,
      isConfirmedHabit: storedUserConfirmedKeys.has('rain_transport_preference'),
      memoryFacts: combinedMemory,
    });
  }

  return {
    pipelineResult,
    spatialMapEvidence,
    storageError: false,
    storage: effectiveStorage,
    snapshotAsOf,
    snapshotTimezone,
    snapshot,
    combinedMemory,
    evidenceBundle,
  };
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
  let selectedCardState: CardSelectionState | null = null;
  let desktopResizeListenerAttached = false;

  let demoPanelOpen = false;
  let demoPanelCleanup: (() => void) | null = null;

  const testHooksEnabled =
    typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined'
      ? __YORI_ENABLE_TEST_HOOKS__
      : Boolean((import.meta as any).env?.DEV);

  const defaultMode = getEffectiveDefaultMode();
  let contextMode: 'demo' | 'live' = defaultMode;

  let isDevMode = false;
  if (typeof window !== 'undefined') {
    try {
      const p = new URLSearchParams(window.location.search);
      const urlTab = p.get('tab');
      if (urlTab === 'for-you') {
        activeTab = 'for-you';
      } else if (urlTab === 'plans') {
        activeTab = 'plans';
      } else if (urlTab === 'me') {
        activeTab = 'me';
      } else if (urlTab === 'today' || urlTab === 'home') {
        activeTab = 'today';
      } else if (urlTab === 'connectors') {
        activeDetail = { type: 'connectors' };
      }

      const devParam = p.get('dev');
      if (devParam === '1' || (testHooksEnabled && p.get('test') === '1')) {
        isDevMode = true;
        sessionStorage.setItem('yori_dev', '1');
      } else if (devParam === '0') {
        isDevMode = false;
        sessionStorage.removeItem('yori_dev');
      } else if (testHooksEnabled && (Boolean((import.meta as any).env?.DEV) || sessionStorage.getItem('yori_dev') === '1')) {
        isDevMode = true;
      }
    } catch {
      // ignore
    }
  }

  if (typeof window !== 'undefined' && (isDevMode || testHooksEnabled)) {
    window.addEventListener('yori:open-demo-panel', () => {
      demoPanelOpen = true;
      update();
    });
  }

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

  const timelineController = new ContinuousTimelineController({
    storage: sharedStorage,
    autoPlay: false,
    onUpdate: (beat) => {
      activeTimelineBeat = beat;
      actionStore.resetToIdle();
      update();
    },
  });

  let activeTimelineBeat: TimelineBeat | null = null;
  const previousComposedPlanByIntent = new Map<string, PreparedPlan>();
  const previousLivePlanByIntent = new Map<string, PreparedPlan>();
  let activeLiveChangeMoment: LiveChangeMomentState | null = null;

  if (typeof window !== 'undefined') {
    try {
      const p = new URLSearchParams(window.location.search);
      const beatParam = p.get('beat') as TimelineBeatId | null;
      const timelineParam = p.get('timeline');
      if (beatParam && TIMELINE_BEATS.some(b => b.id === beatParam)) {
        activeTimelineBeat = timelineController.goTo(beatParam);
      } else if (timelineParam === '1') {
        activeTimelineBeat = timelineController.getCurrentBeat();
      }
    } catch {
      // ignore
    }
  }

  const isTimelineGated =
    testHooksEnabled &&
    (isDevOrTest ||
      isDevMode ||
      (typeof window !== 'undefined' &&
        typeof window.location?.search === 'string' &&
        (window.location.search.includes('timeline=1') ||
          window.location.search.includes('beat=') ||
          window.location.search.includes('test=1') ||
          window.location.search.includes('dev=1'))));

  if (testHooksEnabled && typeof window !== 'undefined' && isTimelineGated) {
    (window as any).__YORI_TIMELINE__ = {
      step: () => {
        actionStore.resetToIdle();
        activeTimelineBeat = timelineController.step();
        update();
        return activeTimelineBeat;
      },
      goTo: (beatId: TimelineBeatId) => {
        actionStore.resetToIdle();
        activeTimelineBeat = timelineController.goTo(beatId);
        update();
        return activeTimelineBeat;
      },
      simulateDismissLunch: (source: 'simulated_user' | 'user' = 'simulated_user') => {
        actionStore.resetToIdle();
        activeTimelineBeat = timelineController.simulateDismissLunch(source);
        update();
        return activeTimelineBeat;
      },
      pause: () => {
        timelineController.pause();
        update();
      },
      play: () => {
        timelineController.play();
        update();
      },
      reset: () => {
        previousComposedPlanByIntent.clear();
        actionStore.resetToIdle();
        activeLoadedFacts = [];
        activeTimelineBeat = timelineController.restart();
        update();
        return activeTimelineBeat;
      },
      getClock: () => timelineController.getClockIso(),
      getState: () => ({
        ...timelineController.getState(),
        activeBeat: activeTimelineBeat,
      }),
    };
  }

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
  if (contextMode === 'live') {
    defaultLocationPort.setLocation('prompt');
    defaultModelCommandInterpreter.setMode('live');
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

  let isWeatherLoading = false;
  let weatherError: string | null = null;

  async function checkWeatherStatus() {
    try {
      if (typeof fetch !== 'undefined') {
        isWeatherLoading = true;
        update();
        const resp = await fetch('/api/weather/status', { cache: 'no-store' });
        if (resp.ok) {
          weatherError = null;
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
        } else if (resp.status >= 500) {
          weatherError = 'Weather service unavailable · showing your last plan';
        }
      }
    } catch {
      // Ignore network errors
    } finally {
      isWeatherLoading = false;
      update();
    }
  }

  // Live Routing Seam (L2-ROUTE-MAP)
  const liveDestinationPort = new LiveDestinationAdapter();
  let liveDestination: DestinationInfo | null = null;
  let liveRoute: RouteResult | null = null;
  let liveRouteStatus: RouteStatus = { enabled: false };
  let liveRouteError = false;
  let liveRouteErrorReason: NoRouteReason | null = null;

  async function checkRouteStatus() {
    try {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch('/api/route/status', { cache: 'no-store' });
        if (resp.ok) {
          liveRouteStatus = (await resp.json()) as RouteStatus;
        }
      }
    } catch {
      // ignore
    }
    await refreshLiveRoute();
  }

  async function refreshLiveRoute() {
    if (contextMode !== 'live') return;

    // Check destination
    if (!liveDestination) {
      try {
        liveDestination = await liveDestinationPort.getLiveDestination();
      } catch {
        liveDestination = null;
      }
    }

    // Dev/Test Hook destination injection (strictly gated by compile-time test hooks and isDevOrTest)
    if (
      typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined' &&
      __YORI_ENABLE_TEST_HOOKS__ &&
      isDevOrTest &&
      typeof window !== 'undefined' &&
      window.location?.search
    ) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('test_destination') === '1' && !liveDestination) {
        liveDestination = {
          coordinate: [37.7599, -122.4148],
          name: 'Mission Dolores',
          address: 'Mission Dolores, San Francisco, CA',
        };
      }
    }

    const hasLocation =
      (liveLocationStatus.status === 'available' || (liveLocationStatus as any).status === 'granted' || liveLocationStatus.isStale) &&
      (liveLocationStatus.coords != null || (liveLocationStatus as any).latitude != null);

    const locCoords: [number, number] | null = liveLocationStatus.coords
      ? [liveLocationStatus.coords.lat, liveLocationStatus.coords.lng]
      : typeof (liveLocationStatus as any).latitude === 'number' &&
        typeof (liveLocationStatus as any).longitude === 'number'
      ? [(liveLocationStatus as any).latitude, (liveLocationStatus as any).longitude]
      : null;

    if (!hasLocation || !locCoords || !liveDestination) {
      liveRoute = null;
      update();
      return;
    }

    try {
      update();
      const [origLat, origLng] = locCoords;
      const [destLat, destLng] = liveDestination.coordinate;
      const isLunchRoute = selectedCardState?.cardKind === 'lunch' || Boolean(selectedLivePlace);
      const mode = isLunchRoute ? 'walking' : 'driving';
      const routeUrl = `/api/route?origin=${origLat},${origLng}&destination=${destLat},${destLng}&mode=${mode}`;
      const resp = await fetch(routeUrl, { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        if (data.enabled && data.route) {
          liveRoute = data.route;
          liveRouteError = false;
          liveRouteErrorReason = null;
        } else {
          liveRoute = null;
          liveRouteError = false;
          liveRouteErrorReason = data.code === 'mode_unsupported' || data.error?.includes('mode_unsupported') ? 'mode_unsupported' : null;
        }
      } else {
        liveRoute = null;
        liveRouteError = true;
        try {
          const errData = await resp.json();
          liveRouteErrorReason = errData.code === 'mode_unsupported' || errData.error?.includes('mode_unsupported') ? 'mode_unsupported' : null;
        } catch {
          liveRouteErrorReason = null;
        }
      }
    } catch {
      liveRoute = null;
      liveRouteError = true;
      liveRouteErrorReason = null;
    } finally {
      update();
    }
  }

  function getLiveNoRouteReason(): NoRouteReason {
    if (
      typeof __YORI_ENABLE_TEST_HOOKS__ !== 'undefined' &&
      __YORI_ENABLE_TEST_HOOKS__ &&
      isDevOrTest &&
      typeof window !== 'undefined' &&
      window.location?.search
    ) {
      const params = new URLSearchParams(window.location.search);
      const forced = params.get('test_no_route_reason') as NoRouteReason | null;
      if (forced && forced in NO_ROUTE_REASON_LABELS) {
        return forced;
      }
    }

    if (liveRouteErrorReason) {
      return liveRouteErrorReason;
    }

    if (liveRoute && isRouteStale(liveRoute)) {
      return 'stale';
    }

    if (liveRouteError) {
      return 'provider_error';
    }

    const hasLocation =
      (liveLocationStatus.status === 'available' || (liveLocationStatus as any).status === 'granted' || liveLocationStatus.isStale) &&
      (liveLocationStatus.coords != null || (liveLocationStatus as any).latitude != null);

    if (liveDestination && hasLocation && liveRouteStatus && !liveRouteStatus.enabled) {
      return 'provider_disabled';
    }

    if (!liveDestination) {
      return 'no_destination';
    }

    if (!hasLocation) {
      return 'location_not_shared';
    }

    if (liveRouteStatus && !liveRouteStatus.enabled) {
      return 'provider_disabled';
    }

    return 'no_destination';
  }

  // Live Places Seam (L3-REAL-PLACES)
  let livePlacesStatus: { enabled: boolean; provider?: string; attribution?: string } = { enabled: false };
  let livePlacesList: readonly RankedPlaceItem[] = [];
  let livePlacesLoading = false;
  let livePlacesError = false;
  let selectedLivePlace: PlaceItem | null = null;

  async function checkPlacesStatus() {
    try {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch('/api/places/status', { cache: 'no-store' });
        if (resp.ok) {
          livePlacesStatus = (await resp.json()) as { enabled: boolean; provider?: string; attribution?: string };
        }
      }
    } catch {
      // ignore
    }
    await refreshLivePlaces();
  }

  async function refreshLivePlaces() {
    if (contextMode !== 'live') return;
    if (!livePlacesStatus.enabled) {
      livePlacesList = [];
      update();
      return;
    }

    const hasLocation =
      (liveLocationStatus.status === 'available' || (liveLocationStatus as any).status === 'granted' || liveLocationStatus.isStale) &&
      (liveLocationStatus.coords != null || (liveLocationStatus as any).latitude != null);

    const locCoords: [number, number] | null = liveLocationStatus.coords
      ? [liveLocationStatus.coords.lat, liveLocationStatus.coords.lng]
      : typeof (liveLocationStatus as any).latitude === 'number' &&
        typeof (liveLocationStatus as any).longitude === 'number'
      ? [(liveLocationStatus as any).latitude, (liveLocationStatus as any).longitude]
      : null;

    if (!hasLocation || !locCoords) {
      livePlacesList = [];
      update();
      return;
    }

    const [lat, lng] = locCoords;
    livePlacesLoading = true;
    update();

    try {
      const resp = await fetch(`/api/places?lat=${lat}&lng=${lng}&amenity=restaurant&radius=1500`, { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        if (data.enabled && Array.isArray(data.places)) {
          if (!activeLoadedFacts || activeLoadedFacts.length === 0) {
            try {
              activeLoadedFacts = await memoryPort.loadFacts();
            } catch {
              // ignore
            }
          }
          const confirmedFacts = activeLoadedFacts.filter(f => f.status === 'confirmed');
          livePlacesList = rankPlacesByConfirmedPreferences(data.places, confirmedFacts);
          livePlacesError = false;
          if (selectedCardState == null && livePlacesList.length > 0) {
            selectedCardState = {
              selectedId: 'places',
              cardKind: 'lunch',
              label: 'Nearby Dining',
            };
          }
        } else {
          livePlacesList = [];
          livePlacesError = false;
        }
      } else {
        livePlacesList = [];
        livePlacesError = true;
      }
    } catch {
      livePlacesList = [];
      livePlacesError = true;
    } finally {
      livePlacesLoading = false;
      update();
    }
  }

  // Live Calendar Seam (S4-LIVE-DEPART)
  let liveCalendarStatus: { enabled: boolean; configured: boolean; attribution?: string; actionRequired?: string } = { enabled: false, configured: false };
  let liveCalendarSignal: LiveSignal | null = null;
  let liveTravelSignal: LiveSignal | null = null;

  async function checkCalendarStatus() {
    try {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch('/api/calendar/status', { cache: 'no-store' });
        if (resp.ok) {
          liveCalendarStatus = (await resp.json()) as { enabled: boolean; configured: boolean; attribution?: string; actionRequired?: string };
        }
      }
    } catch {
      // ignore
    }
    await refreshLiveCalendar();
  }

  async function refreshLiveCalendar() {
    if (contextMode !== 'live') return;
    if (!liveCalendarStatus.configured || !liveCalendarStatus.enabled) {
      liveCalendarSignal = null;
      liveTravelSignal = null;
      update();
      return;
    }

    try {
      if (typeof fetch !== 'undefined') {
        const resp = await fetch('/api/calendar', { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          if (data.enabled && Array.isArray(data.events) && data.events.length > 0) {
            // Find upcoming event within 24h
            const nowMs = Date.now();
            const upcoming = data.events.find((ev: any) => {
              const startMs = Date.parse(ev.startTime);
              return Number.isFinite(startMs) && startMs >= nowMs - 15 * 60000 && startMs <= nowMs + 24 * 3600000;
            });
            if (upcoming) {
              const apptIso = upcoming.startTime;
              const title = upcoming.title || 'Appointment';
              const location = upcoming.location;

              const deviceTimezone =
                typeof Intl !== 'undefined'
                  ? Intl.DateTimeFormat().resolvedOptions().timeZone
                  : 'UTC';

              liveCalendarSignal = createLiveSignal({
                kind: 'calendar',
                value: {
                  title,
                  startTime: apptIso,
                  apptTime: apptIso,
                  location,
                  timezone: deviceTimezone,
                },
                provider: 'ics',
                asOf: new Date().toISOString(),
                validFor: 3600000,
                confidence: 1.0,
                provenance: 'live',
                consentScope: 'device_only',
                status: 'available',
              });

              // Geocode location if available and calculate route
              if (location) {
                try {
                  const geoResp = await fetch(`/api/geocode?q=${encodeURIComponent(location)}`, { cache: 'no-store' });
                  if (geoResp.ok) {
                    const geoData = await geoResp.json();
                    if (geoData.success && geoData.result) {
                      const [destLat, destLng] = geoData.result.coordinate;
                      liveDestination = {
                        coordinate: [destLat, destLng],
                        name: title,
                        address: location,
                        source: 'calendar event',
                      };

                      // If location available, fetch route
                      const locCoords = liveLocationStatus.coords
                        ? [liveLocationStatus.coords.lat, liveLocationStatus.coords.lng]
                        : null;
                      if (locCoords) {
                        try {
                          const routeResp = await fetch(
                            `/api/route?origin=${locCoords[0]},${locCoords[1]}&destination=${destLat},${destLng}&mode=driving`,
                            { cache: 'no-store' }
                          );
                          if (routeResp.ok) {
                            const routeData = await routeResp.json();
                            if (routeData.enabled && routeData.route) {
                              liveRoute = routeData.route;
                              const travelMinutes = Math.round(routeData.route.durationS / 60);
                              liveTravelSignal = createLiveSignal({
                                kind: 'travel_estimate',
                                value: {
                                  travelMinutes,
                                  mode: 'drive',
                                  driveMinutes: travelMinutes,
                                },
                                provider: 'osrm',
                                asOf: new Date().toISOString(),
                                validFor: 300000,
                                confidence: 1.0,
                                provenance: 'live',
                                consentScope: 'device_only',
                                status: 'available',
                              });
                            } else {
                              liveRoute = null;
                              liveTravelSignal = null;
                              liveRouteError = true;
                              liveRouteErrorReason = routeData.enabled === false ? 'provider_disabled' : 'provider_error';
                            }
                          } else {
                            liveRoute = null;
                            liveTravelSignal = null;
                            liveRouteError = true;
                            liveRouteErrorReason = 'provider_error';
                          }
                        } catch {
                          liveRoute = null;
                          liveTravelSignal = null;
                          liveRouteError = true;
                          liveRouteErrorReason = 'provider_error';
                        }
                      } else {
                        liveRoute = null;
                        liveTravelSignal = null;
                        liveRouteError = false;
                        liveRouteErrorReason = 'location_not_shared';
                      }
                    } else {
                      liveRoute = null;
                      liveTravelSignal = null;
                      liveRouteError = false;
                      liveRouteErrorReason = geoData.error === 'owner_gated' ? 'provider_disabled' : 'no_destination';
                    }
                  } else {
                    liveRoute = null;
                    liveTravelSignal = null;
                    liveRouteError = true;
                    liveRouteErrorReason = 'provider_error';
                  }
                } catch {
                  liveRoute = null;
                  liveTravelSignal = null;
                  liveRouteError = true;
                  liveRouteErrorReason = 'provider_error';
                }
              } else {
                liveRoute = null;
                liveTravelSignal = null;
                liveRouteError = false;
                liveRouteErrorReason = 'no_destination';
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
    update();
  }

  function selectLivePlace(place: PlaceItem) {
    selectedLivePlace = place;
    liveDestination = {
      coordinate: [place.coords.lat, place.coords.lng],
      name: place.name,
      address: place.address,
      osmId: place.osmId,
      source: 'user-selected place',
    };
    liveDestinationPort.setDestination(liveDestination);
    selectedCardState = {
      selectedId: `place-${place.osmId}`,
      cardKind: 'lunch',
      planId: `place-${place.osmId}`,
      label: place.name,
    };
    void refreshLiveRoute();
    update();
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
  void checkRouteStatus();
  void checkPlacesStatus();
  void checkCalendarStatus();
  void refreshConnectorStatuses();

  let liveRefreshInFlight = false;

  async function triggerLiveRefresh() {
    if (liveRefreshInFlight) return;
    if (contextMode !== 'live') return;
    liveRefreshInFlight = true;
    try {
      let loc = defaultLocationPort.getLocation();
      const consent = defaultLocationPort.getConsentStatus?.();
      if (consent === 'granted' && (loc.status === 'unavailable' || loc.isStale)) {
        if (typeof defaultLocationPort.acquireSessionFix === 'function') {
          try {
            loc = await defaultLocationPort.acquireSessionFix();
          } catch {
            // retain stale state
          }
        }
      }
      liveLocationStatus = loc;
      await checkWeatherStatus();
      await checkPlacesStatus();
      await checkCalendarStatus();
      await checkRouteStatus();
      await refreshConnectorStatuses();
      update();
    } catch {
      // ignore
    } finally {
      liveRefreshInFlight = false;
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', () => {
      if (contextMode === 'live') {
        void triggerLiveRefresh();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && contextMode === 'live') {
        void triggerLiveRefresh();
      }
    });
    setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (contextMode === 'live') {
        void triggerLiveRefresh();
      }
    }, 60000);
  }

  function update() {
    const isDesktopLayout = typeof window !== 'undefined' && window.innerWidth >= 1024;
    const sceneState =
      contextMode === 'live'
        ? computeLiveState(
            sharedStorage,
            weatherStatus.enabled ? liveWeatherSignal : null,
            liveLocationStatus,
            activeLoadedFacts,
            livePlacesStatus,
            livePlacesList,
            livePlacesError,
            liveRoute,
            liveDestination,
            {
              calendarSignal: liveCalendarSignal,
              customSignals: liveTravelSignal ? [liveTravelSignal] : undefined,
            }
          )
        : computeSceneState(
            currentScene,
            sharedStorage,
            weatherStatus.enabled ? liveWeatherSignal : null,
            activeLoadedFacts,
            undefined,
            contextMode === 'demo' ? activeTimelineBeat : null
          );

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
    } = sceneState;

    currentEvidenceBundle = evidenceBundle;
    let currentV2Composition: HomeCompositionVM | null = null;

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
    const isPlanSuppressed = actionState.plan
      ? storedSuppressions.some(s => s.targetIntent === actionState.plan?.intentId || (s as any).intentId === actionState.plan?.intentId)
      : false;
    const storePlan =
      !isPlanSuppressed && (actionState.status === 'updated' || (actionState.status === 'working' && actionState.plan))
        ? actionState.plan
        : undefined;
    const nowPlan = storePlan ?? baseNowPlan;
    const nowPresentation = nowPlan ? formatNowPlan(nowPlan) : null;
    const cleanNowTitle =
      nowPresentation?.title ||
      (nowPlan as any)?.subjectTitle ||
      (nowPlan?.intentId === 'depart'
        ? 'Piano lesson'
        : nowPlan?.intentId === 'lunch'
          ? 'Lunch options near you'
          : (nowPlan?.headline || 'Plan'));

    if (contextMode === 'live') {
      const heroKind = determineCardKind(nowPlan);
      if (nowPlan) {
        selectedCardState = {
          selectedId: nowPlan.id || 'hero',
          cardKind: heroKind,
          planId: nowPlan.id,
          label: cleanNowTitle,
        };
      } else if (selectedLivePlace) {
        selectedCardState = {
          selectedId: `place-${selectedLivePlace.osmId}`,
          cardKind: 'lunch',
          label: selectedLivePlace.name,
        };
      } else if (liveRoute && liveDestination) {
        selectedCardState = {
          selectedId: 'hero-live-route',
          cardKind: 'travel',
          label: `Route to ${liveDestination.name}`,
        };
      } else if (liveDestination) {
        selectedCardState = {
          selectedId: 'hero-live-dest',
          cardKind: 'travel',
          label: `Destination ${liveDestination.name}`,
        };
      } else if (livePlacesList && livePlacesList.length > 0) {
        selectedCardState = {
          selectedId: 'live-places',
          cardKind: 'lunch',
          label: 'Nearby Dining',
        };
      } else {
        selectedCardState = {
          selectedId: 'live-quiet',
          cardKind: 'quiet',
          label: 'Live context',
        };
      }
    } else {
      const heroKind = determineCardKind(nowPlan);
      if (activeTimelineBeat || !selectedCardState || selectedCardState.selectedId.startsWith('live-') || selectedCardState.selectedId.startsWith('hero-live')) {
        selectedCardState = {
          selectedId: nowPlan?.id || 'hero',
          cardKind: heroKind,
          planId: nowPlan?.id,
          label: cleanNowTitle,
        };
      }
    }

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

    const derivedLivingHeader =
      contextMode === 'demo'
        ? deriveLivingHeaderFromSnapshot(effectiveSnapshot, effectiveTz)
        : deriveLiveLivingHeaderFromSnapshot(effectiveSnapshot, effectiveTz, { weatherDisabled: !weatherStatus.enabled });

    const currentLivingHeaderLine =
      derivedLivingHeader
        ? derivedLivingHeader.formattedLine
        : (() => {
            const timeStr = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const weatherStr =
              weatherStatus.enabled && liveWeatherSignal
                ? (liveWeatherSignal.value as any)?.condition || 'Weather active'
                : 'Weather off';
            const locStr =
              liveLocationStatus.status === 'available'
                ? (liveLocationStatus as any).coords?.city || 'Location shared'
                : 'Home';
            return `${timeStr} · ${weatherStr} · ${locStr}`;
          })();

    const hasPreparedCard = Boolean(
      (
        (nowPlan && !isPlanAccepted(nowPlan, acceptedPlanIds) && !storedSuppressions.some(s => s.targetIntent === nowPlan.intentId || (s as any).intentId === nowPlan.intentId)) ||
        (nowPlan && isPlanAccepted(nowPlan, acceptedPlanIds)) ||
        (admittedCandidate && !storedSuppressions.some(s => s.targetIntent === 'lunch' || (s as any).intentId === 'lunch')) ||
        (living.forYou && living.forYou.length > 0)
      ) &&
      (contextMode === 'live' || (currentScene !== 'busy-lunch' && currentScene !== 'corrupt-storage'))
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
        ? (activeTimelineBeat ? 'Demo timeline · simulated time' : 'Demo · simulated scenes')
        : (() => {
            const parts = ['Device clock'];
            const locConn = latestConnectorStatuses?.location;
            if (locConn?.state === 'connected' || liveLocationStatus.status === 'available') {
              parts.push('Location');
            }
            const weatherConn = latestConnectorStatuses?.weather;
            if (weatherConn?.state === 'connected' || (weatherStatus.enabled && liveWeatherSignal)) {
              parts.push('Weather');
            }
            const xmemoConn = latestConnectorStatuses?.xmemo;
            if (xmemoConn?.state === 'connected' || (xmemoStatus.enabled && xmemoStatus.connected)) {
              parts.push('Memories');
            }
            return parts.join(' · ');
          })();

    actionStore.setCommandContext({
      plan: nowPlan ?? null,
      candidate: admittedCandidate,
      snapshot,
      memory: combinedMemory,
      sceneId: contextMode === 'live' ? 'live' : currentScene,
      userConfirmedKeys,
    });
    const isNowAccepted = nowPlan ? isPlanAccepted(nowPlan, acceptedPlanIds) : false;

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
      const isLiveContext = contextMode === 'live';
      if (activeDetail?.type === 'trip' && nowPlan) {
        const tripVM = deriveTripDetailVM({
          plan: nowPlan,
          spatialEvidence: spatialMapEvidence,
          selectedMode: activeDetail.selectedMode,
          userConfirmedKeys,
          snapshot,
          acceptedPlanIds,
          isLive: isLiveContext,
        });
        v2BodyHtml = renderTripDetail(tripVM);
      } else if (activeDetail?.type === 'restaurant' && nowPlan) {
        const firstOpt = nowPlan.optionsOrSteps?.[0];
        const defaultCandId =
          typeof firstOpt !== 'string' && firstOpt ? firstOpt.id : 'cand-1';
        const candidateId = activeDetail.candidateId || defaultCandId;
        const restaurantBundle =
          (isLiveContext
            ? createLunchPlacesEvidenceBundle({
                places: (livePlacesList && livePlacesList.length > 0
                  ? livePlacesList
                  : ((effectiveSnapshot?.signals?.find(s => s.kind === 'places_lunch')?.value as any)?.places ?? [])) as any,
                snapshot: effectiveSnapshot,
                sceneClockIso: effectiveSnapshot?.asOf ?? snapshotAsOf,
                timezone: snapshotTimezone,
                userConfirmedKeys,
                isConfirmedTaste:
                  userConfirmedKeys.has('taste_preference') ||
                  userConfirmedKeys.has('taste_preference_lunch_cuisine'),
                memory: combinedMemory,
              })
            : effectiveEvidenceBundle ??
              createLunchEvidenceBundle({
                sceneClockIso: snapshot?.asOf ?? '2026-10-28T19:10:00.000Z',
                timezone: snapshotTimezone,
                userConfirmedKeys,
                isConfirmedTaste: userConfirmedKeys.has('taste_preference_lunch_cuisine'),
                memory: combinedMemory,
              }));
        const restaurantVM = deriveRestaurantDetailVM({
          candidateId,
          plan: nowPlan,
          spatialEvidence: spatialMapEvidence,
          isSaved: activeDetail.isSaved ?? false,
          userConfirmedKeys,
          snapshot,
          timezone: snapshotTimezone,
          evidenceBundle: restaurantBundle,
          isLive: isLiveContext,
        });
        v2BodyHtml = renderRestaurantDetail(restaurantVM);
      } else if (activeTab === 'plans') {
        if (contextMode === 'live') {
          v2BodyHtml = renderPlansView([]);
        } else {
          v2BodyHtml = renderPlansView(aheadPlans);
        }
      } else if (activeTab === 'for-you') {
        if (contextMode === 'live') {
          const userConfirmedProposals = living.forYou
            .filter(f => userConfirmedKeys.has(f.key))
            .map(f => ({
              key: f.key,
              title: humanizeProposalTitle(f.key),
              basis: 'Confirmed preference',
              value: f.value,
              provenance: 'user' as const,
            }));
          v2BodyHtml = renderForYouView(userConfirmedProposals);
        } else {
          const proposalsVM = living.forYou.map(f => {
            const isConfirmed = userConfirmedKeys.has(f.key);
            const title = humanizeProposalTitle(f.key);
            const basis = isConfirmed
              ? 'Confirmed preference'
              : 'Derived from sample demo profile';
            return {
              key: f.key,
              title,
              basis,
              value: f.value,
              provenance: isConfirmed ? ('user' as const) : ('fixture' as const),
            };
          });
          v2BodyHtml = renderForYouView(proposalsVM);
        }
      } else {
        let currentPlanDiff: PlanDiff | null = null;
        if (actionStore.canUndo()) {
          const lastSnapshot = actionStore.getLastHistorySnapshot();
          if (lastSnapshot?.planState && nowPlan) {
            const priorOpt = lastSnapshot.planState.optionsOrSteps?.find(
              (o: any) => typeof o === 'object' && o !== null && Boolean(o.isSelected)
            ) as any;
            const currentOpt = nowPlan.optionsOrSteps?.find(
              (o: any) => typeof o === 'object' && o !== null && Boolean(o.isSelected)
            ) as any;
            const prior = {
              headline: lastSnapshot.planState.headline,
              leaveTimeStr: lastSnapshot.planState.leaveAt ? formatTime(lastSnapshot.planState.leaveAt, lastSnapshot.planState.timezone) : undefined,
              prepareTimeStr: lastSnapshot.planState.prepareAt ? formatTime(lastSnapshot.planState.prepareAt, lastSnapshot.planState.timezone) : undefined,
              mode: priorOpt?.mode,
            };
            const current = {
              headline: nowPlan.headline,
              leaveTimeStr: nowPlan.leaveAt ? formatTime(nowPlan.leaveAt, nowPlan.timezone) : undefined,
              prepareTimeStr: nowPlan.prepareAt ? formatTime(nowPlan.prepareAt, nowPlan.timezone) : undefined,
              mode: currentOpt?.mode,
            };
            currentPlanDiff = computePlanDiff(prior, current);
          }
        }

        const effectiveSceneClock = effectiveSnapshot?.asOf;

        let computedChangeMoment: HomeCompositionVM['changeMoment'] = undefined;
        if (contextMode === 'live') {
          if (nowPlan) {
            const priorLivePlan = previousLivePlanByIntent.get(nowPlan.intentId);
            const tz = nowPlan.timezone || effectiveTz || 'UTC';
            const priorLeaveTimeStr = priorLivePlan?.leaveAt ? formatTime(priorLivePlan.leaveAt, tz) : undefined;
            const newLeaveTimeStr = nowPlan.leaveAt ? formatTime(nowPlan.leaveAt, tz) : undefined;
            const priorPrepTimeStr = priorLivePlan?.prepareAt ? formatTime(priorLivePlan.prepareAt, tz) : undefined;
            const newPrepTimeStr = nowPlan.prepareAt ? formatTime(nowPlan.prepareAt, tz) : undefined;

            const planDiff = priorLivePlan
              ? computePlanDiff(
                  {
                    headline: priorLivePlan.headline,
                    leaveTimeStr: priorLeaveTimeStr,
                    prepareTimeStr: priorPrepTimeStr,
                  },
                  {
                    headline: nowPlan.headline,
                    leaveTimeStr: newLeaveTimeStr,
                    prepareTimeStr: newPrepTimeStr,
                  }
                )
              : null;

            const nowPlanSig = buildLiveAckSignature(nowPlan, snapshotAsOf, snapshotTimezone);
            const persistedAcks: Record<string, string> =
              (storedEnvelope?.payload as any)?.liveAcknowledgedMoments ?? {};
            const isPersistedAck =
              persistedAcks[nowPlan.intentId] === nowPlanSig ||
              persistedAcks[nowPlan.id] === nowPlanSig;
            const isAlreadyAccepted = acceptedPlanIds.includes(nowPlan.id);

            const priorCandIds = (priorLivePlan?.optionsOrSteps ?? [])
              .map(o => (typeof o === 'string' ? o : ((o as any).recordId || (o as any).placeId || (o as any).id || '')))
              .filter(Boolean)
              .join(',');
            const newCandIds = (nowPlan.optionsOrSteps ?? [])
              .map(o => (typeof o === 'string' ? o : ((o as any).recordId || (o as any).placeId || (o as any).id || '')))
              .filter(Boolean)
              .join(',');
            const hasCandidateChange = Boolean(priorLivePlan && priorCandIds !== newCandIds);
            const hasTimeShift = Boolean(priorLeaveTimeStr && newLeaveTimeStr && priorLeaveTimeStr !== newLeaveTimeStr);
            const hasMeaningfulDiff = Boolean(planDiff || hasTimeShift || hasCandidateChange);

            if (isPersistedAck || (isAlreadyAccepted && !hasMeaningfulDiff)) {
              activeLiveChangeMoment = null;
            } else if (
              !activeLiveChangeMoment ||
              activeLiveChangeMoment.intentId !== nowPlan.intentId ||
              hasMeaningfulDiff ||
              (!priorLivePlan && (liveLocationStatus.status === 'available' || (liveLocationStatus as any).status === 'granted'))
            ) {
              if (hasMeaningfulDiff || !priorLivePlan) {
                const weatherSig = effectiveSnapshot?.signals.find(s => s.kind === 'weather');
                const isRain =
                  (weatherSig?.value as any)?.condition === 'rain' ||
                  ((weatherSig?.value as any)?.precipProbability ?? 0) > 0;
                let cause = 'nearby dining options';
                if (nowPlan.intentId === 'depart') {
                  cause = isRain ? 'rain forecast' : 'schedule update';
                } else if (nowPlan.intentId === 'lunch') {
                  cause = 'nearby dining options';
                }
                const causeMarker = `What changed: ${cause}`;
                const newLeaveClean = (newLeaveTimeStr || '').replace(/\s*[AaPp][Mm]$/, '');
                const heroCauseEffect =
                  nowPlan.intentId === 'depart'
                    ? isRain
                      ? `Rain starts soon. I moved your leave time to ${newLeaveClean}.`
                      : `Travel estimate changed. I moved your leave time to ${newLeaveClean}.`
                    : `Found nearby lunch options based on your location and preferences.`;

                activeLiveChangeMoment = {
                  id: `live-cm-${Date.now()}`,
                  detectedAt: new Date().toISOString(),
                  intentId: nowPlan.intentId,
                  cause,
                  causeMarker,
                  heroCauseEffect,
                  priorLeaveTime: priorLeaveTimeStr,
                  newLeaveTime: newLeaveTimeStr,
                  statusTransition: 'Updated plan ready',
                  acknowledged: false,
                };
              }
            }

            if (activeLiveChangeMoment && !activeLiveChangeMoment.acknowledged) {
              computedChangeMoment = {
                cause: activeLiveChangeMoment.cause,
                causeMarker: activeLiveChangeMoment.causeMarker,
                heroCauseEffect: activeLiveChangeMoment.heroCauseEffect,
                priorLeaveTime: activeLiveChangeMoment.priorLeaveTime,
                newLeaveTime: activeLiveChangeMoment.newLeaveTime,
                statusTransition: activeLiveChangeMoment.statusTransition,
              };
            }

            previousLivePlanByIntent.set(nowPlan.intentId, nowPlan);
          }
        } else if (nowPlan && activeTimelineBeat) {
          let priorPlan = previousComposedPlanByIntent.get(nowPlan.intentId);
          if (!priorPlan && activeTimelineBeat?.id === 'S3') {
            try {
              const preState = computeSceneState(
                'clear',
                sharedStorage,
                weatherStatus.enabled ? liveWeatherSignal : null,
                activeLoadedFacts,
                undefined,
                activeTimelineBeat ? TIMELINE_BEATS.find(b => b.id === 'S2') ?? null : null
              );
              const candidatePrior = preState.pipelineResult.livingContext.now;
              if (candidatePrior && candidatePrior.intentId === nowPlan.intentId) {
                priorPlan = candidatePrior;
              }
            } catch {
              // ignore
            }
          }

          if (priorPlan) {
            const tz = nowPlan.timezone || 'America/Los_Angeles';
            const priorLeaveTimeStr = priorPlan.leaveAt ? formatTime(priorPlan.leaveAt, tz) : undefined;
            const newLeaveTimeStr = nowPlan.leaveAt ? formatTime(nowPlan.leaveAt, tz) : undefined;
            const priorPrepTimeStr = priorPlan.prepareAt ? formatTime(priorPlan.prepareAt, tz) : undefined;
            const newPrepTimeStr = nowPlan.prepareAt ? formatTime(nowPlan.prepareAt, tz) : undefined;

            const planDiff = computePlanDiff(
              {
                headline: priorPlan.headline,
                leaveTimeStr: priorLeaveTimeStr,
                prepareTimeStr: priorPrepTimeStr,
              },
              {
                headline: nowPlan.headline,
                leaveTimeStr: newLeaveTimeStr,
                prepareTimeStr: newPrepTimeStr,
              }
            );

            if (planDiff || (priorLeaveTimeStr && newLeaveTimeStr && priorLeaveTimeStr !== newLeaveTimeStr)) {
              const weatherSig = effectiveSnapshot?.signals.find(s => s.kind === 'weather');
              const isRain = (weatherSig?.value as any)?.condition === 'rain' || ((weatherSig?.value as any)?.precipProbability ?? 0) > 0;
              const cause = isRain ? 'rain forecast' : 'schedule update';
              const causeMarker = `What changed: ${cause}`;
              const newLeaveClean = (newLeaveTimeStr || '').replace(/\s*[AaPp][Mm]$/, '');
              const eventTitle = (nowPlan as any)?.subjectTitle || (nowPlan as any)?.title || 'your lesson';
              const heroCauseEffect = isRain
                ? `Rain starts before ${eventTitle.toLowerCase().includes('lesson') ? 'your lesson' : eventTitle}. I moved your leave time to ${newLeaveClean}.`
                : `Travel estimate changed. I moved your leave time to ${newLeaveClean}.`;

              computedChangeMoment = {
                cause,
                causeMarker,
                heroCauseEffect,
                priorLeaveTime: priorLeaveTimeStr,
                newLeaveTime: newLeaveTimeStr,
                statusTransition: 'Updated plan ready',
              };
            }
          }

          if (activeTimelineBeat?.id !== 'S3') {
            previousComposedPlanByIntent.set(nowPlan.intentId, nowPlan);
          }
        }

        const isLunchSuppressed =
          storedSuppressions.some((s: any) => s.targetIntent === 'lunch' || (s as any).intentId === 'lunch');

        const v2Composition = buildHomeComposition({
          isLive: contextMode === 'live',
          weatherEnabled: weatherStatus.enabled,
          calendarConnected: liveCalendarStatus.configured && liveCalendarStatus.enabled,
          calendarSignalValue: liveCalendarSignal?.value as any,
          plan: nowPlan,
          spatialEvidence: spatialMapEvidence,
          aheadPlans,
          proposals: living.forYou.map(f => ({ key: f.key, value: f.value })),
          acceptedPlanIds,
          userConfirmedKeys,
          snapshot: effectiveSnapshot,
          canUndo: actionStore.canUndo(),
          evidenceBundle: effectiveEvidenceBundle,
          planDiff: currentPlanDiff,
          weatherError: weatherError ?? undefined,
          isLoading: isWeatherLoading,
          sceneClockIso: effectiveSceneClock,
          livingHeader: {
            formattedLine: currentLivingHeaderLine,
            timeDisplay: derivedLivingHeader?.timeDisplay ?? '',
            weatherDisplay: derivedLivingHeader?.weatherDisplay ?? '',
            placeDisplay: derivedLivingHeader?.placeDisplay ?? '',
            isSimulated: contextMode !== 'live',
          },
          changeMoment: computedChangeMoment,
          suppressedQuiet:
            ((contextMode === 'live' && isLunchSuppressed) ||
             (activeTimelineBeat?.id === 'S1q' && isLunchSuppressed))
              ? {
                  message: "Okay — I'll stay quiet about lunch today",
                  budgetMeter: `${storedEnvelope?.payload.promptBudget?.count ?? 1} of 3 used today`,
                }
              : undefined,
          timelineControls: {
            isPlaying: timelineController.isPlaying(),
            simulatedTimeStr: derivedLivingHeader?.timeDisplay ?? '10:00 AM',
            timelineLabel: 'Demo timeline · simulated time',
          },
        });
        currentV2Composition = v2Composition;
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
        <div class="app-layout" data-ui-version="${uiVersion}" data-context-mode="${contextMode}">
          ${uiVersion === 'v2' ? renderDesktopLeftNav(activeTab, true, isDesktopLayout) : ''}
          <div class="desktop-center-column">
            ${renderConnectorsView(latestConnectorStatuses)}
          </div>
          ${
            uiVersion === 'v2'
              ? renderDesktopRightPanel({
                  contextMode,
                  panelKind: 'quiet',
                  cardKind: 'quiet',
                  ariaAnnouncement: 'Connectors settings view',
                })
              : ''
          }
          <!-- Bottom Tab Bar (Mobile) -->
          <nav class="bottom-tab-bar" aria-label="Main Navigation">
            ${
              uiVersion === 'v2'
                ? `
            <button type="button" class="tab-item" id="tab-home">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <span>Home</span>
            </button>
            <button type="button" class="tab-item" id="tab-plans">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>Plans</span>
            </button>
            <button type="button" class="tab-item" id="tab-for-you">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              <span>For You</span>
            </button>
            <button type="button" class="tab-item active" id="tab-me" aria-current="page">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="tab-icon">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>Me</span>
            </button>
            `
                : ''
            }
          </nav>
        </div>
      `;

      const onNavigateAway = (tab: 'today' | 'plans' | 'for-you' | 'me') => {
        activeTab = tab;
        activeDetail = null;
        update();
      };
      root.querySelector('#desktop-nav-home')?.addEventListener('click', () => onNavigateAway('today'));
      root.querySelector('#desktop-nav-plans')?.addEventListener('click', () => onNavigateAway('plans'));
      root.querySelector('#desktop-nav-for-you')?.addEventListener('click', () => onNavigateAway('for-you'));
      root.querySelector('#desktop-nav-me')?.addEventListener('click', () => onNavigateAway('me'));
      root.querySelector('#desktop-nav-settings')?.addEventListener('click', () => {
        if (!isDevMode && !testHooksEnabled) return;
        modalInvokingId = 'desktop-nav-settings';
        demoPanelOpen = true;
        update();
      });
      root.querySelector('#tab-home')?.addEventListener('click', () => onNavigateAway('today'));
      root.querySelector('#tab-plans')?.addEventListener('click', () => onNavigateAway('plans'));
      root.querySelector('#tab-for-you')?.addEventListener('click', () => onNavigateAway('for-you'));
      root.querySelector('#tab-me')?.addEventListener('click', () => onNavigateAway('me'));

      const sidebarItems = Array.from(root.querySelectorAll<HTMLButtonElement>('.desktop-left-nav .sidebar-nav-item'));
      sidebarItems.forEach((btn, index) => {
        btn.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextIndex = (index + 1) % sidebarItems.length;
            sidebarItems[nextIndex]?.focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevIndex = (index - 1 + sidebarItems.length) % sidebarItems.length;
            sidebarItems[prevIndex]?.focus();
          }
        });
      });

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

    const isLive = contextMode === 'live';
    let panelState = createInitialPanelState(selectedCardState);

    const locConn = latestConnectorStatuses?.location;
    const isLiveConnected = isLive
      ? (liveLocationStatus.status === 'available')
      : (locConn?.state === 'connected');
    const isLivePrompt = isLive
      ? (liveLocationStatus.status === 'prompt')
      : (locConn?.state === 'permission_needed');
    const isLiveDenied = isLive
      ? (liveLocationStatus.status === 'denied')
      : (locConn?.state === 'denied');
    const isLiveStale = isLive && Boolean(liveLocationStatus.isStale);

    const locState = isLiveConnected ? 'available' : isLivePrompt ? 'prompt' : isLiveDenied ? 'denied' : 'unavailable';
    const locLabel = isLiveConnected ? 'Available' : isLivePrompt ? 'Prompt' : isLiveDenied ? 'Denied' : isLiveStale ? 'Stale' : 'Unavailable';
    const calLabel = 'N/A';
    const weatherSig = effectiveSnapshot?.signals?.find(s => s.kind === 'weather') as Partial<LiveSignal> | undefined;
    const isWeatherSigStaleOrUnavail =
      !weatherSig ||
      weatherSig.status === 'unavailable' ||
      weatherSig.status === 'stale' ||
      weatherSig.status === 'error' ||
      weatherSig.status === 'permission_needed' ||
      Boolean((weatherSig as any)?.isStale) ||
      (liveWeatherSignal ? isWeatherStale(liveWeatherSignal, Date.parse(snapshotAsOf || new Date().toISOString())) : false);

    const weatherCondition = (weatherSig?.value as any)?.condition;
    const weatherLabel = contextMode === 'live'
      ? (weatherStatus.enabled ? (isWeatherSigStaleOrUnavail ? 'Unavailable' : 'Open-Meteo') : 'Off')
      : (weatherCondition === 'rain' || currentScene === 'rain' ? 'Rain forecast' : (weatherCondition === 'clear' ? 'Clear' : '20°C'));
    const xmemoConn = latestConnectorStatuses?.xmemo;
    const xmemoLabel = contextMode === 'live'
      ? (xmemoConn?.state === 'connected' ? 'Connected' : 'Disconnected')
      : 'Simulated';
    const notifConn = latestConnectorStatuses?.notifications;
    const notifState = notifConn?.state === 'connected' ? 'available' : 'unavailable';
    const notifLabel = notifConn?.state === 'connected' ? 'On' : 'N/A';

    const selectedOption = (
      nowPlan?.optionsOrSteps?.find(o => typeof o === 'object' && o !== null && (o as any).isSelected) ??
      nowPlan?.optionsOrSteps?.find(o => typeof o === 'object' && o !== null)
    ) as PlanOption | undefined;
    const travelMin = selectedOption?.travelMinutes ?? (selectedOption as any)?.estimatedMinutes ?? 25;
    const leaveMs = !isLive && nowPlan?.leaveAt ? Date.parse(nowPlan.leaveAt) : NaN;
    const demoArrivalTime = !isLive && !isNaN(leaveMs)
      ? formatTime(new Date(leaveMs + travelMin * 60_000).toISOString(), snapshotTimezone)
      : undefined;

    let demoStatusPill: string | undefined;
    if (!isLive && nowPlan?.apptAt && !isNaN(leaveMs)) {
      const apptMs = Date.parse(nowPlan.apptAt);
      const arriveMs = leaveMs + travelMin * 60_000;
      const bufferMin = Math.round((apptMs - arriveMs) / 60_000);
      demoStatusPill = bufferMin >= 0 ? '🟢 On time' : `🔴 Late by ${Math.abs(bufferMin)}m`;
    }

    const demoWeatherSignal = !isLive
      ? (snapshot?.signals?.find(s => s.kind === 'weather') ?? (nowPlan?.why?.evidenceSignals?.find(s => s.kind === 'weather') as any) ?? null)
      : null;
    const demoTrafficSignal = !isLive
      ? (snapshot?.signals?.find(s => s.kind === 'traffic') ?? (nowPlan?.why?.evidenceSignals?.find(s => s.kind === 'traffic') as any) ?? null)
      : null;
    const demoDistanceSignal = !isLive
      ? (snapshot?.signals?.find(s => s.kind === 'travel_estimate' && (s.value as any)?.distanceText) ?? null)
      : null;
    const demoDistanceText = demoDistanceSignal ? (demoDistanceSignal.value as any).distanceText : undefined;
    const demoTrafficText = demoTrafficSignal ? ((demoTrafficSignal.value as any)?.description || (demoTrafficSignal.value as any)?.text) : undefined;

    const rightPanelOpts = {
      contextMode,
      panelKind:
        isLive && (!liveDestination && !liveRoute && !selectedLivePlace && selectedCardState?.cardKind !== 'lunch')
          ? 'quiet'
          : panelState.activePanel,
      cardKind:
        isLive && (!liveDestination && !liveRoute && !selectedLivePlace && selectedCardState?.cardKind !== 'lunch')
          ? 'quiet'
          : (selectedCardState?.cardKind || 'quiet'),
      planId: isLive ? undefined : (selectedCardState?.planId ?? nowPlan?.id),
      planTitle: isLive ? undefined : cleanNowTitle,
      planHeadline: isLive ? undefined : nowPlan?.headline,
      destinationName:
        contextMode === 'live'
          ? (selectedLivePlace?.name || liveDestination?.name)
          : ((spatialMapEvidence?.placeOrRoute as any)?.name || (nowPlan?.optionsOrSteps?.[0] as any)?.title || 'Piano Studio'),
      departureTime: !isLive && nowPlan?.leaveAt ? formatTime(nowPlan.leaveAt, snapshotTimezone) : undefined,
      arrivalTime: demoArrivalTime,
      statusPill: demoStatusPill,
      distanceText: demoDistanceText,
      trafficText: demoTrafficText,
      map: isLive ? undefined : currentV2Composition?.map,
      candidateCards: isLive ? undefined : currentV2Composition?.candidateCards,
      demoWeatherSignal,
      liveRoute,
      liveRouteStatus,
      liveLocationStatus,
      liveDestination,
      liveWeatherSignal,
      weatherStatusEnabled: weatherStatus.enabled,
      noRouteReason: getLiveNoRouteReason(),
      livePlacesEnabled: livePlacesStatus.enabled,
      livePlacesList,
      livePlacesLoading,
      livePlacesError,
      selectedLivePlace,
      liveCalendarConfigured: liveCalendarStatus.configured,
      ariaAnnouncement: isLive
        ? (liveRoute && liveDestination
            ? `Selected Live route to ${liveDestination.name}.`
            : 'Live context. No item selected.')
        : panelState.ariaAnnouncement,
    };

    root.innerHTML = `
      <div class="app-layout" data-ui-version="${uiVersion}" data-context-mode="${contextMode}">
        ${uiVersion === 'v2' ? renderDesktopLeftNav(activeTab, false, isDesktopLayout) : ''}
        <div class="desktop-center-column">
          <header class="header-bar" role="banner">
            <div class="main-container" style="padding-bottom: 0;">
              ${
                uiVersion === 'v2'
                  ? `
              <div class="v2-header-container">
                <div class="desktop-greeting-row">
                  <div class="greeting-text-group">
                    ${!isDesktopLayout ? `<div class="v2-mobile-brand-bar"><span class="v2-brand-wordmark">Yori</span></div>` : ''}
                    <div class="living-header-ambient" id="living-header-ambient" role="region" aria-label="Living Context Line">
                      <span class="living-header-line" id="living-header-line">${escapeHtml(currentLivingHeaderLine)}</span>
                      <span class="living-header-chip card-badge" id="living-header-chip">${contextMode === 'live' ? 'live' : 'simulated'}</span>
                    </div>
                    <h1 class="greeting-title" id="desktop-greeting-title">${escapeHtml(greeting.greeting)}</h1>
                    <p class="greeting-subheading desktop-greeting-sub">${escapeHtml(greeting.subheading)}</p>
                  </div>

                  <div class="desktop-header-controls">
                    ${
                      contextMode === 'demo'
                        ? `
                    <div class="timeline-controls-bar" id="timeline-controls" role="toolbar" aria-label="Demo timeline controls">
                      <button
                        type="button"
                        class="context-pill demo timeline-pill"
                        id="pill-context-status"
                        aria-label="View sources and truth status"
                        data-provenance="fixture"
                      >
                        <div class="context-pill-content">
                          <div class="context-pill-header">
                            <span class="context-pill-dot" aria-hidden="true"></span>
                            <span class="context-pill-title">${STRINGS.header.demoPill}</span>
                            <span class="context-pill-chevron" aria-hidden="true">›</span>
                          </div>
                          <div class="context-pill-subtitle" id="pill-subline">Demo timeline · simulated time</div>
                        </div>
                      </button>

                      <div class="timeline-action-buttons">
                        <button
                          type="button"
                          class="btn-timeline-ctrl"
                          id="timeline-play-pause-btn"
                          aria-label="${timelineController.isPlaying() ? 'Pause simulated timeline' : 'Play simulated timeline'}"
                          title="${timelineController.isPlaying() ? 'Pause' : 'Play'}"
                        >
                          ${timelineController.isPlaying() ? '⏸' : '▶'}
                        </button>
                        <button
                          type="button"
                          class="btn-timeline-ctrl"
                          id="timeline-step-btn"
                          aria-label="Step to next simulated beat"
                          title="Step"
                        >
                          ⏭
                        </button>
                        <button
                          type="button"
                          class="btn-timeline-ctrl"
                          id="timeline-restart-btn"
                          aria-label="Restart simulated timeline"
                          title="Restart"
                        >
                          ↺
                        </button>
                      </div>
                    </div>
                    `
                        : `
                    <button
                      type="button"
                      class="context-pill live"
                      id="pill-context-status"
                      aria-label="View sources and truth status"
                      data-provenance="live"
                      data-source="device_clock"
                      data-fetched-at="${new Date().toISOString()}"
                    >
                      <div class="context-pill-content">
                        <div class="context-pill-header">
                          <span class="context-pill-dot" aria-hidden="true"></span>
                          <span class="context-pill-title">${STRINGS.header.livePill}</span>
                          <span class="context-pill-chevron" aria-hidden="true">›</span>
                        </div>
                        <div class="context-pill-subtitle" id="pill-subline">${escapeHtml(sourcesSubline)}</div>
                      </div>
                    </button>
                    `
                    }

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

                <div class="desktop-connector-strip-wrapper">
                  <div class="desktop-connector-strip" id="desktop-connector-strip" role="region" aria-label="Connectors Status">
                    <span class="connector-status-chip location" id="chip-status-location" title="Location: ${escapeHtml(locLabel)}">
                      <span class="connector-chip-icon" aria-hidden="true">📍</span>
                      <span class="connector-chip-label">Location</span>
                      <span class="connector-chip-val ${locState}">${escapeHtml(locLabel)}</span>
                    </span>
                    <span class="connector-status-chip calendar" id="chip-status-calendar" title="Calendar: Not available yet">
                      <span class="connector-chip-icon" aria-hidden="true">📅</span>
                      <span class="connector-chip-label">Calendar</span>
                      <span class="connector-chip-val unavailable">${calLabel}</span>
                    </span>
                    <span class="connector-status-chip weather" id="chip-status-weather" title="Weather: ${escapeHtml(weatherLabel)}">
                      <span class="connector-chip-icon" aria-hidden="true">🌤️</span>
                      <span class="connector-chip-label">Weather</span>
                      <span class="connector-chip-val">${escapeHtml(weatherLabel)}</span>
                    </span>
                    <span class="connector-status-chip xmemo" id="chip-status-xmemo" title="Memory: ${escapeHtml(xmemoLabel)}">
                      <span class="connector-chip-icon" aria-hidden="true">🧠</span>
                      <span class="connector-chip-label">XMemo</span>
                      <span class="connector-chip-val">${escapeHtml(xmemoLabel)}</span>
                    </span>
                    <span class="connector-status-chip notifications" id="chip-status-alerts" title="Alerts: ${escapeHtml(notifLabel)}">
                      <span class="connector-chip-icon" aria-hidden="true">🔔</span>
                      <span class="connector-chip-label">Alerts</span>
                      <span class="connector-chip-val ${notifState}">${escapeHtml(notifLabel)}</span>
                    </span>
                  </div>
                </div>

                ${
                  weatherStatus.enabled && liveWeatherSignal && (contextMode !== 'live' || (!isWeatherStale(liveWeatherSignal) && !isWeatherSigStaleOrUnavail))
                    ? `
                <div class="weather-attribution" id="weather-attribution" data-provenance="${contextMode === 'live' ? 'live' : 'fixture'}" data-source="open-meteo" data-fetched-at="${escapeHtml(liveWeatherSignal.issuedAt || (liveWeatherSignal.value as any)?.fetchedAt || new Date().toISOString())}">
                  <a href="${escapeHtml(weatherStatus.attribution?.url || 'https://open-meteo.com/')}" target="_blank" rel="noopener noreferrer">${escapeHtml(weatherStatus.attribution?.text || STRINGS.header.weatherAttribution)}</a>
                </div>
                `
                    : ''
                }
              </div>
              `
                  : `
              <div class="top-meta">
                ${
                  (isDevMode || testHooksEnabled)
                    ? `
                <div class="mode-switch-group" role="group" aria-label="Context Mode Switch">
                  <button type="button" class="btn-mode-toggle ${contextMode === 'demo' ? 'active' : ''}" id="btn-mode-demo" aria-pressed="${contextMode === 'demo' ? 'true' : 'false'}">Demo scenes</button>
                  <button type="button" class="btn-mode-toggle ${contextMode === 'live' ? 'active' : ''}" id="btn-mode-live" aria-pressed="${contextMode === 'live' ? 'true' : 'false'}">Live context</button>
                </div>
                `
                    : ''
                }
                ${
                  (isDevMode || testHooksEnabled) && contextMode === 'demo'
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
                  weatherStatus.enabled && liveWeatherSignal && (contextMode !== 'live' || !isWeatherSigStaleOrUnavail)
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
                  (isDevMode || testHooksEnabled) && contextMode === 'demo'
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

              <div class="greeting-section">
                <h1 class="greeting-title">${escapeHtml(greeting.greeting)}</h1>
                <p class="greeting-subheading">${escapeHtml(greeting.subheading)}</p>
                ${
                  weatherStatus.enabled && liveWeatherSignal && (contextMode !== 'live' || (!isWeatherStale(liveWeatherSignal) && !isWeatherSigStaleOrUnavail))
                    ? `
                <div class="weather-attribution" id="weather-attribution" data-provenance="${contextMode === 'live' ? 'live' : 'fixture'}" data-source="open-meteo" data-fetched-at="${escapeHtml(liveWeatherSignal.issuedAt || (liveWeatherSignal.value as any)?.fetchedAt || new Date().toISOString())}">
                  <a href="${escapeHtml(weatherStatus.attribution?.url || 'https://open-meteo.com/')}" target="_blank" rel="noopener noreferrer">${escapeHtml(weatherStatus.attribution?.text || STRINGS.header.weatherAttribution)}</a>
                </div>
                `
                    : ''
                }
              </div>
              `
              }
          </div>
        </header>

        <main class="main-container" role="main">
          ${mainContentHtml}
          ${uiVersion === 'v2' && (activeTab === 'today' || activeTab === 'home') && !activeDetail ? renderAskBar() : ''}
        </main>
      </div>

      ${uiVersion === 'v2' ? renderDesktopRightPanel(rightPanelOpts) : ''}

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
          uiVersion === 'v2' && demoPanelOpen && (isDevMode || testHooksEnabled)
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
                      weatherStatus.enabled && liveWeatherSignal && (contextMode !== 'live' || !isWeatherSigStaleOrUnavail)
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
        if (!isDevMode && !testHooksEnabled) return;
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
            const col = root.querySelector<HTMLElement>('.desktop-center-column');
            if (col) col.scrollLeft = 0;
            restoreInvokingFocus(modalInvokingId || 'btn-dev-demo-controls');
          },
        });
      }

      const closePanelBtn = root.querySelector('#btn-close-demo-panel');
      if (closePanelBtn) {
        closePanelBtn.addEventListener('click', () => {
          demoPanelOpen = false;
          update();
          const col = root.querySelector<HTMLElement>('.desktop-center-column');
          if (col) col.scrollLeft = 0;
          restoreInvokingFocus(modalInvokingId || 'btn-dev-demo-controls');
        });
      }
    }
    // -------------------------------------------------------------

    // 0a. Context Mode Switcher [Demo scenes | Live context]
    const modeDemoBtn = root.querySelector('#btn-mode-demo') as HTMLButtonElement | null;
    if (modeDemoBtn) {
      modeDemoBtn.addEventListener('click', async () => {
        if (!testHooksEnabled && !isDevMode) return;
        if (contextMode === 'demo') return;
        contextMode = 'demo';
        selectedCardState = null;
        defaultModelCommandInterpreter.setMode('scripted_fixture');
        liveLocationStatus = defaultLocationPort.getLocation();
        await refreshConnectorStatuses();
        update();
      });
    }

    const modeLiveBtn = root.querySelector('#btn-mode-live') as HTMLButtonElement | null;
    if (modeLiveBtn) {
      modeLiveBtn.addEventListener('click', async () => {
        if (contextMode === 'live') return;
        contextMode = 'live';
        selectedCardState = null;
        if (!defaultLocationPort.hasSessionFix?.()) {
          defaultLocationPort.setLocation('prompt');
        }
        defaultModelCommandInterpreter.setMode('live');
        liveLocationStatus = defaultLocationPort.getLocation();
        await refreshConnectorStatuses();
        void checkRouteStatus();
        void checkPlacesStatus();
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
        await refreshConnectorStatuses();
        await refreshLiveRoute();
        await refreshLivePlaces();
        await refreshLiveCalendar();
        update();
      });
    }

    // Live Place Selection (Mobile place cards + Desktop candidate tiles)
    const placeElements = root.querySelectorAll('.live-place-card, .desktop-candidate-tile[data-osm-id]');
    placeElements.forEach(el => {
      const osmIdStr = el.getAttribute('data-osm-id');
      if (!osmIdStr) return;
      const osmId = parseInt(osmIdStr, 10);
      const place = livePlacesList.find(p => p.osmId === osmId);
      if (!place) return;

      const handleSelect = (e: Event) => {
        e.stopPropagation();
        selectLivePlace(place);
      };

      el.addEventListener('click', handleSelect);
      el.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          handleSelect(e);
        }
      });
    });

    // 1. Scene Switcher
    const selectEl = root.querySelector('#scene-select') as HTMLSelectElement | null;
    if (selectEl) {
      selectEl.addEventListener('change', e => {
        if (!testHooksEnabled && !isDevMode) return;
        const val = (e.target as HTMLSelectElement).value as DemoSceneId;
        currentScene = val;
        activeTimelineBeat = null;
        selectedCardState = null;
        previousComposedPlanByIntent.clear();
        actionStore.resetToIdle();
        actionStore.clearOverride();
        actionFeedbackMessage = null;
        coordinatedScene = null;
        reasoningRequestId++;
        reasoningState = null;
        update();
      });
    }

    // Timeline Controls (Play/Pause, Step, Restart)
    const playPauseBtn = root.querySelector('#timeline-play-pause-btn') as HTMLButtonElement | null;
    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', () => {
        timelineController.togglePlay();
        update();
      });
    }
    const stepBtn = root.querySelector('#timeline-step-btn') as HTMLButtonElement | null;
    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        actionStore.resetToIdle();
        activeTimelineBeat = timelineController.step();
        update();
      });
    }
    const restartBtn = root.querySelector('#timeline-restart-btn') as HTMLButtonElement | null;
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        previousComposedPlanByIntent.clear();
        actionStore.resetToIdle();
        activeLoadedFacts = [];
        activeTimelineBeat = timelineController.restart();
        update();
      });
    }

    // 1b. Replay Before You Ask (R3: Clear -> Rain transition)
    const replayBeforeYouAskBtn = root.querySelector('#btn-replay-before-you-ask') as HTMLButtonElement | null;
    if (replayBeforeYouAskBtn) {
      replayBeforeYouAskBtn.addEventListener('click', () => {
        selectedCardState = null;
        actionStore.resetToIdle();
        actionStore.clearOverride();
        actionFeedbackMessage = null;
        coordinatedScene = null;
        reasoningRequestId++;
        reasoningState = null;

        // Step 1: Switch to clear scene first
        currentScene = 'clear';
        activeTimelineBeat = timelineController.goTo('S2');
        update();

        // Step 2: Transition to rain scene (delay 600ms, or instant 0ms if reduced motion)
        const isReduced = actionStore.isReducedMotion();
        const transitionDelay = isReduced ? 0 : 600;

        setTimeout(() => {
          currentScene = 'rain';
          activeTimelineBeat = timelineController.goTo('S3');
          selectedCardState = null;
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

    const desktopConnectorsBtn = root.querySelector('#desktop-nav-connectors');
    if (desktopConnectorsBtn) {
      desktopConnectorsBtn.addEventListener('click', () => {
        activeDetail = {
          type: 'connectors',
          originatingElementId: 'desktop-nav-connectors',
        };
        update();
      });
    }

    const desktopSettingsBtn = root.querySelector('#desktop-nav-settings');
    if (desktopSettingsBtn) {
      desktopSettingsBtn.addEventListener('click', () => {
        if (!isDevMode && !testHooksEnabled) return;
        modalInvokingId = 'desktop-nav-settings';
        demoPanelOpen = true;
        update();
      });
    }

    const sidebarNavItems = Array.from(root.querySelectorAll<HTMLButtonElement>('.desktop-left-nav .sidebar-nav-item'));
    sidebarNavItems.forEach((btn, index) => {
      btn.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIndex = (index + 1) % sidebarNavItems.length;
          sidebarNavItems[nextIndex]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIndex = (index - 1 + sidebarNavItems.length) % sidebarNavItems.length;
          sidebarNavItems[prevIndex]?.focus();
        }
      });
    });

    function updateRightPanel(newCard: CardSelectionState) {
      if (
        selectedCardState &&
        selectedCardState.selectedId === newCard.selectedId &&
        selectedCardState.cardKind === newCard.cardKind
      ) {
        return;
      }
      selectedCardState = newCard;
      panelState = panelSelectionReducer(panelState, { type: 'SELECT_CARD', card: newCard });
      const panelEl = root.querySelector('#desktop-right-panel');
      if (panelEl) {
        const newHtml = renderDesktopRightPanel({
          contextMode,
          panelKind:
            isLive && (!liveDestination && !liveRoute && !selectedLivePlace && selectedCardState?.cardKind !== 'lunch')
              ? 'quiet'
              : panelState.activePanel,
          cardKind:
            isLive && (!liveDestination && !liveRoute && !selectedLivePlace && selectedCardState?.cardKind !== 'lunch')
              ? 'quiet'
              : selectedCardState.cardKind,
          planId: isLive ? undefined : (selectedCardState.planId ?? nowPlan?.id),
          planTitle: isLive ? undefined : cleanNowTitle,
          planHeadline: isLive ? undefined : nowPlan?.headline,
          destinationName:
            contextMode === 'live'
              ? (selectedLivePlace?.name || liveDestination?.name)
              : ((spatialMapEvidence?.placeOrRoute as any)?.name || (nowPlan?.optionsOrSteps?.[0] as any)?.title || 'Piano Studio'),
          departureTime: !isLive && nowPlan?.leaveAt ? formatTime(nowPlan.leaveAt, snapshotTimezone) : undefined,
          arrivalTime: demoArrivalTime,
          statusPill: demoStatusPill,
          distanceText: demoDistanceText,
          trafficText: demoTrafficText,
          map: isLive ? undefined : currentV2Composition?.map,
          candidateCards: isLive ? undefined : currentV2Composition?.candidateCards,
          demoWeatherSignal,
          liveRoute,
          liveRouteStatus,
          liveLocationStatus,
          liveDestination,
          liveWeatherSignal,
          weatherStatusEnabled: weatherStatus.enabled,
          noRouteReason: getLiveNoRouteReason(),
          livePlacesEnabled: livePlacesStatus.enabled,
          livePlacesList,
          livePlacesLoading,
          livePlacesError,
          selectedLivePlace,
          liveCalendarConfigured: liveCalendarStatus.configured,
          ariaAnnouncement: isLive
            ? (liveRoute && liveDestination
                ? `Selected Live route to ${liveDestination.name}.`
                : (selectedLivePlace ? `Selected Live place ${selectedLivePlace.name}.` : 'Live context. No item selected.'))
            : panelState.ariaAnnouncement,
        });
        const temp = document.createElement('div');
        temp.innerHTML = newHtml;
        const replacement = temp.firstElementChild;
        if (replacement) {
          panelEl.replaceWith(replacement);
        }
      }
    }

    const nowCardEl = root.querySelector<HTMLElement>('.now-card');
    if (nowCardEl && nowPlan) {
      const onSelectNow = () => {
        updateRightPanel({
          selectedId: nowPlan.id || 'hero',
          cardKind: determineCardKind(nowPlan),
          planId: nowPlan.id,
          label: cleanNowTitle,
        });
      };
      nowCardEl.addEventListener('focusin', onSelectNow);
      nowCardEl.addEventListener('click', onSelectNow);
    }

    if (typeof window !== 'undefined' && !desktopResizeListenerAttached) {
      desktopResizeListenerAttached = true;
      const mql = window.matchMedia('(min-width: 1024px)');
      mql.addEventListener('change', () => {
        update();
      });
    }

    root.querySelectorAll<HTMLElement>('.v2-candidate-card').forEach(card => {
      const candId = card.getAttribute('data-candidate-id');
      const onSelectCandidate = () => {
        updateRightPanel({
          selectedId: candId || 'candidate',
          cardKind: 'lunch',
          candidateId: candId ?? undefined,
          label: card.querySelector('.v2-candidate-name')?.textContent?.trim() || 'Lunch Option',
        });
      };
      card.addEventListener('focusin', onSelectCandidate);
      card.addEventListener('click', onSelectCandidate);
    });

    root.querySelectorAll<HTMLElement>('.v2-ahead-card, .ahead-list .item-row[data-plan-id]').forEach(card => {
      const planId = card.getAttribute('data-plan-id');
      const onSelectAhead = () => {
        const aheadPlan = aheadPlans.find(p => p.id === planId);
        const aheadKind = determineCardKind(aheadPlan);
        updateRightPanel({
          selectedId: planId || 'ahead',
          cardKind: aheadKind,
          planId: planId ?? undefined,
          label: (aheadPlan as any)?.title || aheadPlan?.headline || 'Upcoming moment',
        });
      };
      card.addEventListener('focusin', onSelectAhead);
      card.addEventListener('click', onSelectAhead);
    });

    // 2b. V2 Detail View Interactions (TripDetail & RestaurantDetail)
    if (uiVersion === 'v2') {
      // Open TripDetail from 'Details →' button or NOW card
      const tripDetailsBtn = root.querySelector('#btn-view-trip-details');
      if (tripDetailsBtn && nowPlan) {
        tripDetailsBtn.addEventListener('click', e => {
          e.stopPropagation();
          const isLunchPlan = nowPlan.intentId === 'lunch' || nowPlan.intentId === 'nearby_dining';
          activeDetail = {
            type: isLunchPlan ? 'restaurant' : 'trip',
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
          if (target.closest('button, a, input, select, .real-map-container, .v2-map-canvas')) return;
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
        if (activeLiveChangeMoment) {
          activeLiveChangeMoment.acknowledged = true;
          activeLiveChangeMoment = null;
        }
        const envelope = sharedStorage.load();
        const existingAccepted = envelope?.payload.acceptedPlanIds ?? [];
        const existingAcks = (envelope?.payload as any)?.liveAcknowledgedMoments ?? {};
        const nowPlanSig = buildLiveAckSignature(nowPlan, snapshotAsOf, snapshotTimezone);
        const updatedAcks = {
          ...existingAcks,
          [nowPlan.intentId]: nowPlanSig,
          [nowPlan.id]: nowPlanSig,
        };

        const updatedAccepted = Array.from(new Set([...existingAccepted, nowPlan.id]));
        sharedStorage.save(
          {
            memoryFacts: envelope?.payload.memoryFacts ?? [],
            proposals: envelope?.payload.proposals ?? [],
            suppressions: envelope?.payload.suppressions ?? [],
            promptBudget: envelope?.payload.promptBudget ?? { date: snapshotAsOf.slice(0, 10), count: 0 },
            acceptedPlanIds: updatedAccepted,
            liveAcknowledgedMoments: updatedAcks,
          } as any,
          snapshotAsOf
        );
        update();
      });
    }

    // 4. Plan Review Actions: Undo Accept or Session Override
    const undoAcceptBtn = root.querySelector('#btn-undo-accept') as HTMLButtonElement | null;
    if (undoAcceptBtn && nowPlan) {
      undoAcceptBtn.addEventListener('click', () => {
        const envelope = sharedStorage.load();
        const existingAccepted = envelope?.payload.acceptedPlanIds ?? [];
        if (isPlanAccepted(nowPlan, existingAccepted)) {
          const updatedAccepted = removeAcceptedPlan(nowPlan, existingAccepted);
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
        if (activeLiveChangeMoment) {
          activeLiveChangeMoment.acknowledged = true;
          activeLiveChangeMoment = null;
        }
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

      const applyTimingAdjustment = (planToAdjust: PreparedPlan, prepMinutes: number, bufferMinutes: number) => {
        const priorBuffer = timingOverrides[planToAdjust.id]?.bufferMinutes ?? 5;
        timingOverrides[planToAdjust.id] = { prepMinutes, bufferMinutes };
        if (planToAdjust.apptAt && planToAdjust.leaveAt) {
          const travelMinutes = Math.max(
            5,
            Math.round((Date.parse(planToAdjust.apptAt) - Date.parse(planToAdjust.leaveAt)) / 60_000) - priorBuffer
          );
          const newLeaveMs = Date.parse(planToAdjust.apptAt) - (travelMinutes + bufferMinutes) * 60_000;
          const newPrepMs = newLeaveMs - prepMinutes * 60_000;
          const tz = planToAdjust.timezone;
          const newLeaveIso = new Date(newLeaveMs).toISOString();
          const newPrepIso = new Date(newPrepMs).toISOString();
          const newLeaveStr = formatTime(newLeaveIso, tz);
          const newPrepStr = formatTime(newPrepIso, tz);
          const newHeadline = `Get ready at ${newPrepStr}, leave by ${newLeaveStr}`;

          // Semantic truth check: do not push history or emit diff if timing values did not change
          const priorLeaveMs = planToAdjust.leaveAt ? Date.parse(planToAdjust.leaveAt) : 0;
          const priorPrepMs = planToAdjust.prepareAt ? Date.parse(planToAdjust.prepareAt) : 0;
          const leaveChanged = Math.abs(newLeaveMs - priorLeaveMs) >= 60_000;
          const prepChanged = Math.abs(newPrepMs - priorPrepMs) >= 60_000;

          if (!leaveChanged && !prepChanged) {
            // No-op adjust: times are unchanged. Do not push history or invent diff.
            return;
          }

          const updatedPlan: PreparedPlan = {
            ...planToAdjust,
            leaveAt: newLeaveIso,
            prepareAt: newPrepIso,
            headline: newHeadline,
          };
          actionStore.applyPlanAdjustment(
            updatedPlan,
            `Adjusted timing: prep ${prepMinutes}m, buffer ${bufferMinutes}m`
          );

          previousComposedPlanByIntent.set(planToAdjust.intentId, updatedPlan);

          const filteredLoaded = activeLoadedFacts.filter(
            f => f.key !== 'prep_buffer_minutes' && f.key !== 'prep_duration_minutes'
          );
          activeLoadedFacts = [
            ...filteredLoaded,
            createMemoryFact(
              'prep_buffer_minutes',
              bufferMinutes,
              'confirmed',
              { source: 'user_feedback', recordedAt: snapshotAsOf, note: 'Adjusted for today' },
              snapshotAsOf
            ),
            createMemoryFact(
              'prep_duration_minutes',
              prepMinutes,
              'confirmed',
              { source: 'user_feedback', recordedAt: snapshotAsOf, note: 'Adjusted for today' },
              snapshotAsOf
            ),
          ];
        }
      };

      const adjustForTodayBtn = root.querySelector('#btn-adjust-for-today');
      if (adjustForTodayBtn && activeModal?.type === 'adjust') {
        const planToAdjust = activeModal.plan;
        adjustForTodayBtn.addEventListener('click', () => {
          const prepInput = root.querySelector('#input-prep-minutes') as HTMLInputElement | null;
          const bufferInput = root.querySelector('#input-buffer-minutes') as HTMLInputElement | null;
          const prepMinutes = prepInput ? parseInt(prepInput.value, 10) || 20 : 20;
          const bufferMinutes = bufferInput ? parseInt(bufferInput.value, 10) || 5 : 5;

          applyTimingAdjustment(planToAdjust, prepMinutes, bufferMinutes);
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

          const adjustAckSig = buildLiveAckSignature(planToAdjust, snapshotAsOf, snapshotTimezone);
          sharedStorage.save(
            {
              memoryFacts: envelope?.payload.memoryFacts ?? [],
              proposals: updatedProposals,
              suppressions: envelope?.payload.suppressions ?? [],
              promptBudget: envelope?.payload.promptBudget ?? { date: snapshotAsOf.slice(0, 10), count: 0 },
              acceptedPlanIds: envelope?.payload.acceptedPlanIds ?? [],
              liveAcknowledgedMoments: {
                ...((envelope?.payload as any)?.liveAcknowledgedMoments ?? {}),
                [planToAdjust.intentId]: adjustAckSig,
                [planToAdjust.id]: adjustAckSig,
              },
            } as any,
            snapshotAsOf
          );

          applyTimingAdjustment(planToAdjust, prepMinutes, bufferMinutes);
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

          const currentBudgetCount = envelope?.payload.promptBudget?.count ?? 0;
          const newBudgetCount = Math.max(1, currentBudgetCount);

          const dismissAckSig = buildLiveAckSignature(planToDismiss, snapshotAsOf, snapshotTimezone);
          sharedStorage.save(
            {
              memoryFacts: envelope?.payload.memoryFacts ?? [],
              proposals: updatedProposals,
              suppressions: updatedSuppressions,
              promptBudget: { date: snapshotAsOf.slice(0, 10), count: newBudgetCount },
              acceptedPlanIds: envelope?.payload.acceptedPlanIds ?? [],
              liveAcknowledgedMoments: {
                ...((envelope?.payload as any)?.liveAcknowledgedMoments ?? {}),
                [planToDismiss.intentId]: dismissAckSig,
                [planToDismiss.id]: dismissAckSig,
              },
            } as any,
            snapshotAsOf
          );

          if (activeTimelineBeat && (activeTimelineBeat.id === 'S1' || planToDismiss.intentId === 'lunch')) {
            activeTimelineBeat = timelineController.goTo('S1q');
          }

          if (activeLiveChangeMoment) {
            activeLiveChangeMoment.acknowledged = true;
            activeLiveChangeMoment = null;
          }

          actionStore.resetToIdle();
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
        if (contextMode === 'live') {
          defaultLocationPort.setSimulated(false);
          defaultLocationPort.setLiveEnabled(true);
        }
        if (
          'consentAndRequest' in defaultLocationPort &&
          typeof (defaultLocationPort as any).consentAndRequest === 'function'
        ) {
          liveLocationStatus = await (defaultLocationPort as any).consentAndRequest();
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
          liveLocationStatus = defaultLocationPort.getLocation();
        }
        if (contextMode === 'live') {
          await refreshLiveRoute();
          await checkPlacesStatus();
          await refreshLiveCalendar();
        }
        await refreshConnectorStatuses();
        update();
      });
    }

    const denyLocBtn = root.querySelector('#btn-deny-location');
    if (denyLocBtn) {
      denyLocBtn.addEventListener('click', async () => {
        if ('denyConsent' in defaultLocationPort && typeof (defaultLocationPort as any).denyConsent === 'function') {
          (defaultLocationPort as any).denyConsent();
        } else {
          defaultLocationPort.setLocation('denied');
        }
        liveLocationStatus = defaultLocationPort.getLocation();
        if (contextMode === 'live') {
          livePlacesList = [];
        }
        await refreshConnectorStatuses();
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
      const centerCol = root.querySelector<HTMLElement>('.desktop-center-column');
      const rightPanel = root.querySelector<HTMLElement>('.desktop-right-panel');
      const leftNav = root.querySelector<HTMLElement>('.desktop-left-nav');

      const isModalOrConversationOpen =
        actionStore.getInteractionState() === 'CONVERSATION' || activeModal !== null || demoPanelOpen;

      if (isModalOrConversationOpen) {
        headerEl?.setAttribute('inert', '');
        headerEl?.setAttribute('aria-hidden', 'true');
        mainEl?.setAttribute('inert', '');
        mainEl?.setAttribute('aria-hidden', 'true');
        navEl?.setAttribute('inert', '');
        navEl?.setAttribute('aria-hidden', 'true');
        centerCol?.setAttribute('inert', '');
        centerCol?.setAttribute('aria-hidden', 'true');
        rightPanel?.setAttribute('inert', '');
        rightPanel?.setAttribute('aria-hidden', 'true');
        leftNav?.setAttribute('inert', '');
        leftNav?.setAttribute('aria-hidden', 'true');
      } else {
        headerEl?.removeAttribute('inert');
        headerEl?.removeAttribute('aria-hidden');
        mainEl?.removeAttribute('inert');
        mainEl?.removeAttribute('aria-hidden');
        navEl?.removeAttribute('inert');
        navEl?.removeAttribute('aria-hidden');
        centerCol?.removeAttribute('inert');
        centerCol?.removeAttribute('aria-hidden');
        rightPanel?.removeAttribute('inert');
        rightPanel?.removeAttribute('aria-hidden');
        leftNav?.removeAttribute('inert');
        leftNav?.removeAttribute('aria-hidden');
      }

      if (actionStore.getInteractionState() === 'CONVERSATION') {
        conversationCleanup = attachConversationEvents(root, actionStore, () => {
          headerEl?.removeAttribute('inert');
          headerEl?.removeAttribute('aria-hidden');
          mainEl?.removeAttribute('inert');
          mainEl?.removeAttribute('aria-hidden');
          navEl?.removeAttribute('inert');
          navEl?.removeAttribute('aria-hidden');
          centerCol?.removeAttribute('inert');
          centerCol?.removeAttribute('aria-hidden');
          rightPanel?.removeAttribute('inert');
          rightPanel?.removeAttribute('aria-hidden');
          leftNav?.removeAttribute('inert');
          leftNav?.removeAttribute('aria-hidden');
          update();
          const askBarEl = root.querySelector<HTMLButtonElement>('#ask-bar');
          askBarEl?.focus();
        });
      }
    }

    // Initialize Leaflet real maps if real map containers are present (TID: INBOX-20261101-12065C)
    initRealMaps(root).catch(() => {});

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
