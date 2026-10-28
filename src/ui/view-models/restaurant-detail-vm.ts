/**
 * Restaurant Detail View Model Derivation (LIVING_CONTEXT_V2.md §8 D1)
 *
 * Rules:
 * - Opened from a lunch candidate card.
 * - Local labelled SVG illustration (zero remote images).
 * - Fixture attribute chips only (cuisine, distance; no fake reviews/stars).
 * - Save button is UI state only (never writes to memory facts).
 * - In-app Directions shows schematic route only (never opens external maps or URLs).
 * - Honest provenance for taste basis (sample vs confirmed).
 */

import type { PreparedPlan, PlanOption, SpatialMapEvidence } from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import { getLocalIllustration } from './photo-vm.js';
import { classifyFactSource } from './provenance.js';
import { deriveMapVM } from './map-vm.js';
import {
  GroundedRecommendationVerifier,
  createLunchEvidenceBundle,
  buildNavigateUrl,
  type EvidenceBundle,
  type SourceRef,
} from './grounding.js';
import type { RestaurantDetailVM, RestaurantDirectionStepVM } from './types.js';

export interface DeriveRestaurantDetailOptions {
  candidateId: string;
  plan: PreparedPlan;
  spatialEvidence: SpatialMapEvidence | null;
  isSaved?: boolean;
  userConfirmedKeys?: ReadonlySet<string>;
  snapshot?: {
    signals: readonly { kind: string; value?: unknown; issuedAt?: string }[];
    timezone?: string;
  } | null;
  timezone?: string;
  evidenceBundle?: EvidenceBundle;
}

