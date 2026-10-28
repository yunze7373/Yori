/**
 * Grounding Core for Yori Living Context V2 (LIVING_CONTEXT_V2.md §12 ARCH-V2-005, Slice G12-CORE)
 *
 * Implements:
 * - EvidenceRecord & EvidenceBundle for session-level ground truth.
 * - SourceRef linking rendered places, numbers, and times to bundle records.
 * - Section 12 testable freshness windows (judged against scene clock, never wall clock).
 * - Section 12 normalization rules for times, durations, distances, and place names.
 * - GroundedRecommendationVerifier: non-skippable verification called inside view-models.
 * - Fail-closed negative behavior: tampered value, missing ref, stale record, simulated mislabelled
 *   as live, and candidate outside bundle cause field to show 'unknown' or card to be withheld,
 *   navigation URL disabled, and redacted fact-ids-only reason logged to Decision Log.
 * - Zero core diff invariant: all grounding types and logic live under src/ui.
 */

import { formatTime } from '../living-context/presentation.js';
import { globalDecisionLogger } from '../../adapters/model/decision-log.js';
import type { PreparedPlan } from '../../core/contracts/index.js';
import { DEFAULT_MOCK_PLACES } from '../../adapters/mock/index.js';

export type EvidenceKind = 'poi' | 'route' | 'eta' | 'weather' | 'habit' | 'calendar';

export type EvidenceProvenance = 'simulated' | 'recorded' | 'live' | 'sample' | 'confirmed' | 'session';

export interface SourceRef {
  readonly recordId: string;
  readonly field: string;
}

export interface EvidenceRecord {
  readonly id: string;
  readonly provider: string;
  readonly kind: EvidenceKind;
  readonly fetchedAt: string; // ISO date-time string
  readonly validFor?: number; // validity duration in ms (for weather forecast / signals)
  readonly provenance: EvidenceProvenance;
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface EvidenceBundle {
  readonly id: string;
  readonly sceneClockIso: string;
  readonly timezone: string;
  readonly records: ReadonlyMap<string, EvidenceRecord>;
  getRecord(id: string): EvidenceRecord | undefined;
  hasRecord(id: string): boolean;
  getAllRecords(): readonly EvidenceRecord[];
}

export function createEvidenceBundle(
  id: string,
  sceneClockIso: string,
  records: readonly EvidenceRecord[],
  timezone: string = 'America/Los_Angeles',
  aliases?: ReadonlyMap<string, string>
): EvidenceBundle {
  const map = new Map<string, EvidenceRecord>();
  for (const rec of records) {
    map.set(rec.id, rec);
  }
  if (aliases) {
    for (const [alias, targetId] of aliases.entries()) {
      const target = map.get(targetId);
      if (target) {
        map.set(alias, target);
      }
    }
  }
  return Object.freeze({
    id,
    sceneClockIso,
    timezone,
    records: map,
    getRecord: (recId: string) => map.get(recId),
    hasRecord: (recId: string) => map.has(recId),
    getAllRecords: () => [...new Set(map.values())],
  });
}

// -------------------------------------------------------------
// NORMALIZATION (§12)
// -------------------------------------------------------------

/**
 * Normalizes values per §12 rules:
 * - times: scene-timezone 12-hour strings at minute precision (e.g. "2:30 PM", "1:35 PM")
 * - durations: integer minutes
 * - distances: integer minutes/metres
 * - places: canonical trimmed name
 */
export function normalizeFieldValue(
  field: string,
  val: unknown,
  timezone: string = 'America/Los_Angeles'
): string | number | undefined {
  if (val === null || val === undefined) {
    return undefined;
  }

  const fieldLower = field.toLowerCase();

  // 1. Time normalization
  if (
    fieldLower.includes('time') ||
    fieldLower.endsWith('at') ||
    fieldLower === 'appttime' ||
    fieldLower === 'leavetime' ||
    fieldLower === 'arrivetime' ||
    fieldLower === 'issuedtime' ||
    fieldLower === 'eventtime'
  ) {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      // If it looks like an ISO date-time (contains 'T' or ends with 'Z')
      if (trimmed.includes('T') || trimmed.endsWith('Z')) {
        const d = new Date(trimmed);
        if (Number.isFinite(d.getTime())) {
          return formatTime(trimmed, timezone);
        }
      }
      // If it's already a 12-hour time string like "2:30 PM" or "02:30 PM"
      const match = trimmed.match(/^0?(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (match) {
        const hour = parseInt(match[1]!, 10);
        const minute = match[2];
        const ampm = match[3]!.toUpperCase();
        return `${hour}:${minute} ${ampm}`;
      }
      // If it's a 24-hour time string like "14:30" or "09:15"
      const match24 = trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if (match24) {
        let hour = parseInt(match24[1]!, 10);
        const minute = match24[2];
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;
        return `${hour}:${minute} ${ampm}`;
      }
      return trimmed;
    }
    if (val instanceof Date) {
      return formatTime(val.toISOString(), timezone);
    }
  }

  // 2. Duration / buffer / margin normalization (integer minutes)
  if (
    fieldLower.includes('minute') ||
    fieldLower.includes('duration') ||
    fieldLower.includes('buffer') ||
    fieldLower.includes('margin')
  ) {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? Math.round(val) : undefined;
    }
    if (typeof val === 'string') {
      const match = val.match(/\b(\d+)\s*(m|min|minutes)?\b/i);
      if (match) {
        return parseInt(match[1]!, 10);
      }
    }
  }

  // 3. Distance normalization (integer minutes or metres)
  if (fieldLower.includes('distance')) {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? Math.round(val) : undefined;
    }
    if (typeof val === 'string') {
      const match = val.match(/\b(\d+)\s*(m|min|minutes|meters)?\b/i);
      if (match) {
        return parseInt(match[1]!, 10);
      }
    }
  }

