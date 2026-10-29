/**
 * Option Card View Model Derivation (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Derived purely from PreparedPlan.optionsOrSteps and Why citations.
 * - Invariant: Zero star ratings, zero invented reviews.
 * - Ranking basis explains the preference or habit cited with honest provenance (sample vs confirmed).
 * - Show option details only from plan fields (mode, travelMinutes, bufferMinutes); zero invented rationales.
 * - Do not render plain step strings as option cards when timeline already shows them.
 */

import type { PreparedPlan, PlanOption } from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import { humanizeMemoryKey } from '../review/why-sheet.js';
import type { OptionCardVM } from './types.js';
import {
  GroundedRecommendationVerifier,
  type EvidenceBundle,
  type SourceRef,
} from './grounding.js';

export function deriveOptionCardVMs(
  plan: PreparedPlan,
  userConfirmedKeys?: ReadonlySet<string>,
  bundle?: EvidenceBundle
): OptionCardVM[] {
  if (!plan.optionsOrSteps || plan.optionsOrSteps.length === 0) {
    return [];
  }

  // If this is a depart plan and optionsOrSteps only contains plain step strings
  // or non-mode step objects, do NOT render them as option cards because the timeline already displays them
  if (plan.intentId === 'depart') {
    const hasTransitModes = plan.optionsOrSteps.some(
      opt => typeof opt !== 'string' && typeof (opt as PlanOption).mode === 'string'
    );
    if (!hasTransitModes) {
      return [];
    }
  }

  const tz = plan.timezone;
  const cards: OptionCardVM[] = [];

  // Extract buffer minutes from memory facts
  const bufferFact = plan.why?.memoryFactsUsed?.find(f => f.key === 'prep_buffer_minutes');
  const bufferMinutes =
    typeof bufferFact?.value === 'number' && Number.isFinite(bufferFact.value)
      ? bufferFact.value
      : undefined;

  for (let i = 0; i < plan.optionsOrSteps.length; i++) {
    const raw = plan.optionsOrSteps[i];
    if (typeof raw === 'string') {
      continue;
    }

    const opt = raw as PlanOption;
    const mode = opt.mode;

    // Transit / travel option (Drive vs Bus)
    if (mode || typeof opt.travelMinutes === 'number') {
      const modeCap = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Option';
      const leaveTime = formatTime(opt.leaveAt, tz);
      const travelMins = opt.travelMinutes;
      const isFirst = i === 0;

      const modeKey = (mode || (isFirst ? 'drive' : 'bus')).toLowerCase();
      const recId = modeKey === 'drive' ? 'eta-drive-piano' : 'eta-bus-piano';
      const hasOverride =
        bundle?.hasRecord('user_override_timing') ||
        plan.why?.evidenceSignals?.some(s => s.kind === 'user_request');
      const leaveRecId = hasOverride ? 'user_override_timing' : recId;
      const leaveField = hasOverride ? `${modeKey}LeaveTime` : 'leaveTime';

      let displayLeaveTime = leaveTime;
      if (bundle && leaveTime) {
        let vLeave = GroundedRecommendationVerifier.verifyField(
          { recordId: leaveRecId, field: leaveField },
          leaveTime,
          bundle
        );
        if (!vLeave.valid && hasOverride) {
          vLeave = GroundedRecommendationVerifier.verifyField(
            { recordId: leaveRecId, field: 'leaveTime' },
            leaveTime,
            bundle
          );
        }
        if (!vLeave.valid) {
          displayLeaveTime = 'unknown';
        }
      }
      const title = displayLeaveTime ? `${modeCap} · leave ${displayLeaveTime}` : modeCap;

      // Ranking explanation with provenance (demo profile vs user confirmed)
      let rankingBasis: string | undefined;
      if (opt.rankedByFactKey) {
        const humanKey = humanizeMemoryKey(opt.rankedByFactKey);
        const isConfirmed = userConfirmedKeys?.has(opt.rankedByFactKey) ?? false;
        const provenance = isConfirmed ? 'You confirmed' : 'Demo profile · sample';
        rankingBasis = `Ranked by habit: ${humanKey} (${provenance})`;
      } else if (isFirst) {
        rankingBasis = 'Recommended route';
      } else {
        rankingBasis = 'Alternative route';
      }

      // Detail derived purely from plan fields (mode, travelMinutes, bufferMinutes)
      let detail = opt.details;
      if (!detail) {
        const parts: string[] = [];
        if (travelMins !== undefined) {
          parts.push(`${travelMins}m ${mode || 'travel'}`);
        }
        if (bufferMinutes !== undefined) {
          parts.push(`${bufferMinutes}m buffer`);
        }
        detail = parts.join(' · ');
      }

      const sourceRef: SourceRef = { recordId: recId, field: 'mode' };
      const fieldSourceRefs: Record<string, SourceRef> = {
        mode: { recordId: recId, field: 'mode' },
        travelMinutes: { recordId: recId, field: 'travelMinutes' },
      };
      if (leaveTime) {
        fieldSourceRefs.leaveTime = { recordId: leaveRecId, field: leaveField };
      }
      if (bufferMinutes !== undefined) {
        fieldSourceRefs.bufferMinutes = { recordId: recId, field: 'bufferMinutes' };
      }
      if (opt.rankedByFactKey) {
        fieldSourceRefs.rankingBasis = { recordId: 'habit-rain-transport', field: 'rankingBasis' };
      }

      const card: OptionCardVM = {
        id: opt.id || `opt-mode-${mode || i}`,
        label: opt.label || title,
        title,
        mode,
        travelMinutes: travelMins,
        leaveTime: displayLeaveTime,
        bufferMinutes,
        badge: isFirst ? 'Recommended' : 'Alternative',
        detail: detail || undefined,
        rankingBasis,
        isSelected: isFirst,
        isRecommended: isFirst,
        sourceRef,
        fieldSourceRefs,
      };

      if (bundle) {
        const verification = GroundedRecommendationVerifier.verifyOptionCard(card, bundle);
        if (!verification.valid) {
          // Withhold the card if verification fails
          continue;
        }
      }

      cards.push(card);
      continue;
    }

    // Lunch / Place option
    const name = opt.name || opt.label;
    const cuisine = opt.cuisine ? opt.cuisine.charAt(0).toUpperCase() + opt.cuisine.slice(1) : '';
    const distanceMins = opt.distanceMinutes;
    const distanceText = typeof distanceMins === 'number' ? `${distanceMins}m away` : '';

    let rankingBasis: string | undefined;
    const tasteFact = plan.why?.memoryFactsUsed?.find(f => f.key.includes('taste') || f.key.includes('cuisine'));
    if (tasteFact) {
      const humanKey = humanizeMemoryKey(tasteFact.key);
      const isConfirmed = userConfirmedKeys?.has(tasteFact.key) ?? false;
      const provenance = isConfirmed ? 'You confirmed' : 'Demo profile · sample';
      rankingBasis = `Based on habit: ${humanKey} (${provenance})`;
    }

    const placeRecId = opt.id || `mock-place-${i + 1}`;
    const sourceRef: SourceRef = { recordId: placeRecId, field: 'name' };
    const fieldSourceRefs: Record<string, SourceRef> = {
      title: { recordId: placeRecId, field: 'name' },
      badge: { recordId: placeRecId, field: 'cuisine' },
    };
    if (typeof distanceMins === 'number') {
      fieldSourceRefs.travelMinutes = { recordId: placeRecId, field: 'distanceMinutes' };
    }

    const card: OptionCardVM = {
      id: opt.id || `opt-place-${i}`,
      label: name,
      title: name,
      travelMinutes: distanceMins,
      badge: cuisine || undefined,
      detail: distanceText || undefined,
      rankingBasis,
      isSelected: i === 0,
      isRecommended: i === 0,
      sourceRef,
      fieldSourceRefs,
    };

    if (bundle) {
      const verification = GroundedRecommendationVerifier.verifyOptionCard(card, bundle);
      if (!verification.valid) {
        // Withhold the card if verification fails
        continue;
      }
    }

    cards.push(card);
  }

  return cards;
}
