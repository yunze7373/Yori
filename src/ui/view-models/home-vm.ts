/**
 * Home Composition View Model Compiler (LIVING_CONTEXT_V2.md §4)
 *
 * Rules:
 * - Derived purely from PreparedPlan, ContextSnapshot, and store state.
 * - Zero scene-id branching in presentation logic.
 * - Recomposes home by information value:
 *   - Rain/Transit: large map + timeline + route options.
 *   - Lunch: candidate cards with local illustrations + compact map + per-option basis.
 *   - Quiet: honest quiet state.
 *   - Empty groups (empty AHEAD or FOR YOU) are collapsed completely.
 * - Honest provenance: sample demo profile facts must NEVER be labelled "Confirmed".
 */

import type {
  PreparedPlan,
  PlanOption,
  SpatialMapEvidence,
  PlanAction,
  ContextSnapshot,
  MemoryFact,
} from '../../core/contracts/index.js';
import { formatTime, formatAheadPlan, humanizeProposalTitle } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';
import { deriveTimelineVM } from './timeline-vm.js';
import { deriveOptionCardVMs } from './option-card-vm.js';
import { deriveMapVM } from './map-vm.js';
import { getLocalIllustration } from './photo-vm.js';
import { formatStraightLineDistance } from '../../adapters/providers/simulated-places-provider.js';
import {
  GroundedRecommendationVerifier,
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  createLunchPlacesEvidenceBundle,
  createFuelEvidenceBundle,
  type EvidenceBundle,
  type SourceRef,
} from './grounding.js';
import type {
  HomeCompositionVM,
  CandidateCardVM,
  AheadItemVM,
  ProposalItemVM,
} from './types.js';
import { isLiveSignalExpired, type LiveSignal } from '../../adapters/providers/live-signal.js';

export interface BuildHomeCompositionOptions {
  plan: PreparedPlan | null;
  spatialEvidence: SpatialMapEvidence | null;
  aheadPlans?: readonly PreparedPlan[];
  proposals?: readonly { key: string; value?: unknown }[];
  acceptedPlanIds?: readonly string[];
  userConfirmedKeys?: ReadonlySet<string>;
  snapshot?: ContextSnapshot | null;
  canUndo?: boolean;
  evidenceBundle?: EvidenceBundle;
  planDiff?: HomeCompositionVM['planDiff'];
  weatherError?: string;
  isLoading?: boolean;
  sceneClockIso?: string;
  changeMoment?: HomeCompositionVM['changeMoment'];
  suppressedQuiet?: HomeCompositionVM['suppressedQuiet'];
  livingHeader?: HomeCompositionVM['livingHeader'];
  timelineControls?: HomeCompositionVM['timelineControls'];
  isLive?: boolean;
  weatherEnabled?: boolean;
}

export function derivePlanCountdown(
  leaveAtIso: string | undefined,
  clockIso: string | undefined
): string | undefined {
  if (!leaveAtIso || !clockIso) return undefined;
  const leaveMs = Date.parse(leaveAtIso);
  const clockMs = Date.parse(clockIso);
  if (isNaN(leaveMs) || isNaN(clockMs)) return undefined;

  const diffMinutes = Math.round((leaveMs - clockMs) / 60_000);
  if (diffMinutes <= 0) return 'now';
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return mins > 0 ? `in ${hours}h ${mins}m` : `in ${hours}h`;
  }
  return `in ${diffMinutes}m`;
}

