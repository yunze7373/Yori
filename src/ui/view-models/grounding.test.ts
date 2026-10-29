import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  createEvidenceBundle,
  GroundedRecommendationVerifier,
  buildNavigateUrl,
  normalizeFieldValue,
  isRecordFresh,
  type EvidenceRecord,
  type SourceRef,
} from './grounding.js';
import { buildHomeComposition } from './home-vm.js';
import { deriveOptionCardVMs } from './option-card-vm.js';
import { deriveRestaurantDetailVM } from './restaurant-detail-vm.js';
import { deriveTripDetailVM } from './trip-detail-vm.js';
import { deriveTimelineVM } from './timeline-vm.js';
import { deriveMapVM } from './map-vm.js';
import { globalDecisionLogger } from '../../adapters/model/decision-log.js';
import type { PreparedPlan } from '../../core/contracts/index.js';

describe('G12-CORE: Grounded Recommendation Verification & Evidence Bundles', () => {
  beforeEach(() => {
    globalDecisionLogger.clear();
  });

  const rainPlan: PreparedPlan = {
    id: 'plan-d2-rain',
    intentId: 'depart',
    headline: 'Piano lesson at 3:00 PM',
    subjectTitle: 'Piano Studio (Rain Route)',
    apptAt: '2026-10-28T22:00:00.000Z', // 3:00 PM PDT
    prepareAt: '2026-10-28T21:10:00.000Z', // 2:10 PM PDT
    leaveAt: '2026-10-28T21:30:00.000Z', // 2:30 PM PDT
    timezone: 'America/Los_Angeles',
    checklist: ['umbrella'],
    optionsOrSteps: [
      {
        id: 'opt-drive',
        label: 'Drive · 25 min',
        mode: 'drive',
        travelMinutes: 25,
        leaveAt: '2026-10-28T21:30:00.000Z',
        requiresConfirmation: false,
        rankedByFactKey: 'rain_transport_preference',
        details: '25 min drive + 5 min buffer',
      },
      {
        id: 'opt-bus',
        label: 'Bus · 40 min',
        mode: 'bus',
        travelMinutes: 40,
        leaveAt: '2026-10-28T21:15:00.000Z',
        requiresConfirmation: false,
        details: '40 min bus + 5 min buffer',
      },
    ],
    requiresConfirmation: false,
    why: {
      derivation: 'Re-plan: rain forecast',
      evidenceSignals: [
        {
          kind: 'weather',
          source: 'simulated',
          issuedAt: '2026-10-28T20:35:00.000Z',
          description: 'Rain forecast moderate at 1:35 PM',
        },
      ],
      memoryFactsUsed: [
        {
          key: 'prep_buffer_minutes',
          value: 5,
          status: 'confirmed',
        },
        {
          key: 'rain_transport_preference',
          value: 'drive_first',
          status: 'confirmed',
        },
      ],
    },
    createdAt: '2026-10-28T20:35:00.000Z',
  };

  const lunchPlan: PreparedPlan = {
    id: 'plan-d3-lunch',
    intentId: 'lunch',
    headline: 'Lunch options near you',
    timezone: 'America/Los_Angeles',
    optionsOrSteps: [
      {
        id: 'mock-place-1',
        label: 'Demo Place A · Ramen',
        name: 'Demo Place A · Ramen',
        cuisine: 'japanese',
        distanceMinutes: 5,
        requiresConfirmation: false,
      },
      {
        id: 'mock-place-2',
        label: 'Demo Place B · Salad',
        name: 'Demo Place B · Salad',
        cuisine: 'salad',
        distanceMinutes: 7,
        requiresConfirmation: false,
      },
    ],
    requiresConfirmation: false,
    why: {
      derivation: 'Lunch options citing taste',
      evidenceSignals: [
        {
          kind: 'location_status',
          source: 'simulated',
          issuedAt: '2026-10-28T19:10:00.000Z',
          description: 'Downtown area',
        },
      ],
      memoryFactsUsed: [
        {
          key: 'taste_preference_lunch_cuisine',
          value: 'japanese',
          status: 'confirmed',
        },
      ],
    },
    createdAt: '2026-10-28T19:10:00.000Z',
  };

  describe('Part 1: Positive Suite - Grounded Fixture Resolution', () => {
    it('Rain scene: resolves every place, number, and time via sourceRef with normalized equality', () => {
      const bundle = createRainEvidenceBundle({
        plan: rainPlan,
        isConfirmedHabit: true,
      });
      const cards = deriveOptionCardVMs(rainPlan, new Set(['rain_transport_preference']), bundle);

      expect(cards).toHaveLength(2);

      // Verify drive card grounding
      const driveCard = cards.find(c => c.mode === 'drive')!;
      expect(driveCard).toBeDefined();
      expect(driveCard.sourceRef).toEqual({ recordId: 'eta-drive-piano', field: 'mode' });
      expect(driveCard.fieldSourceRefs).toBeDefined();
      expect(driveCard.fieldSourceRefs!.mode).toEqual({ recordId: 'eta-drive-piano', field: 'mode' });
      expect(driveCard.fieldSourceRefs!.travelMinutes).toEqual({ recordId: 'eta-drive-piano', field: 'travelMinutes' });
      expect(driveCard.fieldSourceRefs!.badge).toEqual({ recordId: 'eta-drive-piano', field: 'badge' });

      // Verifier passes on clean card
      const driveVerify = GroundedRecommendationVerifier.verifyOptionCard(driveCard, bundle);
      expect(driveVerify.valid).toBe(true);

      // Verify bus card grounding
      const busCard = cards.find(c => c.mode === 'bus')!;
      expect(busCard).toBeDefined();
      expect(busCard.sourceRef).toEqual({ recordId: 'eta-bus-piano', field: 'mode' });
      const busVerify = GroundedRecommendationVerifier.verifyOptionCard(busCard, bundle);
      expect(busVerify.valid).toBe(true);

      // Home composition has sourceRef attached
      const home = buildHomeComposition({
        plan: rainPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
        userConfirmedKeys: new Set(['rain_transport_preference']),
      });
      expect(home.sourceRef).toEqual({ recordId: 'cal-piano', field: 'subjectTitle' });
      expect(home.fieldSourceRefs).toBeDefined();

      // Trip detail VM derives verified apptTime from bundle
      const tripDetail = deriveTripDetailVM({
        plan: rainPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
        userConfirmedKeys: new Set(['rain_transport_preference']),
      });
      expect(tripDetail.apptTime).toBe('3:00 PM');
      expect(tripDetail.sourceRef).toEqual({ recordId: 'cal-piano', field: 'subjectTitle' });
    });

    it('Lunch scene: resolves place name, cuisine, and distance via sourceRef with normalized equality', () => {
      const bundle = createLunchEvidenceBundle({ plan: lunchPlan });
      const home = buildHomeComposition({
        plan: lunchPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
        userConfirmedKeys: new Set(['taste_preference_lunch_cuisine']),
      });

      expect(home.layoutKind).toBe('candidates');
      expect(home.candidateCards).toHaveLength(2);

      const ramenCand = home.candidateCards![0]!;
      expect(ramenCand.name).toBe('Demo Place A · Ramen');
      expect(ramenCand.sourceRef).toEqual({ recordId: 'mock-place-1', field: 'name' });
      expect(ramenCand.fieldSourceRefs!.cuisine).toEqual({ recordId: 'mock-place-1', field: 'cuisine' });
      expect(ramenCand.fieldSourceRefs!.distanceMinutes).toEqual({ recordId: 'mock-place-1', field: 'distanceMinutes' });

      // Verify Candidate Card passes
      const candVerify = GroundedRecommendationVerifier.verifyCandidateCard(ramenCand, bundle);
      expect(candVerify.valid).toBe(true);

      // Restaurant detail VM computes valid navigateUrl
      const detail = deriveRestaurantDetailVM({
        candidateId: 'mock-place-1',
        plan: lunchPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
        userConfirmedKeys: new Set(['taste_preference_lunch_cuisine']),
      });
      expect(detail.name).toBe('Demo Place A · Ramen');
      expect(detail.navigateUrl).toBe('yori://navigate?id=mock-place-1&name=Demo%20Place%20A%20%C2%B7%20Ramen');
    });

    it('Normalizes time (12h/24h), duration, distance, and place names correctly', () => {
      const tz = 'America/Los_Angeles';

      // Time normalization
      expect(normalizeFieldValue('leaveTime', '2:30 PM', tz)).toBe('2:30 PM');
      expect(normalizeFieldValue('leaveTime', '14:30', tz)).toBe('2:30 PM');
      expect(normalizeFieldValue('apptAt', '2026-10-28T22:00:00.000Z', tz)).toBe('3:00 PM');

      // Duration & distance normalization
      expect(normalizeFieldValue('travelMinutes', 25, tz)).toBe(25);
      expect(normalizeFieldValue('travelMinutes', '25 min', tz)).toBe(25);
      expect(normalizeFieldValue('distanceMinutes', '5m away', tz)).toBe(5);
      expect(normalizeFieldValue('distanceMinutes', 5, tz)).toBe(5);

      // Name & cuisine normalization
      expect(normalizeFieldValue('name', '  Ramen Ichiko  ', tz)).toBe('Ramen Ichiko');
      expect(normalizeFieldValue('cuisine', 'Japanese', tz)).toBe('japanese');
      expect(normalizeFieldValue('mode', 'Drive', tz)).toBe('drive');
    });
  });

  describe('Part 2: G2 Negative Verification Suite (Fails Closed)', () => {
    it('(1) Tampered displayed value -> fails closed, field shows "unknown" or card withheld, redacted log', () => {
      const bundle = createRainEvidenceBundle({ plan: rainPlan });
      const cards = deriveOptionCardVMs(rainPlan, new Set(), bundle);
      const driveCard = cards.find(c => c.mode === 'drive')!;

      // Tamper driveCard travelMinutes (grounded numeric field)
      const tamperedCard = {
        ...driveCard,
        travelMinutes: 99, // Tampered! Expected 25
      };

      const result = GroundedRecommendationVerifier.verifyOptionCard(tamperedCard, bundle);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('tampered_value');
      expect(result.field).toBe('travelMinutes');

      // Check Decision Log entry
      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('tampered_value');
      expect(latest.outputReasonCodes).toContain('tampered_value');
      expect(latest.inputSignalIds).toEqual(['eta-drive-piano']);
      expect(latest.inputFactKeys).toEqual(['travelMinutes']);

      // Restaurant detail with tampered name
      const lunchBundle = createLunchEvidenceBundle({ plan: lunchPlan });
      const tamperedLunchPlan: PreparedPlan = {
        ...lunchPlan,
        optionsOrSteps: [
          {
            id: 'mock-place-1',
            label: 'Tampered Hacker Bistro',
            name: 'Tampered Hacker Bistro',
            cuisine: 'japanese',
            distanceMinutes: 5,
            requiresConfirmation: false,
          },
        ],
      };

      const detail = deriveRestaurantDetailVM({
        candidateId: 'mock-place-1',
        plan: tamperedLunchPlan,
        spatialEvidence: null,
        evidenceBundle: lunchBundle,
      });

      expect(detail.name).toBe('unknown');
      expect(detail.navigateUrl).toBeUndefined();
    });

    it('(2) Missing source reference -> fails closed, field shows "unknown" or card withheld, redacted log', () => {
      const bundle = createRainEvidenceBundle({ plan: rainPlan });

      const ghostRef: SourceRef = {
        recordId: 'non-existent-record-xyz',
        field: 'travelMinutes',
      };

      const result = GroundedRecommendationVerifier.verifyField(ghostRef, 25, bundle);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('missing_ref');

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('missing_ref');
      expect(latest.inputSignalIds).toEqual(['non-existent-record-xyz']);
      expect(latest.inputFactKeys).toEqual(['travelMinutes']);
    });

    it('(3) Stale fetchedAt vs scene clock -> fails closed, redacted log', () => {
      // Create a bundle where the weather record is 2 hours older than scene clock (validFor: 1h)
      const staleWeatherRecord: EvidenceRecord = {
        id: 'weather-stale',
        provider: 'weather',
        kind: 'weather',
        fetchedAt: '2026-10-28T18:00:00.000Z', // 2.5 hours prior to scene clock 20:35
        validFor: 3600000, // 1 hour validity
        provenance: 'simulated',
        fields: {
          condition: 'rain',
          description: 'Stale Rain Forecast',
        },
      };

      const staleBundle = createEvidenceBundle('bundle-stale', '2026-10-28T20:35:00.000Z', [staleWeatherRecord]);
      expect(isRecordFresh(staleWeatherRecord, staleBundle.sceneClockIso)).toBe(false);

      const ref: SourceRef = { recordId: 'weather-stale', field: 'condition' };
      const result = GroundedRecommendationVerifier.verifyField(ref, 'rain', staleBundle);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('stale_record');

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('stale_record');
      expect(latest.inputSignalIds).toEqual(['weather-stale']);
    });

    it('(4) Simulated mislabelled as live -> fails closed, redacted log', () => {
      const bundle = createRainEvidenceBundle({ plan: rainPlan });
      const driveRef: SourceRef = { recordId: 'eta-drive-piano', field: 'travelMinutes' };

      // Expecting 'live' provenance when underlying record is 'simulated'
      const result = GroundedRecommendationVerifier.verifyField(driveRef, 25, bundle, 'live');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('simulated_mislabelled_as_live');

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('simulated_mislabelled_as_live');
      expect(latest.inputSignalIds).toEqual(['eta-drive-piano']);
      expect(latest.inputFactKeys).toEqual(['travelMinutes']);
    });

    it('(5) Model candidate outside bundle -> fails closed, candidate withheld from cards, redacted log', () => {
      const bundle = createLunchEvidenceBundle({ plan: lunchPlan });

      const hallucinatedCand = {
        id: 'hallucinated-place-999',
        name: 'Invented Place',
        cuisine: 'French',
        distanceMinutes: 2,
        distanceText: '2m away',
      };

      const result = GroundedRecommendationVerifier.verifyCandidateCard(hallucinatedCand, bundle);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('candidate_outside_bundle');

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('candidate_outside_bundle');
      expect(latest.inputSignalIds).toEqual(['hallucinated-place-999']);

      // In home composition, out-of-bundle candidate is withheld
      const outOfBundlePlan: PreparedPlan = {
        ...lunchPlan,
        optionsOrSteps: [
          {
            id: 'hallucinated-place-999',
            label: 'Invented Place',
            name: 'Invented Place',
            cuisine: 'french',
            distanceMinutes: 2,
            requiresConfirmation: false,
          },
        ],
      };

      // Bundle does NOT contain 'hallucinated-place-999'
      const emptyPlacesBundle = createEvidenceBundle('empty-bundle', '2026-10-28T19:10:00.000Z', []);
      const home = buildHomeComposition({
        plan: outOfBundlePlan,
        spatialEvidence: null,
        evidenceBundle: emptyPlacesBundle,
      });

      expect(home.candidateCards).toHaveLength(0); // Withheld!
    });

    it('(6) Verifier failure disables navigation URL (returns undefined)', () => {
      const bundle = createLunchEvidenceBundle({ plan: lunchPlan });

      // Valid candidate generates valid URL
      const validCand = {
        id: 'mock-place-1',
        name: 'Demo Place A · Ramen',
        cuisine: 'japanese',
        distanceMinutes: 5,
        sourceRef: { recordId: 'mock-place-1', field: 'name' },
      };
      expect(buildNavigateUrl(validCand, bundle)).toBe('yori://navigate?id=mock-place-1&name=Demo%20Place%20A%20%C2%B7%20Ramen');

      // Tampered candidate returns undefined
      const tamperedCand = {
        id: 'mock-place-1',
        name: 'Tampered Name',
        cuisine: 'japanese',
        distanceMinutes: 5,
        sourceRef: { recordId: 'mock-place-1', field: 'name' },
      };
      expect(buildNavigateUrl(tamperedCand, bundle)).toBeUndefined();

      // Candidate outside bundle returns undefined
      const outCand = {
        id: 'unknown-place-999',
        name: 'Ghost Place',
        sourceRef: { recordId: 'unknown-place-999', field: 'name' },
      };
      expect(buildNavigateUrl(outCand, bundle)).toBeUndefined();
    });

    it('(7) Tampered plan apptAt time -> fails closed, trip detail apptTime becomes "unknown", redacted log', () => {
      const bundle = createRainEvidenceBundle();
      const tamperedRainPlan: PreparedPlan = {
        ...rainPlan,
        apptAt: '2026-10-28T23:00:00.000Z', // 4:00 PM (tampered vs 3:00 PM in calendar record)
      };

      const tripDetail = deriveTripDetailVM({
        plan: tamperedRainPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });

      expect(tripDetail.apptTime).toBe('unknown');

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('tampered_value');
      expect(latest.inputFactKeys).toEqual(['apptTime']);
    });

    it('(8) Plan candidate absent from adapter -> candidate withheld from cards + redacted Decision Log entry', () => {
      const bundle = createLunchEvidenceBundle();
      const planWithMissingPlace: PreparedPlan = {
        ...lunchPlan,
        optionsOrSteps: [
          {
            id: 'unregistered-candidate-alpha',
            label: 'Mystery Food Truck',
            name: 'Mystery Food Truck',
            cuisine: 'street_food',
            distanceMinutes: 3,
            requiresConfirmation: false,
          },
        ],
      };

      const home = buildHomeComposition({
        plan: planWithMissingPlace,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });

      expect(home.candidateCards).toHaveLength(0); // Withheld!

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('candidate_outside_bundle');
      expect(latest.inputSignalIds).toEqual(['unregistered-candidate-alpha']);
    });
  });

  describe('Part 3: Redaction Invariant', () => {
    it('guarantees Decision Log entries contain only IDs/field keys and zero secrets/PII', () => {
      const bundle = createRainEvidenceBundle({ plan: rainPlan });
      const ref: SourceRef = { recordId: 'eta-drive-piano', field: 'travelMinutes' };

      GroundedRecommendationVerifier.verifyField(ref, 9999, bundle); // Tampered!

      const entry = globalDecisionLogger.getLatest()!;
      expect(entry.templateId).toBe('grounding_verifier');
      expect(entry.inputSignalIds).toEqual(['eta-drive-piano']);
      expect(entry.inputFactKeys).toEqual(['travelMinutes']);
      expect(entry.outputReasonCodes).toEqual(['tampered_value']);

      // Raw json representation check
      const json = JSON.stringify(entry);
      expect(json).not.toContain('password');
      expect(json).not.toContain('secret');
      expect(json).not.toContain('api_key');
      expect(json).not.toContain('token');
    });
  });

  describe('Part 4: Check-1 Coverage (Rain & Lunch VMs)', () => {
    it('Rain scene: verifies every rendered place, number, time inside VMs (NOW, timeline, map callout, banner, Why rows)', () => {
      const bundle = createRainEvidenceBundle({ isConfirmedHabit: true });
      const home = buildHomeComposition({
        plan: rainPlan,
        spatialEvidence: {
          placeOrRoute: { name: 'Piano Studio (Rain Route)', destination: '123 Harmony Way' },
          spatialEvidence: { kind: 'calendar', value: {} } as any,
        },
        evidenceBundle: bundle,
        userConfirmedKeys: new Set(['rain_transport_preference']),
      });

      // 1. NOW title & headline
      expect(home.title).toBe('Piano Studio (Rain Route) at 3:00 PM');
      expect(home.headline).toBe('Get ready at 2:10 PM, leave by 2:30 PM');
      expect(home.umbrellaChip).toBe('Umbrella');

      // 2. Banner & insight
      expect(home.rainBanner).toBe('What changed: rain forecast');
      expect(home.rainInsightDesc).toContain('Rain in the forecast for your travel window');
      expect(home.rainInsightDesc).toContain('issued 1:35 PM');

      // 3. Option Cards (numeric fields grounded, no composed copy)
      expect(home.options).toHaveLength(2);
      const driveCard = home.options[0]!;
      expect(driveCard.mode).toBe('drive');
      expect(driveCard.travelMinutes).toBe(25);
      expect(driveCard.leaveTime).toBe('2:30 PM');
      expect(driveCard.bufferMinutes).toBe(5);
      expect(driveCard.badge).toBe('Recommended');
      expect(driveCard.detail).toBe('25 min drive + 5 min buffer');

      const busCard = home.options[1]!;
      expect(busCard.mode).toBe('bus');
      expect(busCard.travelMinutes).toBe(40);
      expect(busCard.leaveTime).toBe('2:15 PM');
      expect(busCard.bufferMinutes).toBe(5);
      expect(busCard.badge).toBe('Alternative');

      // 4. Timeline
      expect(home.timeline).toBeDefined();
      const steps = home.timeline!.steps;
      expect(steps).toHaveLength(4);
      expect(steps[0]!.time).toBe('2:10 PM');
      expect(steps[0]!.detail).toContain('Take umbrella');
      expect(steps[1]!.time).toBe('2:30 PM');
      expect(steps[1]!.detail).toContain('Drive · 25 min');
      expect(steps[2]!.time).toBe('2:55 PM');
      expect(steps[2]!.detail).toBe('On time · 5m buffer');
      expect(steps[3]!.time).toBe('3:00 PM');

      // 5. Map Callout & destination
      expect(home.map).toBeDefined();
      expect(home.map!.destinationName).toBe('Piano Studio (Rain Route)');
      expect(home.map!.weatherCallout).toBeDefined();
      expect(home.map!.weatherCallout!.text).toBe('Rain forecast · simulated');
      expect(home.map!.weatherCallout!.subtext).toBe('Issued 1:35 PM');
    });

    it('Post-leave-later-confirm state: derives arrive status truthfully as "Late by 10m" for 3:10 PM arrival vs 3:00 PM lesson', () => {
      const bundle = createRainEvidenceBundle();
      // Leave 15 min later: leave 2:45 PM, prep 2:25 PM, arrival 3:10 PM
      const latePlan: PreparedPlan = {
        ...rainPlan,
        leaveAt: '2026-10-28T21:45:00.000Z', // 2:45 PM
        prepareAt: '2026-10-28T21:25:00.000Z', // 2:25 PM
        headline: 'Get ready at 2:25 PM, leave by 2:45 PM',
        optionsOrSteps: [
          {
            id: 'opt-drive',
            label: 'Drive · 25 min',
            mode: 'drive',
            travelMinutes: 25,
            leaveAt: '2026-10-28T21:45:00.000Z',
            details: '25 min drive · late by 10m',
            requiresConfirmation: true,
          },
        ],
        requiresConfirmation: true,
      };

      const timeline = deriveTimelineVM(latePlan, null, undefined, bundle);
      expect(timeline).toBeDefined();
      const prepStep = timeline!.steps.find(s => s.id === 'step-prep')!;
      expect(prepStep.detail).toBe('Take umbrella · 20m prep'); // Drops "+ 5m buffer" when late so it doesn't contradict arrive status
      const arriveStep = timeline!.steps.find(s => s.id === 'step-arrive')!;
      expect(arriveStep.time).toBe('3:10 PM');
      expect(arriveStep.detail).toBe('Late by 10m'); // Truth in arrival status! Never 'On time'

      // Option cards render in post-shift state (does not withhold due to shifted leaveTime)
      const cards = deriveOptionCardVMs(latePlan, new Set(), bundle);
      expect(cards).toHaveLength(1);
      expect(cards[0]!.mode).toBe('drive');
      expect(cards[0]!.travelMinutes).toBe(25);

      const tripDetail = deriveTripDetailVM({
        plan: latePlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });
      expect(tripDetail.arriveTime).toBe('3:10 PM');
      expect(tripDetail.bufferText).toBe('Late by 10m'); // Truth in arrival status!
    });

    it('Post-prep-confirm state: verifies updated prep and buffer timing in timeline and detail VMs', () => {
      const bundle = createRainEvidenceBundle();
      // User confirmed 25m prep + 10m buffer: leave 2:25 PM, prep 2:00 PM, arrive 2:50 PM
      const prepConfirmedPlan: PreparedPlan = {
        ...rainPlan,
        leaveAt: '2026-10-28T21:25:00.000Z', // 2:25 PM
        prepareAt: '2026-10-28T21:00:00.000Z', // 2:00 PM
        headline: 'Get ready at 2:00 PM, leave by 2:25 PM',
        optionsOrSteps: [
          {
            id: 'opt-drive',
            label: 'Drive · 25 min',
            mode: 'drive',
            travelMinutes: 25,
            leaveAt: '2026-10-28T21:25:00.000Z',
            requiresConfirmation: false,
          },
        ],
        why: {
          ...rainPlan.why,
          memoryFactsUsed: [
            { key: 'prep_buffer_minutes', value: 10, status: 'confirmed' },
            { key: 'prep_duration_minutes', value: 25, status: 'confirmed' },
          ],
        },
      };

      const timeline = deriveTimelineVM(prepConfirmedPlan);
      expect(timeline).toBeDefined();
      const prepStep = timeline!.steps.find(s => s.id === 'step-prep')!;
      expect(prepStep.time).toBe('2:00 PM');
      expect(prepStep.detail).toContain('25m prep + 10m buffer');

      const arriveStep = timeline!.steps.find(s => s.id === 'step-arrive')!;
      expect(arriveStep.time).toBe('2:50 PM');
      expect(arriveStep.detail).toBe('On time · 10m buffer');

      const tripDetail = deriveTripDetailVM({
        plan: prepConfirmedPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });
      expect(tripDetail.arriveTime).toBe('2:50 PM');
      expect(tripDetail.bufferText).toBe('On time · 10m buffer');
    });

    it('Lunch scene: verifies every rendered place, number, time inside VMs (NOW, candidate cards, map, Why)', () => {
      const bundle = createLunchEvidenceBundle({ isConfirmedTaste: true });
      const home = buildHomeComposition({
        plan: lunchPlan,
        spatialEvidence: {
          placeOrRoute: { name: 'Downtown Dining District', area: 'Downtown' },
          spatialEvidence: { kind: 'location_status', value: {} } as any,
        },
        evidenceBundle: bundle,
        userConfirmedKeys: new Set(['taste_preference_lunch_cuisine']),
      });

      expect(home.layoutKind).toBe('candidates');
      expect(home.title).toBe('Lunch options near you');
      expect(home.headline).toBe('Places matching what you like, within walking distance');

      expect(home.candidateCards).toHaveLength(2);
      const cardA = home.candidateCards![0]!;
      expect(cardA.name).toBe('Demo Place A · Ramen');
      expect(cardA.cuisine).toBe('Japanese');
      expect(cardA.distanceMinutes).toBe(5);
      expect(cardA.distanceText).toBe('5m away');
      expect(cardA.basis).toContain('Based on taste: Japanese (You confirmed)');

      expect(home.map).toBeDefined();
      expect(home.map!.destinationArea).toBe('Downtown');
    });

    it('Surface Check-1 Tamper Negatives: timeline step time becomes "unknown" when plan time is tampered', () => {
      const bundle = createRainEvidenceBundle();
      const tamperedPlan: PreparedPlan = {
        ...rainPlan,
        prepareAt: '2026-10-28T21:50:00.000Z', // Tampered to 2:50 PM (expected 2:10 PM in cal-piano)
      };

      const timeline = deriveTimelineVM(tamperedPlan, null, undefined, bundle);
      expect(timeline).toBeDefined();
      const prepStep = timeline!.steps.find(s => s.id === 'step-prep')!;
      expect(prepStep.time).toBe('unknown'); // Fails closed!

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('tampered_value');
    });

    it('Surface Check-1 Tamper Negatives: home NOW title becomes "unknown" when plan apptAt is tampered', () => {
      const bundle = createRainEvidenceBundle();
      const tamperedPlan: PreparedPlan = {
        ...rainPlan,
        apptAt: '2026-10-28T23:00:00.000Z', // 4:00 PM (expected 3:00 PM)
      };

      const home = buildHomeComposition({
        plan: tamperedPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });

      expect(home.title).toBe('unknown'); // Fails closed!

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('tampered_value');
    });

    it('Surface Check-1 Tamper Negatives: map weather callout subtext becomes "unknown" when plan weather time is tampered', () => {
      const bundle = createRainEvidenceBundle();
      const tamperedPlan: PreparedPlan = {
        ...rainPlan,
        why: {
          ...rainPlan.why,
          evidenceSignals: [
            {
              kind: 'weather',
              source: 'simulated',
              issuedAt: '2026-10-28T19:00:00.000Z', // 12:00 PM instead of 1:35 PM
              description: 'Tampered rain',
            },
          ],
        },
      };

      const map = deriveMapVM(tamperedPlan, null, 'prominent', {
        snapshot: { signals: [{ kind: 'weather', issuedAt: '2026-10-28T20:35:00.000Z' }] },
        evidenceBundle: bundle,
      });
      expect(map).toBeDefined();
      expect(map!.weatherCallout).toBeDefined();
      expect(map!.weatherCallout!.subtext).toBe('unknown'); // Fails closed!

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('tampered_value');
    });

    it('Surface Check-1 Tamper Negatives: trip detail why row value becomes "unknown" when habit value is tampered', () => {
      const bundle = createRainEvidenceBundle();
      const tamperedPlan: PreparedPlan = {
        ...rainPlan,
        why: {
          ...rainPlan.why,
          memoryFactsUsed: [
            {
              key: 'rain_transport_preference',
              value: 'helicopter', // Tampered! Expected drive_first
              status: 'confirmed',
            },
          ],
        },
      };

      const detail = deriveTripDetailVM({
        plan: tamperedPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });

      const habitItem = detail.whyHabits.find(h => h.label.includes('Rain travel habit'))!;
      expect(habitItem.value).toBe('unknown'); // Fails closed!
    });
  });
});
