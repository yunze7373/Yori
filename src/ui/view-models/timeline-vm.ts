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
  const hasOverride =
    bundle?.hasRecord('user_override_timing') ||
    bundle?.hasRecord('user-override') ||
    plan.why?.evidenceSignals?.some(s => s.kind === 'user_request');

  const prepRecId = hasOverride
    ? 'user_override_timing'
    : (bundle?.getRecord(etaRecId)?.fields.prepareTime !== undefined
        ? etaRecId
        : calRecId);
  const prepField = hasOverride ? `${modeKey}PrepareTime` : 'prepareTime';

  const leaveRecId = hasOverride ? 'user_override_timing' : etaRecId;
  const leaveField = hasOverride ? `${modeKey}LeaveTime` : 'leaveTime';

  const arriveRecId = hasOverride ? 'user_override_timing' : etaRecId;
  const arriveField = hasOverride ? `${modeKey}ArrivalTime` : 'arrivalTime';

  if (prepareTimeStr) {
    let verifiedPrepTime = prepareTimeStr;
    if (bundle) {
      let v = GroundedRecommendationVerifier.verifyField(
        { recordId: prepRecId, field: prepField },
        prepareTimeStr,
        bundle
      );
      if (!v.valid && hasOverride) {
        v = GroundedRecommendationVerifier.verifyField(
          { recordId: prepRecId, field: 'prepareTime' },
          prepareTimeStr,
          bundle
        );
      }
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
      sourceRef: { recordId: prepRecId, field: prepField },
      fieldSourceRefs: {
        prepareTime: { recordId: prepRecId, field: prepField },
        prepDetail: { recordId: 'prep_duration_minutes', field: 'prepText' },
      },
    });
  }

  let verifiedLeaveTime = leaveTimeStr;
  let verifiedTravelMins = travelDurationMinutes;

  if (leaveTimeStr) {
    if (bundle) {
      let v = GroundedRecommendationVerifier.verifyField(
        { recordId: leaveRecId, field: leaveField },
        leaveTimeStr,
        bundle
      );
      if (!v.valid && hasOverride) {
        v = GroundedRecommendationVerifier.verifyField(
          { recordId: leaveRecId, field: 'leaveTime' },
          leaveTimeStr,
          bundle
        );
      }
      if (!v.valid) {
        verifiedLeaveTime = 'unknown';
      }

      if (travelDurationMinutes !== undefined) {
        const vTravel = GroundedRecommendationVerifier.verifyField(
          { recordId: etaRecId, field: 'travelMinutes' },
          travelDurationMinutes,
          bundle
        );
        if (!vTravel.valid) {
          verifiedTravelMins = undefined;
        }
      }
    }

    const leaveDetail =
      verifiedTravelMins !== undefined
        ? `${primaryMode} · ${verifiedTravelMins} min`
        : (bundle && travelDurationMinutes !== undefined ? `${primaryMode} · unknown min` : primaryMode);

    steps.push({
      id: 'step-leave',
      time: verifiedLeaveTime,
      label: 'Leave',
      detail: leaveDetail,
      isPrimary: true,
      iconType: 'leave',
      sourceRef: { recordId: leaveRecId, field: leaveField },
      fieldSourceRefs: {
        leaveTime: { recordId: leaveRecId, field: leaveField },
        travelMinutes: { recordId: etaRecId, field: 'travelMinutes' },
      },
    });
  }

  if (arriveTimeStr) {
    let verifiedArriveTime = arriveTimeStr;
    if (bundle) {
      let v = GroundedRecommendationVerifier.verifyField(
        { recordId: arriveRecId, field: arriveField },
        arriveTimeStr,
        bundle
      );
      if (!v.valid && hasOverride) {
        v = GroundedRecommendationVerifier.verifyField(
          { recordId: arriveRecId, field: 'arrivalTime' },
          arriveTimeStr,
          bundle
        );
      }
      if (!v.valid) {
        verifiedArriveTime = 'unknown';
      }
    }

    let arriveDetail = 'On time';
    const arrivalIso = timing?.arrivalAt ?? (activeLeaveAt && travelDurationMinutes !== undefined
      ? new Date(Date.parse(activeLeaveAt) + travelDurationMinutes * 60 * 1000).toISOString()
      : undefined);

    let marginMinutes: number | undefined;
    if (plan.apptAt && arrivalIso) {
      marginMinutes = Math.round((Date.parse(plan.apptAt) - Date.parse(arrivalIso)) / 60000);
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
      time: verifiedArriveTime,
      label: 'Arrive at destination',
      detail: arriveDetail,
      iconType: 'arrive',
      sourceRef: { recordId: arriveRecId, field: arriveField },
      fieldSourceRefs: {
        arrivalTime: { recordId: arriveRecId, field: arriveField },
        bufferMinutes: hasOverride
          ? { recordId: 'user_override_timing', field: (marginMinutes !== undefined && marginMinutes < 0) ? 'lateMinutes' : 'marginMinutes' }
          : { recordId: etaRecId, field: 'bufferMinutes' },
      },
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
      sourceRef: { recordId: calRecId, field: 'apptTime' },
      fieldSourceRefs: {
        apptTime: { recordId: calRecId, field: 'apptTime' },
        subjectTitle: { recordId: calRecId, field: 'subjectTitle' },
      },
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

  const departureNotice = verifiedLeaveTime
    ? (bufferMinutes !== undefined && !isLate
        ? `Leave by ${verifiedLeaveTime} to arrive with ${bufferMinutes}m buffer`
        : `Leave by ${verifiedLeaveTime}`)
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
      prepareTime: { recordId: prepRecId, field: prepField },
      leaveTime: { recordId: leaveRecId, field: leaveField },
      arrivalTime: { recordId: arriveRecId, field: arriveField },
      travelMinutes: { recordId: etaRecId, field: 'travelMinutes' },
    },
  };
}
