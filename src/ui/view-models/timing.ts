/**
 * Shared Plan Timing Facts Derivation
 * Governed by LIVING_CONTEXT_V2.md §3, §4, §8 D1
 *
 * Rules:
 * - Single source of truth for travel, arrival, and margin across timeline, details, and conversation comparisons.
 * - Derived purely from PreparedPlan data (options, leaveAt, apptAt, why facts/derivation).
 * - Zero fabricated fallback literals (no hardcoded 25m or arbitrary minutes).
 * - Arrival is mathematically: leaveMs + travelMinutes * 60,000.
 * - Margin is mathematically: Math.round((apptMs - arrivalMs) / 60,000).
 * - Late risk when margin < 0.
 */

import { appliedRainBufferMinutes } from './rain-buffer.js';
import type { PreparedPlan, PlanOption } from '../../core/contracts/index.js';

export interface PlanTimingFacts {
  /** Target appointment time (ISO string) */
  readonly apptAt: string;
  /** Effective departure time (ISO string) */
  readonly leaveAt: string;
  /** Effective prepare time (ISO string) if known */
  readonly prepareAt?: string;
  /** Calculated arrival time (ISO string) = leaveAt + travelMinutes */
  readonly arrivalAt: string;
  /** Travel duration in minutes */
  readonly travelMinutes: number;
  /** Buffer in minutes from memory or plan facts */
  readonly bufferMinutes: number;
  /** Prep duration in minutes from memory or plan facts */
  readonly prepMinutes?: number;
  /** Margin in minutes = (apptMs - arrivalMs) / 60,000. Positive = early buffer, 0 = exact on time, negative = late */
  readonly marginMinutes: number;
  /** Whether the plan arrives after the appointment */
  readonly isLate: boolean;
  /** Route mode of the plan or selected option ('drive', 'bus', 'walk', etc.) */
  readonly mode?: string;
}

export function derivePlanTimingFacts(
  plan: PreparedPlan,
  selectedModeOrOption?: string | PlanOption
): PlanTimingFacts | undefined {
  if (plan.intentId !== 'depart' || !plan.apptAt || !plan.leaveAt) {
    return undefined;
  }

  const apptMs = Date.parse(plan.apptAt);
  if (!Number.isFinite(apptMs)) {
    return undefined;
  }

  // Extract memory facts used (buffer and prep duration)
  const bufferFact = plan.why?.memoryFactsUsed?.find(f => f.key === 'prep_buffer_minutes');
  const prepFact = plan.why?.memoryFactsUsed?.find(f => f.key === 'prep_duration_minutes');
  // D5: an applied rain buffer is part of the buffer between leaving and the appointment.
  const bufferMinutes =
    (typeof bufferFact?.value === 'number' && Number.isFinite(bufferFact.value) ? bufferFact.value : 0) +
    appliedRainBufferMinutes(plan);
  const prepMinutes =
    typeof prepFact?.value === 'number' && Number.isFinite(prepFact.value)
      ? prepFact.value
      : undefined;

  // Locate the selected or first option if multi-mode
  const typedOpts = (plan.optionsOrSteps ?? []).filter(
    (o): o is PlanOption => typeof o !== 'string' && typeof (o as PlanOption).mode === 'string'
  );

  let selectedOpt: PlanOption | undefined;
  if (selectedModeOrOption && typeof selectedModeOrOption === 'object' && 'mode' in selectedModeOrOption) {
    selectedOpt = selectedModeOrOption;
  } else if (typeof selectedModeOrOption === 'string' && selectedModeOrOption.trim()) {
    selectedOpt = typedOpts.find(o => o.mode?.toLowerCase() === selectedModeOrOption.toLowerCase());
  }

  if (!selectedOpt && typedOpts.length > 0) {
    selectedOpt = typedOpts[0];
  }

  // Determine mode
  const mode = selectedOpt?.mode?.toLowerCase();

  // Determine active leaveAt
  const activeLeaveAt = selectedOpt?.leaveAt || plan.leaveAt;
  const leaveMs = Date.parse(activeLeaveAt);
  if (!Number.isFinite(leaveMs)) {
    return undefined;
  }

  // Determine travel minutes:
  // 1) From selected option travelMinutes if finite number
  let travelMinutes: number | undefined;
  if (typeof selectedOpt?.travelMinutes === 'number' && Number.isFinite(selectedOpt.travelMinutes)) {
    travelMinutes = selectedOpt.travelMinutes;
  }

  // 2) If not in option (e.g. single-mode step strings or step objects like D1 without typed options),
  // extract from why derivation if present: e.g. "30m travel", "25m drive", "40m bus"
  if (travelMinutes === undefined && typedOpts.length === 0 && plan.why?.derivation) {
    const match = /(\d+)m (?:travel|drive|bus|walk)/i.exec(plan.why.derivation);
    if (match && match[1]) {
      const parsed = parseInt(match[1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        travelMinutes = parsed;
      }
    }
  }

  // 3) Derive mathematically from apptAt - leaveAt - buffer if single mode without typed options
  if (travelMinutes === undefined && typedOpts.length === 0 && apptMs > leaveMs) {
    const totalDiffMin = Math.round((apptMs - leaveMs) / 60_000);
    if (totalDiffMin > bufferMinutes) {
      travelMinutes = totalDiffMin - bufferMinutes;
    } else {
      travelMinutes = totalDiffMin;
    }
  }

  if (travelMinutes === undefined || !Number.isFinite(travelMinutes)) {
    return undefined;
  }

  const arriveMs = leaveMs + travelMinutes * 60_000;
  const arrivalAt = new Date(arriveMs).toISOString();
  const marginMinutes = Math.round((apptMs - arriveMs) / 60_000);
  const isLate = marginMinutes < 0;

  // Active prepareAt
  let activePrepAt = plan.prepareAt;
  if (prepMinutes !== undefined) {
    activePrepAt = new Date(leaveMs - prepMinutes * 60_000).toISOString();
  }

  return {
    apptAt: plan.apptAt,
    leaveAt: activeLeaveAt,
    prepareAt: activePrepAt,
    arrivalAt,
    travelMinutes,
    bufferMinutes,
    prepMinutes,
    marginMinutes,
    isLate,
    mode,
  };
}
