/**
 * Live Snapshot Composer & Living Header Derivation
 * Governed by LIVE_FIRST Architecture (ARCH-LIVE-FIRST-PROVIDERS),
 * Invariants INV-101, INV-102, INV-103, INV-106, INV-107, AC-EXT-1.
 *
 * Composes device clock, consented fix, enabled providers, and MemoryPort facts
 * into the existing ContextSnapshot shape consumed by core without core diffs.
 *
 * Architectural Invariants:
 * 1. Zero fabricated defaults: missing weather renders 'Weather unavailable';
 *    missing location renders 'Location not shared'. 'Clear' / 'Home' fallbacks
 *    are NEVER reachable from Live (Carried finding 1 from CONTEXT-TIMELINE approval).
 * 2. Missing providers yield empty signal lists with human-first notices (INV-103).
 * 3. Expired signals degrade to unavailable/stale via degradeIfExpired (INV-106).
 * 4. Only confirmed MemoryPort facts are included; pending/rejected facts rejected (INV-107).
 * 5. Snapshot deeply frozen before delivery (INV-101).
 *
 * ---------------------------------------------------------------------------
 * DESIGN NOTE: S1-LIVE-PIPELINE-CORE Change-Moment Lifecycle (Carried finding 2)
 * ---------------------------------------------------------------------------
 * In S0, contracts and test seams are established.
 * For S1-LIVE-PIPELINE-CORE:
 * The change moment must NOT be keyed to a timeline beat id (e.g. 'S3') or scene name ('rain').
 * In Live mode, there are no beat ids. The change moment is strictly state-based:
 * - A diff is computed from the prior composed NOW plan vs new composed NOW plan via computePlanDiff.
 * - When a meaningful plan delta occurs (e.g. leave time shifts, transport mode changes, route delay),
 *   a ChangeMomentState record is created with: { id, detectedAt, priorPlan, newPlan, diff, acknowledged: false }.
 * - The ChangeMomentState persists in the action store across subsequent re-renders and snapshot updates
 *   UNTIL the user explicitly acknowledges it (e.g. taps 'Accept', 'Adjust', or 'Not now') OR a newer diff supersedes it.
 * - This guarantees that Live updates do not flash or vanish between 60s background ticks.
 */

import {
  freezeSnapshot,
  type ContextSnapshot,
  type ContextSignal,
  type MemoryFact,
} from '../../core/contracts/index.js';
import {
  createLiveSignal,
  degradeIfExpired,
  type LiveSignal,
} from './live-signal.js';

export interface DerivedLivingHeader {
  readonly timeDisplay: string;
  readonly weatherDisplay: string;
  readonly placeDisplay: string;
  readonly formattedLine: string;
}

export interface BuildLiveSnapshotOptions {
  readonly id?: string;
  readonly asOf?: string; // ISO 8601 string from device clock (defaults to new Date().toISOString())
  readonly timezone?: string; // IANA timezone (defaults to Intl.DateTimeFormat().resolvedOptions().timeZone)
  readonly locationSignal?: LiveSignal | null;
  readonly weatherSignal?: LiveSignal | null;
  readonly routeSignal?: LiveSignal | null;
  readonly placesSignal?: LiveSignal | null;
  readonly calendarSignal?: LiveSignal | null;
  readonly memoryFacts?: readonly MemoryFact[] | null;
  readonly customSignals?: readonly (LiveSignal | ContextSignal)[];
}

/**
 * Builds an immutable, validated ContextSnapshot from live inputs (AC-EXT-1, INV-101).
 * Composes device clock, consented fix, enabled live providers, and confirmed facts.
 */
export function buildLiveSnapshot(options: BuildLiveSnapshotOptions = {}): Readonly<ContextSnapshot> {
  const asOf = options.asOf || new Date().toISOString();
  let timezone = options.timezone;
  if (!timezone) {
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      timezone = 'UTC';
    }
  }

  const signals: ContextSignal[] = [];

  // 1. Clock / Time signal from device clock
  const clockSignal = createLiveSignal({
    kind: 'clock',
    value: {
      iso: asOf,
      timezone,
    },
    provider: 'device_clock',
    asOf,
    validFor: 60000, // 60s tick
    confidence: 1.0,
    provenance: 'live',
    consentScope: 'device_only',
    status: 'available',
  });
  signals.push(clockSignal);

  // Timezone signal (for plugins expecting a 'timezone' signal)
  const timezoneSignal = createLiveSignal({
    kind: 'timezone',
    value: {
      timezone,
      asOf,
    },
    provider: 'device_clock',
    asOf,
    validFor: 86400000, // 24h
    confidence: 1.0,
    provenance: 'live',
    consentScope: 'device_only',
    status: 'available',
  });
  signals.push(timezoneSignal);

  // 2. Location Signal (consented fix only, INV-103)
  if (options.locationSignal) {
    const degradedLoc = degradeIfExpired(options.locationSignal, asOf);
    signals.push(degradedLoc);
  }
  // Note: If options.locationSignal is null/undefined, NO fake 'Home' or coordinates are added.
  // The list remains honest and empty of location signals.

  // 3. Weather Signal (Open-Meteo or live weather)
  if (options.weatherSignal) {
    const degradedWeather = degradeIfExpired(options.weatherSignal, asOf);
    signals.push(degradedWeather);
  }
  // Note: If options.weatherSignal is null/undefined, NO fake 'Clear' condition is added.

  // 4. Route / Travel estimate
  if (options.routeSignal) {
    const degradedRoute = degradeIfExpired(options.routeSignal, asOf);
    signals.push(degradedRoute);
  }

  // 5. Places Signal
  if (options.placesSignal) {
    const degradedPlaces = degradeIfExpired(options.placesSignal, asOf);
    signals.push(degradedPlaces);
  }

  // 6. Calendar Signal
  if (options.calendarSignal) {
    const degradedCal = degradeIfExpired(options.calendarSignal, asOf);
    signals.push(degradedCal);
  }

  // 7. Custom verified signals
  if (options.customSignals && options.customSignals.length > 0) {
    for (const sig of options.customSignals) {
      if ((sig as LiveSignal).validFor && (sig as LiveSignal).asOf) {
        signals.push(degradeIfExpired(sig as LiveSignal, asOf));
      } else {
        signals.push(sig);
      }
    }
  }

  // 8. Memory facts: INV-107 enforce confirmed-only
  if (options.memoryFacts && options.memoryFacts.length > 0) {
    const confirmedFacts = options.memoryFacts.filter(f => f && f.status === 'confirmed');
    if (confirmedFacts.length > 0) {
      const memorySignal = createLiveSignal({
        kind: 'memory_facts',
        value: confirmedFacts,
        provider: 'memory_port',
        asOf,
        validFor: 86400000,
        confidence: 1.0,
        provenance: 'user',
        consentScope: 'local_only',
        status: 'available',
      });
      signals.push(memorySignal);
    }
  }

  const id =
    options.id ||
    `live-snapshot-${Date.parse(asOf)}-${Math.random().toString(36).substring(2, 8)}`;

  return freezeSnapshot({
    id,
    asOf,
    timezone,
    signals,
  });
}

