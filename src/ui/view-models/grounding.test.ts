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
        label: 'Ramen Ichiko · Ramen',
        name: 'Ramen Ichiko',
        cuisine: 'japanese',
        distanceMinutes: 5,
        requiresConfirmation: false,
      },
      {
        id: 'mock-place-2',
        label: 'Green Garden Salad · Salad',
        name: 'Green Garden Salad',
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
      expect(driveCard.fieldSourceRefs!.leaveTime).toEqual({ recordId: 'eta-drive-piano', field: 'leaveTime' });
      expect(driveCard.fieldSourceRefs!.travelMinutes).toEqual({ recordId: 'eta-drive-piano', field: 'travelMinutes' });

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
      expect(ramenCand.name).toBe('Ramen Ichiko');
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
      expect(detail.name).toBe('Ramen Ichiko');
      expect(detail.navigateUrl).toBe('yori://navigate?id=mock-place-1&name=Ramen%20Ichiko');
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

      // Tamper driveCard time
      const tamperedCard = {
        ...driveCard,
        leaveTime: '4:15 PM', // Tampered! Expected 2:30 PM
      };

      const result = GroundedRecommendationVerifier.verifyOptionCard(tamperedCard, bundle);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('tampered_value');
      expect(result.field).toBe('leaveTime');

      // Check Decision Log entry
      const latest = globalDecisionLogger.getLatest()!;
      expect(latest.validationResult.valid).toBe(false);
      expect(latest.validationResult.reason).toBe('tampered_value');
      expect(latest.outputReasonCodes).toContain('tampered_value');
      expect(latest.inputSignalIds).toEqual(['eta-drive-piano']);
      expect(latest.inputFactKeys).toEqual(['leaveTime']);

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
        name: 'Ramen Ichiko',
        cuisine: 'japanese',
        distanceMinutes: 5,
        sourceRef: { recordId: 'mock-place-1', field: 'name' },
      };
      expect(buildNavigateUrl(validCand, bundle)).toBe('yori://navigate?id=mock-place-1&name=Ramen%20Ichiko');

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
});
