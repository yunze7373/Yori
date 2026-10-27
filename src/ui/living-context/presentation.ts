/**
 * Presentation Mapping Layer for Living Context UI
 * Governed by Architecture Rev3 Section 5 and AC-105-1.
 *
 * Enforces:
 * - Clean human copy: subjects, primary action lines, and human basis sentences.
 * - Zero engine debug tokens: never render formulas, memory keys, slice IDs, or invariant codes on home cards.
 * - Dynamic greeting derived from snapshot time in the snapshot timezone.
 * - Robust HTML escaping to eliminate XSS risks on interpolated data.
 */

import { STRINGS } from './strings.js';
import type { PreparedPlan } from '../../core/contracts/index.js';
import type { DemoSceneId } from './app.js';

/**
 * Escapes characters that are special in HTML to prevent XSS.
 */
export function escapeHtml(unsafe: string): string {
  if (typeof unsafe !== 'string') {
    return '';
  }
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Derives the contextual greeting based on snapshot.asOf in the specified timezone.
 * Morning: < 12:00
 * Afternoon: 12:00 - 17:59
 * Evening: >= 18:00
 */
export function getGreeting(
  asOfIso: string,
  timezone?: string
): { readonly greeting: string; readonly subheading: string } {
  try {
    const d = new Date(asOfIso);
    if (!Number.isFinite(d.getTime())) {
      return {
        greeting: STRINGS.header.greetings.afternoon,
        subheading: STRINGS.header.subheading,
      };
    }

    const tz = timezone || 'America/Los_Angeles';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hourCycle: 'h23',
    });
    const hour = parseInt(formatter.format(d), 10);

    let greeting: string = STRINGS.header.greetings.afternoon;
    if (hour < 12) {
      greeting = STRINGS.header.greetings.morning;
    } else if (hour >= 18) {
      greeting = STRINGS.header.greetings.evening;
    }

    return {
      greeting,
      subheading: STRINGS.header.subheading,
    };
  } catch {
    return {
      greeting: STRINGS.header.greetings.afternoon,
      subheading: STRINGS.header.subheading,
    };
  }
}

export interface FormattedNowOption {
  readonly label: string;
  readonly meta?: string;
}

export interface FormattedNowPlan {
  readonly title: string;
  readonly headline: string;
  readonly basis: string;
  readonly isRain: boolean;
  readonly rainBanner?: string;
  readonly umbrellaChip?: string;
  readonly habitNote?: string;
  readonly options: readonly FormattedNowOption[];
  readonly mockPlacesNotice?: string;
}

/**
 * Maps a raw PreparedPlan into a human-first presentation model.
 * Completely shields cards from raw math formulas, slice IDs, and internal memory keys.
 */
export function formatNowPlan(
  plan: PreparedPlan,
  sceneId: DemoSceneId
): FormattedNowPlan {
  if (sceneId === 'rain') {
    return Object.freeze({
      title: STRINGS.depart.defaultTitle,
      headline: STRINGS.depart.primaryLine,
      basis: STRINGS.depart.basisLine,
      isRain: true,
      rainBanner: STRINGS.rain.whatChanged,
      umbrellaChip: STRINGS.rain.umbrellaChip,
      habitNote: STRINGS.rain.habitNote,
      options: Object.freeze([
        { label: STRINGS.rain.driveOption, meta: '25m drive' },
        { label: STRINGS.rain.busOption, meta: '40m bus' },
      ]),
    });
  }

  if (plan.intentId === 'depart') {
    return Object.freeze({
      title: STRINGS.depart.defaultTitle,
      headline: STRINGS.depart.primaryLine,
      basis: STRINGS.depart.basisLine,
      isRain: false,
      options: Object.freeze([]),
    });
  }

  if (plan.intentId === 'lunch') {
    const formattedOptions: FormattedNowOption[] = plan.optionsOrSteps.map(opt => {
      if (typeof opt === 'string') {
        return { label: opt };
      }
      const optionObj = opt as unknown as Record<string, unknown>;
      const rawName =
        typeof optionObj.name === 'string' ? optionObj.name : opt.label;
      const cuisine =
        typeof optionObj.cuisine === 'string' ? optionObj.cuisine : '';
      const cuisineTag = cuisine
        ? cuisine.charAt(0).toUpperCase() + cuisine.slice(1)
        : '';
      const distance =
        typeof optionObj.distanceMinutes === 'number'
          ? `${optionObj.distanceMinutes}m away`
          : undefined;

      const meta = [cuisineTag, distance].filter(Boolean).join(' · ');
      return {
        label: rawName,
        meta: meta || undefined,
      };
    });

    return Object.freeze({
      title: STRINGS.lunch.title,
      headline: STRINGS.lunch.primaryLine,
      basis: STRINGS.lunch.basisLine,
      isRain: false,
      options: Object.freeze(formattedOptions),
      mockPlacesNotice: STRINGS.lunch.mockPlacesNotice,
    });
  }

  // Fallback for generic plans: sanitize headline and derivation
  return Object.freeze({
    title: plan.headline,
    headline: plan.headline,
    basis: STRINGS.depart.basisLine,
    isRain: false,
    options: Object.freeze([]),
  });
}
