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
import { STRINGS } from '../living-context/strings.js';
import { globalDecisionLogger } from '../../adapters/model/decision-log.js';
import type { PreparedPlan, MemoryFact } from '../../core/contracts/index.js';
import type { UserRequestOverride } from '../../plugins/depart/request-override.js';
import { mockPlaceAdapter } from '../../adapters/mock/index.js';
import {
  formatStraightLineDistance,
} from '../../adapters/providers/simulated-places-provider.js';
import type { PlaceItem } from '../../adapters/providers/places-types.js';
import { classifyFactSource, type FactLike } from './provenance.js';

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
const DURATION_MINUTE_FIELDS: ReadonlySet<string> = new Set([
  'lateminutes',
  'bufferminutes',
  'durationminutes',
  'marginminutes',
  'travelminutes',
  'driveminutes',
  'busminutes',
  'prepminutes',
  'deltaminutes',
  'distanceminutes',
  'estimatedminutes',
  'drivetravelminutes',
  'bustravelminutes',
  'duration',
  'buffer',
  'margin',
]);

function extractDurationMinutes(val: string): number | undefined {
  const trimmed = val.trim();
  // 1. Pure duration (e.g. "25", "25m", "25 min", "25 minutes", "+10m")
  const m1 = trimmed.match(/^(?:[+-]\s*)?(\d+)\s*(?:m|min|mins|minute|minutes)?$/i);
  if (m1) {
    return parseInt(m1[1]!, 10);
  }
  // 2. Late offset (e.g. "late by 10m", "Late by 10 min")
  const m2 = trimmed.match(/^late\s+by\s+(\d+)\s*(?:m|min|mins|minute|minutes)?$/i);
  if (m2) {
    return parseInt(m2[1]!, 10);
  }
  // 3. Prep / buffer / margin / away suffix (e.g. "20m prep", "5m buffer", "5m margin", "5m away")
  const m3 = trimmed.match(/^(\d+)\s*(?:m|min|mins|minute|minutes)?\s+(?:prep|buffer|margin|away)$/i);
  if (m3) {
    return parseInt(m3[1]!, 10);
  }
  // 4. Mode / status prefix with optional suffix (e.g. "Drive · 25 min", "On time · 5m buffer", "Bus · 40m")
  const m4 = trimmed.match(/^(?:drive|bus|walk|transit|on\s+time)\s*[·•\-]\s*(\d+)\s*(?:m|min|mins|minute|minutes)?(?:\s+(?:buffer|margin))?$/i);
  if (m4) {
    return parseInt(m4[1]!, 10);
  }
  // 5. Mode suffix with optional margin (e.g. "25 min drive", "25 min drive + 5m margin")
  const m5 = trimmed.match(/^(\d+)\s*(?:m|min|mins|minute|minutes)?\s+(?:drive|bus|walk|transit)(?:\s*\+\s*\d+\s*(?:m|min|mins|minute|minutes)?\s*margin)?$/i);
  if (m5) {
    return parseInt(m5[1]!, 10);
  }
  return undefined;
}

