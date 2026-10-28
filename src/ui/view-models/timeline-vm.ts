/**
 * Timeline View Model Derivation (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Derived purely from PreparedPlan and ContextSnapshot data.
 * - All times formatted using plan.timezone or snapshot timezone.
 * - Invariant: Zero invented times; arrival time derived mathematically from leaveAt + travelMinutes.
 * - Omit missing fields rather than defaulting with hardcoded literals.
 */

import type { PreparedPlan } from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import { derivePlanTimingFacts } from './timing.js';
import type { TimelineVM, TimelineStepVM } from './types.js';

export function deriveTimelineVM(
  plan: PreparedPlan,
  snapshot?: { signals: readonly { kind: string; value?: unknown }[] } | null,
  selectedMode?: string
): TimelineVM | undefined {
  if (plan.intentId !== 'depart') {
    return undefined;
  }

  const tz = plan.timezone;
  const apptTimeStr = plan.apptAt ? formatTime(plan.apptAt, tz) : '';
  const eventTitle = plan.subjectTitle
    ? (apptTimeStr ? `${plan.subjectTitle} at ${apptTimeStr}` : plan.subjectTitle)
    : plan.headline;

  // Derive timing facts from single shared timing helper
  const timing = derivePlanTimingFacts(plan, selectedMode);

  let bufferMinutes = timing?.bufferMinutes;
  let prepMinutes = timing?.prepMinutes;
  let primaryMode = timing?.mode ? timing.mode.charAt(0).toUpperCase() + timing.mode.slice(1) : undefined;
  let travelDurationMinutes = timing?.travelMinutes;

  if (timing && timing.marginMinutes >= 0) {
    bufferMinutes = timing.marginMinutes;
  }

  // Active leaveAt and prepareAt
  const activeLeaveAt = timing?.leaveAt || plan.leaveAt;
  const activePrepAt = timing?.prepareAt || plan.prepareAt;

  const prepareTimeStr = activePrepAt ? formatTime(activePrepAt, tz) : '';
  const leaveTimeStr = activeLeaveAt ? formatTime(activeLeaveAt, tz) : '';

  // If primaryMode still not determined, check travel signal value if available
  if (!primaryMode && snapshot?.signals) {
    const travelSig = snapshot.signals.find(s => s.kind === 'travel_estimate');
    const valMode = (travelSig?.value as Record<string, unknown>)?.mode;
    if (typeof valMode === 'string' && valMode) {
      primaryMode = valMode.charAt(0).toUpperCase() + valMode.slice(1);
    }
  }
  if (!primaryMode) {
    primaryMode = 'Travel';
  }

  // Derive arrival time from activeLeaveAt + travelDurationMinutes
  let arriveTimeStr: string | undefined;
  if (activeLeaveAt && travelDurationMinutes !== undefined) {
    const leaveDate = new Date(activeLeaveAt);
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
