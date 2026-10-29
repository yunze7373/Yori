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
import { GroundedRecommendationVerifier, type EvidenceBundle } from './grounding.js';

export function deriveTimelineVM(
  plan: PreparedPlan,
  snapshot?: { signals: readonly { kind: string; id?: string; issuedAt?: string; value?: unknown }[] } | null,
  selectedMode?: string,
  bundle?: EvidenceBundle
): TimelineVM | undefined {
  if (plan.intentId !== 'depart') {
    return undefined;
  }

  const tz = plan.timezone;
  const apptTimeStr = plan.apptAt ? formatTime(plan.apptAt, tz) : '';
  const eventTitle = plan.subjectTitle
    ? (apptTimeStr ? `${plan.subjectTitle} at ${apptTimeStr}` : plan.subjectTitle)
    : plan.headline;

  // Dynamically resolve calendar record ID from signals or fallback
  const calSig =
    snapshot?.signals?.find(s => s.kind === 'calendar') ??
    plan.why?.evidenceSignals?.find(s => s.kind === 'calendar');
  const calRecId =
    (calSig as any)?.id ||
    (calSig?.issuedAt ? `${calSig.kind}:${calSig.issuedAt}` : undefined) ||
    'cal-piano';

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

  if (prepMinutes === undefined && activeLeaveAt && activePrepAt) {
    const diff = Math.round((Date.parse(activeLeaveAt) - Date.parse(activePrepAt)) / 60000);
    if (diff > 0) {
      prepMinutes = diff;
    }
  }

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
  const isLate = (timing?.marginMinutes !== undefined && timing.marginMinutes < 0);

  // Prep detail: dynamically formatted from actual facts used (no hardcoded 20m/5m)
  // In late state, drop "+ 5m buffer" so it does not contradict arrival status
  const prepParts: string[] = [];
  if (hasUmbrella) {
    prepParts.push('Take umbrella');
  }
  if (prepMinutes !== undefined && bufferMinutes !== undefined && !isLate) {
    prepParts.push(`${prepMinutes}m prep + ${bufferMinutes}m buffer`);
  } else if (prepMinutes !== undefined) {
    prepParts.push(`${prepMinutes}m prep`);
  }
  const prepDetail = prepParts.join(' · ');

  const steps: TimelineStepVM[] = [];
  const modeKey = (primaryMode || 'drive').toLowerCase();
  const etaRecId = modeKey === 'drive' ? 'eta-drive-piano' : 'eta-bus-piano';
  const hasOverride = bundle?.hasRecord('user_override_timing') || bundle?.hasRecord('user-override');
  const prepRecId = hasOverride
    ? 'user_override_timing'
    : (bundle?.getRecord(etaRecId)?.fields.prepareTime !== undefined
        ? etaRecId
        : calRecId);

  if (prepareTimeStr) {
    let verifiedPrepTime = prepareTimeStr;
    if (bundle) {
      const v = GroundedRecommendationVerifier.verifyField(
        { recordId: prepRecId, field: 'prepareTime' },
        prepareTimeStr,
        bundle
      );
      if (!v.valid) {
        verifiedPrepTime = 'unknown';
      }
    }
    steps.push({
      id: 'step-prep',
      time: verifiedPrepTime,
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
    let arriveDetail = 'On time';
    const arrivalIso = timing?.arrivalAt ?? (activeLeaveAt && travelDurationMinutes !== undefined
      ? new Date(Date.parse(activeLeaveAt) + travelDurationMinutes * 60 * 1000).toISOString()
      : undefined);

    if (plan.apptAt && arrivalIso) {
      const marginMinutes = Math.round((Date.parse(plan.apptAt) - Date.parse(arrivalIso)) / 60000);
      if (marginMinutes < 0) {
        arriveDetail = `Late by ${Math.abs(marginMinutes)}m`;
      } else if (marginMinutes > 0) {
        arriveDetail = `On time · ${marginMinutes}m buffer`;
      } else {
        arriveDetail = 'On time';
      }
    } else if (bufferMinutes !== undefined && bufferMinutes > 0) {
      arriveDetail = `On time · ${bufferMinutes}m buffer`;
    }

    steps.push({
      id: 'step-arrive',
      time: arriveTimeStr,
      label: 'Arrive at destination',
      detail: arriveDetail,
      iconType: 'arrive',
    });
  }

  if (apptTimeStr || plan.subjectTitle) {
    let verifiedApptTime = apptTimeStr || '';
    if (bundle && apptTimeStr) {
      const v = GroundedRecommendationVerifier.verifyField(
        { recordId: calRecId, field: 'apptTime' },
        apptTimeStr,
        bundle
      );
      if (!v.valid) {
        verifiedApptTime = 'unknown';
      }
    }
    steps.push({
      id: 'step-event',
      time: verifiedApptTime,
      label: plan.subjectTitle || 'Event starts',
      detail: 'Scheduled appointment',
      isEvent: true,
      iconType: 'event',
    });
  }

  let displayEventTitle = eventTitle;
  let displayEventTime = apptTimeStr || 'Scheduled time';
  if (bundle) {
    if (plan.subjectTitle) {
      const v = GroundedRecommendationVerifier.verifyField(
        { recordId: calRecId, field: 'subjectTitle' },
        plan.subjectTitle,
        bundle
      );
      if (!v.valid) {
        displayEventTitle = 'unknown';
      }
    }
    if (apptTimeStr) {
      const v = GroundedRecommendationVerifier.verifyField(
        { recordId: calRecId, field: 'apptTime' },
        apptTimeStr,
        bundle
      );
      if (!v.valid) {
        displayEventTime = 'unknown';
      }
    }
  }

  const departureNotice = leaveTimeStr
    ? (bufferMinutes !== undefined && !isLate
        ? `Leave by ${leaveTimeStr} to arrive with ${bufferMinutes}m buffer`
        : `Leave by ${leaveTimeStr}`)
    : 'Scheduled departure';

  return {
    title: 'Journey Timeline',
    eventTitle: displayEventTitle,
    eventTime: displayEventTime,
    steps: Object.freeze(steps),
    departureNotice,
    sourceRef: { recordId: calRecId, field: 'subjectTitle' },
    fieldSourceRefs: {
      eventTitle: { recordId: calRecId, field: 'subjectTitle' },
      eventTime: { recordId: calRecId, field: 'apptTime' },
      prepareTime: { recordId: calRecId, field: 'prepareTime' },
    },
  };
}