function compileHomeComposition(options: BuildHomeCompositionOptions): HomeCompositionVM {
  const {
    plan,
    spatialEvidence,
    aheadPlans = [],
    proposals = [],
    acceptedPlanIds = [],
    userConfirmedKeys,
    snapshot,
    canUndo,
    evidenceBundle,
  } = options;

  const bundle =
    evidenceBundle ??
    (snapshot?.signals?.some(s => s.kind === 'places_lunch')
      ? createLunchPlacesEvidenceBundle({
          snapshot,
          sceneClockIso: snapshot?.asOf ?? '2026-10-28T19:10:00.000Z',
          timezone: plan?.timezone ?? snapshot?.timezone ?? 'America/Los_Angeles',
          userConfirmedKeys,
        })
      : plan?.intentId === 'depart'
        ? createRainEvidenceBundle({
            snapshot,
            sceneClockIso: snapshot?.asOf ?? '2026-10-28T20:35:00.000Z',
            timezone: plan.timezone ?? snapshot?.timezone ?? 'America/Los_Angeles',
            userConfirmedKeys,
            isConfirmedHabit: userConfirmedKeys?.has('rain_transport_preference'),
          })
        : plan?.intentId === 'lunch'
          ? createLunchEvidenceBundle({
              snapshot,
              sceneClockIso: snapshot?.asOf ?? '2026-10-28T19:10:00.000Z',
              timezone: plan?.timezone ?? snapshot?.timezone ?? 'America/Los_Angeles',
              userConfirmedKeys,
              isConfirmedTaste: userConfirmedKeys?.has('taste_preference_lunch_cuisine'),
            })
          : plan?.intentId === 'fuel' || snapshot?.signals?.some(s => s.kind === 'fuel_percent' || s.kind === 'fuel_status' || s.kind === 'places_fuel')
            ? createFuelEvidenceBundle({
                snapshot,
                sceneClockIso: snapshot?.asOf ?? '2026-10-28T19:10:00.000Z',
                timezone: plan?.timezone ?? snapshot?.timezone ?? 'America/Los_Angeles',
              })
            : undefined);

  // 1. Quiet State (D4: 0 prompts is valid; honest quiet state)
  if (!plan) {
    if (snapshot?.signals?.some(s => s.kind === 'fuel_percent' || s.kind === 'fuel_status')) {
      const locSig = snapshot.signals.find(s => s.kind === 'location_status');
      const locVal = locSig?.value as any;

      if (locVal?.status === 'prompt') {
        return {
          layoutKind: 'quiet',
          title: 'Location Needed',
          headline: 'Location permission needed to find nearby gas stations',
          basis: 'Grant location access or enter coordinates manually · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
          locationState: 'prompt',
          locationNotice: locVal?.notice || 'Location permission needed to find nearby gas stations',
        };
      }

      if (locVal?.status === 'denied') {
        return {
          layoutKind: 'quiet',
          title: 'Location Denied',
          headline: 'Location access denied by user',
          basis: 'Location permission was denied · enter coordinates manually or enable permission',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
          locationState: 'denied',
          locationNotice: locVal?.notice || 'Location access denied by user',
        };
      }

      if (locVal?.status === 'unavailable') {
        return {
          layoutKind: 'quiet',
          title: 'Location Unavailable',
          headline: 'Cannot find nearby gas stations without location access',
          basis: 'Location permission or fixture coordinates required · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
          locationState: 'unavailable',
          locationNotice: locVal?.notice || 'Cannot find nearby gas stations without location access',
        };
      }

      const placesSig = snapshot.signals.find(s => s.kind === 'places_fuel');
      const placesVal = placesSig?.value as any;
      if (placesVal?.status === 'error') {
        return {
          layoutKind: 'quiet',
          title: 'Fuel Station Lookup Failed',
          headline: 'Unable to load nearby gas stations from places provider',
          basis: 'Places provider error · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
        };
      }

      if (placesVal?.status === 'disabled') {
        return {
          layoutKind: 'quiet',
          title: 'Nearby Places Not Enabled',
          headline: 'Nearby places · not enabled (owner setting)',
          basis: 'Nearby dining places provider disabled by owner setting · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
        };
      }

      if (placesVal?.status === 'empty' || (Array.isArray(placesVal?.places) && placesVal.places.length === 0)) {
        return {
          layoutKind: 'quiet',
          title: 'No Gas Stations Nearby',
          headline: 'No fuel stations found within search radius',
          basis: 'Zero gas stations returned by provider · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
        };
      }
    }

    if (snapshot?.signals?.some(s => s.kind === 'places_lunch')) {
      const locSig = snapshot.signals.find(s => s.kind === 'location_status' || s.kind === 'location');
      const locVal = locSig?.value as any;

      if (locVal?.status === 'prompt') {
        return {
          layoutKind: 'quiet',
          title: 'Location Needed',
          headline: 'Location permission needed to find nearby lunch places',
          basis: 'Grant location access or enter coordinates manually · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
          locationState: 'prompt',
          locationNotice: locVal?.notice || 'Location permission needed to find nearby lunch places',
        };
      }

      if (locVal?.status === 'denied') {
        return {
          layoutKind: 'quiet',
          title: 'Location Denied',
          headline: 'Location access denied by user',
          basis: 'Location permission was denied · enter coordinates manually or enable permission',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
          locationState: 'denied',
          locationNotice: locVal?.notice || 'Location access denied by user',
        };
      }

      if (locVal?.status === 'unavailable') {
        return {
          layoutKind: 'quiet',
          title: 'Location Unavailable',
          headline: 'Cannot find nearby lunch places without location access',
          basis: 'Location permission or fixture coordinates required · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
          locationState: 'unavailable',
          locationNotice: locVal?.notice || 'Cannot find nearby lunch places without location access',
        };
      }

      const placesSig = snapshot.signals.find(s => s.kind === 'places_lunch');
      const placesVal = placesSig?.value as any;
      if (placesVal?.status === 'error') {
        return {
          layoutKind: 'quiet',
          title: 'Lunch Place Lookup Failed',
          headline: 'Unable to load nearby lunch places from places provider',
          basis: 'Places provider error · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
        };
      }

      if (placesVal?.status === 'disabled') {
        return {
          layoutKind: 'quiet',
          title: 'Nearby Places Not Enabled',
          headline: 'Nearby places · not enabled (owner setting)',
          basis: 'Nearby dining places provider disabled by owner setting · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
        };
      }

      if (placesVal?.status === 'empty' || (Array.isArray(placesVal?.places) && placesVal.places.length === 0)) {
        return {
          layoutKind: 'quiet',
          title: 'No Lunch Places Nearby',
          headline: 'No restaurants found within search radius',
          basis: 'Zero restaurants returned by provider · fails closed',
          isRain: false,
          options: [],
          isAccepted: false,
          canUndo: false,
          actions: [],
          aheadItems: compileAheadItems(aheadPlans),
          proposals: compileProposals(proposals),
          evidenceBundle: bundle,
        };
      }
    }

    return {
      layoutKind: 'quiet',
      title: STRINGS.quietState.title,
      headline: STRINGS.quietState.subtitle,
      basis: 'No proactive reminders needed for your schedule right now.',
      isRain: false,
      options: [],
      isAccepted: false,
      actions: [],
      aheadItems: compileAheadItems(aheadPlans),
      proposals: compileProposals(proposals),
    };
  }

  const isAccepted = isPlanAccepted(plan, acceptedPlanIds);
  const actions: PlanAction[] = plan.actions ? [...plan.actions] : [];

  // 2. Journey / Depart Layout (Clear & Rain)
  if (plan.intentId === 'depart') {
    const tz = plan.timezone;
    const apptTimeStr = formatTime(plan.apptAt, tz);
    const title = plan.subjectTitle
      ? `${plan.subjectTitle}${apptTimeStr ? ` at ${apptTimeStr}` : ''}`
      : plan.headline;

    const prepareStr = formatTime(plan.prepareAt, tz);
    const leaveStr = formatTime(plan.leaveAt, tz);
    const headline =
      prepareStr && leaveStr
        ? `Get ready at ${prepareStr}, leave by ${leaveStr}`
        : plan.headline;

    const hasRainChecklist = plan.checklist?.includes('umbrella') ?? false;
    const isRain =
      hasRainChecklist ||
      plan.why.evidenceSignals.some(s => s.description?.toLowerCase().includes('rain'));

    let rainInsightDesc: string | undefined;
    const weatherSignal = isRain
      ? snapshot?.signals.find(s => s.kind === 'weather') ??
        plan.why.evidenceSignals.find(s => s.kind === 'weather')
      : undefined;
    const weatherRecId =
      (weatherSignal as any)?.id ||
      (weatherSignal?.issuedAt ? `${weatherSignal.kind}:${weatherSignal.issuedAt}` : undefined) ||
      'weather-rain';
    const weatherIssuedTime = weatherSignal?.issuedAt ? formatTime(weatherSignal.issuedAt, tz) : undefined;

    if (isRain) {
      rainInsightDesc = weatherIssuedTime
        ? `Rain in the forecast for your travel window · simulated (issued ${weatherIssuedTime}). I've prepared an updated departure schedule.`
        : `Rain in the forecast for your travel window · simulated. I've prepared an updated departure schedule.`;
    }

    let habitNote: string | undefined;
    const rainHabitRec = bundle?.getRecord('rain_transport_preference');
    if (rainHabitRec) {
      habitNote = rainHabitRec.fields?.value === 'bus_first' ? STRINGS.habit.rainTransit : STRINGS.habit.rainDrive;
    }

    const calSig =
      snapshot?.signals?.find(s => s.kind === 'calendar') ??
      plan.why?.evidenceSignals?.find(s => s.kind === 'calendar');
    const calRecId =
      (calSig as any)?.id ||
      (calSig?.issuedAt ? `${calSig.kind}:${calSig.issuedAt}` : undefined) ||
      'cal-piano';

    const hasOverride = bundle?.hasRecord('user_override_timing') || bundle?.hasRecord('user-override');
    const etaRecId = 'eta-drive-piano';
    const prepRecId = hasOverride ? 'user_override_timing' : etaRecId;
    const leaveRecId = hasOverride ? 'user_override_timing' : etaRecId;

    let displayTitle = title;
    let displayHeadline = headline;
    let rainBanner: string | undefined = isRain ? STRINGS.rain.whatChanged : undefined;

    if (bundle) {
      if (plan.apptAt) {
        const vAppt = GroundedRecommendationVerifier.verifyField(
          { recordId: calRecId, field: 'apptTime' },
          apptTimeStr,
          bundle
        );
        if (!vAppt.valid) {
          displayTitle = 'unknown';
        }
      }
      if (plan.prepareAt && prepareStr) {
        const vPrep = GroundedRecommendationVerifier.verifyField(
          { recordId: prepRecId, field: 'prepareTime' },
          prepareStr,
          bundle
        );
        if (!vPrep.valid) {
          displayHeadline = 'unknown';
        }
      }
      if (plan.leaveAt && leaveStr) {
        const vLeave = GroundedRecommendationVerifier.verifyField(
          { recordId: leaveRecId, field: 'leaveTime' },
          leaveStr,
          bundle
        );
        if (!vLeave.valid) {
          displayHeadline = 'unknown';
        }
      }
      if (isRain && rainBanner) {
        const weatherSig =
          snapshot?.signals?.find(s => s.kind === 'weather') ??
          plan.why?.evidenceSignals?.find(s => s.kind === 'weather');
        const weatherRecId =
          (weatherSig as any)?.id ||
          (weatherSig?.issuedAt ? `${weatherSig.kind}:${weatherSig.issuedAt}` : undefined) ||
          'weather:2026-10-28T20:35:00.000Z';
        const vBanner = GroundedRecommendationVerifier.verifyField(
          { recordId: weatherRecId, field: 'rainBanner' },
          rainBanner,
          bundle
        );
        if (!vBanner.valid) {
          rainBanner = 'unknown';
        }
      }
    }

    const map = deriveMapVM(plan, spatialEvidence, 'prominent', { snapshot, evidenceBundle: bundle });
    const timeline = deriveTimelineVM(plan, snapshot, undefined, bundle);
    const optionCards = deriveOptionCardVMs(plan, userConfirmedKeys, bundle);

    const selectedOption = (
      plan.optionsOrSteps?.find(o => typeof o === 'object' && o !== null && (o as any).isSelected) ??
      plan.optionsOrSteps?.find(o => typeof o === 'object' && o !== null)
    ) as PlanOption | undefined;
    const travelMinutes = selectedOption?.travelMinutes ?? (selectedOption as any)?.estimatedMinutes ?? 25;
    const leaveMs = plan.leaveAt ? Date.parse(plan.leaveAt) : NaN;
    const arriveTimeStr = !isNaN(leaveMs)
      ? formatTime(new Date(leaveMs + travelMinutes * 60_000).toISOString(), tz)
      : undefined;

    const effectiveClock = options.sceneClockIso ?? snapshot?.asOf;
    const countdownStr = derivePlanCountdown(plan.leaveAt, effectiveClock);

    return {
      layoutKind: 'journey',
      planId: plan.id,
      title: displayTitle,
      headline: displayHeadline,
      basis: STRINGS.depart.basisLine,
      isRain,
      rainBanner,
      rainInsightDesc,
      umbrellaChip: hasRainChecklist ? STRINGS.rain.umbrellaChip : undefined,
      habitNote,
      map,
      timeline,
      options: optionCards,
      isAccepted,
      canUndo,
      actions,
      aheadItems: compileAheadItems(aheadPlans),
      proposals: compileProposals(proposals),
      evidenceBundle: bundle,
      subjectTitle: plan.subjectTitle || 'Piano lesson',
      apptTimeStr,
      prepareTimeStr: prepareStr,
      leaveTimeStr: leaveStr,
      arriveTimeStr,
      countdownStr,
      weatherIssuedTime,
      sourceRef: { recordId: calRecId, field: 'subjectTitle' },
      fieldSourceRefs: {
        prepareTime: { recordId: prepRecId, field: 'prepareTime' },
        leaveTime: { recordId: leaveRecId, field: 'leaveTime' },
        apptTime: { recordId: calRecId, field: 'apptTime' },
        subjectTitle: { recordId: calRecId, field: 'subjectTitle' },
        ...(isRain && weatherIssuedTime
          ? { weatherIssuedTime: { recordId: weatherRecId, field: 'issuedTime' } }
          : {}),
      },
    };
  }

  // 3. Lunch / Candidates Layout
  if (plan.intentId === 'lunch') {
    const isDynamicLunch = Boolean(snapshot?.signals?.some(s => s.kind === 'places_lunch'));
    const candidateCards: CandidateCardVM[] = [];
    if (plan.optionsOrSteps) {
      for (let i = 0; i < plan.optionsOrSteps.length; i++) {
        const raw = plan.optionsOrSteps[i];
        if (typeof raw === 'string') {
          const photo = getLocalIllustration('dining');
          candidateCards.push({
            id: `candidate-${i}`,
            name: raw,
            cuisine: 'Dining',
            distanceMinutes: 5,
            distanceText: '5m away',
            basis: 'Nearby option',
            photo,
            isSelected: i === 0,
          });
        } else {
          const opt = raw as PlanOption;
          const name = opt.name || opt.label;
          const cuisine = opt.cuisine ? opt.cuisine.charAt(0).toUpperCase() + opt.cuisine.slice(1) : 'Dining';
          const distMins = isDynamicLunch ? undefined : opt.distanceMinutes;
          const straightLineDist =
            (opt as any).straightLineDistanceLabel ||
            (typeof (opt as any).straightLineDistanceMeters === 'number'
              ? formatStraightLineDistance((opt as any).straightLineDistanceMeters)
              : undefined);
          const distText = isDynamicLunch
            ? (straightLineDist ?? '')
            : (typeof distMins === 'number' ? `${distMins}m away` : '');
          const photo = getLocalIllustration(opt.cuisine || 'dining', name);

          // Check if taste preference or cuisine fact is confirmed by the user
          const habitRec =
            bundle?.getRecord('taste_preference') ||
            bundle?.getRecord('favorite_cuisine') ||
            bundle?.getRecord('taste_preference_lunch_cuisine') ||
            bundle?.getAllRecords().find(r => r.kind === 'habit');
          const isConfirmed = habitRec?.provenance === 'confirmed';
          const provenance = isConfirmed ? 'You confirmed' : 'Demo profile · sample';
          const basis = `Based on taste: ${cuisine} (${provenance})`;

          const recId = (opt as any).recordId || opt.id;
          const sourceRef: SourceRef = { recordId: recId, field: 'name' };
          const fieldSourceRefs: Record<string, SourceRef> = {
            name: { recordId: recId, field: 'name' },
            cuisine: { recordId: recId, field: 'cuisine' },
          };
          if (isDynamicLunch) {
            if (straightLineDist) {
              fieldSourceRefs.distanceText = { recordId: recId, field: 'straightLineDistanceLabel' };
            }
          } else {
            if (typeof distMins === 'number') {
              fieldSourceRefs.distanceMinutes = { recordId: recId, field: 'distanceMinutes' };
              fieldSourceRefs.distanceText = { recordId: recId, field: 'distanceText' };
            }
          }
          if (
            habitRec &&
            bundle &&
            bundle.hasRecord(habitRec.id) &&
            (habitRec.fields.cuisine === cuisine || habitRec.fields.value === opt.cuisine)
          ) {
            fieldSourceRefs.basis = {
              recordId: habitRec.id,
              field: 'basis',
            };
          }

          const card: CandidateCardVM = {
            id: opt.id || `candidate-${i}`,
            name,
            cuisine,
            distanceMinutes: isDynamicLunch ? undefined : (distMins ?? 0),
            distanceText: distText,
            basis,
            photo,
            isSelected: i === 0,
            noiseLevel: (opt as any).noiseLevel,
            vegetarian: (opt as any).vegetarian,
            sourceRef,
            fieldSourceRefs,
            openingStatus: (opt as any).openingStatus,
            openNow: (opt as any).openNow,
            osmId: (opt as any).osmId,
            coords: (opt as any).coords,
            fetchedAt: (opt as any).fetchedAt,
            attribution: (opt as any).attribution,
          };

          if (bundle) {
            const verification = GroundedRecommendationVerifier.verifyCandidateCard(card, bundle);
            if (!verification.valid) {
              // Withhold candidate card if verification fails
              continue;
            }
          }

          candidateCards.push(card);
        }
      }
    }

    const map = deriveMapVM(plan, spatialEvidence, 'compact', { snapshot, evidenceBundle: bundle });

    let locationLabel: string | undefined;
    if (isDynamicLunch) {
      const locSig = snapshot?.signals?.find(s => s.kind === 'location_status' || s.kind === 'location');
      const locVal = locSig?.value as any;
      const locSource = locVal?.source;
      if (options.isLive) {
        locationLabel = locVal?.currentArea || locVal?.label || locVal?.name || 'Location shared';
      } else {
        locationLabel = 'Selected City (simulated)';
        if (locSource === 'manual') {
          if (locVal?.lat && Math.abs(locVal.lat - 34.0522) < 0.05) {
            locationLabel = 'Los Angeles (manual)';
          } else if (locVal?.lat && Math.abs(locVal.lat - 37.7749) < 0.05) {
            locationLabel = 'San Francisco (manual)';
          } else if (locVal?.lat && locVal?.lng) {
            locationLabel = `Custom Location (${locVal.lat.toFixed(2)}, ${locVal.lng.toFixed(2)}) (manual)`;
          } else {
            locationLabel = 'Manual Location';
          }
        } else if (locSource === 'geolocation') {
          locationLabel = 'Acquired Position (live geolocation)';
        }
      }
    }

    return {
      layoutKind: 'candidates',
      planId: plan.id,
      title: STRINGS.lunch.title,
      headline: isDynamicLunch ? 'Nearby places (straight-line distances)' : STRINGS.lunch.primaryLine,
      basis: STRINGS.lunch.basisLine,
      isRain: false,
      map,
      options: [],
      candidateCards: Object.freeze(candidateCards),
      isAccepted,
      canUndo,
      actions,
      aheadItems: compileAheadItems(aheadPlans),
      proposals: compileProposals(proposals),
      evidenceBundle: bundle,
      sourceRef: { recordId: isDynamicLunch ? 'loc-lunch-origin' : 'loc-downtown', field: 'name' },
      locationLabel,
    };
  }

  // 4. Fuel / Gas Stations Layout (V5-FUEL)
  if (plan.intentId === 'fuel') {
    const candidateCards: CandidateCardVM[] = [];
    if (plan.optionsOrSteps) {
      for (let i = 0; i < plan.optionsOrSteps.length; i++) {
        const raw = plan.optionsOrSteps[i];
        if (typeof raw === 'object' && raw !== null) {
          const opt = raw as any;
          const name = opt.name || opt.label;
          const straightLineDist =
            opt.straightLineDistanceLabel ||
            (opt.straightLineDistanceMeters !== undefined
              ? formatStraightLineDistance(opt.straightLineDistanceMeters)
              : undefined);
          if (!straightLineDist) {
            continue;
          }
          const photo = getLocalIllustration('fuel', name);
          const basis = opt.brand ? `Simulated fixture · ${opt.brand}` : 'Simulated fixture';

          const recId = opt.recordId || opt.id || opt.placeId;
          const sourceRef: SourceRef = { recordId: recId, field: 'name' };
          const fieldSourceRefs: Record<string, SourceRef> = {
            name: { recordId: recId, field: 'name' },
            distanceText: { recordId: recId, field: 'straightLineDistanceLabel' },
          };

          const card: CandidateCardVM = {
            id: opt.id || opt.placeId || `fuel-cand-${i}`,
            name,
            cuisine: 'Gas Station',
            distanceText: straightLineDist,
            basis,
            photo,
            isSelected: i === 0,
            sourceRef,
            fieldSourceRefs,
          };

          if (bundle) {
            const verification = GroundedRecommendationVerifier.verifyCandidateCard(card, bundle);
            if (!verification.valid) {
              continue;
            }
          }

          candidateCards.push(card);
        }
      }
    }

    let headline = plan.headline;
    const topOption = plan.optionsOrSteps?.[0] as any;
    const topRecId = topOption ? (topOption.recordId || topOption.id || topOption.placeId) : undefined;
    const topName = topOption?.name;
    const topDistClean = topOption?.straightLineDistanceLabel
      ? topOption.straightLineDistanceLabel.replace(' (straight-line)', ' straight-line')
      : undefined;

    if (bundle && topOption) {
      const vHead = GroundedRecommendationVerifier.verifyField(
        { recordId: topRecId, field: 'name' },
        topOption.name,
        bundle
      );
      if (!vHead.valid) {
        headline = 'unknown';
      }
    }

    const map = deriveMapVM(plan, spatialEvidence, 'compact', { snapshot, evidenceBundle: bundle });
    const spatialName = (spatialEvidence?.placeOrRoute as any)?.name;
    if (bundle && map && spatialName && topOption) {
      const topRecId = topOption.recordId || topOption.id || topOption.placeId;
      const vMap = GroundedRecommendationVerifier.verifyField(
        { recordId: topRecId, field: 'name' },
        spatialName,
        bundle
      );
      if (!vMap.valid) {
        (map as any).destinationName = 'unknown';
        (map as any).title = 'unknown';
      }
    }

    const locSig = snapshot?.signals?.find(s => s.kind === 'location_status' || s.kind === 'location');
    const locVal = locSig?.value as any;
    const locSource = locVal?.source;
    let locationLabel = options.isLive
      ? (locVal?.currentArea || locVal?.label || locVal?.name || 'Location shared')
      : 'Selected City (simulated)';
    if (!options.isLive) {
      if (locSource === 'manual') {
        if (locVal?.lat && Math.abs(locVal.lat - 34.0522) < 0.05) {
          locationLabel = 'Los Angeles (manual)';
        } else if (locVal?.lat && Math.abs(locVal.lat - 37.7749) < 0.05) {
          locationLabel = 'San Francisco (manual)';
        } else if (locVal?.lat && locVal?.lng) {
          locationLabel = `Custom Location (${locVal.lat.toFixed(2)}, ${locVal.lng.toFixed(2)}) (manual)`;
        } else {
          locationLabel = 'Manual Location';
        }
      } else if (locSource === 'geolocation') {
        locationLabel = 'Acquired Position (live geolocation)';
      }
    }

    return {
      layoutKind: 'candidates',
      planId: plan.id,
      title: 'Low Fuel Warning',
      headline,
      topCandidateName: topName,
      topCandidateDistance: topDistClean,
      basis: 'Nearby gas stations · straight-line distances · simulated',
      isRain: false,
      map,
      options: [],
      candidateCards: Object.freeze(candidateCards),
      isAccepted,
      canUndo,
      actions,
      aheadItems: compileAheadItems(aheadPlans),
      proposals: compileProposals(proposals),
      evidenceBundle: bundle,
      sourceRef: { recordId: 'loc-fuel-origin', field: 'name' },
      fieldSourceRefs: topRecId ? {
        topCandidateName: { recordId: topRecId, field: 'name' },
        topCandidateDistance: { recordId: topRecId, field: 'straightLineDistanceLabel' },
      } : undefined,
      locationLabel,
    };
  }

  // 4. Generic Fallback
  return {
    layoutKind: 'generic',
    planId: plan.id,
    title: plan.headline,
    headline: plan.headline,
    basis: 'Current recommended plan',
    isRain: false,
    options: deriveOptionCardVMs(plan, userConfirmedKeys),
    isAccepted,
    actions,
    aheadItems: compileAheadItems(aheadPlans),
    proposals: compileProposals(proposals),
  };
}