/**
 * Formats an ISO-8601 timestamp into a clean, locale-aware time string (e.g. '1:35 PM').
 */
export function formatLiveTime(isoString: string | undefined, timeZone?: string): string {
  if (!isoString) return '';
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return '';

  const date = new Date(parsed);
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone || 'UTC',
    }).format(date);
  } catch {
    return '';
  }
}

/**
 * Derives the Living Header from a Live ContextSnapshot.
 *
 * CRITICAL RULE (Carried Finding 1):
 * Never fabricates defaults in Live.
 * Missing/unknown weather produces 'Weather unavailable' (NEVER 'Clear').
 * Missing/unshared location produces 'Location not shared' (NEVER 'Home').
 */
export function deriveLiveLivingHeaderFromSnapshot(
  snapshot: ContextSnapshot,
  timeZone?: string,
  options?: { weatherDisabled?: boolean; weatherNeedsLocation?: boolean }
): DerivedLivingHeader {
  const effectiveTz = timeZone || snapshot.timezone || 'UTC';
  const timeDisplay = formatLiveTime(snapshot.asOf, effectiveTz);

  // 1. Weather condition
  const weatherSignal = snapshot.signals.find(s => s.kind === 'weather');
  // UI-QUIET-PRECISION (b): with no consented fix yet, say what is missing, not that weather failed.
  let weatherDisplay = options?.weatherDisabled
    ? 'Weather: Off'
    : options?.weatherNeedsLocation
      ? 'Weather needs location'
      : 'Weather unavailable';

  if (!options?.weatherDisabled && weatherSignal) {
    const liveSig = weatherSignal as Partial<LiveSignal>;
    if (liveSig.status === 'unavailable' || liveSig.status === 'stale' || liveSig.status === 'error') {
      weatherDisplay = 'Weather unavailable';
    } else if (weatherSignal.value && typeof weatherSignal.value === 'object') {
      const val = weatherSignal.value as Record<string, unknown>;
      const cond = typeof val.condition === 'string' ? val.condition.trim() : '';
      const onset = (val.forecastOnset || val.forecast) as string | undefined;

      if (cond.toLowerCase() === 'rain' && onset) {
        weatherDisplay = `Rain from ${onset}`;
      } else if (cond && cond.toLowerCase() !== 'unknown' && cond.toLowerCase() !== 'unavailable') {
        weatherDisplay = cond.charAt(0).toUpperCase() + cond.slice(1).toLowerCase();
      } else if (typeof val.temperatureC === 'number') {
        weatherDisplay = `${val.temperatureC}°C`;
      }
    }
  }

  // 2. Place / Location
  const locSignal = snapshot.signals.find(
    s => s.kind === 'location_status' || s.kind === 'location'
  );
  let placeDisplay = 'Location not shared';

  if (locSignal) {
    const liveSig = locSignal as Partial<LiveSignal>;
    if ((liveSig as any).isStale) {
      placeDisplay = (liveSig as any).note || 'Location stale';
    } else if (
      liveSig.status === 'permission_needed' ||
      liveSig.status === 'unavailable' ||
      liveSig.status === 'error'
    ) {
      placeDisplay = 'Location not shared';
    } else if (locSignal.value && typeof locSignal.value === 'object') {
      const val = locSignal.value as Record<string, unknown>;
      const area =
        (val.currentArea as string | undefined) ||
        (val.label as string | undefined) ||
        (val.isHome ? 'Home' : undefined);

      if (area && area.trim().length > 0 && area !== 'Location not shared') {
        const staleNotice =
          (val.staleFixNotice as string | undefined) ||
          ((liveSig as any).staleFixNotice as string | undefined);
        placeDisplay = staleNotice ? `${area.trim()} (${staleNotice})` : area.trim();
      }
    }
  }

  const formattedLine = `${timeDisplay} · ${weatherDisplay} · ${placeDisplay}`;

  return {
    timeDisplay,
    weatherDisplay,
    placeDisplay,
    formattedLine,
  };
}
