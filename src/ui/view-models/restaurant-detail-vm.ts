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
import { getLocalIllustration } from './photo-vm.js';
import { deriveMapVM } from './map-vm.js';
import type { RestaurantDetailVM, RestaurantDirectionStepVM } from './types.js';

export interface DeriveRestaurantDetailOptions {
  candidateId: string;
  plan: PreparedPlan;
  spatialEvidence: SpatialMapEvidence | null;
  isSaved?: boolean;
  userConfirmedKeys?: ReadonlySet<string>;
}

export function deriveRestaurantDetailVM(options: DeriveRestaurantDetailOptions): RestaurantDetailVM {
  const {
    candidateId,
    plan,
    spatialEvidence,
    isSaved = false,
    userConfirmedKeys,
  } = options;

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
  const distanceMinutes = targetOpt?.distanceMinutes ?? 5;
  const distanceText = `${distanceMinutes}m away`;

  // Local labelled SVG illustration
  const photo = getLocalIllustration(targetOpt?.cuisine || 'dining', name);

  // Fixture attribute chips only (cuisine, distance; quiet/vegetarian deferred to V2b)
  const attributeChips: string[] = [cuisine, distanceText, 'Lunch window 12:10–1:30'];

  // Taste preference basis with honest provenance
  const tasteFact = plan.why?.memoryFactsUsed?.find(
    f => f.key.includes('taste') || f.key.includes('cuisine')
  );
  const isConfirmed = tasteFact ? (userConfirmedKeys?.has(tasteFact.key) ?? false) : false;
  const provenance = isConfirmed ? 'You confirmed' : 'Demo profile · sample';
  const basis = `Based on taste: ${cuisine} (${provenance})`;

  // Compact schematic map
  const map = deriveMapVM(plan, spatialEvidence, 'compact')!;

  // In-app schematic walk directions (never external maps or URLs)
  const directions: RestaurantDirectionStepVM[] = [
    {
      id: 'step-dir-1',
      instruction: 'Head east on 4th Ave toward Pine St',
      durationText: '2 min',
    },
    {
      id: 'step-dir-2',
      instruction: `Turn left onto Pine St toward ${name}`,
      durationText: `${Math.max(1, distanceMinutes - 2)} min`,
    },
    {
      id: 'step-dir-3',
      instruction: `Arrive at ${name} on your right`,
      isFinal: true,
    },
  ];

  return {
    id: candidateId,
    name,
    cuisine,
    distanceMinutes,
    distanceText,
    photo,
    attributeChips: Object.freeze(attributeChips),
    basis,
    map,
    isSaved,
    directions: Object.freeze(directions),
    simulatedNotice: 'Demonstration place · simulated context',
  };
}
