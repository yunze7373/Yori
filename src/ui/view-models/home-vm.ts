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
} from '../../core/contracts/index.js';
import { formatTime, formatAheadPlan, humanizeProposalTitle } from '../living-context/presentation.js';
import { STRINGS } from '../living-context/strings.js';
import { deriveTimelineVM } from './timeline-vm.js';
import { deriveOptionCardVMs } from './option-card-vm.js';
import { deriveMapVM } from './map-vm.js';
import { getLocalIllustration } from './photo-vm.js';
import { classifyFactSource } from './provenance.js';
import {
  GroundedRecommendationVerifier,
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  type EvidenceBundle,
  type SourceRef,
} from './grounding.js';
import type {
  HomeCompositionVM,
  CandidateCardVM,
  AheadItemVM,
  ProposalItemVM,
} from './types.js';

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
}

export function buildHomeComposition(options: BuildHomeCompositionOptions): HomeCompositionVM {
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
    (plan?.intentId === 'depart'
      ? createRainEvidenceBundle({
          plan,
          snapshot,
          sceneClockIso: snapshot?.asOf ?? '2026-10-28T20:35:00.000Z',
          timezone: plan.timezone ?? snapshot?.timezone ?? 'America/Los_Angeles',
          isConfirmedHabit: userConfirmedKeys?.has('rain_transport_preference'),
        })
      : plan?.intentId === 'lunch'
        ? createLunchEvidenceBundle({
            plan,
            snapshot,
            sceneClockIso: snapshot?.asOf ?? '2026-10-28T19:10:00.000Z',
            timezone: plan?.timezone ?? snapshot?.timezone ?? 'America/Los_Angeles',
            isConfirmedTaste: userConfirmedKeys?.has('taste_preference_lunch_cuisine'),
          })
        : undefined);

  // 1. Quiet State (D4: 0 prompts is valid; honest quiet state)
  if (!plan) {
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

  const isAccepted = acceptedPlanIds.includes(plan.id);
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
    if (isRain) {
      const weatherSignal =
        snapshot?.signals.find(s => s.kind === 'weather') ??
        plan.why.evidenceSignals.find(s => s.kind === 'weather');

      const issuedTime = weatherSignal?.issuedAt ? formatTime(weatherSignal.issuedAt, tz) : undefined;
      rainInsightDesc = issuedTime
        ? `Rain in the forecast for your travel window · simulated (issued ${issuedTime}). I've prepared an updated departure schedule.`
        : `Rain in the forecast for your travel window · simulated. I've prepared an updated departure schedule.`;
    }

    let habitNote: string | undefined;
    const rainFact = plan.why.memoryFactsUsed.find(
      f => f.key === 'rain_transport_preference' && f.status === 'confirmed'
    );
    if (rainFact) {
      habitNote = rainFact.value === 'bus_first' ? STRINGS.habit.rainTransit : STRINGS.habit.rainDrive;
    }

    const calSig =
      snapshot?.signals?.find(s => s.kind === 'calendar') ??
      plan.why?.evidenceSignals?.find(s => s.kind === 'calendar');
    const calRecId =
      (calSig as any)?.id ||
      (calSig?.issuedAt ? `${calSig.kind}:${calSig.issuedAt}` : undefined) ||
      'cal-piano';

    const hasOverride = bundle?.hasRecord('user_override_timing') || bundle?.hasRecord('user-override');
    const prepRecId = hasOverride ? 'user_override_timing' : calRecId;
    const leaveRecId = hasOverride ? 'user_override_timing' : calRecId;

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
      sourceRef: { recordId: calRecId, field: 'subjectTitle' },
      fieldSourceRefs: {
        prepareTime: { recordId: prepRecId, field: 'prepareTime' },
        leaveTime: { recordId: leaveRecId, field: 'leaveTime' },
        apptTime: { recordId: calRecId, field: 'apptTime' },
      },
    };
  }

  // 3. Lunch / Candidates Layout
  if (plan.intentId === 'lunch') {
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
          const distMins = opt.distanceMinutes;
          const distText = typeof distMins === 'number' ? `${distMins}m away` : '';
          const photo = getLocalIllustration(opt.cuisine || 'dining', name);

          // Check if taste preference or cuisine fact is confirmed by the user
          const tasteFact = plan.why?.memoryFactsUsed?.find(
            f => f.key.includes('taste') || f.key.includes('cuisine')
          );
          const isConfirmed = tasteFact
            ? classifyFactSource(tasteFact, userConfirmedKeys) === 'user_confirmed'
            : false;
          const provenance = isConfirmed ? 'You confirmed' : 'Demo profile · sample';
          const basis = `Based on taste: ${cuisine} (${provenance})`;

          const recId = (opt as any).recordId || opt.id;
          const sourceRef: SourceRef = { recordId: recId, field: 'name' };
          const fieldSourceRefs: Record<string, SourceRef> = {
            name: { recordId: recId, field: 'name' },
            cuisine: { recordId: recId, field: 'cuisine' },
          };
          if (typeof distMins === 'number') {
            fieldSourceRefs.distanceMinutes = { recordId: recId, field: 'distanceMinutes' };
            fieldSourceRefs.distanceText = { recordId: recId, field: 'distanceText' };
          }

          const card: CandidateCardVM = {
            id: opt.id || `candidate-${i}`,
            name,
            cuisine,
            distanceMinutes: distMins ?? 0,
            distanceText: distText,
            basis,
            photo,
            isSelected: i === 0,
            noiseLevel: (opt as any).noiseLevel,
            vegetarian: (opt as any).vegetarian,
            sourceRef,
            fieldSourceRefs,
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

    return {
      layoutKind: 'candidates',
      planId: plan.id,
      title: STRINGS.lunch.title,
      headline: STRINGS.lunch.primaryLine,
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
      sourceRef: { recordId: 'loc-downtown', field: 'name' },
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
  proposals: readonly { key: string; value?: unknown }[]
): readonly ProposalItemVM[] {
  return Object.freeze(
    proposals.map(prop => ({
      key: prop.key,
      title: humanizeProposalTitle(prop.key),
    }))
  );
}