export function deriveRestaurantDetailVM(options: DeriveRestaurantDetailOptions): RestaurantDetailVM {
  const {
    candidateId,
    plan,
    spatialEvidence,
    isSaved = false,
    userConfirmedKeys,
    snapshot,
    timezone,
    evidenceBundle,
  } = options;

  const bundle =
    evidenceBundle ??
    createLunchEvidenceBundle({
      plan,
      timezone: timezone ?? plan.timezone ?? snapshot?.timezone ?? 'America/Los_Angeles',
      isConfirmedTaste: userConfirmedKeys?.has('taste_preference_lunch_cuisine'),
    });

  // Locate the target candidate option in plan.optionsOrSteps
  let targetOpt: PlanOption | undefined;
  if (plan.optionsOrSteps) {
    for (const raw of plan.optionsOrSteps) {
      if (typeof raw !== 'string' && (raw as PlanOption).id === candidateId) {
        targetOpt = raw as PlanOption;
        break;
      }
    }
  }

  // Fallback to first option if not explicitly matched
  if (!targetOpt && plan.optionsOrSteps && plan.optionsOrSteps.length > 0) {
    const first = plan.optionsOrSteps[0];
    if (typeof first !== 'string') {
      targetOpt = first as PlanOption;
    }
  }

  const name = targetOpt?.name || targetOpt?.label || 'Restaurant Candidate';
  const cuisine = targetOpt?.cuisine
    ? targetOpt.cuisine.charAt(0).toUpperCase() + targetOpt.cuisine.slice(1)
    : 'Dining';
  const distanceMinutes =
    typeof targetOpt?.distanceMinutes === 'number' && Number.isFinite(targetOpt.distanceMinutes)
      ? targetOpt.distanceMinutes
      : undefined;
  const distanceText = distanceMinutes !== undefined ? `${distanceMinutes}m away` : undefined;

  // Local labelled SVG illustration
  const photo = getLocalIllustration(targetOpt?.cuisine || 'dining', name);

  // Derive lunch window from snapshot or plan signals (omit if absent)
  let lunchWindowText: string | undefined;
  const scheduleSig =
    snapshot?.signals?.find(s => s.kind === 'schedule_window') ??
    plan.why?.evidenceSignals?.find(s => s.kind === 'schedule_window');

  // Format with snapshot or scene timezone, falling back to plan's (omit if neither exists)
  const tz = timezone ?? snapshot?.timezone ?? plan.timezone;

  if (tz && scheduleSig) {
    const val = (scheduleSig as { value?: unknown }).value as Record<string, unknown> | undefined;
    const freeUntil = (val?.freeUntil as string | undefined) ?? (val?.until as string | undefined);
    const start =
      (val?.windowStart as string | undefined) ??
      (val?.freeFrom as string | undefined) ??
      (scheduleSig as { issuedAt?: string }).issuedAt;

    if (freeUntil) {
      const freeUntilFormatted = formatTime(freeUntil, tz);
      if (start) {
        const startFormatted = formatTime(start, tz);
        if (startFormatted && freeUntilFormatted) {
          lunchWindowText = `Lunch window ${startFormatted}–${freeUntilFormatted}`;
        } else if (freeUntilFormatted) {
          lunchWindowText = `Lunch window until ${freeUntilFormatted}`;
        }
      } else if (freeUntilFormatted) {
        lunchWindowText = `Lunch window until ${freeUntilFormatted}`;
      }
    }
  }

  // Fixture attribute chips only (cuisine, distance, lunch window if present; quiet, vegetarian)
  const attributeChips: string[] = [cuisine];
  if (distanceText) {
    attributeChips.push(distanceText);
  }
  if (lunchWindowText) {
    attributeChips.push(lunchWindowText);
  }
  const noiseLevel = (targetOpt as any)?.noiseLevel;
  if (noiseLevel === 'quiet') {
    attributeChips.push('Quiet');
  } else if (noiseLevel === 'moderate') {
    attributeChips.push('Moderate noise');
  } else if (noiseLevel === 'lively') {
    attributeChips.push('Lively');
  }
  if ((targetOpt as any)?.vegetarian) {
    attributeChips.push('Vegetarian');
  }

  // Taste preference basis with honest provenance
  const tasteFact = plan.why?.memoryFactsUsed?.find(
    f => f.key.includes('taste') || f.key.includes('cuisine')
  );
  const isConfirmed = tasteFact
    ? classifyFactSource(tasteFact, userConfirmedKeys) === 'user_confirmed'
    : false;
  const provenance = isConfirmed ? 'You confirmed' : 'Demo profile · sample';
  const basis = `Based on taste: ${cuisine} (${provenance})`;

  // Compact schematic map
  const map = deriveMapVM(plan, spatialEvidence, 'compact')!;

  // In-app schematic walk directions strictly from fixture data (zero invented street names)
  const walkDesc =
    distanceMinutes !== undefined
      ? `About ${distanceMinutes} min walk · simulated route`
      : 'Simulated route';

  const directions: RestaurantDirectionStepVM[] = [
    {
      id: 'step-dir-1',
      instruction: 'Start from your current location',
      durationText: walkDesc,
    },
    {
      id: 'step-dir-2',
      instruction: `Follow schematic pedestrian route toward ${name}`,
    },
    {
      id: 'step-dir-3',
      instruction: `Arrive at ${name}`,
      isFinal: true,
    },
  ];

  const placeRecId = candidateId;
  const sourceRef: SourceRef = { recordId: placeRecId, field: 'name' };
  const fieldSourceRefs: Record<string, SourceRef> = {
    name: { recordId: placeRecId, field: 'name' },
    cuisine: { recordId: placeRecId, field: 'cuisine' },
  };
  if (distanceMinutes !== undefined) {
    fieldSourceRefs.distanceMinutes = { recordId: placeRecId, field: 'distanceMinutes' };
  }

  let verifiedName = name;
  let verifiedDistanceText = distanceText;

  if (bundle) {
    const verification = GroundedRecommendationVerifier.verifyCandidateCard(
      {
        id: candidateId,
        name,
        cuisine,
        distanceMinutes,
        distanceText,
        sourceRef,
        fieldSourceRefs,
      },
      bundle
    );
    if (!verification.valid) {
      if (verification.reason === 'tampered_value') {
        if (verification.field === 'name') verifiedName = 'unknown';
        if (verification.field === 'distanceMinutes' && distanceText !== undefined) {
          verifiedDistanceText = 'unknown';
        }
      } else {
        verifiedName = 'unknown';
        if (distanceText !== undefined) {
          verifiedDistanceText = 'unknown';
        }
      }
    }
  }

  const navigateUrl = bundle
    ? buildNavigateUrl(
        {
          id: candidateId,
          name: verifiedName,
          cuisine,
          distanceMinutes,
          distanceText: verifiedDistanceText,
          sourceRef,
          fieldSourceRefs,
        },
        bundle
      )
    : undefined;

  return {
    id: candidateId,
    name: verifiedName,
    cuisine,
    distanceMinutes,
    distanceText: verifiedDistanceText,
    photo,
    attributeChips: Object.freeze(attributeChips),
    basis,
    map,
    isSaved,
    directions: Object.freeze(directions),
    simulatedNotice: 'Demonstration place · simulated context',
    navigateUrl,
    evidenceBundle: bundle,
    sourceRef,
    fieldSourceRefs,
  };
}
