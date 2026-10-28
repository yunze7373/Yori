/**
 * Timeline View Model Derivation (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Derived purely from PreparedPlan and ContextSnapshot data.
 * - All times formatted using plan.timezone or snapshot timezone.
 * - Invariant: Zero invented times; arrival time derived mathematically from leaveAt + travelMinutes.
 * - Omit missing fields rather than defaulting with hardcoded literals.
 */

import type { PreparedPlan, PlanOption } from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import type { TimelineVM, TimelineStepVM } from './types.js';

export function deriveTimelineVM(plan: PreparedPlan): TimelineVM | undefined {
  if (plan.intentId !== 'depart') {
    return undefined;
  }

  const tz = plan.timezone;
  const apptTimeStr = plan.apptAt ? formatTime(plan.apptAt, tz) : '';
  const eventTitle = plan.subjectTitle
    ? (apptTimeStr ? `${plan.subjectTitle} at ${apptTimeStr}` : plan.subjectTitle)
    : plan.headline;

  const prepareTimeStr = plan.prepareAt ? formatTime(plan.prepareAt, tz) : '';
  const leaveTimeStr = plan.leaveAt ? formatTime(plan.leaveAt, tz) : '';

  // Extract memory facts used (buffer and prep duration)
  const bufferFact = plan.why?.memoryFactsUsed?.find(f => f.key === 'prep_buffer_minutes');
  const prepFact = plan.why?.memoryFactsUsed?.find(f => f.key === 'prep_duration_minutes');
  let bufferMinutes =
    typeof bufferFact?.value === 'number' && Number.isFinite(bufferFact.value)
      ? bufferFact.value
      : undefined;
  let prepMinutes =
    typeof prepFact?.value === 'number' && Number.isFinite(prepFact.value)
      ? prepFact.value
      : undefined;

  // Determine primary route mode and travel duration
  let primaryMode: string | undefined;
  let travelDurationMinutes: number | undefined;

  if (plan.optionsOrSteps && plan.optionsOrSteps.length > 0) {
    const firstOpt = plan.optionsOrSteps[0];
    if (typeof firstOpt !== 'string') {
      const opt = firstOpt as PlanOption;
      if (opt.mode) {
        primaryMode = opt.mode.charAt(0).toUpperCase() + opt.mode.slice(1);
      }
      if (typeof opt.travelMinutes === 'number' && Number.isFinite(opt.travelMinutes)) {
        travelDurationMinutes = opt.travelMinutes;
      }
    }
  }

  // If not found in typed options (e.g. D1 single-mode plan with step strings),
  // derive travel minutes mathematically: apptAt - leaveAt - buffer
  if (travelDurationMinutes === undefined && plan.apptAt && plan.leaveAt) {
    const apptMs = Date.parse(plan.apptAt);
    const leaveMs = Date.parse(plan.leaveAt);
    if (Number.isFinite(apptMs) && Number.isFinite(leaveMs) && apptMs > leaveMs) {
      const totalDiffMin = Math.round((apptMs - leaveMs) / 60000);
      const buf = bufferMinutes ?? 0;
      if (totalDiffMin > buf) {
        travelDurationMinutes = totalDiffMin - buf;
      }
    }
  }

  // If bufferMinutes was not in memory facts, derive it from apptAt - (leaveAt + travel)
  if (bufferMinutes === undefined && plan.apptAt && plan.leaveAt && travelDurationMinutes !== undefined) {
    const apptMs = Date.parse(plan.apptAt);
    const leaveMs = Date.parse(plan.leaveAt);
    if (Number.isFinite(apptMs) && Number.isFinite(leaveMs)) {
      const arriveMs = leaveMs + travelDurationMinutes * 60000;
      if (apptMs >= arriveMs) {
        bufferMinutes = Math.round((apptMs - arriveMs) / 60000);
      }
    }
  }

  // If prepMinutes was not in memory facts, derive it from leaveAt - prepareAt
  if (prepMinutes === undefined && plan.leaveAt && plan.prepareAt) {
    const leaveMs = Date.parse(plan.leaveAt);
    const prepMs = Date.parse(plan.prepareAt);
    if (Number.isFinite(leaveMs) && Number.isFinite(prepMs) && leaveMs > prepMs) {
      prepMinutes = Math.round((leaveMs - prepMs) / 60000);
    }
  }

  // If primaryMode still not determined, check travel evidence signals
  if (!primaryMode && plan.why?.evidenceSignals) {
    const travelSignal = plan.why.evidenceSignals.find(s => s.kind === 'travel_estimate');
    if (travelSignal?.description) {
      primaryMode = 'Drive';
    }
  }
  if (!primaryMode) {
    primaryMode = 'Travel';
  }

  // Derive arrival time from leaveAt + travelDurationMinutes
  let arriveTimeStr: string | undefined;
  if (plan.leaveAt && travelDurationMinutes !== undefined) {
    const leaveDate = new Date(plan.leaveAt);
    if (Number.isFinite(leaveDate.getTime())) {
      const arriveDate = new Date(leaveDate.getTime() + travelDurationMinutes * 60 * 1000);
      arriveTimeStr = formatTime(arriveDate.toISOString(), tz);
    }
  }

  const hasUmbrella = plan.checklist?.includes('umbrella') ?? false;

  // Prep detail: dynamically formatted from actual facts used (no hardcoded 20m/5m)
  const prepParts: string[] = [];
  if (hasUmbrella) {
    prepParts.push('Take umbrella');
  }
  if (prepMinutes !== undefined && bufferMinutes !== undefined) {
    prepParts.push(`${prepMinutes}m prep + ${bufferMinutes}m buffer`);
  } else if (prepMinutes !== undefined) {
    prepParts.push(`${prepMinutes}m prep`);
  }
  const prepDetail = prepParts.join(' · ');

  const steps: TimelineStepVM[] = [];

  if (prepareTimeStr) {
    steps.push({
      id: 'step-prep',
      time: prepareTimeStr,
      label: 'Get ready',
      detail: prepDetail || undefined,
      iconType: 'prep',
    });
  }

  if (leaveTimeStr) {
    const leaveDetail =
      travelDurationMinutes !== undefined
        ? `${primaryMode} · ${travelDurationMinutes} min`
        : primaryMode;

    steps.push({
      id: 'step-leave',
      time: leaveTimeStr,
      label: 'Leave',
      detail: leaveDetail,
      isPrimary: true,
      iconType: 'leave',
    });
  }

  if (arriveTimeStr) {
    const arriveDetail =
      bufferMinutes !== undefined
        ? `On time · ${bufferMinutes}m buffer`
        : 'On time';

    steps.push({
      id: 'step-arrive',
      time: arriveTimeStr,
      label: 'Arrive at destination',
      detail: arriveDetail,
      iconType: 'arrive',
    });
  }

  if (apptTimeStr || plan.subjectTitle) {
    steps.push({
      id: 'step-event',
      time: apptTimeStr || '',
      label: plan.subjectTitle || 'Event starts',
      detail: 'Scheduled appointment',
      isEvent: true,
      iconType: 'event',
    });
  }

  const departureNotice = leaveTimeStr
    ? (bufferMinutes !== undefined
        ? `Leave by ${leaveTimeStr} to arrive with ${bufferMinutes}m buffer`
        : `Leave by ${leaveTimeStr}`)
    : 'Scheduled departure';

  return {
    title: 'Journey Timeline',
    eventTitle,
    eventTime: apptTimeStr || 'Scheduled time',
    steps: Object.freeze(steps),
    departureNotice,
  };
}
