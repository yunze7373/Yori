import { describe, it, expect } from 'vitest';
import {
  deriveTripDetailVM,
  deriveRestaurantDetailVM,
} from './index.js';
import type { PreparedPlan, SpatialMapEvidence } from '../../core/contracts/index.js';

describe('V1b: TripDetailVM and RestaurantDetailVM Derivation (§8 D1/D4)', () => {
  const d2RainPlan: PreparedPlan = {
    id: 'plan-d2-rain',
    intentId: 'depart',
    headline: 'Piano lesson at 3:00 PM',
    subjectTitle: 'Piano lesson',
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
          key: 'prep_duration_minutes',
          value: 20,
          status: 'pending',
        },
        {
          key: 'rain_transport_preference',
          value: 'drive',
          status: 'pending',
        },
      ],
      derivation: 'Drive preferred when raining based on transportation preference.',
    },
    createdAt: '2026-10-28T20:00:00.000Z',
  };

  const spatialEvidence: SpatialMapEvidence = {
    placeOrRoute: { name: 'Piano Studio (Downtown)', area: 'Downtown' },
    spatialEvidence: {
      kind: 'calendar',
      source: 'simulated',
      value: { title: 'Piano lesson', location: 'Piano Studio' },
      issuedAt: '2026-10-28T17:00:00.000Z',
      validFor: 36000000,
      confidence: 1.0,
      consentScope: 'device_only',
    },
  };

  const d1LunchPlan: PreparedPlan = {
    id: 'plan-d1-lunch',
    intentId: 'lunch',
    headline: 'Lunch at 12:10 PM',
    subjectTitle: 'Lunch',
    apptAt: '2026-10-28T19:10:00.000Z', // 12:10 PM PDT
    prepareAt: '2026-10-28T19:00:00.000Z',
    leaveAt: '2026-10-28T19:05:00.000Z',
    timezone: 'America/Los_Angeles',
    optionsOrSteps: [
      {
        id: 'cand-1',
        name: 'Menya Musashi',
        label: 'Menya Musashi',
        cuisine: 'ramen',
        distanceMinutes: 5,
        requiresConfirmation: false,
      },
      {
        id: 'cand-2',
        name: 'Sushi Yoshi',
        label: 'Sushi Yoshi',
        cuisine: 'sushi',
        distanceMinutes: 8,
        requiresConfirmation: false,
      },
    ],
    requiresConfirmation: false,
    why: {
      evidenceSignals: [],
      memoryFactsUsed: [
        {
          key: 'lunch_cuisine_preference',
          value: 'ramen',
          status: 'confirmed',
        },
      ],
      derivation: 'Ramen candidate selected based on taste preference.',
    },
    createdAt: '2026-10-28T19:00:00.000Z',
  };

  describe('deriveTripDetailVM', () => {
    it('creates mode tabs strictly for Drive and Bus without fictitious Walk tab', () => {
      const vm = deriveTripDetailVM({
        plan: d2RainPlan,
        spatialEvidence,
      });

      expect(vm.modeTabs).toHaveLength(2);
      expect(vm.modeTabs[0]!.mode).toBe('drive');
      expect(vm.modeTabs[0]!.label).toBe('Drive · 25 min');
      expect(vm.modeTabs[0]!.isSelected).toBe(true);
      expect(vm.modeTabs[1]!.mode).toBe('bus');
      expect(vm.modeTabs[1]!.label).toBe('Bus · 40 min');
      expect(vm.modeTabs[1]!.isSelected).toBe(false);
      expect(vm.modeTabs.some(t => t.mode === 'walk')).toBe(false);
    });

    it('derives mathematical leave and arrive times for each mode tab', () => {
      const vm = deriveTripDetailVM({
        plan: d2RainPlan,
        spatialEvidence,
      });

      // Drive: leave 2:30 PM, duration 25m -> arrive 2:55 PM
      expect(vm.modeTabs[0]!.leaveTime).toBe('2:30 PM');
      expect(vm.modeTabs[0]!.arriveTime).toBe('2:55 PM');

      // Bus: leave 2:15 PM, duration 40m -> arrive 2:55 PM
      expect(vm.modeTabs[1]!.leaveTime).toBe('2:15 PM');
      expect(vm.modeTabs[1]!.arriveTime).toBe('2:55 PM');

      // Current selected row matches Drive
      expect(vm.leaveTime).toBe('2:30 PM');
      expect(vm.arriveTime).toBe('2:55 PM');
      expect(vm.bufferText).toBe('On time · 5m buffer');
      expect(vm.prepText).toBe('Take umbrella · 20m prep + 5m buffer');
    });

    it('updates active mode and times when selectedMode is specified', () => {
      const vm = deriveTripDetailVM({
        plan: d2RainPlan,
        spatialEvidence,
        selectedMode: 'bus',
      });

      expect(vm.selectedMode).toBe('bus');
      expect(vm.modeTabs[0]!.isSelected).toBe(false);
      expect(vm.modeTabs[1]!.isSelected).toBe(true);
      expect(vm.leaveTime).toBe('2:15 PM');
      expect(vm.arriveTime).toBe('2:55 PM');
    });

    it('creates prominent map VM with route geometry and weather overlay', () => {
      const vm = deriveTripDetailVM({
        plan: d2RainPlan,
        spatialEvidence,
      });

      expect(vm.map).not.toBeNull();
      expect(vm.map.sizeHint).toBe('prominent');
      expect(vm.map.polylines.length).toBeGreaterThan(0);
      expect(vm.map.weatherCallout).toBeDefined();
    });

    it('labels provenance as "You confirmed" vs "Demo profile · sample" honestly', () => {
      const confirmedKeys = new Set(['prep_buffer_minutes']);
      const vm = deriveTripDetailVM({
        plan: d2RainPlan,
        spatialEvidence,
        userConfirmedKeys: confirmedKeys,
      });

      expect(vm.whyHabits).toHaveLength(3);
      const bufferHabit = vm.whyHabits.find(h => h.label.includes('Buffer'));
      expect(bufferHabit?.provenanceText).toBe('You confirmed');
      expect(bufferHabit?.isConfirmed).toBe(true);

      const prepHabit = vm.whyHabits.find(h => h.label.includes('ready'));
      expect(prepHabit?.provenanceText).toBe('Demo profile · sample');
      expect(prepHabit?.isConfirmed).toBe(false);
    });

    it('handles single-mode plan with travel signal without crashing', () => {
      const singlePlan: PreparedPlan = {
        id: 'plan-single',
        intentId: 'travel',
        headline: 'Doctor at 4:00 PM',
        apptAt: '2026-10-28T23:00:00.000Z', // 4:00 PM
        leaveAt: '2026-10-28T22:30:00.000Z', // 3:30 PM
        timezone: 'America/Los_Angeles',
        optionsOrSteps: [],
        requiresConfirmation: false,
        why: {
          evidenceSignals: [],
          memoryFactsUsed: [],
          derivation: 'Appointment at 4:00 PM',
        },
        createdAt: '2026-10-28T18:00:00.000Z',
      };

      const vm = deriveTripDetailVM({
        plan: singlePlan,
        spatialEvidence: null,
        snapshot: {
          signals: [
            { kind: 'travel_estimate', value: { mode: 'transit', minutes: 25 } },
          ],
        },
      });

      expect(vm.modeTabs).toHaveLength(1);
      expect(vm.modeTabs[0]!.mode).toBe('transit');
      expect(vm.leaveTime).toBe('3:30 PM');
    });
  });

  describe('deriveRestaurantDetailVM', () => {
    it('derives restaurant detail for selected candidate', () => {
      const vm = deriveRestaurantDetailVM({
        candidateId: 'cand-1',
        plan: d1LunchPlan,
        spatialEvidence: null,
      });

      expect(vm.id).toBe('cand-1');
      expect(vm.name).toBe('Menya Musashi');
      expect(vm.cuisine).toBe('Ramen');
      expect(vm.distanceMinutes).toBe(5);
      expect(vm.distanceText).toBe('5m away');
      expect(vm.isSaved).toBe(false);
      expect(vm.simulatedNotice).toContain('simulated');
    });

    it('uses local labelled illustration and zero remote image URLs', () => {
      const vm = deriveRestaurantDetailVM({
        candidateId: 'cand-1',
        plan: d1LunchPlan,
        spatialEvidence: null,
      });

      expect(vm.photo.svgMarkup).toMatch(/^<svg/);
      expect(vm.photo.svgMarkup).not.toContain('<image');
      expect(vm.photo.svgMarkup).not.toContain('http://localhost');
      expect(vm.photo.svgMarkup).not.toContain('https://');
      expect(vm.photo.simulatedBadge).toBe('Illustration · simulated');
      expect(vm.photo.altText).toContain('Ramen dish illustration');
      expect(vm.photo.category).toBe('ramen');
    });

    it('contains fixture attribute chips only and no star ratings or review counts', () => {
      const vm = deriveRestaurantDetailVM({
        candidateId: 'cand-1',
        plan: d1LunchPlan,
        spatialEvidence: null,
      });

      expect(vm.attributeChips).toContain('Ramen');
      expect(vm.attributeChips).toContain('5m away');
      // No stars or reviews
      const serialized = JSON.stringify(vm);
      expect(serialized).not.toContain('★');
      expect(serialized).not.toContain('reviews');
      expect(serialized).not.toContain('rating');
    });

    it('toggles isSaved state in UI without modifying any memory facts', () => {
      const vmUnsaved = deriveRestaurantDetailVM({
        candidateId: 'cand-2',
        plan: d1LunchPlan,
        spatialEvidence: null,
        isSaved: false,
      });
      expect(vmUnsaved.isSaved).toBe(false);

      const vmSaved = deriveRestaurantDetailVM({
        candidateId: 'cand-2',
        plan: d1LunchPlan,
        spatialEvidence: null,
        isSaved: true,
      });
      expect(vmSaved.isSaved).toBe(true);
    });

    it('provides in-app schematic directions strictly without external links or URLs', () => {
      const vm = deriveRestaurantDetailVM({
        candidateId: 'cand-1',
        plan: d1LunchPlan,
        spatialEvidence: null,
      });

      expect(vm.directions.length).toBeGreaterThan(1);
      for (const step of vm.directions) {
        expect(step.instruction).toBeDefined();
        // Zero external URLs
        expect(step.instruction).not.toContain('http://');
        expect(step.instruction).not.toContain('https://');
        expect(step.instruction).not.toContain('maps.google.com');
      }
      expect(vm.directions[vm.directions.length - 1]!.isFinal).toBe(true);
    });

    it('renders honest taste provenance with userConfirmedKeys', () => {
      const unconfirmedVM = deriveRestaurantDetailVM({
        candidateId: 'cand-1',
        plan: d1LunchPlan,
        spatialEvidence: null,
      });
      expect(unconfirmedVM.basis).toContain('Demo profile · sample');

      const confirmedVM = deriveRestaurantDetailVM({
        candidateId: 'cand-1',
        plan: d1LunchPlan,
        spatialEvidence: null,
        userConfirmedKeys: new Set(['lunch_cuisine_preference']),
      });
      expect(confirmedVM.basis).toContain('You confirmed');
    });
  });
});