export function normalizeFieldValue(
  field: string,
  val: unknown,
  timezone: string = 'America/Los_Angeles'
): string | number | undefined {
  if (val === null || val === undefined) {
    return undefined;
  }

  const fieldLower = field.toLowerCase();
  const fieldClean = fieldLower.replace(/[-_]/g, '');

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
      // If it matches a 12-hour time string like "2:30 PM" or "10:00 AM" (anchored strictly)
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

  // 2. Duration / buffer / margin / late normalization (integer minutes)
  if (DURATION_MINUTE_FIELDS.has(fieldClean)) {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? Math.round(val) : undefined;
    }
    if (typeof val === 'string') {
      return extractDurationMinutes(val);
    }
  }

  // 3. Distance normalization (integer minutes or metres)
  if (fieldLower.includes('distance') && !DURATION_MINUTE_FIELDS.has(fieldClean)) {
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
    fieldLower === 'destinationname' ||
    fieldLower === 'subjecttitle' ||
    fieldLower === 'area'
  ) {
    return typeof val === 'string' ? val.trim() : String(val).trim();
  }

  // 5. Mode, cuisine and category normalization (case-insensitive canonical)
  if (fieldLower === 'mode' || fieldLower === 'cuisine' || fieldLower === 'category') {
    return typeof val === 'string' ? val.trim().toLowerCase() : String(val).trim().toLowerCase();
  }

  // 6. Provenance normalization
  if (fieldLower === 'provenance') {
    const s = String(val).trim().toLowerCase();
    if (s === 'confirmed' || s === 'you confirmed') return 'confirmed';
    if (s.includes('sample')) return 'sample';
    if (s.includes('simulated')) return 'simulated';
    if (s === 'live') return 'live';
    return s;
  }

  // 7. General string / number normalization
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
  | 'sample_mislabelled_as_confirmed'
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
    const recordRawVal =
      sourceRef.field === 'fetchedAt'
        ? record.fetchedAt
        : sourceRef.field === 'provenance'
          ? (record.fields.provenance ?? record.provenance)
          : record.fields[sourceRef.field];
    const normRecord = normalizeFieldValue(sourceRef.field, recordRawVal, bundle.timezone);
    const normDisplayed = normalizeFieldValue(sourceRef.field, displayedValue, bundle.timezone);

    if (normRecord === undefined || normDisplayed === undefined || normRecord !== normDisplayed) {
      if (
        (sourceRef.field === 'provenance' || sourceRef.field === 'basis') &&
        record.provenance === 'sample' &&
        normDisplayed === 'confirmed'
      ) {
        return this.fail(
          'sample_mislabelled_as_confirmed',
          record.id,
          sourceRef.field,
          `Record '${record.id}' is sample preference but labelled as confirmed`,
          bundle
        );
      }
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
      if (record.provenance === 'sample' && expectedProvenance === 'confirmed') {
        return this.fail(
          'sample_mislabelled_as_confirmed',
          record.id,
          sourceRef.field,
          `Record '${record.id}' is sample preference but labelled as confirmed`,
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
    if (typeof candidate.distanceMinutes === 'number' && rec.fields.distanceMinutes !== undefined) {
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
  bundle: EvidenceBundle,
  options?: { platform?: 'ios' | 'android' | 'desktop' | 'app_scheme'; forceFail?: boolean }
): string | undefined {
  if (options?.forceFail) {
    GroundedRecommendationVerifier.verifyField(
      { recordId: '__forced_failure__', field: 'name' },
      candidate.name,
      bundle
    );
    return undefined;
  }

  const result = GroundedRecommendationVerifier.verifyCandidateCard(candidate, bundle);
  if (!result.valid) {
    return undefined; // Verifier failure => navigation disabled
  }

  const rec = bundle.getRecord(candidate.sourceRef?.recordId || candidate.id);
  const recCoords = (rec?.fields.coords as { lat: number; lng: number } | undefined) ?? (candidate as any).coords;

  if (options?.platform && options.platform !== 'app_scheme' && recCoords) {
    if (options.platform === 'ios') {
      const q = encodeURIComponent(String(rec?.fields.name || candidate.name));
      return `https://maps.apple.com/?daddr=${recCoords.lat},${recCoords.lng}&dirflg=d&q=${q}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${recCoords.lat}%2C${recCoords.lng}&travelmode=driving`;
  }

  const destName = encodeURIComponent(String(rec?.fields.name || candidate.name));
  return `yori://navigate?id=${encodeURIComponent(candidate.id)}&name=${destName}`;
}

// -------------------------------------------------------------
// DEFAULT SCENE BUNDLE FACTORIES (G12-CORE)
// -------------------------------------------------------------

export function createRainEvidenceBundle(options?: {
  plan?: PreparedPlan;
  snapshot?: { asOf?: string; timezone?: string; signals?: readonly { kind: string; id?: string; issuedAt?: string; value?: unknown }[] } | null;
  override?: UserRequestOverride | null;
  sceneClockIso?: string;
  timezone?: string;
  isConfirmedHabit?: boolean;
  userConfirmedKeys?: ReadonlySet<string>;
  memoryFacts?: readonly { key: string; value?: unknown; status?: string }[];
}): EvidenceBundle {
  const sceneClockIso = options?.sceneClockIso ?? options?.snapshot?.asOf ?? '2026-10-28T20:35:00.000Z';
  const timezone = options?.timezone ?? options?.snapshot?.timezone ?? options?.plan?.timezone ?? 'America/Los_Angeles';
  const isConfirmedHabit = options?.isConfirmedHabit ?? false;

  // Extract source inputs from snapshot or plan signals, fallback to fixture defaults (never plan values)
  const calSig =
    options?.snapshot?.signals?.find(s => s.kind === 'calendar') ??
    options?.plan?.why?.evidenceSignals?.find(s => s.kind === 'calendar');
  const calVal = ((calSig as any)?.value as Record<string, unknown>) ?? {};
  const apptAt = typeof calVal.startTime === 'string'
    ? calVal.startTime
    : '2026-10-28T22:00:00.000Z';
  const subjectTitle = typeof calVal.title === 'string'
    ? calVal.title
    : 'Piano Studio (Rain Route)';
  const destination = typeof calVal.location === 'string'
    ? calVal.location
    : '123 Harmony Way';
  const calRecordId =
    (calSig as any)?.id ||
    (calSig?.issuedAt ? `${calSig.kind}:${calSig.issuedAt}` : undefined) ||
    'calendar:2026-10-28T17:00:00.000Z';
  const calFetchedAt = calSig?.issuedAt ?? '2026-10-28T17:00:00.000Z';

  const weatherSig =
    options?.snapshot?.signals?.find(s => s.kind === 'weather') ??
    options?.plan?.why?.evidenceSignals?.find(s => s.kind === 'weather');
  const weatherVal = ((weatherSig as any)?.value as Record<string, unknown>) ?? {};
  const weatherRecordId =
    (weatherSig as any)?.id ||
    (weatherSig?.issuedAt ? `${weatherSig.kind}:${weatherSig.issuedAt}` : undefined) ||
    'weather:2026-10-28T20:35:00.000Z';
  const weatherIssuedAt = weatherSig?.issuedAt ?? '2026-10-28T20:35:00.000Z';
  const weatherIssuedTime = formatTime(weatherIssuedAt, timezone);

  const travelSig =
    options?.snapshot?.signals?.find(s => s.kind === 'travel_estimate') ??
    options?.plan?.why?.evidenceSignals?.find(s => s.kind === 'travel_estimate');
  const travelVal = ((travelSig as any)?.value as Record<string, unknown>) ?? {};
  const driveMinutes =
    typeof travelVal.driveMinutes === 'number'
      ? travelVal.driveMinutes
      : typeof travelVal.travelMinutes === 'number'
        ? travelVal.travelMinutes
        : 25;
  const busMinutes = typeof travelVal.busMinutes === 'number' ? travelVal.busMinutes : 40;
  const travelRecordId =
    (travelSig as any)?.id ||
    (travelSig?.issuedAt ? `${travelSig.kind}:${travelSig.issuedAt}` : undefined) ||
    'travel_estimate:2026-10-28T20:35:00.000Z';
  const travelFetchedAt = travelSig?.issuedAt ?? '2026-10-28T20:35:00.000Z';

  const memFacts = options?.memoryFacts;
  const bufferMinutes = typeof memFacts?.find(f => f.key === 'prep_buffer_minutes')?.value === 'number'
    ? (memFacts.find(f => f.key === 'prep_buffer_minutes')!.value as number)
    : 5;
  const prepMinutes = typeof memFacts?.find(f => f.key === 'prep_duration_minutes')?.value === 'number'
    ? (memFacts.find(f => f.key === 'prep_duration_minutes')!.value as number)
    : 20;

  const apptMs = Date.parse(apptAt);

  // Derive timing records mathematically from source inputs
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

  const habitRecordId = 'rain_transport_preference';

  const records: EvidenceRecord[] = [
    {
      id: calRecordId,
      provider: 'calendar',
      kind: 'calendar',
      fetchedAt: calFetchedAt,
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
        issuedTime: formatTime(calFetchedAt, timezone),
        provenance: 'simulated',
      },
    },
    {
      id: weatherRecordId,
      provider: 'weather',
      kind: 'weather',
      fetchedAt: weatherIssuedAt,
      validFor: 7200000, // 2 hours
      provenance: 'simulated',
      fields: {
        condition: (weatherVal.condition as string) || 'rain',
        description: 'Rain forecast · simulated',
        issuedAt: weatherIssuedAt,
        issuedTime: weatherIssuedTime,
        whatChanged: 'Rain starting in 25 min (simulated)',
        calloutText: 'Rain forecast · simulated',
        calloutSubtext: `Issued ${weatherIssuedTime}`,
        rainBanner: 'What changed: rain forecast',
      },
    },
    {
      id: travelRecordId,
      provider: 'traffic',
      kind: 'eta',
      fetchedAt: travelFetchedAt,
      validFor: 7200000,
      provenance: 'simulated',
      fields: {
        driveMinutes,
        busMinutes,
        issuedTime: formatTime(travelFetchedAt, timezone),
        provenance: 'simulated',
      },
    },
    {
      id: 'eta-drive-piano',
      provider: 'traffic',
      kind: 'eta',
      fetchedAt: travelFetchedAt,
      provenance: 'simulated',
      fields: {
        mode: 'drive',
        travelMinutes: driveMinutes,
        bufferMinutes,
        leaveTime: driveLeaveTime,
        prepareTime: drivePrepTime,
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
      fetchedAt: travelFetchedAt,
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
  ];

  // User request override: recompute expected timing from base eta + request delta
  // Governed by Living Context §2.3 and G12 Check 1 (Zero Circular Evidence)
  const userReqSig =
    options?.snapshot?.signals?.find(s => s.kind === 'user_request') ??
    options?.plan?.why?.evidenceSignals?.find(s => s.kind === 'user_request');
  const overrideObj = options?.override;
  const hasUserRequest = Boolean(overrideObj || userReqSig);

  let isLate = false;
  let overrideRecord: EvidenceRecord | undefined;

  if (hasUserRequest) {
    const overrideRecordId = 'user_override_timing';
    const reqIssuedAt = overrideObj?.provenance?.at || userReqSig?.issuedAt || sceneClockIso;

    let deltaMinutes = 0;
    let preferredMode: 'drive' | 'bus' = 'drive';

    if (overrideObj) {
      if (overrideObj.kind === 'leave_later') {
        deltaMinutes = overrideObj.deltaMinutes ?? 15;
      } else if (overrideObj.kind === 'route_preference') {
        preferredMode = overrideObj.mode ?? 'bus';
      }
    } else if (userReqSig) {
      const sigVal = (userReqSig as any).value as Record<string, unknown> | undefined;
      if (sigVal && typeof sigVal.deltaMinutes === 'number') {
        deltaMinutes = sigVal.deltaMinutes;
      } else if ((userReqSig as any).description) {
        const matchDelta = String((userReqSig as any).description).match(/leave\s+(\d+)\s*min/i);
        if (matchDelta) {
          deltaMinutes = parseInt(matchDelta[1]!, 10);
        }
      }

      if (sigVal && typeof sigVal.mode === 'string' && (sigVal.mode === 'drive' || sigVal.mode === 'bus')) {
        preferredMode = sigVal.mode;
      } else if ((userReqSig as any).description) {
        const desc = String((userReqSig as any).description);
        if (/switch to bus|take the bus/i.test(desc)) {
          preferredMode = 'bus';
        } else if (/switch to drive|take driving|take the car/i.test(desc)) {
          preferredMode = 'drive';
        }
      }
    }

    const shiftDriveLeaveMs = driveLeaveMs + deltaMinutes * 60000;
    const shiftDrivePrepMs = drivePrepMs + deltaMinutes * 60000;
    const shiftDriveArriveMs = shiftDriveLeaveMs + driveMinutes * 60000;

    const shiftBusLeaveMs = busLeaveMs + deltaMinutes * 60000;
    const shiftBusPrepMs = busPrepMs + deltaMinutes * 60000;
    const shiftBusArriveMs = shiftBusLeaveMs + busMinutes * 60000;

    const primaryLeaveMs = preferredMode === 'bus' ? shiftBusLeaveMs : shiftDriveLeaveMs;
    const primaryPrepMs = preferredMode === 'bus' ? shiftBusPrepMs : shiftDrivePrepMs;
    const primaryArriveMs = preferredMode === 'bus' ? shiftBusArriveMs : shiftDriveArriveMs;

    const driveLeaveTimeStr = formatTime(new Date(shiftDriveLeaveMs).toISOString(), timezone);
    const drivePrepTimeStr = formatTime(new Date(shiftDrivePrepMs).toISOString(), timezone);
    const driveArriveTimeStr = formatTime(new Date(shiftDriveArriveMs).toISOString(), timezone);

    const busLeaveTimeStr = formatTime(new Date(shiftBusLeaveMs).toISOString(), timezone);
    const busPrepTimeStr = formatTime(new Date(shiftBusPrepMs).toISOString(), timezone);
    const busArriveTimeStr = formatTime(new Date(shiftBusArriveMs).toISOString(), timezone);

    const primaryLeaveTimeStr = formatTime(new Date(primaryLeaveMs).toISOString(), timezone);
    const primaryPrepTimeStr = formatTime(new Date(primaryPrepMs).toISOString(), timezone);
    const primaryArriveTimeStr = formatTime(new Date(primaryArriveMs).toISOString(), timezone);

    const marginMinutes = Math.round((apptMs - primaryArriveMs) / 60000);
    isLate = marginMinutes < 0;

    overrideRecord = {
      id: overrideRecordId,
      provider: 'user_request',
      kind: 'habit',
      fetchedAt: reqIssuedAt,
      provenance: 'session',
      fields: {
        deltaMinutes,
        mode: preferredMode,
        prepareAt: new Date(primaryPrepMs).toISOString(),
        prepareTime: primaryPrepTimeStr,
        leaveAt: new Date(primaryLeaveMs).toISOString(),
        leaveTime: primaryLeaveTimeStr,
        arriveAt: new Date(primaryArriveMs).toISOString(),
        arrivalTime: primaryArriveTimeStr,
        marginMinutes,
        lateMinutes: isLate ? Math.abs(marginMinutes) : 0,
        bufferMinutes: isLate ? Math.abs(marginMinutes) : marginMinutes,
        isLate,
        driveLeaveTime: driveLeaveTimeStr,
        drivePrepareTime: drivePrepTimeStr,
        driveArrivalTime: driveArriveTimeStr,
        driveTravelMinutes: driveMinutes,
        busLeaveTime: busLeaveTimeStr,
        busPrepareTime: busPrepTimeStr,
        busArrivalTime: busArriveTimeStr,
        busTravelMinutes: busMinutes,
      },
    };
  }

  // Add one habit record per memory fact used (from default facts or options.memoryFacts; never plan.why.memoryFactsUsed)
  const defaultMemoryFacts: readonly { key: string; value?: unknown; status?: string; provenance?: unknown }[] = [
    { key: 'rain_transport_preference', value: 'drive_first', status: isConfirmedHabit ? 'confirmed' : 'pending' },
    { key: 'prep_buffer_minutes', value: bufferMinutes, status: 'pending' },
    { key: 'prep_duration_minutes', value: prepMinutes, status: 'pending' },
  ];

  const factMap = new Map<string, { key: string; value?: unknown; status?: string; provenance?: unknown }>();
  if (options?.memoryFacts) {
    for (const f of options.memoryFacts) factMap.set(f.key, f);
  } else {
    for (const f of defaultMemoryFacts) factMap.set(f.key, f);
  }

  for (const fact of factMap.values()) {
    const factKind = classifyFactSource(
      fact as FactLike,
      options?.userConfirmedKeys,
      options?.memoryFacts
    );
    const isConfirmed = options?.userConfirmedKeys !== undefined
      ? factKind === 'user_confirmed'
      : (fact.key === 'rain_transport_preference' ? isConfirmedHabit : false);
    const provStr: EvidenceProvenance = isConfirmed ? 'confirmed' : 'sample';
    const provLabel = isConfirmed ? 'You confirmed' : 'Demo profile · sample';

    records.push({
      id: fact.key,
      provider: 'memory',
      kind: 'habit',
      fetchedAt: sceneClockIso,
      provenance: provStr,
      fields: {
        key: fact.key,
        value: fact.value,
        bufferMinutes: fact.key === 'prep_buffer_minutes' ? fact.value : bufferMinutes,
        prepMinutes: fact.key === 'prep_duration_minutes' ? fact.value : prepMinutes,
        prepText: isLate ? `${prepMinutes}m prep` : `${prepMinutes}m prep + ${bufferMinutes}m buffer`,
        bufferText: `${bufferMinutes}m buffer`,
        rankingBasis: fact.key === 'rain_transport_preference'
          ? `Ranked by habit: Rain travel habit (${provLabel})`
          : undefined,
        basis: fact.key === 'rain_transport_preference'
          ? `Rain travel habit (${provLabel})`
          : fact.key === 'prep_buffer_minutes'
            ? `Buffer: ${fact.value ?? bufferMinutes} min (${provLabel})`
            : fact.key === 'prep_duration_minutes'
              ? `Prep: ${fact.value ?? prepMinutes} min (${provLabel})`
              : undefined,
        provenance: provStr,
        habitNote: fact.key === 'rain_transport_preference'
          ? (fact.value === 'bus_first' ? STRINGS.habit.rainTransit : STRINGS.habit.rainDrive)
          : undefined,
        description: fact.key === 'rain_transport_preference'
          ? (fact.value === 'bus_first' ? STRINGS.memory.rainTransitValue : STRINGS.memory.rainDriveValue)
          : fact.key === 'prep_buffer_minutes'
            ? `${fact.value ?? bufferMinutes} min`
            : fact.key === 'prep_duration_minutes'
              ? `${fact.value ?? prepMinutes} min`
              : undefined,
      },
    });
  }

  if (overrideRecord) {
    records.push(overrideRecord);
  }

  const aliases = new Map<string, string>([
    ['cal-piano', calRecordId],
    ['weather-rain', weatherRecordId],
    ['travel-rain', travelRecordId],
    ['habit-rain-transport', habitRecordId],
    ['user-override', 'user_override_timing'],
    [`${travelRecordId}:drive`, 'eta-drive-piano'],
    [`${travelRecordId}:bus`, 'eta-bus-piano'],
    ['travel_estimate:2026-10-28T20:35:00.000Z:drive', 'eta-drive-piano'],
    ['travel_estimate:2026-10-28T20:35:00.000Z:bus', 'eta-bus-piano'],
  ]);

  return createEvidenceBundle('bundle-rain-d2', sceneClockIso, records, timezone, aliases);
}

export function createLunchEvidenceBundle(options?: {
  plan?: PreparedPlan;
  snapshot?: { asOf?: string; timezone?: string; signals?: readonly { kind: string; id?: string; issuedAt?: string; value?: unknown }[] } | null;
  sceneClockIso?: string;
  timezone?: string;
  isConfirmedTaste?: boolean;
  userConfirmedKeys?: ReadonlySet<string>;
  memory?: readonly (MemoryFact | FactLike)[];
  memoryFacts?: readonly (MemoryFact | FactLike)[];
}): EvidenceBundle {
  const sceneClockIso = options?.sceneClockIso ?? options?.snapshot?.asOf ?? '2026-10-28T19:10:00.000Z';
  const timezone = options?.timezone ?? options?.snapshot?.timezone ?? 'America/Los_Angeles';

  const recordMap = new Map<string, EvidenceRecord>();
  const habitId = 'taste_preference_lunch_cuisine';

  const aliases = new Map<string, string>([
    ['habit-taste-cuisine', habitId],
  ]);

  // Load POI records from the scene adapter's getEvidenceRecords()
  const evidenceRecords = mockPlaceAdapter.getEvidenceRecords(sceneClockIso);
  for (let idx = 0; idx < evidenceRecords.length; idx++) {
    const rec = evidenceRecords[idx]!;
    recordMap.set(rec.id, {
      id: rec.id,
      provider: rec.provider,
      kind: rec.kind,
      fetchedAt: rec.fetchedAt,
      provenance: rec.provenance,
      fields: {
        ...rec.fields,
        provenance: rec.provenance,
      },
    });
    aliases.set(`candidate-${idx}`, rec.id);
  }

  // Real signal ID from snapshot or default
  const mockPlacesSig = options?.snapshot?.signals?.find(s => s.kind === 'mock_places');
  const mockPlacesSigId =
    (mockPlacesSig as any)?.id ||
    (mockPlacesSig?.issuedAt ? `${mockPlacesSig.kind}:${mockPlacesSig.issuedAt}` : undefined) ||
    'mock_places:2026-10-28T19:10:00.000Z';

  recordMap.set(mockPlacesSigId, {
    id: mockPlacesSigId,
    provider: 'mock-place-adapter',
    kind: 'poi',
    fetchedAt: sceneClockIso,
    provenance: 'simulated',
    fields: {
      count: evidenceRecords.length,
    },
  });

  const locSig = options?.snapshot?.signals?.find(s => s.kind === 'location_status');
  const locSigId =
    (locSig as any)?.id ||
    (locSig?.issuedAt ? `${locSig.kind}:${locSig.issuedAt}` : undefined) ||
    'location_status:2026-10-28T19:10:00.000Z';

  recordMap.set(locSigId, {
    id: locSigId,
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

  recordMap.set('loc-lunch-origin', {
    id: 'loc-lunch-origin',
    provider: 'location',
    kind: 'poi',
    fetchedAt: sceneClockIso,
    provenance: 'simulated',
    fields: {
      name: 'Lunch locations near you',
      area: 'Downtown',
    },
  });

  const schedSig =
    options?.snapshot?.signals?.find(s => s.kind === 'schedule_window') ??
    options?.plan?.why?.evidenceSignals?.find(s => s.kind === 'schedule_window');

  if (schedSig) {
    const windowStartIso = (schedSig as any)?.value?.windowStart || schedSig.issuedAt;
    const freeUntilIso = (schedSig as any)?.value?.freeUntil || (schedSig as any)?.value?.until;
    const windowStart = windowStartIso ? formatTime(windowStartIso, timezone) : undefined;
    const freeUntil = freeUntilIso ? formatTime(freeUntilIso, timezone) : undefined;

    if (windowStart && freeUntil) {
      recordMap.set('schedule_window', {
        id: 'schedule_window',
        provider: 'calendar',
        kind: 'calendar',
        fetchedAt: sceneClockIso,
        provenance: 'simulated',
        fields: {
          windowStart,
          freeUntil,
          lunchWindow: `Lunch window ${windowStart}–${freeUntil}`,
        },
      });
      aliases.set('sched-lunch-window', 'schedule_window');
    }
  }

  // Habit / taste preference record(s) dynamically built from MemoryPort / combinedMemory facts passed in
  const memoryFacts = options?.memory ?? options?.memoryFacts;
  if (Array.isArray(memoryFacts) && memoryFacts.length > 0) {
    const tasteFacts = memoryFacts.filter(
      f =>
        f.key.toLowerCase().includes('taste') ||
        f.key.toLowerCase().includes('cuisine') ||
        f.key.toLowerCase().includes('food')
    );
    for (const fact of tasteFacts) {
      const valStr = typeof fact.value === 'string' ? fact.value : String(fact.value ?? '');
      const cuisineStr = valStr ? valStr.charAt(0).toUpperCase() + valStr.slice(1) : '';
      const factKind = classifyFactSource(fact, options?.userConfirmedKeys, memoryFacts);
      const isConfirmed = factKind === 'user_confirmed';
      const provStr: EvidenceProvenance = isConfirmed ? 'confirmed' : 'sample';
      const provLabel = isConfirmed ? 'You confirmed' : 'Demo profile · sample';

      recordMap.set(fact.key, {
        id: fact.key,
        provider: 'memory',
        kind: 'habit',
        fetchedAt: sceneClockIso,
        provenance: provStr,
        fields: {
          key: fact.key,
          value: valStr,
          cuisine: cuisineStr,
          provenance: provStr,
          description: fact.key === 'taste_preference' && valStr === 'ramen_or_salad' ? 'You like ramen or salad' : cuisineStr,
          basis: `Based on taste: ${cuisineStr} (${provLabel})`,
        },
      });
      aliases.set(`habit-${fact.key}`, fact.key);
      aliases.set(fact.key, fact.key);
    }
    // Alias taste_preference_lunch_cuisine and habit-taste-cuisine to favorite_cuisine or primary taste fact
    const primaryTaste =
      tasteFacts.find(f => f.key === 'favorite_cuisine') ||
      tasteFacts.find(f => f.key === 'taste_preference') ||
      tasteFacts[0];
    if (primaryTaste) {
      aliases.set(habitId, primaryTaste.key);
      aliases.set('habit-taste-cuisine', primaryTaste.key);
    }
  } else {
    // Fallback when no memory facts provided (e.g. tests without memory)
    const isConfirmed = options?.userConfirmedKeys
      ? options.userConfirmedKeys.has(habitId) || options.userConfirmedKeys.has('taste_preference') || options.userConfirmedKeys.has('favorite_cuisine')
      : (options?.isConfirmedTaste ?? false);
    const provStr: EvidenceProvenance = isConfirmed ? 'confirmed' : 'sample';
    const provLabel = isConfirmed ? 'You confirmed' : 'Demo profile · sample';

    recordMap.set(habitId, {
      id: habitId,
      provider: 'memory',
      kind: 'habit',
      fetchedAt: sceneClockIso,
      provenance: provStr,
      fields: {
        key: habitId,
        value: 'japanese',
        cuisine: 'Japanese',
        provenance: provStr,
        description: 'Japanese',
        basis: `Based on taste: Japanese (${provLabel})`,
      },
    });
    aliases.set('habit-taste-cuisine', habitId);
  }

  return createEvidenceBundle('bundle-lunch-d3', sceneClockIso, [...recordMap.values()], timezone, aliases);
}

export function createFuelEvidenceBundle(options?: {
  places?: readonly PlaceItem[];
  snapshot?: { asOf?: string; timezone?: string; signals?: readonly { kind: string; id?: string; issuedAt?: string; value?: unknown }[] } | null;
  sceneClockIso?: string;
  timezone?: string;
  originCoords?: { lat: number; lng: number };
}): EvidenceBundle {
  const sceneClockIso = options?.sceneClockIso ?? options?.snapshot?.asOf ?? '2026-10-28T19:10:00.000Z';
  const timezone = options?.timezone ?? options?.snapshot?.timezone ?? 'America/Los_Angeles';

  // Resolve origin coordinates strictly from options or snapshot (no literal SF fallback)
  const locSig = options?.snapshot?.signals?.find(s => s.kind === 'location_status' || s.kind === 'location');
  const locVal = locSig?.value as any;
  const originCoords =
    options?.originCoords ??
    (typeof locVal?.lat === 'number' && typeof locVal?.lng === 'number'
      ? { lat: locVal.lat, lng: locVal.lng }
      : undefined);

  const recordMap = new Map<string, EvidenceRecord>();
  const aliases = new Map<string, string>();

  // Resolve PlaceItems strictly from options.places or snapshot places_fuel signal (never self-ground from plan)
  let placesList: readonly PlaceItem[] = options?.places ?? [];
  if (placesList.length === 0 && options?.snapshot?.signals) {
    const placesSig = options.snapshot.signals.find(s => s.kind === 'places_fuel');
    if (placesSig && typeof placesSig.value === 'object' && placesSig.value !== null) {
      const pVal = placesSig.value as any;
      if (Array.isArray(pVal.places)) {
        placesList = pVal.places;
      }
    }
  }

  for (const place of placesList) {
    const pid = place.id || place.placeId;
    const distMeters = place.straightLineDistanceMeters ?? place.distanceMeters;
    const distLabel =
      place.straightLineDistanceLabel ??
      (distMeters !== undefined ? formatStraightLineDistance(distMeters) : undefined);

    recordMap.set(pid, {
      id: pid,
      provider: 'simulated-places',
      kind: 'poi',
      fetchedAt: sceneClockIso,
      provenance: 'simulated',
      fields: {
        id: pid,
        name: place.name,
        coords: place.coords,
        lat: place.coords.lat,
        lng: place.coords.lng,
        category: place.category,
        address: place.address,
        brand: place.brand,
        distanceMeters: distMeters,
        straightLineDistance: distLabel,
        straightLineDistanceLabel: distLabel,
        provenance: 'simulated',
        straight_line: true,
      },
    });
    aliases.set(place.name.toLowerCase(), pid);
    aliases.set(`candidate-${recordMap.size - 1}`, pid);
  }

  // Location record (only when originCoords exists)
  if (originCoords) {
    const locRecordId = 'loc-fuel-origin';
    recordMap.set(locRecordId, {
      id: locRecordId,
      provider: 'location-port',
      kind: 'poi',
      fetchedAt: sceneClockIso,
      provenance: 'simulated',
      fields: {
        lat: originCoords.lat,
        lng: originCoords.lng,
        status: locVal?.status || 'available',
      },
    });
  }

  // Vehicle fuel signal / status (only when fuel signal actually exists with a number)
  const fuelSig = options?.snapshot?.signals?.find(
    s => s.kind === 'fuel_percent' || s.kind === 'fuel_status' || s.kind === 'vehicle_fuel'
  );
  if (fuelSig && fuelSig.value !== undefined && fuelSig.value !== null) {
    const fuelVal = fuelSig.value as any;
    const fuelPercent = typeof fuelVal === 'number' ? fuelVal : fuelVal?.fuelPercent;
    if (typeof fuelPercent === 'number') {
      recordMap.set('fuel_status', {
        id: 'fuel_status',
        provider: 'vehicle',
        kind: 'poi',
        fetchedAt: sceneClockIso,
        provenance: 'simulated',
        fields: {
          fuelPercent,
          needsFuel: fuelPercent <= 25,
          status: `Fuel level ${fuelPercent}%${fuelPercent <= 25 ? ' (low)' : ''}`,
        },
      });
    }
  }

  return createEvidenceBundle('bundle-fuel-v5', sceneClockIso, [...recordMap.values()], timezone, aliases);
}

export function createLunchPlacesEvidenceBundle(options?: {
  places?: readonly PlaceItem[];
  snapshot?: { asOf?: string; timezone?: string; signals?: readonly { kind: string; id?: string; issuedAt?: string; value?: unknown }[] } | null;
  sceneClockIso?: string;
  timezone?: string;
  originCoords?: { lat: number; lng: number };
  userConfirmedKeys?: ReadonlySet<string>;
  isConfirmedTaste?: boolean;
  memory?: readonly (MemoryFact | FactLike)[];
  memoryFacts?: readonly (MemoryFact | FactLike)[];
}): EvidenceBundle {
  const sceneClockIso = options?.sceneClockIso ?? options?.snapshot?.asOf ?? '2026-10-28T19:10:00.000Z';
  const timezone = options?.timezone ?? options?.snapshot?.timezone ?? 'America/Los_Angeles';

  const locSig = options?.snapshot?.signals?.find(s => s.kind === 'location_status' || s.kind === 'location');
  const locVal = locSig?.value as any;
  const originCoords =
    options?.originCoords ??
    (typeof locVal?.lat === 'number' && typeof locVal?.lng === 'number'
      ? { lat: locVal.lat, lng: locVal.lng }
      : undefined);

  const recordMap = new Map<string, EvidenceRecord>();
  const aliases = new Map<string, string>();

  // Resolve PlaceItems strictly from options.places or snapshot places_lunch signal (never self-ground from plan)
  let placesList: readonly PlaceItem[] = options?.places ?? [];
  if (placesList.length === 0 && options?.snapshot?.signals) {
    const placesSig = options.snapshot.signals.find(s => s.kind === 'places_lunch');
    if (placesSig && typeof placesSig.value === 'object' && placesSig.value !== null) {
      const pVal = placesSig.value as any;
      if (Array.isArray(pVal.places)) {
        placesList = pVal.places;
      }
    }
  }

  for (const place of placesList) {
    const pid = place.id || place.placeId;
    const distMeters = place.straightLineDistanceMeters ?? place.distanceMeters;
    const distLabel =
      place.straightLineDistanceLabel ??
      (distMeters !== undefined ? formatStraightLineDistance(distMeters) : undefined);
    const cuisine = place.cuisine
      ? place.cuisine.charAt(0).toUpperCase() + place.cuisine.slice(1)
      : 'Dining';

    recordMap.set(pid, {
      id: pid,
      provider: 'simulated-places',
      kind: 'poi',
      fetchedAt: sceneClockIso,
      provenance: 'simulated',
      fields: {
        id: pid,
        name: place.name,
        coords: place.coords,
        lat: place.coords.lat,
        lng: place.coords.lng,
        category: place.category,
        address: place.address,
        brand: place.brand,
        cuisine,
        noiseLevel: place.noiseLevel,
        vegetarian: place.vegetarian,
        distanceMeters: distMeters,
        straightLineDistance: distLabel,
        straightLineDistanceLabel: distLabel,
        provenance: 'simulated',
        straight_line: true,
      },
    });
    aliases.set(place.name.toLowerCase(), pid);
    aliases.set(`candidate-${recordMap.size - 1}`, pid);
  }

  // Location record (only when originCoords exists)
  if (originCoords) {
    const locRecordId = 'loc-lunch-origin';
    recordMap.set(locRecordId, {
      id: locRecordId,
      provider: 'location-port',
      kind: 'poi',
      fetchedAt: sceneClockIso,
      provenance: 'simulated',
      fields: {
        lat: originCoords.lat,
        lng: originCoords.lng,
        status: locVal?.status || 'available',
        name: 'Selected City (simulated)',
      },
    });
  }

  // Schedule window
  const schedSig = options?.snapshot?.signals?.find(s => s.kind === 'schedule_window');
  if (schedSig) {
    const windowStartIso = (schedSig as any)?.value?.windowStart || schedSig.issuedAt;
    const freeUntilIso = (schedSig as any)?.value?.freeUntil || (schedSig as any)?.value?.until;
    const windowStart = windowStartIso ? formatTime(windowStartIso, timezone) : undefined;
    const freeUntil = freeUntilIso ? formatTime(freeUntilIso, timezone) : undefined;
    if (windowStart && freeUntil) {
      recordMap.set('schedule_window', {
        id: 'schedule_window',
        provider: 'calendar',
        kind: 'calendar',
        fetchedAt: sceneClockIso,
        provenance: 'simulated',
        fields: {
          windowStart,
          freeUntil,
          lunchWindow: `Lunch window ${windowStart}–${freeUntil}`,
        },
      });
      aliases.set('sched-lunch-window', 'schedule_window');
    }
  }

  // Habit / taste preference record(s) dynamically built from MemoryPort / combinedMemory facts passed in
  const memoryFacts = options?.memory ?? options?.memoryFacts;
  if (Array.isArray(memoryFacts) && memoryFacts.length > 0) {
    const tasteFacts = memoryFacts.filter(
      f =>
        f.key.toLowerCase().includes('taste') ||
        f.key.toLowerCase().includes('cuisine') ||
        f.key.toLowerCase().includes('food')
    );
    for (const fact of tasteFacts) {
      const valStr = typeof fact.value === 'string' ? fact.value : String(fact.value ?? '');
      const cuisineStr = valStr ? valStr.charAt(0).toUpperCase() + valStr.slice(1) : '';
      const factKind = classifyFactSource(fact, options?.userConfirmedKeys, memoryFacts);
      const isConfirmed = factKind === 'user_confirmed';
      const provStr = isConfirmed ? 'confirmed' : 'sample';
      const provLabel = isConfirmed ? 'You confirmed' : 'Demo profile · sample';

      recordMap.set(fact.key, {
        id: fact.key,
        provider: 'memory',
        kind: 'habit',
        fetchedAt: sceneClockIso,
        provenance: provStr,
        fields: {
          key: fact.key,
          value: valStr,
          cuisine: cuisineStr,
          description: fact.key === 'taste_preference' && valStr === 'ramen_or_salad' ? 'You like ramen or salad' : cuisineStr,
          provenance: provStr,
          basis: `Based on taste: ${cuisineStr} (${provLabel})`,
        },
      });
      aliases.set(`habit-${fact.key}`, fact.key);
      aliases.set('taste_preference_lunch_cuisine', fact.key);
      aliases.set('habit-taste-cuisine', fact.key);
    }
  }

  return createEvidenceBundle('bundle-lunch-places', sceneClockIso, [...recordMap.values()], timezone, aliases);
}