  // 4. Place / name normalization
  if (
    fieldLower === 'name' ||
    fieldLower === 'destination' ||
    fieldLower === 'subjecttitle' ||
    fieldLower === 'area'
  ) {
    return typeof val === 'string' ? val.trim() : String(val).trim();
  }

  // 5. Mode and cuisine normalization (case-insensitive canonical)
  if (fieldLower === 'mode' || fieldLower === 'cuisine') {
    return typeof val === 'string' ? val.trim().toLowerCase() : String(val).trim().toLowerCase();
  }

  // 6. General string / number normalization
  if (typeof val === 'number') {
    return val;
  }
  return typeof val === 'string' ? val.trim() : String(val).trim();
}

// -------------------------------------------------------------
// FRESHNESS (§12)
// -------------------------------------------------------------

/**
 * Freshness judged per kind relative to scene clock (NEVER wall clock):
 * - weather: within forecast validity window from issuedAt (default 1h)
 * - route/eta: 30 minutes from fetchedAt
 * - poi: 24 hours from fetchedAt
 * - habit/confirmed: no expiry while confirmed
 * - calendar: 24 hours from fetchedAt
 */
export function isRecordFresh(record: EvidenceRecord, sceneClockIso: string): boolean {
  if (record.provenance === 'confirmed' || record.kind === 'habit') {
    return true; // Habits/confirmed facts do not expire while status stays confirmed
  }

  const sceneTime = new Date(sceneClockIso).getTime();
  if (!Number.isFinite(sceneTime)) {
    return false;
  }

  const fetchedTime = new Date(record.fetchedAt).getTime();
  if (!Number.isFinite(fetchedTime)) {
    return false;
  }

  const elapsedMs = sceneTime - fetchedTime;
  if (elapsedMs < 0) {
    // Record timestamp is in the future relative to scene clock (time-travel anomaly)
    return false;
  }

  switch (record.kind) {
    case 'weather': {
      // Forecast validity window from issuedAt (or validFor on record)
      const validDuration = record.validFor ?? 3600000; // default 1 hour
      return elapsedMs <= validDuration;
    }
    case 'route':
    case 'eta': {
      // 30 minutes
      return elapsedMs <= 30 * 60 * 1000;
    }
    case 'poi': {
      // 24 hours
      return elapsedMs <= 24 * 60 * 60 * 1000;
    }
    case 'calendar': {
      // 24 hours
      return elapsedMs <= 24 * 60 * 60 * 1000;
    }
    default:
      return elapsedMs <= 24 * 60 * 60 * 1000;
  }
}

