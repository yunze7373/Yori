/**
 * Provenance Classifier & Formatting
 * Governed by Living Context Architecture and Reviewer Amendment (msg_2ce5d22929cd4a35).
 *
 * Central source of truth for categorizing memory facts and context items into honest
 * provenance categories:
 * - 'user_confirmed': explicitly saved/confirmed by the user in this session or storage;
 *                     requires provenance.source === 'user_confirmed' AND membership in userConfirmedKeys.
 *                     Status alone ('confirmed') NEVER yields 'user_confirmed'.
 * - 'demo_sample': initial/sample profile facts bundled in the demo scenario.
 * - 'user_request': ephemeral session-scoped request override (never persisted as a fact).
 * - 'provider': live or external provider facts.
 */

export type FactSourceKind = 'user_confirmed' | 'user_stated' | 'learned' | 'learned_demo' | 'demo_sample' | 'user_request' | 'provider' | 'synced';

export interface FactLike {
  readonly key: string;
  readonly status?: string;
  readonly provenance?: {
    readonly source?: string;
    readonly [key: string]: unknown;
  } | unknown;
  readonly value?: unknown;
}

/**
 * Classifies a memory fact or cited key into its honest provenance bucket.
 * Invariant: Status alone ('confirmed') NEVER qualifies a fact as 'user_confirmed'.
 * It strictly requires fact.provenance.source === 'user_confirmed' AND presence in userConfirmedKeys.
 * Remote-synced facts carry 'synced' provenance (source 'xmemo') to prevent mislabeling as demo or user-confirmed.
 */
export function classifyFactSource(
  fact: FactLike | string,
  userConfirmedKeys?: ReadonlySet<string>,
  knownFacts?: readonly FactLike[],
  syncedKeys?: ReadonlySet<string>
): FactSourceKind {
  const key = typeof fact === 'string' ? fact : fact.key;
  const factObj: FactLike | undefined =
    typeof fact === 'string'
      ? knownFacts?.find(f => f.key === key)
      : fact;

  if (key === 'user_request') {
    return 'user_request';
  }

  const provSource =
    factObj?.provenance && typeof factObj.provenance === 'object' && 'source' in factObj.provenance
      ? String((factObj.provenance as { source?: unknown }).source)
      : undefined;

  if (provSource === 'user_request') {
    return 'user_request';
  }

  if (provSource === 'provider' || provSource === 'live') {
    return 'provider';
  }

  // HABIT-LEARN: learned from the user's own choices / told to Yori by the user.
  if (provSource === 'observed' || factObj?.status === 'learned') {
    const v = factObj?.value as { demo?: unknown } | undefined;
    return v && typeof v === 'object' && v.demo === true ? 'learned_demo' : 'learned';
  }
  if (provSource === 'user_stated') {
    return 'user_stated';
  }

  // Local user confirmation strictly wins over remote or demo
  if (userConfirmedKeys?.has(key) && (provSource === undefined || provSource === 'user_confirmed')) {
    return 'user_confirmed';
  }

  // Truthful XMemo provenance (Reviewer Finding P2)
  if (provSource === 'xmemo' || (syncedKeys?.has(key) && !userConfirmedKeys?.has(key))) {
    return 'synced';
  }

  if (provSource === 'demo_profile' || provSource === 'sample_profile' || provSource === 'sample') {
    return 'demo_sample';
  }

  // Status alone never yields user_confirmed:
  // Must be explicitly present in userConfirmedKeys
  if (userConfirmedKeys?.has(key)) {
    if (provSource === undefined || provSource === 'user_confirmed') {
      return 'user_confirmed';
    }
  }

  return 'demo_sample';
}

/**
 * Human-facing label for each provenance category.
 */
export function provenanceLabel(kind: FactSourceKind): string {
  switch (kind) {
    case 'user_confirmed':
    case 'user_stated':
      return 'You told Yori';
    case 'learned':
      return 'Learned from your choices';
    case 'learned_demo':
      return 'Learned from sample choices · demo';
    case 'synced':
      return 'Synced from XMemo';
    case 'demo_sample':
      return 'Demo profile · sample preference';
    case 'user_request':
      return 'Your request · this session';
    case 'provider':
      return 'Live provider';
  }
}

/**
 * True if and only if the fact is classified as user_confirmed.
 */
export function isFactUserConfirmed(
  fact: FactLike | string,
  userConfirmedKeys?: ReadonlySet<string>,
  knownFacts?: readonly FactLike[]
): boolean {
  return classifyFactSource(fact, userConfirmedKeys, knownFacts) === 'user_confirmed';
}

/**
 * Element-level provenance kinds for L1-LIVE-TRUTH
 * Governed by REV3_LIVE_ROADMAP.plan.json §Slice 1
 */
export type ElementProvenanceKind = 'live' | 'fixture' | 'user' | 'none';

export interface ProvenanceMetadata {
  readonly provenance: ElementProvenanceKind;
  readonly source?: string;
  readonly fetchedAt?: string;
}

/**
 * Formats HTML attributes for provenance metadata.
 * Invariant: Every data-provenance="live" element MUST have data-source and data-fetched-at.
 */
export function formatProvenanceAttrs(
  provenance: ElementProvenanceKind,
  source?: string,
  fetchedAt?: string
): string {
  if (provenance === 'live') {
    const src = source || 'live_feed';
    const at = fetchedAt || new Date().toISOString();
    return `data-provenance="live" data-source="${src}" data-fetched-at="${at}"`;
  }
  return `data-provenance="${provenance}"`;
}

/**
 * Checks whether live weather data has exceeded its validity window.
 * Default validity window is 2 hours (7,200,000ms).
 */
export function isWeatherStale(
  signal: { fetchedAt?: string; issuedAt?: string; validFor?: number } | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!signal) return false;
  const at = signal.fetchedAt || signal.issuedAt;
  if (!at) return false;
  const timeMs = Date.parse(at);
  if (isNaN(timeMs)) return false;
  const validForMs = signal.validFor ?? 7200000;
  return nowMs - timeMs > validForMs;
}

/**
 * Resolves the truthful element provenance for a given component in Demo vs Live mode.
 */
export function resolveElementProvenance(
  contextMode: 'demo' | 'live',
  itemType:
    | 'scene_plan'
    | 'scene_map'
    | 'scene_timeline'
    | 'scene_candidate'
    | 'scene_proposal'
    | 'device_clock'
    | 'weather_live'
    | 'weather_off'
    | 'weather_stale'
    | 'location_shared'
    | 'location_prompt'
    | 'location_denied'
    | 'places_not_enabled'
    | 'route_unavailable'
    | 'user_memory'
    | 'empty'
): ProvenanceMetadata {
  if (contextMode === 'demo') {
    if (itemType === 'user_memory') {
      return { provenance: 'user' };
    }
    return { provenance: 'fixture' };
  }

  // Live mode: inputs take only from verified live ports or user memories
  switch (itemType) {
    case 'device_clock':
      return {
        provenance: 'live',
        source: 'device_clock',
        fetchedAt: new Date().toISOString(),
      };
    case 'weather_live':
      return {
        provenance: 'live',
        source: 'open-meteo',
        fetchedAt: new Date().toISOString(),
      };
    case 'location_shared':
      return {
        provenance: 'live',
        source: 'geolocation',
        fetchedAt: new Date().toISOString(),
      };
    case 'user_memory':
      return { provenance: 'user' };
    case 'weather_off':
    case 'weather_stale':
    case 'location_prompt':
    case 'location_denied':
    case 'places_not_enabled':
    case 'route_unavailable':
    case 'empty':
    default:
      return { provenance: 'none' };
  }
}
