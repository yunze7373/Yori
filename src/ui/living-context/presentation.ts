/**
 * Presentation Mapping Layer for Living Context UI
 * Governed by Architecture Rev3 Section 5 and AC-105-1.
 *
 * Enforces:
 * - Dynamic data formatting: renders strictly from PreparedPlan structured fields via Intl.
 * - Zero scene-id branching: formatting is pure and driven by plan contracts.
 * - Human copy: appointment subjects, primary action lines, and human basis sentences.
 * - Zero engine debug tokens: never render formulas, memory keys, slice IDs, or invariant codes on home cards.
 * - Dynamic greeting derived from snapshot time in the snapshot timezone.
 * - Robust HTML escaping to eliminate XSS risks on interpolated data.
 */

import { STRINGS } from './strings.js';
import type { PreparedPlan, PlanOption } from '../../core/contracts/index.js';

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
 * Formats an ISO date-time string into a localized 12-hour time (e.g. "2:05 PM").
 */
export function formatTime(isoString: string | undefined, timeZone?: string): string {
  if (!isoString) {
    return '';
  }
  const d = new Date(isoString);
  if (!Number.isFinite(d.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone } : {}),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
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

    const formatter = new Intl.DateTimeFormat('en-US', {
      ...(timezone ? { timeZone: timezone } : {}),
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
 * Maps a raw PreparedPlan into a human-first presentation model purely from plan data.
 * Zero scene-id branching.
 */
export function formatNowPlan(plan: PreparedPlan): FormattedNowPlan {
  if (plan.intentId === 'depart') {
    const timeZone = plan.timezone;
    const apptTimeStr = formatTime(plan.apptAt, timeZone);
    // Neutral plan headline fallback instead of fabricated 'Piano lesson at 3:00'
    const title = plan.subjectTitle
      ? `${plan.subjectTitle}${apptTimeStr ? ` at ${apptTimeStr}` : ''}`
      : plan.headline;

    const prepareStr = formatTime(plan.prepareAt, timeZone);
    const leaveStr = formatTime(plan.leaveAt, timeZone);
    const headline =
      prepareStr && leaveStr
        ? `Get ready at ${prepareStr}, leave by ${leaveStr}`
        : plan.headline;

    const hasRainChecklist = plan.checklist?.includes('umbrella') ?? false;
    const isRain =
      hasRainChecklist ||
      plan.why.evidenceSignals.some(s =>
        s.description?.toLowerCase().includes('rain')
      );

    let habitNote: string | undefined;
    const rainFact = plan.why.memoryFactsUsed.find(
      f => f.key === 'rain_transport_preference' && f.status === 'confirmed'
    );
    if (rainFact) {
      if (rainFact.value === 'bus_first') {
        habitNote = STRINGS.habit.rainTransit;
      } else {
        habitNote = STRINGS.habit.rainDrive;
      }
    }

    const options: FormattedNowOption[] = [];
    if (isRain && plan.optionsOrSteps.length > 0) {
      for (const opt of plan.optionsOrSteps) {
        if (typeof opt !== 'string') {
          const planOpt = opt as PlanOption;
          const modeStr = planOpt.mode
            ? planOpt.mode.charAt(0).toUpperCase() + planOpt.mode.slice(1)
            : 'Option';
          const leaveTimeStr = formatTime(planOpt.leaveAt, timeZone);
          const label = leaveTimeStr ? `${modeStr} · leave ${leaveTimeStr}` : planOpt.label;
          const meta =
            typeof planOpt.travelMinutes === 'number'
              ? `${planOpt.travelMinutes}m ${planOpt.mode || 'travel'}`
              : undefined;
          options.push({ label, meta });
        }
      }
    }

    return Object.freeze({
      title,
      headline,
      basis: STRINGS.depart.basisLine,
      isRain,
      rainBanner: isRain ? STRINGS.rain.whatChanged : undefined,
      umbrellaChip: hasRainChecklist ? STRINGS.rain.umbrellaChip : undefined,
      habitNote,
      options: Object.freeze(options),
    });
  }

  if (plan.intentId === 'lunch') {
    const formattedOptions: FormattedNowOption[] = plan.optionsOrSteps.map(opt => {
      if (typeof opt === 'string') {
        return { label: opt };
      }
      const optionObj = opt as PlanOption;
      const rawName = optionObj.name || optionObj.label;
      const cuisineTag = optionObj.cuisine
        ? optionObj.cuisine.charAt(0).toUpperCase() + optionObj.cuisine.slice(1)
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
    basis: 'Based on your scheduled plans.',
    isRain: false,
    options: Object.freeze([]),
  });
}