// -------------------------------------------------------------
// GROUNDED RECOMMENDATION VERIFIER (§12 G2)
// -------------------------------------------------------------

export type GroundingFailureReason =
  | 'missing_ref'
  | 'tampered_value'
  | 'stale_record'
  | 'simulated_mislabelled_as_live'
  | 'candidate_outside_bundle';

export interface GroundingVerificationResult {
  readonly valid: boolean;
  readonly reason?: GroundingFailureReason;
  readonly recordId?: string;
  readonly field?: string;
  readonly error?: string;
}

export class GroundedRecommendationVerifier {
  /**
   * Verifies a single grounded value against the bundle.
   */
  public static verifyField(
    sourceRef: SourceRef | undefined,
    displayedValue: unknown,
    bundle: EvidenceBundle,
    expectedProvenance?: EvidenceProvenance
  ): GroundingVerificationResult {
    if (!sourceRef || !sourceRef.recordId || !sourceRef.field) {
      return this.fail('missing_ref', undefined, undefined, 'Missing sourceRef on grounded field', bundle);
    }

    const record = bundle.getRecord(sourceRef.recordId);
    if (!record) {
      return this.fail('missing_ref', sourceRef.recordId, sourceRef.field, `Record '${sourceRef.recordId}' not found in bundle`, bundle);
    }

    // 1. Freshness check against scene clock
    if (!isRecordFresh(record, bundle.sceneClockIso)) {
      return this.fail('stale_record', record.id, sourceRef.field, `Record '${record.id}' is stale relative to scene clock`, bundle);
    }

    // 2. Normalized equality check
    const recordRawVal = record.fields[sourceRef.field];
    const normRecord = normalizeFieldValue(sourceRef.field, recordRawVal, bundle.timezone);
    const normDisplayed = normalizeFieldValue(sourceRef.field, displayedValue, bundle.timezone);

    if (normRecord === undefined || normDisplayed === undefined || normRecord !== normDisplayed) {
      return this.fail(
        'tampered_value',
        record.id,
        sourceRef.field,
        `Tampered value on field '${sourceRef.field}': expected '${normRecord}', got '${normDisplayed}'`,
        bundle
      );
    }

    // 3. Provenance check
    if (expectedProvenance && expectedProvenance !== record.provenance) {
      if ((record.provenance === 'simulated' || record.provenance === 'sample') && expectedProvenance === 'live') {
        return this.fail(
          'simulated_mislabelled_as_live',
          record.id,
          sourceRef.field,
          `Record '${record.id}' is simulated but labelled as live`,
          bundle
        );
      }
    }

    return { valid: true };
  }

  /**
   * Verifies an option card (e.g. Drive / Bus option).
   */
  public static verifyOptionCard<
    T extends {
      readonly id?: string;
      readonly sourceRef?: SourceRef;
      readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
    }
  >(card: T, bundle: EvidenceBundle): GroundingVerificationResult {
    const cardObj = card as unknown as Record<string, unknown>;
    // If card has fieldSourceRefs, verify all referenced fields
    if (card.fieldSourceRefs) {
      for (const [field, ref] of Object.entries(card.fieldSourceRefs)) {
        const val = cardObj[field];
        const res = this.verifyField(ref, val, bundle);
        if (!res.valid) {
          return res;
        }
      }
    }

    if (card.sourceRef) {
      const rec = bundle.getRecord(card.sourceRef.recordId);
      if (!rec) {
        return this.fail('missing_ref', card.sourceRef.recordId, card.sourceRef.field, `Card sourceRef record '${card.sourceRef.recordId}' missing`, bundle);
      }
      if (!isRecordFresh(rec, bundle.sceneClockIso)) {
        return this.fail('stale_record', rec.id, card.sourceRef.field, `Card record '${rec.id}' is stale`, bundle);
      }
    }

    return { valid: true };
  }

