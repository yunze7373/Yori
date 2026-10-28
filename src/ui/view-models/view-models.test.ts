import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildHomeComposition,
  deriveTimelineVM,
  deriveOptionCardVMs,
  deriveMapVM,
  getLocalIllustration,
} from './index.js';
import type { PreparedPlan, SpatialMapEvidence } from '../../core/contracts/index.js';

describe('V1: Scene-Driven Home Composition & View Models (§4)', () => {
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
      },
      {
        id: 'opt-bus',
        label: 'Bus · 40 min',
        mode: 'bus',
        travelMinutes: 40,
        leaveAt: '2026-10-28T21:15:00.000Z',
        requiresConfirmation: false,
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
          key: 'rain_transport_preference',
          value: 'drive_first',
          status: 'confirmed',
        },
      ],
      derivation: 'Re-plan: rain at 1:35 PM -> drive option ranked first',
    },
    createdAt: '2026-10-28T20:35:00.000Z',
  };

  const d3LunchPlan: PreparedPlan = {
    id: 'plan-d3-lunch',
    intentId: 'lunch',
    headline: 'Lunch options near you',
    optionsOrSteps: [
      {
        id: 'place-a',
        label: 'Demo Place A · Ramen',
        name: 'Demo Place A · Ramen',
        cuisine: 'japanese',
        distanceMinutes: 5,
        requiresConfirmation: false,
      },
      {
        id: 'place-b',
        label: 'Demo Place B · Salad',
        name: 'Demo Place B · Salad',
        cuisine: 'salad',
        distanceMinutes: 7,
        requiresConfirmation: false,
      },
      {
        id: 'place-c',
        label: 'Demo Place C · Sushi',
        name: 'Demo Place C · Sushi',
        cuisine: 'japanese',
        distanceMinutes: 10,
        requiresConfirmation: false,
      },
    ],
    requiresConfirmation: false,
    why: {
      evidenceSignals: [
        {
          kind: 'location_status',
          source: 'simulated',
          issuedAt: '2026-10-28T19:10:00.000Z',
          description: 'User away from home in Downtown',
        },
      ],
      memoryFactsUsed: [
        {
          key: 'taste_preference',
          value: 'ramen_or_salad',
          status: 'confirmed',
        },
      ],
      derivation: 'Away at 12:10 PM with free window -> <=3 lunch options citing confirmed taste',
    },
    createdAt: '2026-10-28T19:10:00.000Z',
  };

  const mockSpatialEvidence: SpatialMapEvidence = {
    placeOrRoute: { name: 'Piano Studio (Downtown)' },
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

  describe('4.1 Journey Timeline & Transit Options (Depart/Rain)', () => {
    it('derives TimelineVM with exact times, umbrella detail, and arrival buffer', () => {
      const timeline = deriveTimelineVM(d2RainPlan);
      expect(timeline).toBeDefined();
      expect(timeline!.eventTitle).toContain('Piano lesson at 3:00 PM');
      expect(timeline!.steps).toHaveLength(4);

      // Step 1: Prep
      expect(timeline!.steps[0]!.time).toBe('2:10 PM');
      expect(timeline!.steps[0]!.label).toBe('Get ready');
      expect(timeline!.steps[0]!.detail).toContain('umbrella');

      // Step 2: Leave
      expect(timeline!.steps[1]!.time).toBe('2:30 PM');
      expect(timeline!.steps[1]!.label).toBe('Leave');
      expect(timeline!.steps[1]!.detail).toContain('Drive · 25 min');
      expect(timeline!.steps[1]!.isPrimary).toBe(true);

      // Step 3: Arrive (2:30 PM + 25m = 2:55 PM)
      expect(timeline!.steps[2]!.time).toBe('2:55 PM');
      expect(timeline!.steps[2]!.label).toBe('Arrive at destination');
      expect(timeline!.steps[2]!.detail).toContain('5m buffer');

      // Step 4: Event
      expect(timeline!.steps[3]!.time).toBe('3:00 PM');
      expect(timeline!.steps[3]!.label).toBe('Piano lesson');
      expect(timeline!.steps[3]!.isEvent).toBe(true);
    });

    it('derives OptionCardVMs for transit modes with ranking basis and no star ratings', () => {
      const options = deriveOptionCardVMs(d2RainPlan);
      expect(options).toHaveLength(2);

      // Drive option
      expect(options[0]!.mode).toBe('drive');
      expect(options[0]!.travelMinutes).toBe(25);
      expect(options[0]!.badge).toBe('Recommended');
      expect(options[0]!.rankingBasis).toContain('rain transport preference');
      expect(options[0]!.isSelected).toBe(true);

      // Bus option
      expect(options[1]!.mode).toBe('bus');
      expect(options[1]!.travelMinutes).toBe(40);
      expect(options[1]!.badge).toBe('Alternative');

      // Data honesty: no star ratings or review counts
      const allText = JSON.stringify(options);
      expect(allText).not.toContain('★');
      expect(allText).not.toContain('stars');
      expect(allText).not.toContain('reviews');
    });

    it('derives MapVM with prominent size, schematic polylines, and weather callout', () => {
      const map = deriveMapVM(d2RainPlan, mockSpatialEvidence, 'prominent');
      expect(map).toBeDefined();
      expect(map!.sizeHint).toBe('prominent');
      expect(map!.simulatedBadge).toBe('Schematic · simulated');
      expect(map!.polylines).toHaveLength(2); // Drive and Bus
      expect(map!.markers).toHaveLength(2); // Origin and Destination
      expect(map!.weatherCallout).toBeDefined();
      expect(map!.weatherCallout!.text).toBe('Rain expected');
    });
  });

  describe('4.2 Candidate Cards & Compact Map (Lunch Away)', () => {
    it('derives CandidateCardVMs paired with local SVG illustrations', () => {
      const comp = buildHomeComposition({
        plan: d3LunchPlan,
        spatialEvidence: mockSpatialEvidence,
      });

      expect(comp.layoutKind).toBe('candidates');
      expect(comp.candidateCards).toBeDefined();
      expect(comp.candidateCards).toHaveLength(3);

      const placeA = comp.candidateCards![0]!;
      expect(placeA.name).toBe('Demo Place A · Ramen');
      expect(placeA.cuisine).toBe('Japanese');
      expect(placeA.distanceMinutes).toBe(5);
      expect(placeA.distanceText).toBe('5m away');
      expect(placeA.photo.category).toBe('ramen');
      expect(placeA.photo.simulatedBadge).toBe('Illustration · simulated');
      expect(placeA.photo.svgMarkup).toContain('<svg');

      const placeB = comp.candidateCards![1]!;
      expect(placeB.name).toBe('Demo Place B · Salad');
      expect(placeB.cuisine).toBe('Salad');
      expect(placeB.photo.category).toBe('salad');
    });

    it('derives compact MapVM for lunch candidates', () => {
      const map = deriveMapVM(d3LunchPlan, mockSpatialEvidence, 'compact');
      expect(map).toBeDefined();
      expect(map!.sizeHint).toBe('compact');
      expect(map!.simulatedBadge).toBe('Schematic · simulated');
      // User location + 3 candidates
      expect(map!.markers).toHaveLength(4);
      expect(map!.polylines).toHaveLength(3);
    });
  });

  describe('4.3 Empty Group Collapse (§4 Non-monotonous Layout)', () => {
    it('collapses AHEAD and FOR YOU when empty (zero empty placeholder cards)', () => {
      const comp = buildHomeComposition({
        plan: d2RainPlan,
        spatialEvidence: mockSpatialEvidence,
        aheadPlans: [], // empty
        proposals: [], // empty
      });

      // Proof: empty lists mean the UI template never renders empty block wrappers
      expect(comp.aheadItems).toHaveLength(0);
      expect(comp.proposals).toHaveLength(0);
    });

    it('populates AHEAD and FOR YOU only when real items exist', () => {
      const comp = buildHomeComposition({
        plan: d2RainPlan,
        spatialEvidence: mockSpatialEvidence,
        aheadPlans: [d3LunchPlan],
        proposals: [{ key: 'prep_buffer_preference', value: '10m' }],
      });

      expect(comp.aheadItems).toHaveLength(1);
      expect(comp.aheadItems[0]!.title).toBe('Lunch options near you');

      expect(comp.proposals).toHaveLength(1);
      expect(comp.proposals[0]!.title).toContain('prep & buffer');
    });

    it('renders honest quiet state when no plan is scheduled (D4)', () => {
      const comp = buildHomeComposition({
        plan: null,
        spatialEvidence: null,
      });

      expect(comp.layoutKind).toBe('quiet');
      expect(comp.timeline).toBeUndefined();
      expect(comp.map).toBeUndefined();
      expect(comp.options).toHaveLength(0);
      expect(comp.aheadItems).toHaveLength(0);
      expect(comp.proposals).toHaveLength(0);
    });
  });

  describe('4.4 Static Check: Zero External Image URLs (Data Honesty)', () => {
    it('verifies all files in src/ui/view-models/ contain ZERO external image URLs', () => {
      const vmDir = path.resolve(process.cwd(), 'src/ui/view-models');
      const files = fs.readdirSync(vmDir).filter(f => f.endsWith('.ts'));

      for (const file of files) {
        const content = fs.readFileSync(path.join(vmDir, file), 'utf-8');
        expect(content).not.toMatch(/https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp|gif)/i);
        expect(content).not.toMatch(/src=["']https?:\/\//i);
      }
    });

    it('verifies illustration helper outputs local SVGs without remote references', () => {
      const illustrations = [
        getLocalIllustration('ramen'),
        getLocalIllustration('salad'),
        getLocalIllustration('sushi'),
        getLocalIllustration('cafe'),
        getLocalIllustration('italian'),
        getLocalIllustration('unknown'),
      ];

      for (const ill of illustrations) {
        expect(ill.simulatedBadge).toBe('Illustration · simulated');
        expect(ill.svgMarkup).toContain('<svg');
        // Proof of zero external image URLs / zero remote asset fetching
        expect(ill.svgMarkup).not.toMatch(/https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp|gif)/i);
        expect(ill.svgMarkup).not.toMatch(/src=["']https?:\/\//i);
        expect(ill.svgMarkup).not.toMatch(/xlink:href=["']https?:\/\//i);
        expect(ill.svgMarkup).not.toMatch(/href=["']https?:\/\//i);
      }
    });
  });
});
