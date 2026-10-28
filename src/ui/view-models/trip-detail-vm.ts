/**
 * Trip Detail View Model Derivation (LIVING_CONTEXT_V2.md §8 D1)
 *
 * Rules:
 * - Opened from the rain/depart NOW card.
 * - Mode tabs for the plan's options only (Drive and Bus; Walk only if fixture exists).
 * - Large labelled schematic map (reuses MapVM).
 * - Current/recommended plan row with leave and arrive times derived from plan data.
 * - "Why this plan?" section reusing Why provenance (sample vs confirmed labels).
 * - Data honesty: fixture values only (no ratings, review counts, or road forgeries).
 */

import type {
  PreparedPlan,
  PlanOption,
  SpatialMapEvidence,
  PlanAction,
} from '../../core/contracts/index.js';
import { formatTime } from '../living-context/presentation.js';
import {
  humanizeMemoryKey,
  humanizeMemoryValue,
  buildHumanDerivation,
} from '../review/why-sheet.js';
import { deriveMapVM } from './map-vm.js';
import { deriveTimelineVM } from './timeline-vm.js';
import type {
  TripDetailVM,
  TripModeTabVM,
  TripWhyProvenanceVM,
} from './types.js';

export interface DeriveTripDetailOptions {
  plan: PreparedPlan;
  spatialEvidence: SpatialMapEvidence | null;
  selectedMode?: string;
  userConfirmedKeys?: ReadonlySet<string>;
  snapshot?: { signals: readonly { kind: string; value?: unknown }[] } | null;
  acceptedPlanIds?: readonly string[];
}

