import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRainEvidenceBundle,
  createLunchEvidenceBundle,
  createLunchPlacesEvidenceBundle,
  createFuelEvidenceBundle,
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
import { createSimulatedSignal } from '../../core/contracts/index.js';
import type { PlaceItem } from '../../adapters/providers/places-types.js';
import { buildGroundedNavigateUrl } from '../navigation/navigate-url.js';
import { d3MemoryFacts } from '../../../tests/fixtures/index.js';
import { d2MemoryFacts } from '../../../tests/fixtures/d2.js';

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
      expect(driveCard.fieldSourceRefs!.leaveTime).toEqual({ recordId: 'eta-drive-piano', field: 'leaveTime' });
      expect(driveCard.fieldSourceRefs!.badge).toBeUndefined();

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
        why: {
          ...rainPlan.why,
          evidenceSignals: [
            ...rainPlan.why.evidenceSignals,
            {
              kind: 'user_request',
              source: 'simulated',
              issuedAt: '2026-10-28T20:35:00.000Z',
              description: 'Because you asked: leave 15 min later · this time only',
              value: { kind: 'leave_later', deltaMinutes: 15 },
            } as any,
          ],
        },
        requiresConfirmation: true,
      };

      const bundle = createRainEvidenceBundle({ plan: latePlan });

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

    it('trip detail why rows verify prep_buffer_minutes (5 min) and prep_duration_minutes (20 min) truthfully from bundle', () => {
      const planWithAllFacts: PreparedPlan = {
        ...rainPlan,
        why: {
          ...rainPlan.why,
          memoryFactsUsed: [
            { key: 'prep_buffer_minutes', value: 5, status: 'confirmed' },
            { key: 'prep_duration_minutes', value: 20, status: 'confirmed' },
            { key: 'rain_transport_preference', value: 'drive_first', status: 'confirmed' },
          ],
        },
      };

      const bundle = createRainEvidenceBundle({ plan: planWithAllFacts });
      const detail = deriveTripDetailVM({
        plan: planWithAllFacts,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });

      const bufferRow = detail.whyHabits.find(h => h.label.includes('Buffer before leaving'))!;
      expect(bufferRow).toBeDefined();
      expect(bufferRow.value).toBe('5 min');

      const prepRow = detail.whyHabits.find(h => h.label.includes('Time to get ready'))!;
      expect(prepRow).toBeDefined();
      expect(prepRow.value).toBe('20 min');

      const habitRow = detail.whyHabits.find(h => h.label.includes('Rain travel habit'))!;
      expect(habitRow).toBeDefined();
      expect(habitRow.value).toBe('Prefers driving when it rains');

      // No row shows "unknown"
      for (const h of detail.whyHabits) {
        expect(h.value).not.toBe('unknown');
      }
    });

    it('Surface Check-1 Tamper Negatives: trip detail why row value becomes "unknown" when habit fact is absent from evidence bundle', () => {
      const planWithAllFacts: PreparedPlan = {
        ...rainPlan,
        why: {
          ...rainPlan.why,
          memoryFactsUsed: [
            { key: 'prep_buffer_minutes', value: 5, status: 'confirmed' },
            { key: 'prep_duration_minutes', value: 20, status: 'confirmed' },
            { key: 'rain_transport_preference', value: 'drive_first', status: 'confirmed' },
          ],
        },
      };

      // Bundle created with only rain_transport_preference; prep_buffer_minutes and prep_duration_minutes omitted
      const bundleMissingFacts = createRainEvidenceBundle({
        memoryFacts: [{ key: 'rain_transport_preference', value: 'drive_first', status: 'confirmed' }],
      });

      const detail = deriveTripDetailVM({
        plan: planWithAllFacts,
        spatialEvidence: null,
        evidenceBundle: bundleMissingFacts,
      });

      const bufferRow = detail.whyHabits.find(h => h.label.includes('Buffer before leaving'))!;
      expect(bufferRow.value).toBe('unknown'); // Fails closed because absent from bundle!

      const prepRow = detail.whyHabits.find(h => h.label.includes('Time to get ready'))!;
      expect(prepRow.value).toBe('unknown'); // Fails closed because absent from bundle!

      const habitRow = detail.whyHabits.find(h => h.label.includes('Rain travel habit'))!;
      expect(habitRow.value).toBe('Prefers driving when it rains'); // Present in bundle
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

    it('Check-1 Tamper Negatives: user_request plan whose leaveAt differs from base+shift fails with tampered_value', () => {
      const legitOverridePlan: PreparedPlan = {
        ...rainPlan,
        leaveAt: '2026-10-28T21:45:00.000Z', // 2:45 PM
        prepareAt: '2026-10-28T21:25:00.000Z', // 2:25 PM
        why: {
          ...rainPlan.why,
          evidenceSignals: [
            ...rainPlan.why.evidenceSignals,
            {
              kind: 'user_request',
              source: 'simulated',
              issuedAt: '2026-10-28T20:35:00.000Z',
              description: 'Because you asked: leave 15 min later · this time only',
              value: { kind: 'leave_later', deltaMinutes: 15 },
            } as any,
          ],
        },
      };

      const bundle = createRainEvidenceBundle({ plan: legitOverridePlan });

      // Reviewer probe: verifyField on user_override_timing with tampered 4:00 PM leave
      const verifyRes = GroundedRecommendationVerifier.verifyField(
        { recordId: 'user_override_timing', field: 'leaveTime' },
        '4:00 PM',
        bundle
      );
      expect(verifyRes.valid).toBe(false);
      expect(verifyRes.reason).toBe('tampered_value');

      // Tampered plan with 4:00 PM leave renders "unknown" in timeline and NOW headline
      const tamperedShiftPlan: PreparedPlan = {
        ...legitOverridePlan,
        leaveAt: '2026-10-28T23:00:00.000Z', // 4:00 PM (tampered! expected 2:45 PM)
        headline: 'Get ready at 2:25 PM, leave by 4:00 PM',
      };

      const timeline = deriveTimelineVM(tamperedShiftPlan, null, undefined, bundle);
      const leaveStep = timeline!.steps.find(s => s.id === 'step-leave')!;
      expect(leaveStep.time).toBe('unknown'); // Fails closed!

      const home = buildHomeComposition({
        plan: tamperedShiftPlan,
        spatialEvidence: null,
        evidenceBundle: bundle,
      });
      expect(home.headline).toBe('unknown'); // Fails closed!

      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('tampered_value');
    });

    it('Check-1 Tamper Negatives: timeline step-leave and step-arrive render "unknown" on tampered values', () => {
      const bundle = createRainEvidenceBundle();

      // Tamper leave time on rainPlan and its option
      const tamperedLeavePlan: PreparedPlan = {
        ...rainPlan,
        leaveAt: '2026-10-28T23:30:00.000Z', // 4:30 PM (expected 2:30 PM)
        optionsOrSteps: [
          {
            ...(rainPlan.optionsOrSteps![0] as any),
            leaveAt: '2026-10-28T23:30:00.000Z',
          },
        ],
      };

      const timeline = deriveTimelineVM(tamperedLeavePlan, null, undefined, bundle);
      const leaveStep = timeline!.steps.find(s => s.id === 'step-leave')!;
      expect(leaveStep.time).toBe('unknown'); // Fails closed!
      const arriveStep = timeline!.steps.find(s => s.id === 'step-arrive')!;
      expect(arriveStep.time).toBe('unknown'); // Fails closed!
    });

    it('Check-1 Tamper Negatives: option-card leaveTime renders "unknown" and card is withheld when leaveTime is tampered', () => {
      const bundle = createRainEvidenceBundle();

      const tamperedCardPlan: PreparedPlan = {
        ...rainPlan,
        optionsOrSteps: [
          {
            id: 'opt-drive',
            label: 'Drive · leave 4:15 PM',
            mode: 'drive',
            travelMinutes: 25,
            leaveAt: '2026-10-28T23:15:00.000Z', // 4:15 PM (expected 2:30 PM)
            requiresConfirmation: false,
          },
          {
            id: 'opt-bus',
            label: 'Bus · leave 2:15 PM',
            mode: 'bus',
            travelMinutes: 40,
            leaveAt: '2026-10-28T21:15:00.000Z', // 2:15 PM (legitimate)
            requiresConfirmation: false,
          },
        ],
      };

      const cards = deriveOptionCardVMs(tamperedCardPlan, new Set(), bundle);
      // Tampered drive card is withheld; clean bus card remains
      expect(cards).toHaveLength(1);
      expect(cards[0]!.mode).toBe('bus');
      expect(cards[0]!.leaveTime).toBe('2:15 PM');
    });

    it('"Take the bus" command: verifies both bus (Recommended) and drive (Alternative) cards without badge in fieldSourceRefs', () => {
      const busOverridePlan: PreparedPlan = {
        ...rainPlan,
        optionsOrSteps: [
          {
            id: 'opt-bus',
            label: 'Bus · leave 2:15 PM',
            mode: 'bus',
            travelMinutes: 40,
            leaveAt: '2026-10-28T21:15:00.000Z',
            requiresConfirmation: false,
          },
          {
            id: 'opt-drive',
            label: 'Drive · leave 2:30 PM',
            mode: 'drive',
            travelMinutes: 25,
            leaveAt: '2026-10-28T21:30:00.000Z',
            requiresConfirmation: false,
          },
        ],
        why: {
          ...rainPlan.why,
          evidenceSignals: [
            ...rainPlan.why.evidenceSignals,
            {
              kind: 'user_request',
              source: 'simulated',
              issuedAt: '2026-10-28T20:35:00.000Z',
              description: 'Because you asked: switch to bus · this time only',
              value: { kind: 'route_preference', mode: 'bus' },
            } as any,
          ],
        },
      };

      const bundle = createRainEvidenceBundle({ plan: busOverridePlan });
      const cards = deriveOptionCardVMs(busOverridePlan, new Set(), bundle);

      expect(cards).toHaveLength(2);
      expect(cards[0]!.mode).toBe('bus');
      expect(cards[0]!.badge).toBe('Recommended');
      expect(cards[0]!.leaveTime).toBe('2:15 PM');
      expect(cards[0]!.fieldSourceRefs!.badge).toBeUndefined();

      expect(cards[1]!.mode).toBe('drive');
      expect(cards[1]!.badge).toBe('Alternative');
      expect(cards[1]!.leaveTime).toBe('2:30 PM');
      expect(cards[1]!.fieldSourceRefs!.badge).toBeUndefined();

      // Reviewer unit probe: verifyOptionCard passes for both cards
      const busVerify = GroundedRecommendationVerifier.verifyOptionCard(cards[0]!, bundle);
      expect(busVerify.valid).toBe(true);

      const driveVerify = GroundedRecommendationVerifier.verifyOptionCard(cards[1]!, bundle);
      expect(driveVerify.valid).toBe(true);
    });
  });

  describe('Part 5: Fuel Evidence Bundle Suite (V5-FUEL)', () => {
    const sfPlaces: PlaceItem[] = [
      {
        id: 'fuel-sf-1',
        placeId: 'fuel-sf-1',
        name: 'Metro Gas & Go',
        coords: { lat: 37.7755, lng: -122.418 },
        category: 'gas_station',
        address: '850 Market St, San Francisco, CA',
        brand: 'Metro Gas',
        straightLineDistanceMeters: 140,
        straightLineDistanceLabel: '140 m (straight-line)',
        source: 'simulated',
        fetchedAt: '2026-10-28T19:10:00.000Z',
      },
      {
        id: 'fuel-sf-2',
        placeId: 'fuel-sf-2',
        name: 'Sunset Fuel Station',
        coords: { lat: 37.773, lng: -122.421 },
        category: 'gas_station',
        address: '420 9th St, San Francisco, CA',
        brand: 'Sunset Petroleum',
        straightLineDistanceMeters: 254,
        straightLineDistanceLabel: '254 m (straight-line)',
        source: 'simulated',
        fetchedAt: '2026-10-28T19:10:00.000Z',
      },
    ];

    it('creates a grounded fuel evidence bundle from session PlacesProvider results (G1)', () => {
      const bundle = createFuelEvidenceBundle({
        originCoords: { lat: 37.7749, lng: -122.4194 },
        places: sfPlaces,
        snapshot: {
          asOf: '2026-10-28T19:10:00.000Z',
          timezone: 'America/Los_Angeles',
          signals: [
            {
              kind: 'fuel_percent',
              value: { fuelPercent: 18, needsFuel: true },
            },
          ],
        },
      });

      expect(bundle.id).toBe('bundle-fuel-v5');
      expect(bundle.hasRecord('loc-fuel-origin')).toBe(true);
      expect(bundle.hasRecord('fuel_status')).toBe(true);

      const fuelRec = bundle.getRecord('fuel_status');
      expect(fuelRec?.fields.fuelPercent).toBe(18);
      expect(fuelRec?.fields.needsFuel).toBe(true);

      // Gas stations from session places only
      const metroGas = bundle.getRecord('fuel-sf-1');
      expect(metroGas).toBeDefined();
      expect(metroGas?.fields.name).toBe('Metro Gas & Go');
      expect(metroGas?.fields.straight_line).toBe(true);
      expect(metroGas?.fields.straightLineDistanceLabel).toBe('140 m (straight-line)');
      expect(metroGas?.provenance).toBe('simulated');

      // Seattle station is NOT in the SF session bundle
      expect(bundle.getRecord('fuel-sea-1')).toBeUndefined();

      // Verifies clean candidate card against bundle
      const candidate = {
        id: 'fuel-sf-1',
        name: 'Metro Gas & Go',
        coords: { lat: 37.7755, lng: -122.418 },
        distanceText: '140 m (straight-line)',
        sourceRef: { recordId: 'fuel-sf-1', field: 'name' },
        fieldSourceRefs: {
          name: { recordId: 'fuel-sf-1', field: 'name' },
          distanceText: { recordId: 'fuel-sf-1', field: 'straightLineDistanceLabel' },
        },
      };

      const result = GroundedRecommendationVerifier.verifyCandidateCard(candidate, bundle);
      expect(result.valid).toBe(true);

      // Out-of-session candidate (e.g. Seattle station) fails verifier and builds NO URL
      const outOfSessionCand = {
        id: 'fuel-sea-1',
        name: 'Emerald City Gas',
        coords: { lat: 47.607, lng: -122.331 },
        sourceRef: { recordId: 'fuel-sea-1', field: 'name' },
      };
      const seaNavUrl = buildGroundedNavigateUrl(outOfSessionCand, bundle);
      expect(seaNavUrl).toBeUndefined();
    });

    it('verifies changing fixture location to LA returns LA bundle records and verified LA navigate URL (AC-212-1)', () => {
      const laPlaces: PlaceItem[] = [
        {
          id: 'fuel-la-1',
          placeId: 'fuel-la-1',
          name: 'Pacific Coast Petrol',
          coords: { lat: 34.053, lng: -118.242 },
          category: 'gas_station',
          address: '200 N Main St, Los Angeles, CA',
          brand: 'Pacific Coast',
          straightLineDistanceMeters: 120,
          straightLineDistanceLabel: '120 m (straight-line)',
          source: 'simulated',
          fetchedAt: '2026-10-28T19:10:00.000Z',
        },
      ];

      const laBundle = createFuelEvidenceBundle({
        originCoords: { lat: 34.0522, lng: -118.2437 },
        places: laPlaces,
        snapshot: {
          asOf: '2026-10-28T19:10:00.000Z',
          timezone: 'America/Los_Angeles',
          signals: [{ kind: 'fuel_percent', value: { fuelPercent: 15, needsFuel: true } }],
        },
      });

      expect(laBundle.hasRecord('fuel-la-1')).toBe(true);
      expect(laBundle.getRecord('fuel-sf-1')).toBeUndefined();

      const laCand = {
        id: 'fuel-la-1',
        name: 'Pacific Coast Petrol',
        coords: { lat: 34.053, lng: -118.242 },
        distanceText: '120 m (straight-line)',
        sourceRef: { recordId: 'fuel-la-1', field: 'name' },
        fieldSourceRefs: {
          name: { recordId: 'fuel-la-1', field: 'name' },
          distanceText: { recordId: 'fuel-la-1', field: 'straightLineDistanceLabel' },
        },
      };

      const laNavUrl = buildGroundedNavigateUrl(laCand, laBundle, { platform: 'desktop' });
      expect(laNavUrl).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=34.053%2C-118.242&travelmode=driving&destination_place_id=fuel-la-1'
      );
    });

    it('verifies tampered distance on fuel candidate card is withheld by GroundedRecommendationVerifier (G1, G2)', () => {
      const bundle = createFuelEvidenceBundle({
        originCoords: { lat: 37.7749, lng: -122.4194 },
        places: sfPlaces,
      });

      const tamperedCandidate = {
        id: 'fuel-sf-1',
        name: 'Metro Gas & Go',
        coords: { lat: 37.7755, lng: -122.418 },
        distanceText: '10 m (straight-line)', // Tampered! Expected '140 m (straight-line)'
        sourceRef: { recordId: 'fuel-sf-1', field: 'name' },
        fieldSourceRefs: {
          name: { recordId: 'fuel-sf-1', field: 'name' },
          distanceText: { recordId: 'fuel-sf-1', field: 'straightLineDistanceLabel' },
        },
      };

      const res = GroundedRecommendationVerifier.verifyCandidateCard(tamperedCandidate, bundle);
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('tampered_value');
    });

    it('verifies provider failure and empty results yield explicit quiet states in buildHomeComposition (AC-212-2)', () => {
      // 1. Provider failure -> Fuel Station Lookup Failed
      const errorSnapshot = {
        id: 'snap-err-comp',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [
          createSimulatedSignal({
            kind: 'fuel_percent',
            value: { fuelPercent: 18, needsFuel: true },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'location_status',
            value: { status: 'available', lat: 37.7749, lng: -122.4194 },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'places_fuel',
            value: { status: 'error', error: 'Places service unavailable', places: [] },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
        ],
      };

      const errComp = buildHomeComposition({
        plan: null,
        spatialEvidence: null,
        snapshot: errorSnapshot,
      });
      expect(errComp.layoutKind).toBe('quiet');
      expect(errComp.title).toBe('Fuel Station Lookup Failed');
      expect(errComp.headline).toBe('Unable to load nearby gas stations from places provider');

      // 2. Provider empty -> No Gas Stations Nearby
      const emptySnapshot = {
        id: 'snap-empty-comp',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [
          createSimulatedSignal({
            kind: 'fuel_percent',
            value: { fuelPercent: 18, needsFuel: true },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'location_status',
            value: { status: 'available', lat: 37.7749, lng: -122.4194 },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'places_fuel',
            value: { status: 'empty', places: [] },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
        ],
      };

      const emptyComp = buildHomeComposition({
        plan: null,
        spatialEvidence: null,
        snapshot: emptySnapshot,
      });
      expect(emptyComp.layoutKind).toBe('quiet');
      expect(emptyComp.title).toBe('No Gas Stations Nearby');
      expect(emptyComp.headline).toBe('No fuel stations found within search radius');
    });

    it('fuel plan with invented station fails closed: card withheld, URL undefined, candidate_outside_bundle logged', () => {
      globalDecisionLogger.clear();

      const inventedPlan: PreparedPlan = {
        id: 'plan-fuel-hallucinated',
        intentId: 'fuel',
        headline: 'Find gas nearby',
        timezone: 'America/Los_Angeles',
        optionsOrSteps: [
          {
            id: 'fuel-x-invented',
            name: 'Blue Fern Gas',
            straightLineDistanceMeters: 150,
            straightLineDistanceLabel: '150 m (straight-line)',
            requiresConfirmation: false,
          } as any,
        ],
        requiresConfirmation: false,
        why: {
          derivation: 'Invented fuel plan for negative test',
          evidenceSignals: [],
          memoryFactsUsed: [],
        },
        createdAt: '2026-10-28T19:10:00.000Z',
      };

      // Snapshot without places / places_fuel signal
      const snapshotWithoutPlaces = {
        id: 'snap-no-places',
        asOf: '2026-10-28T19:10:00.000Z',
        timezone: 'America/Los_Angeles',
        signals: [
          createSimulatedSignal({
            kind: 'fuel_percent',
            value: { fuelPercent: 12, needsFuel: true },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
          createSimulatedSignal({
            kind: 'location_status',
            value: { status: 'available', lat: 37.7749, lng: -122.4194 },
            issuedAt: '2026-10-28T19:10:00.000Z',
            validFor: 3600000,
            confidence: 1,
            consentScope: 'device_only',
          }),
        ],
      };

      // 1. buildHomeComposition withholds the card (0 candidate cards)
      const home = buildHomeComposition({
        plan: inventedPlan,
        spatialEvidence: null,
        snapshot: snapshotWithoutPlaces,
      });

      expect(home.candidateCards).toHaveLength(0);

      // 2. buildGroundedNavigateUrl returns undefined
      const bundle = createFuelEvidenceBundle({ snapshot: snapshotWithoutPlaces });
      expect(bundle.hasRecord('fuel-x-invented')).toBe(false);

      const inventedCandidate = {
        id: 'fuel-x-invented',
        name: 'Blue Fern Gas',
        coords: { lat: 37.775, lng: -122.418 },
        sourceRef: { recordId: 'fuel-x-invented', field: 'name' },
      };
      const navUrl = buildGroundedNavigateUrl(inventedCandidate, bundle);
      expect(navUrl).toBeUndefined();

      // 3. Redacted Decision Log entry is written with candidate_outside_bundle
      const latest = globalDecisionLogger.getLatest();
      expect(latest).toBeDefined();
      expect(latest!.validationResult.valid).toBe(false);
      expect(latest!.validationResult.reason).toBe('candidate_outside_bundle');
      expect(latest!.inputSignalIds).toEqual(['fuel-x-invented']);
    });
  });

  describe('V5-LUNCH: Places Lunch Evidence Bundle & Grounding Verification', () => {
    const sfSnapshot = {
      id: 'snap-sf-lunch',
      asOf: '2026-10-28T19:10:00.000Z',
      timezone: 'America/Los_Angeles',
      signals: [
        createSimulatedSignal({
          kind: 'location_status',
          value: { status: 'available', lat: 37.7749, lng: -122.4194, source: 'manual' },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1,
          consentScope: 'device_only',
        }),
        createSimulatedSignal({
          kind: 'places_lunch',
          value: {
            status: 'ok',
            places: [
              {
                id: 'lunch-sf-1',
                name: 'Pacific Ramen Bar',
                category: 'restaurant',
                cuisine: 'japanese',
                noiseLevel: 'quiet',
                vegetarian: true,
                coords: { lat: 37.7765, lng: -122.4172 },
                straightLineDistanceMeters: 250,
                straightLineDistanceLabel: '250 m (straight-line)',
                distanceMinutes: 4,
              },
              {
                id: 'lunch-sf-2',
                name: 'Garden Fresh Bowls',
                category: 'restaurant',
                cuisine: 'salad',
                noiseLevel: 'moderate',
                vegetarian: true,
                coords: { lat: 37.778, lng: -122.415 },
                straightLineDistanceMeters: 510,
                straightLineDistanceLabel: '510 m (straight-line)',
                distanceMinutes: 7,
              },
            ],
          },
          issuedAt: '2026-10-28T19:10:00.000Z',
          validFor: 3600000,
          confidence: 1,
          consentScope: 'device_only',
        }),
      ],
    };

    it('builds lunch bundle with origin and restaurant POIs and passes verification', () => {
      const bundle = createLunchPlacesEvidenceBundle({ snapshot: sfSnapshot });
      expect(bundle.hasRecord('loc-lunch-origin')).toBe(true);
      expect(bundle.hasRecord('lunch-sf-1')).toBe(true);
      expect(bundle.hasRecord('lunch-sf-2')).toBe(true);

      const ramenRec = bundle.getRecord('lunch-sf-1')!;
      expect(ramenRec.fields.name).toBe('Pacific Ramen Bar');
      expect(ramenRec.fields.cuisine).toBe('Japanese');
      expect(ramenRec.fields.noiseLevel).toBe('quiet');
      expect(ramenRec.fields.vegetarian).toBe(true);
      expect(ramenRec.fields.straightLineDistanceLabel).toBe('250 m (straight-line)');
      expect(ramenRec.fields.straight_line).toBe(true);
      expect(ramenRec.fields.distanceMinutes).toBeUndefined();
      expect(ramenRec.fields.distanceText).toBeUndefined();

      const candidate = {
        id: 'lunch-sf-1',
        name: 'Pacific Ramen Bar',
        cuisine: 'japanese',
        distanceText: '250 m (straight-line)',
        coords: { lat: 37.7765, lng: -122.4172 },
        sourceRef: { recordId: 'lunch-sf-1', field: 'name' },
        fieldSourceRefs: {
          name: { recordId: 'lunch-sf-1', field: 'name' },
          cuisine: { recordId: 'lunch-sf-1', field: 'cuisine' },
          distanceText: { recordId: 'lunch-sf-1', field: 'straightLineDistanceLabel' },
        },
      };

      const result = GroundedRecommendationVerifier.verifyCandidateCard(candidate, bundle);
      expect(result.valid).toBe(true);

      const navUrl = buildGroundedNavigateUrl(candidate, bundle);
      expect(navUrl).toBeDefined();
      expect(navUrl).toContain('37.7765%2C-122.4172');
    });

    it('withholds out-of-session candidate (Seattle candidate queried from SF) and returns no URL', () => {
      globalDecisionLogger.clear();
      const bundle = createLunchPlacesEvidenceBundle({ snapshot: sfSnapshot });

      // Emerald Noodle Workshop is in Seattle, not in the SF session bundle
      const outOfSessionCandidate = {
        id: 'lunch-sea-1',
        name: 'Emerald Noodle Workshop',
        cuisine: 'chinese',
        distanceMinutes: 5,
        coords: { lat: 47.6062, lng: -122.3321 },
        sourceRef: { recordId: 'lunch-sea-1', field: 'name' },
      };

      const result = GroundedRecommendationVerifier.verifyCandidateCard(outOfSessionCandidate, bundle);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('candidate_outside_bundle');

      const navUrl = buildGroundedNavigateUrl(outOfSessionCandidate, bundle);
      expect(navUrl).toBeUndefined();

      const latestLog = globalDecisionLogger.getLatest();
      expect(latestLog).toBeDefined();
      expect(latestLog!.validationResult.valid).toBe(false);
      expect(latestLog!.validationResult.reason).toBe('candidate_outside_bundle');
      expect(latestLog!.inputSignalIds).toEqual(['lunch-sea-1']);
    });

    it('detects tampered candidate name and fails closed', () => {
      const bundle = createLunchPlacesEvidenceBundle({ snapshot: sfSnapshot });

      const tamperedCandidate = {
        id: 'lunch-sf-1',
        name: 'Tampered Ramen House',
        cuisine: 'japanese',
        distanceMinutes: 4,
        sourceRef: { recordId: 'lunch-sf-1', field: 'name' },
      };

      const result = GroundedRecommendationVerifier.verifyCandidateCard(tamperedCandidate, bundle);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('tampered_value');
      expect(result.error).toContain('tampered');

      const navUrl = buildGroundedNavigateUrl(tamperedCandidate, bundle);
      expect(navUrl).toBeUndefined();
    });

    it('detects tampered straightLineDistanceLabel and fails closed', () => {
      const bundle = createLunchPlacesEvidenceBundle({ snapshot: sfSnapshot });

      const tamperedCandidate = {
        id: 'lunch-sf-1',
        name: 'Pacific Ramen Bar',
        cuisine: 'japanese',
        distanceText: '10 m (straight-line)', // Bundle has '250 m (straight-line)'
        sourceRef: { recordId: 'lunch-sf-1', field: 'name' },
        fieldSourceRefs: {
          distanceText: { recordId: 'lunch-sf-1', field: 'straightLineDistanceLabel' },
        },
      };

      const result = GroundedRecommendationVerifier.verifyCandidateCard(tamperedCandidate, bundle);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('tampered_value');

      const navUrl = buildGroundedNavigateUrl(tamperedCandidate, bundle);
      expect(navUrl).toBeUndefined();
    });

    it('builds dynamic habit record from memory: salad memory yields salad habit, and Japanese Why row fails verification', () => {
      const memoryWithSalad = [
        {
          key: 'taste_preference_lunch_cuisine',
          value: 'salad',
          status: 'confirmed' as const,
          source: 'user_explicit' as const,
          confidence: 1,
          updatedAt: '2026-10-28T19:10:00.000Z',
          provenance: { source: 'user_confirmed' },
        },
      ];
      const userConfirmedKeys = new Set(['taste_preference_lunch_cuisine']);

      const bundle = createLunchPlacesEvidenceBundle({
        snapshot: sfSnapshot,
        memory: memoryWithSalad,
        userConfirmedKeys,
      });

      expect(bundle.hasRecord('taste_preference_lunch_cuisine')).toBe(true);
      const habitRec = bundle.getRecord('taste_preference_lunch_cuisine')!;
      expect(habitRec.fields.value).toBe('salad');
      expect(habitRec.fields.cuisine).toBe('Salad');
      expect(habitRec.provenance).toBe('confirmed');

      // Verifying a Why row stating 'salad' succeeds
      const validWhyRow = GroundedRecommendationVerifier.verifyField(
        { recordId: 'taste_preference_lunch_cuisine', field: 'value' },
        'salad',
        bundle
      );
      expect(validWhyRow.valid).toBe(true);

      // Verifying a Why row stating 'Japanese' fails verification (tampered_value)
      const invalidWhyRow = GroundedRecommendationVerifier.verifyField(
        { recordId: 'taste_preference_lunch_cuisine', field: 'value' },
        'Japanese',
        bundle
      );
      expect(invalidWhyRow.valid).toBe(false);
      expect(invalidWhyRow.reason).toBe('tampered_value');
    });

    it('omits habit record when no taste fact exists and does not contain loc-downtown', () => {
      const bundleWithoutMemory = createLunchPlacesEvidenceBundle({
        snapshot: sfSnapshot,
      });

      expect(bundleWithoutMemory.hasRecord('taste_preference_lunch_cuisine')).toBe(false);
      expect(bundleWithoutMemory.hasRecord('loc-downtown')).toBe(false);
      expect(bundleWithoutMemory.hasRecord('loc-lunch-origin')).toBe(true);
    });

    it('d3 persona facts plus empty stored confirmations yields habit records with provenance sample and Demo profile · sample basis; after confirmation yields confirmed and You confirmed', () => {
      // d3 persona facts carrying status 'confirmed' with provenance source 'user_confirmed'
      const emptyStoredConfirmations = new Set<string>();

      const sampleBundle = createLunchPlacesEvidenceBundle({
        snapshot: sfSnapshot,
        memory: d3MemoryFacts,
        userConfirmedKeys: emptyStoredConfirmations,
      });

      expect(sampleBundle.hasRecord('taste_preference')).toBe(true);
      const sampleHabit = sampleBundle.getRecord('taste_preference')!;
      expect(sampleHabit.provenance).toBe('sample');
      expect(sampleHabit.fields.basis).toContain('Demo profile · sample');

      // After user confirms taste_preference (stored confirmation present)
      const storedConfirmationsWithTaste = new Set<string>(['taste_preference', 'favorite_cuisine']);
      const confirmedBundle = createLunchPlacesEvidenceBundle({
        snapshot: sfSnapshot,
        memory: d3MemoryFacts,
        userConfirmedKeys: storedConfirmationsWithTaste,
      });

      expect(confirmedBundle.hasRecord('taste_preference')).toBe(true);
      const confirmedHabit = confirmedBundle.getRecord('taste_preference')!;
      expect(confirmedHabit.provenance).toBe('confirmed');
      expect(confirmedHabit.fields.basis).toContain('You confirmed');
    });

    describe('PRE-S1-A: Memory Evidence & Provenance-Class Hardening', () => {
      it('Check 1 (Rain bundle): d2 persona facts with status confirmed and empty stored keys yield provenance sample and Demo profile · sample basis; verifying with confirmed fails closed', () => {
        const emptyStoredConfirmations = new Set<string>();
        const sampleBundle = createRainEvidenceBundle({
          memoryFacts: d2MemoryFacts,
          userConfirmedKeys: emptyStoredConfirmations,
        });

        // 1. Records are present, not absent
        expect(sampleBundle.hasRecord('prep_buffer_minutes')).toBe(true);
        expect(sampleBundle.hasRecord('rain_transport_preference')).toBe(true);

        const prepRec = sampleBundle.getRecord('prep_buffer_minutes')!;
        expect(prepRec.provenance).toBe('sample');
        expect(prepRec.fields.basis).toContain('Demo profile · sample');

        const habitRec = sampleBundle.getRecord('rain_transport_preference')!;
        expect(habitRec.provenance).toBe('sample');
        expect(habitRec.fields.basis).toContain('Demo profile · sample');
        expect(habitRec.fields.rankingBasis).toContain('Demo profile · sample');

        // Negative: verifying with expectedProvenance 'confirmed' fails with sample_mislabelled_as_confirmed
        const vHabitFail = GroundedRecommendationVerifier.verifyField(
          { recordId: 'rain_transport_preference', field: 'value' },
          'drive_first',
          sampleBundle,
          'confirmed'
        );
        expect(vHabitFail.valid).toBe(false);
        expect(vHabitFail.reason).toBe('sample_mislabelled_as_confirmed');

        // Any render labelled 'You confirmed' for basis fails normalized equality
        const vRenderFail = GroundedRecommendationVerifier.verifyField(
          { recordId: 'rain_transport_preference', field: 'basis' },
          'Rain travel habit (You confirmed)',
          sampleBundle
        );
        expect(vRenderFail.valid).toBe(false);
        expect(vRenderFail.reason).toBe('tampered_value');

        // Positive: after stored confirmation, yields provenance 'confirmed' and 'You confirmed'
        const storedKeys = new Set<string>(['prep_buffer_minutes', 'rain_transport_preference']);
        const confirmedBundle = createRainEvidenceBundle({
          memoryFacts: d2MemoryFacts,
          userConfirmedKeys: storedKeys,
        });

        const confirmedPrep = confirmedBundle.getRecord('prep_buffer_minutes')!;
        expect(confirmedPrep.provenance).toBe('confirmed');
        expect(confirmedPrep.fields.basis).toContain('You confirmed');

        const confirmedHabit = confirmedBundle.getRecord('rain_transport_preference')!;
        expect(confirmedHabit.provenance).toBe('confirmed');
        expect(confirmedHabit.fields.basis).toContain('You confirmed');
        expect(confirmedHabit.fields.rankingBasis).toContain('You confirmed');

        const vHabitPass = GroundedRecommendationVerifier.verifyField(
          { recordId: 'rain_transport_preference', field: 'value' },
          'drive_first',
          confirmedBundle,
          'confirmed'
        );
        expect(vHabitPass.valid).toBe(true);
      });

      it('Check 1 (Rain prep rows): G12 rain prep rows (5/20 min in Details/Why) stay green throughout', () => {
        const storedKeys = new Set<string>();
        const sampleBundle = createRainEvidenceBundle({
          memoryFacts: d2MemoryFacts,
          userConfirmedKeys: storedKeys,
        });

        const planWithAllFacts: PreparedPlan = {
          ...rainPlan,
          why: {
            ...rainPlan.why,
            memoryFactsUsed: [
              { key: 'prep_buffer_minutes', value: 5, status: 'confirmed' },
              { key: 'prep_duration_minutes', value: 20, status: 'confirmed' },
              { key: 'rain_transport_preference', value: 'drive_first', status: 'confirmed' },
            ],
          },
        };

        const detail = deriveTripDetailVM({
          plan: planWithAllFacts,
          spatialEvidence: null,
          evidenceBundle: sampleBundle,
          userConfirmedKeys: storedKeys,
        });

        const bufferRow = detail.whyHabits.find(h => h.label.includes('Buffer before leaving'))!;
        expect(bufferRow).toBeDefined();
        expect(bufferRow.value).toBe('5 min');
        expect(bufferRow.provenanceText).toBe('Demo profile · sample');
        expect(bufferRow.isConfirmed).toBe(false);

        const prepRow = detail.whyHabits.find(h => h.label.includes('Time to get ready'))!;
        expect(prepRow).toBeDefined();
        expect(prepRow.value).toBe('20 min');
        expect(prepRow.provenanceText).toBe('Demo profile · sample');
        expect(prepRow.isConfirmed).toBe(false);
      });

      it('Check 2: No code path overlays plan.why.memoryFactsUsed or grounds plan memory against the plan itself', () => {
        const forgedPlan: PreparedPlan = {
          ...rainPlan,
          why: {
            ...rainPlan.why,
            memoryFactsUsed: [
              { key: 'forged_overlay_key', value: 'malicious_value', status: 'confirmed' },
            ],
          },
        };

        // Calling createRainEvidenceBundle with plan carrying memoryFactsUsed does not overlay or include it
        const bundleFromForgedPlan = createRainEvidenceBundle({
          plan: forgedPlan,
        });
        expect(bundleFromForgedPlan.hasRecord('forged_overlay_key')).toBe(false);

        // Calling createLunchPlacesEvidenceBundle with plan carrying memoryFactsUsed does not include it
        const lunchBundle = createLunchPlacesEvidenceBundle({
          snapshot: sfSnapshot,
          ...({ plan: forgedPlan } as any),
        });
        expect(lunchBundle.hasRecord('forged_overlay_key')).toBe(false);

        // buildHomeComposition ignores plan.why.memoryFactsUsed for habit notes and derives from bundle
        const homeVM = buildHomeComposition({
          plan: forgedPlan,
          spatialEvidence: null,
          evidenceBundle: bundleFromForgedPlan,
          userConfirmedKeys: new Set(),
        });
        // Since forged_overlay_key is not in bundle and not confirmed, habitNote is not set from plan
        expect(homeVM.habitNote).toBeUndefined();
      });
    });
  });
});
