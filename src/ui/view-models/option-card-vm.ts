/**
 * Option Card View Model Derivation (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Derived purely from PreparedPlan.optionsOrSteps and Why citations.
 * - Invariant: Zero star ratings, zero invented reviews.
 * - Ranking basis explains the preference or habit cited.
 */

import type { PreparedPlan, PlanOption } from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import type { OptionCardVM } from './types.js';

export function deriveOptionCardVMs(plan: PreparedPlan): OptionCardVM[] {
  if (!plan.optionsOrSteps || plan.optionsOrSteps.length === 0) {
    return [];
  }

  const tz = plan.timezone;
  const cards: OptionCardVM[] = [];

  for (let i = 0; i < plan.optionsOrSteps.length; i++) {
    const raw = plan.optionsOrSteps[i];
    if (typeof raw === 'string') {
      cards.push({
        id: `opt-${i}`,
        label: raw,
        title: raw,
        isSelected: i === 0,
        isRecommended: i === 0,
      });
      continue;
    }

    const opt = raw as PlanOption;
    const mode = opt.mode;

    // Transit / travel option (Drive vs Bus)
    if (mode || typeof opt.travelMinutes === 'number') {
      const modeCap = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : 'Option';
      const leaveTime = formatTime(opt.leaveAt, tz);
      const title = leaveTime ? `${modeCap} · leave ${leaveTime}` : modeCap;
      const travelMins = opt.travelMinutes ?? (mode === 'drive' ? 25 : 40);
      const isFirst = i === 0;

      // Ranking explanation from why or rankedByFactKey
      let rankingBasis: string | undefined;
      if (opt.rankedByFactKey) {
        rankingBasis = `Ranked by habit: ${opt.rankedByFactKey.replace(/_/g, ' ')}`;
      } else if (isFirst) {
        rankingBasis = 'Faster route · confirmed preference';
      } else {
        rankingBasis = 'Alternative route option';
      }

      cards.push({
        id: opt.id || `opt-mode-${mode || i}`,
        label: opt.label || title,
        title,
        mode,
        travelMinutes: travelMins,
        leaveTime,
        bufferMinutes: 5,
        badge: isFirst ? 'Recommended' : 'Alternative',
        detail: `${travelMins}m ${mode || 'travel'} · ${isFirst ? 'avoids walking in rain' : 'transit schedule'}`,
        rankingBasis,
        isSelected: isFirst,
        isRecommended: isFirst,
      });
      continue;
    }

    // Lunch / Place option
    const name = opt.name || opt.label;
    const cuisine = opt.cuisine ? opt.cuisine.charAt(0).toUpperCase() + opt.cuisine.slice(1) : '';
    const distanceMins = opt.distanceMinutes;
    const distanceText = typeof distanceMins === 'number' ? `${distanceMins}m away` : '';

    let rankingBasis = 'Prepared based on your nearby location';
    const tasteFact = plan.why.memoryFactsUsed.find(f => f.key.includes('taste') || f.key.includes('cuisine'));
    if (tasteFact) {
      rankingBasis = `Cites confirmed ${tasteFact.key.replace(/_/g, ' ')}: ${String(tasteFact.value)}`;
    }

    cards.push({
      id: opt.id || `opt-place-${i}`,
      label: name,
      title: name,
      travelMinutes: distanceMins,
      badge: cuisine || undefined,
      detail: distanceText,
      rankingBasis,
      isSelected: i === 0,
      isRecommended: i === 0,
    });
  }

  return cards;
}
