/**
 * Plan Diff Computation for S3-MICRO
 * Computes semantic diff between prior and updated plan compositions,
 * formatting human-readable diff summaries and aria-live announcements.
 */

export interface PlanDiff {
  readonly fieldName: 'leaveTime' | 'prepareTime' | 'headline' | 'transitMode' | 'recommendation';
  readonly priorValue: string;
  readonly newValue: string;
  readonly diffSummary: string;
  readonly ariaLiveText: string;
}

export interface PlanDiffTarget {
  readonly headline?: string;
  readonly leaveTimeStr?: string;
  readonly prepareTimeStr?: string;
  readonly mode?: string;
  readonly topRecommendation?: string;
}

/**
 * Normalizes time strings like "2:25 PM", "14:25", "2:25" for clean comparisons.
 */
function normalizeTime(val?: string): string | null {
  if (!val) return null;
  const match = val.match(/(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extracts departure time from a headline like "Leave by 2:25 PM" or "Get ready at 2:05 PM, leave by 2:25 PM".
 */
function extractLeaveTimeFromHeadline(headline?: string): string | null {
  if (!headline) return null;
  const match = headline.match(/leave\s+(?:by\s+)?(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/i);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Extracts preparation time from a headline like "prepare 2:10 PM" or "Get ready at 2:05 PM, leave by 2:25 PM".
 */
function extractPrepareTimeFromHeadline(headline?: string): string | null {
  if (!headline) return null;
  const match = headline.match(/(?:prepare|get ready at)\s+(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/i);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Computes a semantic diff between prior and current plan compositions.
 * Diff strictly checks semantic fields (leave time, prepare time, transit mode, recommendation).
 * Free-text headline wording is not used as a fallback to ensure no false diffs on no-ops.
 * Returns null if compositions have identical semantic values or if either is missing.
 */
export function computePlanDiff(
  prior: PlanDiffTarget | null | undefined,
  current: PlanDiffTarget | null | undefined
): PlanDiff | null {
  if (!prior || !current) {
    return null;
  }

  // 1. Leave Time Diff (explicit leaveTimeStr or extracted from headline)
  const priorLeave =
    normalizeTime(prior.leaveTimeStr) || extractLeaveTimeFromHeadline(prior.headline);
  const currentLeave =
    normalizeTime(current.leaveTimeStr) || extractLeaveTimeFromHeadline(current.headline);

  if (priorLeave && currentLeave && priorLeave !== currentLeave) {
    return {
      fieldName: 'leaveTime',
      priorValue: priorLeave,
      newValue: currentLeave,
      diffSummary: `Leave by ${priorLeave} → ${currentLeave}`,
      ariaLiveText: `Departure time updated: Leave by ${priorLeave} changed to Leave by ${currentLeave}.`,
    };
  }

  // 2. Prepare Time Diff (explicit prepareTimeStr or extracted from headline)
  const priorPrep =
    normalizeTime(prior.prepareTimeStr) || extractPrepareTimeFromHeadline(prior.headline);
  const currentPrep =
    normalizeTime(current.prepareTimeStr) || extractPrepareTimeFromHeadline(current.headline);

  if (priorPrep && currentPrep && priorPrep !== currentPrep) {
    return {
      fieldName: 'prepareTime',
      priorValue: priorPrep,
      newValue: currentPrep,
      diffSummary: `Prepare by ${priorPrep} → ${currentPrep}`,
      ariaLiveText: `Preparation time updated: Prepare by ${priorPrep} changed to Prepare by ${currentPrep}.`,
    };
  }

  // 3. Transit Mode Switch
  if (prior.mode && current.mode && prior.mode !== current.mode) {
    const priorCap = prior.mode.charAt(0).toUpperCase() + prior.mode.slice(1);
    const currCap = current.mode.charAt(0).toUpperCase() + current.mode.slice(1);
    return {
      fieldName: 'transitMode',
      priorValue: priorCap,
      newValue: currCap,
      diffSummary: `Primary route switched: ${priorCap} → ${currCap}`,
      ariaLiveText: `Route mode updated: Switched from ${priorCap} to ${currCap}.`,
    };
  }

  // 4. Recommendation Diff (e.g. Lunch or Fuel candidates re-ranked)
  if (
    prior.topRecommendation &&
    current.topRecommendation &&
    prior.topRecommendation !== current.topRecommendation
  ) {
    return {
      fieldName: 'recommendation',
      priorValue: prior.topRecommendation,
      newValue: current.topRecommendation,
      diffSummary: `Recommendation updated: ${prior.topRecommendation} → ${current.topRecommendation}`,
      ariaLiveText: `Top recommendation changed from ${prior.topRecommendation} to ${current.topRecommendation}.`,
    };
  }

  return null;
}