function compileAheadItems(aheadPlans: readonly PreparedPlan[]): readonly AheadItemVM[] {
  return Object.freeze(
    aheadPlans.map(p => {
      const formatted = formatAheadPlan(p);
      return {
        id: p.id,
        title: formatted.title,
        subtitle: formatted.subtitle,
      };
    })
  );
}

function compileProposals(
  proposals: readonly { key: string; value?: unknown; status?: string; basis?: string; provenance?: 'user' | 'fixture' | 'none' }[]
): readonly ProposalItemVM[] {
  return Object.freeze(
    proposals.map(prop => ({
      key: prop.key,
      title: humanizeProposalTitle(prop.key),
      basis: prop.basis,
      provenance: prop.provenance || (prop.status === 'confirmed' || prop.basis?.includes('Confirmed') ? 'user' : 'fixture'),
      value: prop.value,
    }))
  );
}

/**
 * Checks if a plan is accepted, ensuring lunch plans (keyed on asOf timestamp)
 * remain stably accepted across ticks within the same calendar day.
 */
export function isPlanAccepted(plan: PreparedPlan, acceptedPlanIds: readonly string[]): boolean {
  if (acceptedPlanIds.includes(plan.id)) {
    return true;
  }
  if (plan.intentId === 'lunch' || plan.id.startsWith('plan-lunch-')) {
    const planDatePart = plan.id.slice(11, 19);
    if (planDatePart.length === 8) {
      return acceptedPlanIds.some(
        id => id.startsWith('plan-lunch-') && id.slice(11, 19) === planDatePart
      );
    }
  }
  return false;
}