export function deriveTripDetailVM(options: DeriveTripDetailOptions): TripDetailVM {
  const {
    plan,
    spatialEvidence,
    selectedMode,
    userConfirmedKeys,
    snapshot,
    acceptedPlanIds = [],
  } = options;

  const tz = plan.timezone;
  const apptTime = plan.apptAt ? formatTime(plan.apptAt, tz) : '';
  const title = plan.subjectTitle
    ? (apptTime ? `${plan.subjectTitle} at ${apptTime}` : plan.subjectTitle)
    : plan.headline;
  const destinationName = plan.subjectTitle || 'Destination';

  // Extract memory facts for buffer and prep (no hardcoded literal fallbacks)
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

  // Determine available mode tabs strictly from plan options
  const modeTabs: TripModeTabVM[] = [];
  const typedOptions = (plan.optionsOrSteps ?? []).filter(
    opt => typeof opt !== 'string' && typeof (opt as PlanOption).mode === 'string'
  ) as PlanOption[];

  if (typedOptions.length > 0) {
    const activeMode =
      selectedMode && typedOptions.some(o => o.mode?.toLowerCase() === selectedMode.toLowerCase())
        ? selectedMode.toLowerCase()
        : typedOptions[0]!.mode!.toLowerCase();

    for (const opt of typedOptions) {
      const mode = opt.mode!;
      const modeCap = mode.charAt(0).toUpperCase() + mode.slice(1);
      const duration =
        typeof opt.travelMinutes === 'number' && Number.isFinite(opt.travelMinutes)
          ? opt.travelMinutes
          : undefined;
      const leaveTime = opt.leaveAt ? formatTime(opt.leaveAt, tz) : '';
      let arriveTime = '';
      if (opt.leaveAt && duration !== undefined && duration > 0) {
        const leaveDate = new Date(opt.leaveAt);
        if (Number.isFinite(leaveDate.getTime())) {
          const arriveDate = new Date(leaveDate.getTime() + duration * 60000);
          arriveTime = formatTime(arriveDate.toISOString(), tz);
        }
      }

      // If travelMinutes is missing, omit rather than displaying "0 min"
      const label = duration !== undefined ? `${modeCap} · ${duration} min` : modeCap;

      modeTabs.push({
        id: `mode-tab-${mode}`,
        mode,
        label,
        leaveTime,
        arriveTime,
        durationMinutes: duration,
        isSelected: mode.toLowerCase() === activeMode,
      });
    }
  } else {
    // Single-mode plan (e.g. D1) — derive travel duration and mode from signals/times without literal fallbacks
    let travelDurationMinutes: number | undefined;
    let singleMode = 'travel';
    if (snapshot?.signals) {
      const travelSig = snapshot.signals.find(s => s.kind === 'travel_estimate');
      const val = travelSig?.value as Record<string, unknown> | undefined;
      if (typeof val?.mode === 'string' && val.mode.trim()) {
        singleMode = val.mode.toLowerCase();
      }
      if (typeof val?.travelMinutes === 'number' && Number.isFinite(val.travelMinutes)) {
        travelDurationMinutes = val.travelMinutes;
      }
    }

    if (travelDurationMinutes === undefined && plan.apptAt && plan.leaveAt) {
      const apptMs = Date.parse(plan.apptAt);
      const leaveMs = Date.parse(plan.leaveAt);
      if (Number.isFinite(apptMs) && Number.isFinite(leaveMs) && apptMs > leaveMs) {
        const diffMin = Math.round((apptMs - leaveMs) / 60000);
        if (bufferMinutes !== undefined && diffMin > bufferMinutes) {
          travelDurationMinutes = diffMin - bufferMinutes;
        } else if (bufferMinutes === undefined) {
          travelDurationMinutes = diffMin;
        }
      }
    }

    const leaveTime = plan.leaveAt ? formatTime(plan.leaveAt, tz) : '';
    let arriveTime = '';
    if (plan.leaveAt && travelDurationMinutes !== undefined && travelDurationMinutes > 0) {
      const leaveDate = new Date(plan.leaveAt);
      if (Number.isFinite(leaveDate.getTime())) {
        const arriveDate = new Date(leaveDate.getTime() + travelDurationMinutes * 60000);
        arriveTime = formatTime(arriveDate.toISOString(), tz);
      }
    }

    const singleModeCap = singleMode.charAt(0).toUpperCase() + singleMode.slice(1);
    const label =
      travelDurationMinutes !== undefined
        ? `${singleModeCap} · ${travelDurationMinutes} min`
        : singleModeCap;

    modeTabs.push({
      id: `mode-tab-${singleMode}`,
      mode: singleMode,
      label,
      leaveTime,
      arriveTime,
      durationMinutes: travelDurationMinutes,
      isSelected: true,
    });
  }

  const selectedTab = modeTabs.find(t => t.isSelected) ?? modeTabs[0]!;

  // Derive prep minutes from leaveAt - prepareAt if missing from facts
  if (prepMinutes === undefined && plan.leaveAt && plan.prepareAt) {
    const leaveMs = Date.parse(plan.leaveAt);
    const prepMs = Date.parse(plan.prepareAt);
    if (Number.isFinite(leaveMs) && Number.isFinite(prepMs) && leaveMs > prepMs) {
      prepMinutes = Math.round((leaveMs - prepMs) / 60000);
    }
  }

  // Selected option buffer derivation based on actual option arriveTime
  let optionBufferMinutes: number | undefined;
  if (bufferMinutes !== undefined) {
    optionBufferMinutes = bufferMinutes;
    const selectedOpt = typedOptions.find(
      o => o.mode?.toLowerCase() === selectedTab.mode.toLowerCase()
    );
    const activeLeaveAt = selectedOpt?.leaveAt || plan.leaveAt;
    const activeDuration = selectedTab.durationMinutes;

    if (plan.apptAt && activeLeaveAt && activeDuration !== undefined) {
      const apptMs = Date.parse(plan.apptAt);
      const arriveMs = Date.parse(activeLeaveAt) + activeDuration * 60000;
      if (Number.isFinite(apptMs) && Number.isFinite(arriveMs) && apptMs >= arriveMs) {
        optionBufferMinutes = Math.round((apptMs - arriveMs) / 60000);
      }
    }
  }

  // If buffer fact/data is missing, omit buffer text or say 'On time'
  const bufferText =
    optionBufferMinutes !== undefined ? `On time · ${optionBufferMinutes}m buffer` : 'On time';

  const hasUmbrella = plan.checklist?.includes('umbrella') ?? false;
  const prepParts: string[] = [];
  if (hasUmbrella) {
    prepParts.push('Take umbrella');
  }
  if (prepMinutes !== undefined && optionBufferMinutes !== undefined) {
    prepParts.push(`${prepMinutes}m prep + ${optionBufferMinutes}m buffer`);
  } else if (prepMinutes !== undefined) {
    prepParts.push(`${prepMinutes}m prep`);
  }
  const prepText = prepParts.join(' · ');

  // Map and Timeline dynamically synced with selected mode
  const map = deriveMapVM(plan, spatialEvidence, 'prominent')!;
  const timeline = deriveTimelineVM(plan, snapshot, selectedTab.mode);
  const steps = timeline?.steps ?? [];

  // Why Provenance Section
  const whyHabits: TripWhyProvenanceVM[] = [];
  if (plan.why?.memoryFactsUsed) {
    for (const fact of plan.why.memoryFactsUsed) {
      const label = humanizeMemoryKey(fact.key);
      const value = humanizeMemoryValue(fact.key, fact.value);
      const isConfirmed = userConfirmedKeys?.has(fact.key) ?? false;
      const provenanceText = isConfirmed ? 'You confirmed' : 'Demo profile · sample';
      whyHabits.push({
        label,
        value,
        provenanceText,
        isConfirmed,
      });
    }
  }

  const isAccepted = acceptedPlanIds.includes(plan.id);
  const actions: PlanAction[] = plan.actions ? [...plan.actions] : [];

  return {
    planId: plan.id,
    title,
    headline: plan.headline,
    destinationName,
    apptTime,
    leaveTime: selectedTab.leaveTime,
    arriveTime: selectedTab.arriveTime,
    bufferText,
    prepText,
    modeTabs: Object.freeze(modeTabs),
    selectedMode: selectedTab.mode,
    map,
    steps,
    whyHabits: Object.freeze(whyHabits),
    whyDerivation: buildHumanDerivation(plan),
    isAccepted,
    actions: Object.freeze(actions),
  };
}
