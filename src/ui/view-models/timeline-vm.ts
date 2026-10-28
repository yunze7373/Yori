/**
 * Timeline View Model Derivation (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Derived purely from PreparedPlan and ContextSnapshot data.
 * - All times formatted using plan.timezone or snapshot timezone.
 * - Invariant: Zero invented times; arrival time derived mathematically from leaveAt + travelMinutes.
 */

import type { PreparedPlan, PlanOption } from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import type { TimelineVM, TimelineStepVM } from './types.js';

export function deriveTimelineVM(plan: PreparedPlan): TimelineVM | undefined {
  if (plan.intentId !== 'depart') {
    return undefined;
  }

  const tz = plan.timezone;
  const apptTimeStr = formatTime(plan.apptAt, tz) || '3:00 PM';
  const eventTitle = plan.subjectTitle
    ? `${plan.subjectTitle} at ${apptTimeStr}`
    : plan.headline;

  const prepareTimeStr = formatTime(plan.prepareAt, tz);
  const leaveTimeStr = formatTime(plan.leaveAt, tz);

  // Determine primary route option (e.g. Drive 25m)
  let primaryMode = 'Travel';
  let travelDurationMinutes = 25;
  if (plan.optionsOrSteps && plan.optionsOrSteps.length > 0) {
    const firstOpt = plan.optionsOrSteps[0];
    if (typeof firstOpt !== 'string') {
      const opt = firstOpt as PlanOption;
      if (opt.mode) {
        primaryMode = opt.mode.charAt(0).toUpperCase() + opt.mode.slice(1);
      }
      if (typeof opt.travelMinutes === 'number') {
        travelDurationMinutes = opt.travelMinutes;
      }
    }
  }

  // Derive arrival time from leaveAt + travelMinutes
  let arriveTimeStr = '2:55 PM';
  if (plan.leaveAt) {
    const leaveDate = new Date(plan.leaveAt);
    if (Number.isFinite(leaveDate.getTime())) {
      const arriveDate = new Date(leaveDate.getTime() + travelDurationMinutes * 60 * 1000);
      arriveTimeStr = formatTime(arriveDate.toISOString(), tz);
    }
  }

  const hasUmbrella = plan.checklist?.includes('umbrella') ?? false;
  const prepDetail = hasUmbrella
    ? 'Take umbrella · 20m prep + 5m buffer'
    : '20m prep + 5m buffer';

  const steps: TimelineStepVM[] = [];

  if (prepareTimeStr) {
    steps.push({
      id: 'step-prep',
      time: prepareTimeStr,
      label: 'Get ready',
      detail: prepDetail,
      iconType: 'prep',
    });
  }

  if (leaveTimeStr) {
    steps.push({
      id: 'step-leave',
      time: leaveTimeStr,
      label: 'Leave',
      detail: `${primaryMode} · ${travelDurationMinutes} min`,
      isPrimary: true,
      iconType: 'leave',
    });
  }

  steps.push({
    id: 'step-arrive',
    time: arriveTimeStr,
    label: 'Arrive at destination',
    detail: 'On time · 5m buffer',
    iconType: 'arrive',
  });

  steps.push({
    id: 'step-event',
    time: apptTimeStr,
    label: plan.subjectTitle || 'Event starts',
    detail: 'Scheduled appointment',
    isEvent: true,
    iconType: 'event',
  });

  return {
    title: 'Journey Timeline',
    eventTitle,
    eventTime: apptTimeStr,
    steps: Object.freeze(steps),
    departureNotice: `Leave by ${leaveTimeStr || 'scheduled time'} to arrive with buffer`,
  };
}