/**
 * Removes an accepted plan from the accepted plan IDs list, including any
 * same-day lunch plan timestamp variants for that plan.
 */
export function removeAcceptedPlan(plan: PreparedPlan, acceptedPlanIds: readonly string[]): string[] {
  return acceptedPlanIds.filter(id => {
    if (id === plan.id) return false;
    if (plan.intentId === 'lunch' && id.startsWith('plan-lunch-') && plan.id.startsWith('plan-lunch-')) {
      const planDate = plan.id.slice(11, 19);
      if (planDate.length === 8 && id.slice(11, 19) === planDate) {
        return false;
      }
    }
    return true;
  });
}

export function buildHomeComposition(options: BuildHomeCompositionOptions): HomeCompositionVM {
  const raw = compileHomeComposition(options);

  const weatherSig = options.snapshot?.signals.find(s => s.kind === 'weather');
  const liveWeatherSig = weatherSig as (Partial<LiveSignal> | undefined);
  const isWeatherUnavailable =
    !weatherSig ||
    options.weatherEnabled === false ||
    options.weatherError ||
    liveWeatherSig?.status === 'unavailable' ||
    liveWeatherSig?.status === 'stale' ||
    liveWeatherSig?.status === 'error' ||
    liveWeatherSig?.status === 'permission_needed' ||
    Boolean((liveWeatherSig as any)?.isStale) ||
    Boolean(
      options.isLive &&
        liveWeatherSig &&
        liveWeatherSig.validFor &&
        liveWeatherSig.asOf &&
        options.snapshot?.asOf &&
        isLiveSignalExpired(liveWeatherSig as LiveSignal, options.snapshot.asOf)
    );

  const weatherVal = isWeatherUnavailable ? undefined : (weatherSig?.value as any);
  const weatherSignalValue =
    weatherVal && typeof weatherVal === 'object'
      ? {
          condition: typeof weatherVal.condition === 'string' ? weatherVal.condition : undefined,
          temperatureC: typeof weatherVal.temperatureC === 'number' ? weatherVal.temperatureC : undefined,
          precipProbability: typeof weatherVal.precipProbability === 'number' ? weatherVal.precipProbability : undefined,
        }
      : undefined;

  const memSig = options.snapshot?.signals.find(s => s.kind === 'memory_facts');
  const memList = Array.isArray(memSig?.value) ? (memSig.value as MemoryFact[]) : [];
  const confirmedMemFromSig = memList.find(f => f && f.status === 'confirmed');
  const confirmedMemFromPlan = options.plan?.why?.memoryFactsUsed?.find(
    f => f && (f.status === 'confirmed' || options.userConfirmedKeys?.has(f.key))
  );
  const confirmedFact = confirmedMemFromSig || confirmedMemFromPlan;
  let confirmedMemoryFact: string | undefined;
  let confirmedMemoryNote: string | undefined;
  if (confirmedFact) {
    confirmedMemoryFact = confirmedFact.key;
    const valStr = typeof confirmedFact.value === 'string' ? confirmedFact.value : (confirmedFact.value ? JSON.stringify(confirmedFact.value) : '');
    const cleanKey = confirmedFact.key.includes('taste') ? 'Taste' : humanizeProposalTitle(confirmedFact.key);
    confirmedMemoryNote = valStr ? `${cleanKey}: ${valStr} (confirmed)` : `${cleanKey} (confirmed)`;
  }

  return {
    ...raw,
    planDiff: options.planDiff ?? null,
    weatherError: options.weatherError,
    isLoading: Boolean(options.isLoading),
    changeMoment: options.changeMoment ?? raw.changeMoment,
    suppressedQuiet: options.suppressedQuiet ?? raw.suppressedQuiet,
    livingHeader: options.livingHeader ?? raw.livingHeader,
    timelineControls: options.timelineControls ?? raw.timelineControls,
    isLive: Boolean(options.isLive),
    weatherEnabled: options.weatherEnabled,
    weatherSignalValue,
    confirmedMemoryFact,
    confirmedMemoryNote,
  };
}