  /**
   * Verifies a lunch candidate card.
   */
  public static verifyCandidateCard<
    T extends {
      readonly id: string;
      readonly name: string;
      readonly cuisine?: string;
      readonly distanceMinutes?: number;
      readonly distanceText?: string;
      readonly sourceRef?: SourceRef;
      readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
    }
  >(candidate: T, bundle: EvidenceBundle): GroundingVerificationResult {
    // 1. Candidate must exist in bundle
    const recId = candidate.sourceRef?.recordId || candidate.id;
    let rec = bundle.getRecord(recId);
    if (!rec) {
      rec = bundle.getRecord(candidate.name) || bundle.getRecord(candidate.name.toLowerCase());
    }
    if (!rec) {
      return this.fail('candidate_outside_bundle', candidate.id, 'id', `Candidate '${candidate.id}' not in evidence bundle`, bundle);
    }

    // 2. Freshness check
    if (!isRecordFresh(rec, bundle.sceneClockIso)) {
      return this.fail('stale_record', rec.id, 'fetchedAt', `Candidate record '${rec.id}' is stale`, bundle);
    }

    // 3. Name check
    const normRecName = normalizeFieldValue('name', rec.fields.name, bundle.timezone);
    const normCandName = normalizeFieldValue('name', candidate.name, bundle.timezone);
    if (normRecName !== normCandName) {
      return this.fail('tampered_value', rec.id, 'name', `Candidate name tampered: expected '${normRecName}', got '${normCandName}'`, bundle);
    }

    // 4. Distance check
    if (typeof candidate.distanceMinutes === 'number') {
      const normRecDist = normalizeFieldValue('distanceMinutes', rec.fields.distanceMinutes, bundle.timezone);
      const normCandDist = normalizeFieldValue('distanceMinutes', candidate.distanceMinutes, bundle.timezone);
      if (normRecDist !== normCandDist) {
        return this.fail('tampered_value', rec.id, 'distanceMinutes', `Distance tampered: expected '${normRecDist}', got '${normCandDist}'`, bundle);
      }
    }

    // 5. Verify fieldSourceRefs if present
    const candObj = candidate as unknown as Record<string, unknown>;
    if (candidate.fieldSourceRefs) {
      for (const [field, ref] of Object.entries(candidate.fieldSourceRefs)) {
        const val = candObj[field];
        const res = this.verifyField(ref, val, bundle);
        if (!res.valid) {
          return res;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Logs redacted fact-ids-only reason to Decision Log and returns failure result.
   */
  private static fail(
    reason: GroundingFailureReason,
    recordId: string | undefined,
    field: string | undefined,
    errorMsg: string,
    bundle: EvidenceBundle
  ): GroundingVerificationResult {
    // Log to global Decision Logger (redacted: record IDs and field keys only)
    try {
      globalDecisionLogger.log({
        timestamp: bundle.sceneClockIso,
        templateId: 'grounding_verifier',
        inputSignalIds: recordId ? [recordId] : [],
        inputFactKeys: field ? [field] : [],
        outputReasonCodes: [reason],
        outputIntent: 'VERIFY',
        validationResult: {
          valid: false,
          reason,
          error: errorMsg,
        },
        engineStatus: 'offline_deterministic',
      });
    } catch {
      // Non-blocking logger write
    }

    return {
      valid: false,
      reason,
      recordId,
      field,
      error: errorMsg,
    };
  }
}

// -------------------------------------------------------------
// NAVIGATE-URL BUILDER (§12 G2)
// -------------------------------------------------------------

/**
 * Safe navigate-URL builder.
 * Non-skippable: calls GroundedRecommendationVerifier.verifyCandidateCard before building URL.
 * If verification fails, navigation is disabled and undefined is returned.
 */
export function buildNavigateUrl(
  candidate: {
    readonly id: string;
    readonly name: string;
    readonly sourceRef?: SourceRef;
    readonly fieldSourceRefs?: Readonly<Record<string, SourceRef>>;
    readonly [key: string]: unknown;
  },
  bundle: EvidenceBundle
): string | undefined {
  const result = GroundedRecommendationVerifier.verifyCandidateCard(candidate, bundle);
  if (!result.valid) {
    return undefined; // Verifier failure => navigation disabled
  }

  const rec = bundle.getRecord(candidate.sourceRef?.recordId || candidate.id);
  const destName = encodeURIComponent(String(rec?.fields.name || candidate.name));
  return `yori://navigate?id=${encodeURIComponent(candidate.id)}&name=${destName}`;
}

// -------------------------------------------------------------
// DEFAULT SCENE BUNDLE FACTORIES (G12-CORE)
// -------------------------------------------------------------

export function createRainEvidenceBundle(options?: {
  plan?: PreparedPlan;
  sceneClockIso?: string;
  timezone?: string;
  isConfirmedHabit?: boolean;
}): EvidenceBundle {
  const sceneClockIso = options?.sceneClockIso ?? '2026-10-28T20:35:00.000Z';
  const timezone = options?.timezone ?? 'America/Los_Angeles';
  const isConfirmedHabit = options?.isConfirmedHabit ?? false;

  // Authoritative fixture inputs (not read from plan to ensure non-circularity)
  const apptAt = '2026-10-28T22:00:00.000Z'; // 3:00 PM local
  const subjectTitle = 'Piano Studio (Rain Route)';
  const destination = '123 Harmony Way';
  const driveMinutes = 25;
  const busMinutes = 40;
  const bufferMinutes = 5;
  const prepMinutes = 20;

  const apptMs = Date.parse(apptAt);

  // Derive timing records mathematically from fixture inputs
  const driveArriveMs = apptMs - bufferMinutes * 60000;
  const driveLeaveMs = driveArriveMs - driveMinutes * 60000;
  const drivePrepMs = driveLeaveMs - prepMinutes * 60000;

  const driveLeaveIso = new Date(driveLeaveMs).toISOString();
  const driveArriveIso = new Date(driveArriveMs).toISOString();
  const drivePrepIso = new Date(drivePrepMs).toISOString();

  const driveLeaveTime = formatTime(driveLeaveIso, timezone);
  const driveArriveTime = formatTime(driveArriveIso, timezone);
  const drivePrepTime = formatTime(drivePrepIso, timezone);

  const busArriveMs = apptMs - bufferMinutes * 60000;
  const busLeaveMs = busArriveMs - busMinutes * 60000;
  const busPrepMs = busLeaveMs - prepMinutes * 60000;

  const busLeaveIso = new Date(busLeaveMs).toISOString();
  const busArriveIso = new Date(busArriveMs).toISOString();
  const busPrepIso = new Date(busPrepMs).toISOString();

  const busLeaveTime = formatTime(busLeaveIso, timezone);
  const busArriveTime = formatTime(busArriveIso, timezone);
  const busPrepTime = formatTime(busPrepIso, timezone);

  const calRecordId = 'calendar:2026-10-28T17:00:00.000Z';
  const weatherRecordId = 'weather:2026-10-28T20:35:00.000Z';
  const travelRecordId = 'travel_estimate:2026-10-28T20:35:00.000Z';
  const habitRecordId = 'rain_transport_preference';

  const records: EvidenceRecord[] = [
    {
      id: calRecordId,
      provider: 'calendar',
      kind: 'calendar',
      fetchedAt: '2026-10-28T17:00:00.000Z',
      provenance: 'simulated',
      fields: {
        subjectTitle,
        destination,
        destinationName: subjectTitle,
        apptAt,
        prepareAt: drivePrepIso,
        leaveAt: driveLeaveIso,
        apptTime: formatTime(apptAt, timezone), // '3:00 PM'
        prepareTime: drivePrepTime,             // '2:10 PM'
        leaveTime: driveLeaveTime,               // '2:30 PM'
      },
    },
    {
      id: weatherRecordId,
      provider: 'weather',
      kind: 'weather',
      fetchedAt: '2026-10-28T20:35:00.000Z',
      validFor: 7200000, // 2 hours
      provenance: 'simulated',
      fields: {
        condition: 'rain',
        description: 'Rain forecast · simulated',
        issuedAt: '2026-10-28T20:35:00.000Z',
        issuedTime: '1:35 PM',
        whatChanged: 'Rain starting in 25 min (simulated)',
        calloutText: 'Rain forecast · simulated',
        calloutSubtext: 'Issued 1:35 PM',
        rainBanner: 'What changed: rain forecast',
      },
    },
    {
      id: travelRecordId,
      provider: 'traffic',
      kind: 'eta',
      fetchedAt: '2026-10-28T20:35:00.000Z',
      validFor: 7200000,
      provenance: 'simulated',
      fields: {
        driveMinutes,
        busMinutes,
      },
    },
    {
      id: 'eta-drive-piano',
      provider: 'traffic',
      kind: 'eta',
      fetchedAt: '2026-10-28T20:35:00.000Z',
      provenance: 'simulated',
      fields: {
        mode: 'drive',
        travelMinutes: driveMinutes,
        bufferMinutes,
        leaveTime: driveLeaveTime,
        leaveAt: driveLeaveIso,
        arrivalTime: driveArriveTime,
        arrivalAt: driveArriveIso,
        destination: subjectTitle,
        badge: 'Recommended',
        polylineId: 'poly-drive',
      },
    },
    {
      id: 'eta-bus-piano',
      provider: 'transit',
      kind: 'eta',
      fetchedAt: '2026-10-28T20:35:00.000Z',
      provenance: 'simulated',
      fields: {
        mode: 'bus',
        travelMinutes: busMinutes,
        bufferMinutes,
        leaveTime: busLeaveTime,
        prepareTime: busPrepTime,
        leaveAt: busLeaveIso,
        arrivalTime: busArriveTime,
        arrivalAt: busArriveIso,
        destination: subjectTitle,
        badge: 'Alternative',
        polylineId: 'poly-bus',
      },
    },
    {
      id: habitRecordId,
      provider: 'memory',
      kind: 'habit',
      fetchedAt: '2026-10-28T20:35:00.000Z',
      provenance: isConfirmedHabit ? 'confirmed' : 'sample',
      fields: {
        key: 'rain_transport_preference',
        value: 'drive_first',
        rankingBasis: isConfirmedHabit
          ? 'Ranked by habit: Rain travel habit (You confirmed)'
          : 'Ranked by habit: Rain travel habit (Demo profile · sample)',
        bufferMinutes,
        prepMinutes,
        prepText: `${prepMinutes}m prep + ${bufferMinutes}m buffer`,
        bufferText: `${bufferMinutes}m buffer`,
      },
    },
  ];

  const aliases = new Map<string, string>([
    ['cal-piano', calRecordId],
    ['weather-rain', weatherRecordId],
    ['habit-rain-transport', habitRecordId],
    ['travel_estimate:2026-10-28T20:35:00.000Z:drive', 'eta-drive-piano'],
    ['travel_estimate:2026-10-28T20:35:00.000Z:bus', 'eta-bus-piano'],
  ]);

  return createEvidenceBundle('bundle-rain-d2', sceneClockIso, records, timezone, aliases);
}

export function createLunchEvidenceBundle(options?: {
  plan?: PreparedPlan;
  sceneClockIso?: string;
  timezone?: string;
  isConfirmedTaste?: boolean;
}): EvidenceBundle {
  const sceneClockIso = options?.sceneClockIso ?? '2026-10-28T19:10:00.000Z';
  const timezone = options?.timezone ?? 'America/Los_Angeles';
  const isConfirmedTaste = options?.isConfirmedTaste ?? false;

  const recordMap = new Map<string, EvidenceRecord>();
  const habitId = 'taste_preference_lunch_cuisine';

  const aliases = new Map<string, string>([
    ['habit-taste-cuisine', habitId],
  ]);

  // Add mock places strictly from DEFAULT_MOCK_PLACES (source fixture, not plan)
  for (let idx = 0; idx < DEFAULT_MOCK_PLACES.length; idx++) {
    const p = DEFAULT_MOCK_PLACES[idx]!;
    const placeId = p.id || `mock-place-${idx + 1}`;
    recordMap.set(placeId, {
      id: placeId,
      provider: 'mock-place-adapter',
      kind: 'poi',
      fetchedAt: sceneClockIso,
      provenance: 'simulated',
      fields: {
        id: placeId,
        name: p.name,
        cuisine: p.cuisine,
        distanceMinutes: p.distanceMinutes,
        distanceText: `${p.distanceMinutes}m away`,
        noiseLevel: p.noiseLevel,
        vegetarian: p.vegetarian,
      },
    });

    // Identifiers and slugs used across scenes, preparer, and test fixtures:
    aliases.set(`mock-place-${idx + 1}`, placeId);
    aliases.set(`place-${String.fromCharCode(97 + idx)}`, placeId);
    aliases.set(`cand-${idx + 1}`, placeId);
    aliases.set(`candidate-${idx}`, placeId);
    aliases.set(`opt-${idx + 1}`, placeId);
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    aliases.set(slug, placeId);
    for (let k = 1; k <= DEFAULT_MOCK_PLACES.length; k++) {
      aliases.set(`opt-${k}-${slug}`, placeId);
    }
    aliases.set(p.name.toLowerCase(), placeId);
    aliases.set(p.name, placeId);
  }

  // Real signal IDs
  recordMap.set('mock_places:2026-10-28T19:10:00.000Z', {
    id: 'mock_places:2026-10-28T19:10:00.000Z',
    provider: 'mock-place-adapter',
    kind: 'poi',
    fetchedAt: sceneClockIso,
    provenance: 'simulated',
    fields: {
      count: DEFAULT_MOCK_PLACES.length,
    },
  });

  recordMap.set('location_status:2026-10-28T19:10:00.000Z', {
    id: 'location_status:2026-10-28T19:10:00.000Z',
    provider: 'location',
    kind: 'poi',
    fetchedAt: sceneClockIso,
    provenance: 'simulated',
    fields: {
      isHome: false,
      currentArea: 'Downtown',
    },
  });

  recordMap.set('loc-downtown', {
    id: 'loc-downtown',
    provider: 'location',
    kind: 'poi',
    fetchedAt: sceneClockIso,
    provenance: 'simulated',
    fields: {
      name: 'Downtown Dining District',
      area: 'Downtown',
    },
  });

  recordMap.set(habitId, {
    id: habitId,
    provider: 'memory',
    kind: 'habit',
    fetchedAt: sceneClockIso,
    provenance: isConfirmedTaste ? 'confirmed' : 'sample',
    fields: {
      key: 'taste_preference_lunch_cuisine',
      value: 'japanese',
      cuisine: 'Japanese',
      basis: isConfirmedTaste
        ? 'Based on taste: Japanese (You confirmed)'
        : 'Based on taste: Japanese (Demo profile · sample)',
    },
  });

  return createEvidenceBundle('bundle-lunch-d3', sceneClockIso, [...recordMap.values()], timezone, aliases);
}
